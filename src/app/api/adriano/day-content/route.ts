import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { DailyLearnable, Flashcard } from "@/lib/types";

function authorized(request: Request) {
  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  if (!cronSecret) return { ok: false, error: "Cron secret is not configured.", status: 500 };
  return request.headers.get("authorization") === `Bearer ${cronSecret}`
    ? { ok: true, cronSecret }
    : { ok: false, error: "Unauthorized Adriano day-content request.", status: 401 };
}

function validLearnable(value: unknown): value is DailyLearnable {
  const item = value as Partial<DailyLearnable> | null;
  return Boolean(item && typeof item === "object" && typeof item.title === "string" && typeof item.objective === "string" && Array.isArray(item.sections) && item.sections.length >= 4 && Array.isArray(item.references));
}

function validCards(value: unknown): value is Flashcard[] {
  return Array.isArray(value) && value.length >= 8 && value.length <= 20 && value.every((card) => card && typeof card.front === "string" && Array.isArray(card.tags) && ["basic", "multiple_choice", "cloze", "scenario"].includes(card.type));
}

export async function POST(request: Request) {
  const auth = authorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.sprintId || !Number.isFinite(Number(body.dayIndex))) return NextResponse.json({ ok: false, error: "sprintId and dayIndex are required." }, { status: 400 });
  if (!validLearnable(body.learnable)) return NextResponse.json({ ok: false, error: "Invalid learnable JSON shape." }, { status: 400 });
  if (!validCards(body.flashcards)) return NextResponse.json({ ok: false, error: "Invalid flashcards JSON shape." }, { status: 400 });

  const report = String(body.reportMarkdown || [
    `**Today’s Learnables — Day ${body.dayIndex}**`,
    "",
    `- Focus: ${body.learnable.title}`,
    `- Study time: ${body.learnable.estimatedMinutes} minutes`,
    `- Required: finish the reading + ${body.flashcards.length} flashcards`,
    "- Source: Adriano/OpenClaw external generation handoff",
    "",
    `**Summary:** ${body.summary || body.learnable.objective}`,
  ].join("\n"));

  const { data, error } = await getSupabase().rpc("adrianoos_save_day_content", {
    p_secret: auth.cronSecret,
    p_sprint_id: body.sprintId,
    p_day_index: Number(body.dayIndex),
    p_learnable_json: body.learnable,
    p_flashcards_json: body.flashcards,
    p_report_markdown: report,
    p_report_type: body.reportType === "catchup" ? "catchup" : "daily",
  });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Save failed." }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}
