import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sprint = body?.activeSprint;
  const overview = sprint?.overview_json ?? body?.overview;
  if (!sprint || !overview?.days?.length) return NextResponse.json({ ok: false, error: "Invalid AdrianoOS export JSON." }, { status: 400 });

  const { data, error } = await getSupabase().rpc("adrianoos_create_sprint", {
    p_session_id: await sessionId(),
    p_topic: sprint.topic_title ?? overview.topic,
    p_description: sprint.description ?? overview.description,
    p_current_level: sprint.current_level ?? overview.currentLevel,
    p_goal: sprint.goal ?? overview.goal,
    p_target_outcome: sprint.target_outcome ?? overview.targetOutcome,
    p_daily_study_minutes: sprint.daily_study_minutes ?? overview.dailyStudyMinutes,
    p_sprint_days: sprint.sprint_days ?? overview.defaultDays ?? 7,
    p_urgency: sprint.urgency ?? overview.urgency ?? "",
    p_overview_json: overview,
  });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Import failed." }, { status: 400 });
  return NextResponse.json({ ok: true, ...data });
}
