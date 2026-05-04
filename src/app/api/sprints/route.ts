import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateSprintOverview } from "@/lib/learning";
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


  return NextResponse.json({ ok: true, overview, ...data });
}
