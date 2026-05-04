import type { DailyLearnable, Flashcard, LearningState, ProgressStatus, SprintOverview, TopicInput } from "./types";

export interface SnapshotResponse {
  activeSprint: Record<string, unknown> | null;
  days: Array<Record<string, unknown>>;
  flashcards: Array<Record<string, unknown>>;
  progress: Array<Record<string, unknown>>;
}

export function snapshotToState(snapshot: SnapshotResponse): LearningState {
  if (!snapshot.activeSprint) {
    return { setupComplete: true, isAuthenticated: true, sprintStarted: false, activeDay: 1, learnables: {}, cards: {}, progress: {}, lessonDone: {}, cardsDone: {} };
  }
  const s = snapshot.activeSprint;
  const topic: TopicInput = {
    topic: String(s.topic_title ?? ""),
    description: String(s.description ?? ""),
    currentLevel: String(s.current_level ?? ""),
    goal: String(s.goal ?? ""),
    targetOutcome: String(s.target_outcome ?? ""),
    dailyStudyMinutes: Number(s.daily_study_minutes ?? 60) as 30 | 60 | 90,
    sprintDays: Number(s.sprint_days ?? 7),
    urgency: String(s.urgency ?? ""),
  };
  const overview = s.overview_json as SprintOverview;
  const learnables: Record<number, DailyLearnable> = {};
  const cards: Record<number, Flashcard[]> = {};
  const progress: Record<number, ProgressStatus> = {};
  const lessonDone: Record<number, boolean> = {};
  const cardsDone: Record<number, boolean> = {};

  for (const day of snapshot.days ?? []) {
    const idx = Number(day.day_index);
    if (day.learnable_json && typeof day.learnable_json === "object") learnables[idx] = { ...(day.learnable_json as DailyLearnable), dbId: day.id } as DailyLearnable & { dbId?: unknown };
    progress[idx] = statusToProgress(String(day.status ?? "none"));
    lessonDone[idx] = Boolean(day.lesson_completed_at);
    cardsDone[idx] = Boolean(day.flashcards_completed_at);
  }
  for (const card of snapshot.flashcards ?? []) {
    const idx = Number(snapshot.days.find((d) => d.id === card.learning_day_id)?.day_index ?? 1);
    cards[idx] = cards[idx] ?? [];
    if (card.card_json && typeof card.card_json === "object") cards[idx].push({ ...(card.card_json as Flashcard), id: String(card.id), dbId: card.id } as Flashcard & { dbId?: unknown });
  }

  return { setupComplete: true, isAuthenticated: true, sprintStarted: String(s.status) === "active", topic, overview, activeDay: Number(s.current_day_index ?? 1), learnables, cards, progress, lessonDone, cardsDone };
}

export function statusToProgress(status: string): ProgressStatus {
  if (["started", "lesson_done", "cards_done", "complete", "missed", "catchup"].includes(status)) return status as ProgressStatus;
  if (status === "assigned") return "started";
  return "none";
}
