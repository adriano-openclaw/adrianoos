export type StudyMinutes = 30 | 60 | 90;
export type DayFocus = "foundation" | "application" | "build" | "review" | "decision";
export type Difficulty = "beginner" | "easy" | "medium" | "advanced";
export type ProgressStatus = "none" | "started" | "lesson_done" | "cards_done" | "complete" | "missed" | "catchup";
export type CardType = "basic" | "multiple_choice" | "cloze" | "scenario";
export type CardRating = "correct" | "wrong" | "unsure";

export interface TopicInput {
  topic: string;
  description: string;
  currentLevel: string;
  goal: string;
  targetOutcome: string;
  dailyStudyMinutes: StudyMinutes;
  urgency?: string;
}

export interface SprintDayOverview {
  dayIndex: number;
  title: string;
  objective: string;
  expectedOutcome: string;
  focus: DayFocus;
  difficulty: Difficulty;
}

export interface SprintOverview extends TopicInput {
  defaultDays: 7;
  maxDays: 14;
  days: SprintDayOverview[];
}

export interface LearnableSection {
  type: "overview" | "explanation" | "example" | "visual" | "mini_task" | "reflection";
  title?: string;
  content?: string;
  instructions?: string;
  prompt?: string;
}

export interface DailyLearnable {
  sprintId: string;
  dayIndex: number;
  title: string;
  objective: string;
  estimatedMinutes: StudyMinutes;
  status: "assigned" | "catchup" | "review";
  tone: string;
  sections: LearnableSection[];
  references: { title: string; url: string }[];
}

export interface Flashcard {
  id: string;
  type: CardType;
  front: string;
  back?: string;
  choices?: string[];
  answer?: string;
  explanation?: string;
  difficulty: Difficulty;
  tags: string[];
  rating?: CardRating;
}

export interface LearningState {
  setupComplete: boolean;
  isAuthenticated: boolean;
  sprintStarted: boolean;
  topic?: TopicInput;
  overview?: SprintOverview;
  activeDay: number;
  learnables: Record<number, DailyLearnable>;
  cards: Record<number, Flashcard[]>;
  progress: Record<number, ProgressStatus>;
  lessonDone: Record<number, boolean>;
  cardsDone: Record<number, boolean>;
}
