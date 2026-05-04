import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateFlashcards, generateLearnable, generateSprintOverview } from "@/lib/learning";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input?.topic || !input?.description || !input?.goal) return NextResponse.json({ ok: false, error: "Missing required topic fields." }, { status: 400 });
  const overview = generateSprintOverview(input);
  const { data, error } = await getSupabase().rpc("adrianoos_create_sprint", {
    p_session_id: await sessionId(),
    p_topic: input.topic,
    p_description: input.description,
    p_current_level: input.currentLevel,
    p_goal: input.goal,
    p_target_outcome: input.targetOutcome,
    p_daily_study_minutes: input.dailyStudyMinutes,
    p_sprint_days: input.sprintDays,
    p_urgency: input.urgency ?? "",
    p_overview_json: overview,
  });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Sprint creation failed." }, { status: 400 });

  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  if (cronSecret) {
    const learnable = generateLearnable(overview, 1, false);
    const cards = generateFlashcards(overview, 1);
    const report = [`**Today’s Learnables — Day 1**`, "", `- Focus: ${learnable.title}`, `- Study time: ${learnable.estimatedMinutes} minutes`, `- Required: finish the reading + ${cards.length} flashcards`, "", "**Summary:** Day 1 content was generated immediately from the sprint intake so the app is usable before the first 5 AM cron."].join("\n");
    const { data: saved, error: saveError } = await getSupabase().rpc("adrianoos_save_day_content", { p_secret: cronSecret, p_sprint_id: data.sprintId, p_day_index: 1, p_learnable_json: learnable, p_flashcards_json: cards, p_report_markdown: report, p_report_type: "daily" });
    if (saveError || !saved?.ok) return NextResponse.json({ ok: false, error: saved?.error ?? saveError?.message ?? "Sprint created, but Day 1 generation failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, overview, ...data });
}
