import { NextResponse } from "next/server";
import { generateFlashcards, generateLearnable } from "@/lib/learning";
import { getSupabase } from "@/lib/supabase";
import type { LearningState } from "@/lib/types";

export async function GET() {
  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ ok: false, error: "Cron secret is not configured." }, { status: 500 });

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("adrianoos_cron_get_state", { p_secret: cronSecret });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: "Cron is not authorized." }, { status: 401 });

  const state = normalizeState(data.state);
  const channelId = process.env.DISCORD_LEARNABLES_CHANNEL_ID ?? "1500687653798940822";

  if (!state.overview || !state.sprintStarted) {
    return NextResponse.json({ ok: true, action: "idle", report: "No active sprint to update." });
  }

  const currentDay = state.activeDay || 1;
  const currentComplete = state.progress?.[currentDay] === "complete";
  const maxDay = Math.min(state.overview.maxDays ?? 14, 14);
  const planDays = state.overview.days.length;

  let targetDay = currentDay;
  let catchup = false;
  let strictNote = "";

  if (!currentComplete) {
    catchup = true;
    strictNote = `You are behind. Finish Day ${currentDay} lesson and cards before starting new content.`;
  } else if (currentDay < maxDay) {
    targetDay = currentDay + 1;
  } else {
    strictNote = "Sprint is at the 14-day max. Wrap essentials or request a continuation sprint from Adriano.";
  }

  const canonicalDay = Math.min(targetDay, planDays);
  const learnable = generateLearnable(state.overview, canonicalDay, catchup);
  const cards = generateFlashcards(state.overview, canonicalDay);

  const nextState: LearningState = {
    ...state,
    activeDay: targetDay,
    learnables: { ...state.learnables, [targetDay]: learnable },
    cards: { ...state.cards, [targetDay]: cards },
    progress: { ...state.progress, [targetDay]: catchup ? "catchup" : "started" },
  };

  const report = [
    `**Today’s Learnables — Day ${targetDay}**`,
    "",
    `- Focus: ${learnable.title}`,
    `- Study time: ${learnable.estimatedMinutes} minutes`,
    `- Required: finish the reading + ${cards.length} flashcards`,
    catchup ? `- Guardrail: ${strictNote}` : "- Guardrail: previous day is complete; new content is unlocked.",
    `- Destination: <#${channelId}>`,
    "",
    `**Summary:** ${catchup ? strictNote : `Adriano generated today's learnable and flashcards from the stored sprint plan. No app-side LLM provider key is used.`}`,
  ].join("\n");

  const { data: saved, error: saveError } = await supabase.rpc("adrianoos_cron_save_state", { p_secret: cronSecret, p_state: nextState });
  if (saveError || !saved?.ok) return NextResponse.json({ ok: false, error: "Cron state save failed." }, { status: 500 });

  return NextResponse.json({ ok: true, action: catchup ? "catchup" : "generated", targetDay, report });
}

function normalizeState(value: Partial<LearningState> | null): LearningState {
  return {
    setupComplete: true,
    isAuthenticated: false,
    sprintStarted: Boolean(value?.sprintStarted),
    topic: value?.topic,
    overview: value?.overview,
    activeDay: value?.activeDay ?? 1,
    learnables: value?.learnables ?? {},
    cards: value?.cards ?? {},
    progress: value?.progress ?? {},
    lessonDone: value?.lessonDone ?? {},
    cardsDone: value?.cardsDone ?? {},
  };
}
