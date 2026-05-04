import { NextResponse } from "next/server";
import { generateFlashcards, generateLearnable } from "@/lib/learning";
import { getSupabase } from "@/lib/supabase";
import type { SprintOverview } from "@/lib/types";

export async function GET(request: Request) {
  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ ok: false, error: "Cron secret is not configured." }, { status: 500 });

  const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron") || request.headers.get("x-vercel-cron") === "1";
  const isManualLocal = process.env.NODE_ENV !== "production" && request.headers.get("x-adrianoos-manual") === "1";
  if (!isVercelCron && !isManualLocal) return NextResponse.json({ ok: false, error: "Unauthorized cron trigger." }, { status: 401 });

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

  const overview = active.overview_json as SprintOverview;
  const catchup = advance.action === "catchup";
  const learnable = generateLearnable(overview, Number(day.day_index), catchup);
  const cards = generateFlashcards(overview, Number(day.day_index));
  const strictNote = `You are behind. Finish Day ${day.day_index} lesson and cards before starting new content.`;

  const report = [
    `**Today’s Learnables — Day ${day.day_index}**`,
    "",
    `- Focus: ${learnable.title}`,
    `- Study time: ${learnable.estimatedMinutes} minutes`,
    `- Required: finish the reading + ${cards.length} flashcards`,
    catchup ? `- Guardrail: ${strictNote}` : "- Guardrail: previous assigned work is complete; new content is unlocked.",
    `- Destination: <#${channelId}>`,
    "",
    `**Summary:** ${catchup ? strictNote : "Adriano generated today's learnable and flashcards from the Supabase sprint/progress state. The app does not use an embedded LLM provider key."}`,
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

  const discord = await sendDiscordReport(channelId, report);
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
