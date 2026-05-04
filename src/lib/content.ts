import type { DailyLearnable, Flashcard, SprintOverview, TopicInput } from "./types";

const dayTitles = ["Foundations, Vocabulary, and Mental Model", "Mechanics, Moving Parts, and Concrete Examples", "Decision Boundaries and Work Tradeoffs", "Implementation Patterns and Failure Modes", "Debugging, Anti-patterns, and Operational Signals", "Synthesis, Review, and Weak-area Reinforcement", "Work-ready Decision Checklist and Final Assessment"];
const focuses = ["foundation", "application", "decision", "application", "application", "review", "build"] as const;

export function generateSprintOverview(input: TopicInput): SprintOverview {
  return { ...input, defaultDays: 7, maxDays: 14, days: dayTitles.map((title, index) => ({ dayIndex: index + 1, title, objective: dayObjective(input.topic, index + 1), expectedOutcome: dayOutcome(input.topic, index + 1), focus: focuses[index], difficulty: index === 0 ? "beginner" : index < 3 ? "easy" : index < 6 ? "medium" : "advanced" })) };
}

export function generateLongFormLearnable(overview: SprintOverview, dayIndex: number, catchup = false): DailyLearnable {
  const day = overview.days[Math.min(dayIndex, 7) - 1];
  const minutes = overview.dailyStudyMinutes;
  const blocks = minutes === 90 ? 7 : minutes === 60 ? 5 : 3;
  const topic = overview.topic;
  return { sprintId: "supabase-active-sprint", dayIndex, title: day.title, objective: day.objective, estimatedMinutes: minutes, status: catchup ? "catchup" : "assigned", tone: dayIndex === 1 ? "clear-beginner-friendly" : "practical-work-focused", sections: [
    section("overview", "Reading plan", `${catchup ? "Catch-up mode: finish the current day before advancing. " : ""}This lesson is designed for about ${minutes} minutes. For 90 minutes, expect chapter-length reading: core explanation, diagrams, examples, and a multiple-choice check — no mini tasks.`),
    ...Array.from({ length: blocks }, (_, index) => section("explanation", `Part ${index + 1}: ${partTitle(index)}`, longReading(topic, overview, dayIndex, minutes === 90))),
    section("visual", "Diagram 1 — concept map", `\n[Problem]\n   ↓\n[${topic}] — assumptions + boundaries + tradeoffs\n   ↓\n[Outcome]\n\nRead this left-to-right. The concept is not magic; it transforms a problem into an outcome under constraints.`),
    section("visual", "Diagram 2 — production decision flow", `\nNeed ${topic}?\n   ├─ Is the problem clear? → no → define problem first\n   ├─ Do constraints match? → no → choose simpler option\n   ├─ Can the team operate it? → no → reduce scope\n   └─ yes → use it, document tradeoffs, verify with examples`),
    section("example", "Worked example A — simple case", `Explain ${topic} without jargon first. Start with the problem from your context: ${overview.description}. Then state how ${topic} helps, one concrete example, and one limitation.`),
    section("example", "Worked example B — work-like case", `For ${overview.targetOutcome}, decide based on maintainability, team familiarity, debugging, deployment risk, and reversibility. A production answer says: use it when..., avoid it when..., verify it by...`),
    section("reflection", "Checkpoint", `Answer in 4-6 sentences: what problem does ${topic} solve, what does it cost, and what signal tells you it is the wrong choice?`),
  ], references: [{ title: `${topic} official documentation`, url: `https://www.google.com/search?q=${encodeURIComponent(`${topic} official documentation`)}` }, { title: `${topic} practical examples`, url: `https://www.google.com/search?q=${encodeURIComponent(`${topic} practical examples`)}` }] };
}

export function generateExerciseCards(overview: SprintOverview, dayIndex: number): Flashcard[] {
  const topic = overview.topic;
  const count = overview.dailyStudyMinutes === 90 ? 15 : overview.dailyStudyMinutes === 60 ? 12 : 8;
  const templates: Omit<Flashcard, "id">[] = [
    { type: "basic", front: `Explain ${topic} without naming any tooling first.`, back: `${topic} is best explained by the problem it solves, the constraints it assumes, and the tradeoffs it introduces.`, difficulty: "easy", tags: ["explanation"] },
    { type: "multiple_choice", front: `Which is the best first question before using ${topic}?`, choices: ["Is it popular?", "What problem and constraints do we have?", "Can we rewrite everything?", "Can AI generate it?"], answer: "What problem and constraints do we have?", explanation: "A production decision starts with context and constraints, not trend-following.", difficulty: "easy", tags: ["decision"] },
    { type: "cloze", front: `${topic} becomes risky when its ____ are ignored.`, back: "tradeoffs", difficulty: "medium", tags: ["tradeoffs"] },
    { type: "scenario", front: `A production bug appears after adopting ${topic}. What do you inspect first?`, back: "Inspect assumptions, boundaries, data flow, ownership, and logs around the exact path where the abstraction meets reality.", difficulty: "medium", tags: ["debugging"] },
    { type: "multiple_choice", front: `Which diagram best helps explain ${topic}?`, choices: ["Input → Decision → Output", "Logo → Slogan → Launch", "Code → Hope → Deploy", "Meeting → Meeting → Meeting"], answer: "Input → Decision → Output", explanation: "It forces you to show signals, choice, and consequence.", difficulty: "easy", tags: ["diagram"] },
  ];
  return Array.from({ length: count }, (_, i) => ({ ...templates[i % templates.length], id: `day-${dayIndex}-card-${i + 1}` }));
}

function section(type: DailyLearnable["sections"][number]["type"], title: string, content: string) { return { type, title, content }; }
function dayObjective(topic: string, day: number) { return [`Build a durable mental model of ${topic} and its purpose.`, `Understand how ${topic} works through concrete examples.`, `Learn when ${topic} is the right or wrong production choice.`, `Map ${topic} to implementation patterns and system boundaries.`, `Recognize common mistakes, debugging signals, and failure modes.`, `Reinforce weak areas and compress the concept into memory.`, `Create a work-ready checklist for applying ${topic}.`][day - 1]; }
function dayOutcome(topic: string, day: number) { return [`Can explain ${topic} clearly to a beginner.`, `Can walk through examples without hand-waving.`, `Can make a justified architecture recommendation.`, `Can identify safe implementation boundaries.`, `Can debug common issues and avoid traps.`, `Can recall important details through exercises.`, `Can use ${topic} in real work planning.`][day - 1]; }
function partTitle(index: number) { return ["Problem before solution", "Core mental model", "Important moving parts", "Tradeoffs and constraints", "Production example", "Common failure modes", "How to explain it at work"][index]; }
function longReading(topic: string, overview: SprintOverview, dayIndex: number, deep: boolean) { return `${topic} should be learned from the problem outward. For Day ${dayIndex}, connect the idea to your goal: ${overview.goal}. Separate the concept from hype. Ask what inputs it needs, what output it promises, what complexity it hides, and what complexity it creates elsewhere.\n\nIn work, the useful question is rarely “can I use ${topic}?” It is “what decision becomes easier, safer, or more explicit if I use it?” If the answer is vague, the concept is not understood yet. If the answer names concrete constraints, you are closer to production judgment.${deep ? "\n\nFor a 90-minute session, slow down: write down the terms, compare with one alternative, and notice what would break if a core assumption changed. This should feel like a concise chapter, not a card." : ""}`; }
