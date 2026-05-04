import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

function str(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function num(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function dayIndexOf(day: Record<string, unknown>) { return Number(day.dayIndex ?? day.day_index); }
function dayLearnable(day: Record<string, unknown>, body: Record<string, unknown>) {
  const fromDay = day.learnable_json ?? day.learnable;
  if (fromDay && typeof fromDay === "object") return fromDay;
  const learnables = body.learnables;
  if (learnables && typeof learnables === "object") return (learnables as Record<string, unknown>)[String(dayIndexOf(day))];
  return null;
}
function cardsForDay(day: Record<string, unknown>, body: Record<string, unknown>) {
  const idx = dayIndexOf(day);
  const fromDay = day.flashcards ?? day.cards;
  if (Array.isArray(fromDay)) return fromDay;
  const groupedCards = body.cards;
  if (groupedCards && typeof groupedCards === "object" && Array.isArray((groupedCards as Record<string, unknown>)[String(idx)])) return (groupedCards as Record<string, unknown[]>)[String(idx)];
  const snapshotCards = Array.isArray(body.flashcards) ? body.flashcards : [];
  return snapshotCards
    .filter((card) => {
      const item = card as Record<string, unknown>;
      return Number(item.day_index ?? item.dayIndex) === idx || item.learning_day_id === day.id;
    })
    .map((card) => {
      const item = card as Record<string, unknown>;
      return item.card_json ?? item;
    });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sprint = body?.activeSprint as Record<string, unknown> | undefined;
  const overview = (sprint?.overview_json ?? body?.overview) as Record<string, unknown> | undefined;
  const days = Array.isArray(overview?.days) ? overview.days as Record<string, unknown>[] : [];

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
  if (!days.every((day, index) => dayIndexOf(day) === index + 1 && str(day.title) && str(day.objective))) {
    return NextResponse.json({ ok: false, error: "Each day must have a sequential dayIndex, title, and objective." }, { status: 400 });
  }

  const normalizedOverview = { ...overview, topic, description, goal, targetOutcome, dailyStudyMinutes, defaultDays: sprintDays, maxDays: 14, days };
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("adrianoos_create_sprint", {
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

  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  let importedContentDays = 0;
  if (cronSecret) {
    for (const day of days) {
      const learnable = dayLearnable(day, body);
      const cards = cardsForDay(day, body);
      if (!learnable || !Array.isArray(cards) || cards.length === 0) continue;
      const save = await supabase.rpc("adrianoos_save_day_content", {
        p_secret: cronSecret,
        p_sprint_id: data.sprintId,
        p_day_index: dayIndexOf(day),
        p_learnable_json: learnable,
        p_flashcards_json: cards,
        p_report_markdown: `Imported Day ${dayIndexOf(day)} content from AdrianoOS JSON export.`,
        p_report_type: "daily",
      });
      if (!save.error && save.data?.ok) importedContentDays += 1;
    }
  }

  return NextResponse.json({ ok: true, importedContentDays, ...data });
}
