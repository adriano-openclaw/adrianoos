import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function GET() {
  const { data, error } = await getSupabase().rpc("adrianoos_active_snapshot", { p_session_id: await sessionId() });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? "Unauthorized" }, { status: 401 });
  const cards = Array.isArray(data.flashcards) ? data.flashcards : [];
  const days = Array.isArray(data.days) ? data.days : [];
  return NextResponse.json({
    schemaVersion: 1,
    exportType: "flashcards",
    exportedAt: new Date().toISOString(),
    sprintId: data.activeSprint?.id ?? null,
    flashcards: cards.map((card: Record<string, unknown>) => {
      const day = days.find((item: Record<string, unknown>) => item.id === card.learning_day_id) as Record<string, unknown> | undefined;
      return {
        id: card.id,
        dayIndex: day?.day_index ?? null,
        learningDayId: card.learning_day_id,
        type: card.type,
        difficulty: card.difficulty,
        tags: card.tags,
        latestRating: card.latest_rating ?? null,
        card: card.card_json,
      };
    }),
  });
}
