import { NextResponse } from "next/server";
import { generateFlashcards, generateLearnable } from "@/lib/learning";
import { getSupabase } from "@/lib/supabase";
import type { Flashcard, SprintOverview } from "@/lib/types";

export async function GET(request: Request) {
  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ ok: false, error: "Cron secret is not configured." }, { status: 500 });

  const auth = request.headers.get("authorization") ?? "";
  const hasBearerSecret = auth === `Bearer ${cronSecret}`;
  const isManualLocal = process.env.NODE_ENV !== "production" && request.headers.get("x-adrianoos-manual") === "1";
  if (!hasBearerSecret && !isManualLocal) return NextResponse.json({ ok: false, error: "Unauthorized cron trigger." }, { status: 401 });

  const supabase = getSupabase();
  const { data: advance, error: advanceError } = await supabase.rpc("adrianoos_cron_advance_if_complete", { p_secret: cronSecret });
  if (advanceError || !advance?.ok) return NextResponse.json({ ok: false, error: advance?.error ?? advanceError?.message ?? "Cron advance failed." }, { status: 500 });
  if (advance.action === "idle") return NextResponse.json({ ok: true, action: "idle", report: "No active sprint to update." });

  const { data, error } = await supabase.rpc("adrianoos_cron_active_state", { p_secret: cronSecret });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Cron state failed." }, { status: 500 });

  const active = data.activeSprint;
  const day = data.currentDay;
  const channelId = process.env.DISCORD_LEARNABLES_CHANNEL_ID ?? "1500687653798940822";
  if (!active || !day) return NextResponse.json({ ok: true, action: "idle", report: "No active sprint day." });

  if (advance.action === "completed") {
    return NextResponse.json({ ok: true, action: "completed", report: "Sprint is complete. Start a continuation sprint only if needed." });
  }
  if (advance.action === "maxed") {
    return NextResponse.json({ ok: true, action: "maxed", report: advance.recommendation ?? "Sprint reached the 14-day maximum. Choose essentials-only wrap-up, continuation sprint, or archive/restart." });
  }

  const overview = active.overview_json as SprintOverview;
  const catchup = advance.action === "catchup";
  const weakCards = Array.isArray(data.weakCards) ? data.weakCards : [];
  const reviewCards = Array.isArray(data.reviewCards) ? data.reviewCards : [];
  const adaptiveCards = [...weakCards, ...reviewCards];
  const existingCards = (Array.isArray(data.currentDayCards) ? data.currentDayCards.map((card: { card_json?: Flashcard }) => card.card_json).filter(Boolean) : []) as Flashcard[];
  const hasExternalContent = Boolean(day.learnable_json && existingCards.length >= 8);
  const learnable = hasExternalContent ? day.learnable_json : generateLearnable(overview, Number(day.day_index), catchup, adaptiveCards);
  const cards: Flashcard[] = hasExternalContent ? existingCards : generateFlashcards(overview, Number(day.day_index), adaptiveCards);
  const reviewCount = cards.filter((card) => card.tags?.includes("review") || card.tags?.includes("weak-card")).length;
  const strictNote = `You are behind. Finish Day ${day.day_index} lesson and cards before starting new content.`;

  const report = [
    `**Today’s Learnables — Day ${day.day_index}**`,
    "",
    `- Focus: ${learnable.title}`,
    `- Study time: ${learnable.estimatedMinutes} minutes`,
    `- Required: finish the reading + ${cards.length} flashcards`,
    reviewCount ? `- Review: ${reviewCount} weak/review card(s) come back first` : "- Review: no weak cards due yet",
    catchup ? `- Guardrail: ${strictNote}` : "- Guardrail: previous assigned work is complete; new content is unlocked.",
    `- Destination: <#${channelId}>`,
    "",
    `**Summary:** ${catchup ? strictNote : hasExternalContent ? "Using Adriano/OpenClaw externally generated content already saved in Supabase. The app does not use an embedded LLM provider key." : "Adriano generated today's learnable and flashcards from the Supabase sprint/progress state, including weak-card adaptation when available. The app does not use an embedded LLM provider key."}`,
  ].join("\n");

  const { data: saved, error: saveError } = await supabase.rpc("adrianoos_save_day_content", {
    p_secret: cronSecret,
    p_sprint_id: active.id,
    p_day_index: Number(day.day_index),
    p_learnable_json: learnable,
    p_flashcards_json: cards,
    p_report_markdown: report,
    p_report_type: catchup ? "catchup" : "daily",
  });
  if (saveError || !saved?.ok) return NextResponse.json({ ok: false, error: saved?.error ?? saveError?.message ?? "Cron state save failed." }, { status: 500 });

  if (saved.alreadySent) return NextResponse.json({ ok: true, action: "already_sent", dayIndex: day.day_index, messageId: saved.messageId, report });

  const discord = await sendDiscordReport(channelId, report);
  await supabase.rpc("adrianoos_update_report_delivery", {
    p_secret: cronSecret,
    p_report_id: saved.reportId,
    p_status: discord.sent ? "sent" : "failed",
    p_message_id: discord.messageId ?? null,
  });
  return NextResponse.json({ ok: true, action: catchup ? "catchup" : "generated", dayIndex: day.day_index, discord, report });
}

async function sendDiscordReport(channelId: string, content: string) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { sent: false, reason: "DISCORD_BOT_TOKEN is not configured." };
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) return { sent: false, status: response.status, retryAfter: response.headers.get("retry-after") };
  const message = await response.json().catch(() => null);
  return { sent: true, messageId: message?.id };
}
