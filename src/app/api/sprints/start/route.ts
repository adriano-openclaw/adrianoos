import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateFlashcards, generateLearnable } from "@/lib/learning";
import { getSupabase } from "@/lib/supabase";
import type { SprintOverview } from "@/lib/types";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function POST() {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("adrianoos_start_sprint", { p_session_id: await sessionId() });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Sprint start failed." }, { status: 400 });

  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  const overview = data.overview as SprintOverview | undefined;
  if (cronSecret && overview) {
    const learnable = generateLearnable(overview, 1, false);
    const cards = generateFlashcards(overview, 1);
    const report = [`**Today’s Learnables — Day 1**`, "", `- Focus: ${learnable.title}`, `- Study time: ${learnable.estimatedMinutes} minutes`, `- Required: finish the reading + ${cards.length} flashcards`, "", "**Summary:** Day 1 content was generated when the draft sprint was started."].join("\n");
    const { data: saved, error: saveError } = await supabase.rpc("adrianoos_save_day_content", { p_secret: cronSecret, p_sprint_id: data.sprintId, p_day_index: 1, p_learnable_json: learnable, p_flashcards_json: cards, p_report_markdown: report, p_report_type: "daily" });
    if (saveError || !saved?.ok) return NextResponse.json({ ok: false, error: saved?.error ?? saveError?.message ?? "Sprint started, but Day 1 generation failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...data });
}
