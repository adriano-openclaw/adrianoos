import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateSprintOverview } from "@/lib/learning";
import { getSupabase } from "@/lib/supabase";
import type { SprintOverview, TopicInput } from "@/lib/types";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

function regeneratedOverview(base: SprintOverview, count: number): SprintOverview {
  const topicInput: TopicInput = {
    topic: base.topic,
    description: base.description,
    currentLevel: base.currentLevel,
    goal: base.goal,
    targetOutcome: base.targetOutcome,
    dailyStudyMinutes: base.dailyStudyMinutes,
    sprintDays: 7,
    urgency: base.urgency,
  };
  const overview = generateSprintOverview(topicInput);
  const emphases = ["Mental model", "Mechanics", "Tradeoffs", "Implementation", "Debugging", "Review", "Assessment"];
  return {
    ...overview,
    regeneratedAt: new Date().toISOString(),
    regenerationCount: count,
    days: overview.days.map((day, index) => ({
      ...day,
      title: `${emphases[(index + count) % emphases.length]} — ${day.title}`,
      objective: `${day.objective} Regeneration pass ${count}: use a different angle from the previous draft and prefer concrete work examples over generic coverage.`,
    })),
  } as SprintOverview;
}

export async function POST() {
  const sid = await sessionId();
  if (!validUuid(sid)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data: snapshot, error: snapshotError } = await supabase.rpc("adrianoos_active_snapshot", { p_session_id: sid });
  if (snapshotError || !snapshot?.ok) return NextResponse.json({ ok: false, error: snapshot?.error ?? snapshotError?.message ?? "Unauthorized" }, { status: 401 });
  const sprint = snapshot.activeSprint;
  if (!sprint || sprint.status !== "draft") return NextResponse.json({ ok: false, error: "Regenerate is available only before the sprint is started." }, { status: 400 });

  const current = sprint.overview_json as SprintOverview;
  const count = Number((current as SprintOverview & { regenerationCount?: number }).regenerationCount ?? 0) + 1;
  const overview = regeneratedOverview(current, count);
  const { data, error } = await supabase.rpc("adrianoos_regenerate_draft_overview", { p_session_id: sid, p_overview_json: overview });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Overview regeneration failed." }, { status: 400 });
  return NextResponse.json({ ok: true, overview, ...data });
}
