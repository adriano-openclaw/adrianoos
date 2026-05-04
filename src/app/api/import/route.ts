import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

function str(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function num(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sprint = body?.activeSprint;
  const overview = sprint?.overview_json ?? body?.overview;
  const days = Array.isArray(overview?.days) ? overview.days : [];

  if (!body || body.schemaVersion !== 1) return NextResponse.json({ ok: false, error: "Unsupported or missing AdrianoOS schemaVersion." }, { status: 400 });
  if (!overview || days.length < 1 || days.length > 14) return NextResponse.json({ ok: false, error: "Invalid sprint overview days." }, { status: 400 });

  const topic = str(sprint?.topic_title, str(overview.topic));
  const description = str(sprint?.description, str(overview.description));
  const goal = str(sprint?.goal, str(overview.goal));
  const targetOutcome = str(sprint?.target_outcome, str(overview.targetOutcome));
  const dailyStudyMinutes = num(sprint?.daily_study_minutes ?? overview.dailyStudyMinutes, 90);
  const sprintDays = Math.min(Math.max(num(sprint?.sprint_days ?? overview.defaultDays, days.length), 1), 14);

  if (!topic || !description || !goal || !targetOutcome) return NextResponse.json({ ok: false, error: "Import requires topic, description, goal, and target outcome." }, { status: 400 });
  if (![30, 60, 90].includes(dailyStudyMinutes)) return NextResponse.json({ ok: false, error: "dailyStudyMinutes must be 30, 60, or 90." }, { status: 400 });
  if (!days.every((day: Record<string, unknown>, index: number) => Number(day.dayIndex) === index + 1 && str(day.title) && str(day.objective))) {
    return NextResponse.json({ ok: false, error: "Each day must have a sequential dayIndex, title, and objective." }, { status: 400 });
  }

  const normalizedOverview = { ...overview, topic, description, goal, targetOutcome, dailyStudyMinutes, defaultDays: sprintDays, maxDays: 14, days };
  const { data, error } = await getSupabase().rpc("adrianoos_create_sprint", {
    p_session_id: await sessionId(),
    p_topic: topic,
    p_description: description,
    p_current_level: str(sprint?.current_level, str(overview.currentLevel)),
    p_goal: goal,
    p_target_outcome: targetOutcome,
    p_daily_study_minutes: dailyStudyMinutes,
    p_sprint_days: sprintDays,
    p_urgency: str(sprint?.urgency, str(overview.urgency)),
    p_overview_json: normalizedOverview,
  });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Import failed." }, { status: 400 });
  return NextResponse.json({ ok: true, ...data });
}
