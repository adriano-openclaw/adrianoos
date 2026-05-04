import type { LearningState, ProgressStatus } from "./types";
export { generateExerciseCards as generateFlashcards, generateLongFormLearnable as generateLearnable, generateSprintOverview } from "./content";

export const initialState: LearningState = { setupComplete: false, isAuthenticated: false, sprintStarted: false, activeDay: 1, learnables: {}, cards: {}, progress: {}, lessonDone: {}, cardsDone: {} };

export function nextProgress(lessonDone: boolean, cardsDone: boolean, started = true): ProgressStatus {
  if (lessonDone && cardsDone) return "complete";
  if (lessonDone) return "lesson_done";
  if (cardsDone) return "cards_done";
  return started ? "started" : "none";
}
