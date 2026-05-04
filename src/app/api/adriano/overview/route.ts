import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { SprintOverview } from "@/lib/types";

function authorized(request: Request) {
  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  if (!cronSecret) return { ok: false, error: "Cron secret is not configured.", status: 500 };
  return request.headers.get("authorization") === `Bearer ${cronSecret}`
    ? { ok: true, cronSecret }
    : { ok: false, error: "Unauthorized Adriano overview request.", status: 401 };
}

function validOverview(value: unknown): value is SprintOverview {
  const overview = value as Partial<SprintOverview> | null;
  return Boolean(
    overview &&
    typeof overview === "object" &&
    typeof overview.topic === "string" &&
    typeof overview.description === "string" &&
    typeof overview.goal === "string" &&
    Array.isArray(overview.days) &&
    overview.days.length === 7 &&
    overview.days.every((day, index) => day && day.dayIndex === index + 1 && typeof day.title === "string" && typeof day.objective === "string" && typeof day.expectedOutcome === "string")
  );
}

export async function POST(request: Request) {
  const auth = authorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.sprintId) return NextResponse.json({ ok: false, error: "sprintId is required." }, { status: 400 });
  if (!validOverview(body.overview)) return NextResponse.json({ ok: false, error: "Invalid researched overview JSON shape." }, { status: 400 });

  const { data, error } = await getSupabase().rpc("adrianoos_save_researched_overview", {
    p_secret: auth.cronSecret,
    p_sprint_id: body.sprintId,
    p_overview_json: body.overview,
  });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Overview save failed." }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}
