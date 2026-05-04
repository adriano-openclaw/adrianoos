import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function GET() {
  const { data, error } = await getSupabase().rpc("adrianoos_active_snapshot", { p_session_id: await sessionId() });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? "Unauthorized" }, { status: 401 });
  const days = Array.isArray(data.days) ? data.days : [];
  return NextResponse.json({
    schemaVersion: 1,
    exportType: "daily_content",
    exportedAt: new Date().toISOString(),
    sprintId: data.activeSprint?.id ?? null,
    days: days.map((day: Record<string, unknown>) => ({
      id: day.id,
      dayIndex: day.day_index,
      scheduledDate: day.scheduled_date,
      title: day.title,
      objective: day.objective,
      status: day.status,
      learnable: day.learnable_json ?? null,
      lessonCompletedAt: day.lesson_completed_at ?? null,
      flashcardsCompletedAt: day.flashcards_completed_at ?? null,
    })),
  });
}
