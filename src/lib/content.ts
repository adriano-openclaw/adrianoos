import type { DailyLearnable, Flashcard, SprintOverview, TopicInput } from "./types";

interface WeakCardInput {
  card_json?: Partial<Flashcard>;
  rating?: "wrong" | "unsure" | "correct" | "unreviewed";
}

function normalizeWeakCards(cards: WeakCardInput[] = []) {
  return cards
    .map((card) => ({ ...(card.card_json ?? {}), rating: card.rating }))
    .filter((card) => card.front || card.back || card.answer)
    .slice(0, 6);
}

const dayTitles = [
  "Foundations, Vocabulary, and Mental Model",
  "Mechanics, Moving Parts, and Concrete Examples",
  "Decision Boundaries and Work Tradeoffs",
  "Implementation Patterns and Failure Modes",
  "Debugging, Anti-patterns, and Operational Signals",
  "Synthesis, Review, and Weak-area Reinforcement",
  "Work-ready Decision Checklist and Final Assessment",
];
const focuses = ["foundation", "application", "decision", "application", "application", "review", "build"] as const;

export function generateSprintOverview(input: TopicInput): SprintOverview {
  const sprintDays = Math.min(Math.max(input.sprintDays || 7, 1), 14);
  return {
    ...input,
    defaultDays: sprintDays,
    maxDays: 14,
    days: Array.from({ length: sprintDays }, (_, index) => {
      const dayIndex = index + 1;
      const title = dayTitles[index] ?? `Extension Day ${dayIndex}: Essentials and Review`;
      return {
        dayIndex,
        title,
        objective: dayObjective(input.topic, dayIndex, input.goal),
        expectedOutcome: dayOutcome(input.topic, dayIndex, input.targetOutcome),
        focus: focuses[index] ?? "review",
        difficulty: index === 0 ? "beginner" : index < 3 ? "easy" : index < 6 ? "medium" : "advanced",
      };
    }),
  };
}

export function generateLongFormLearnable(overview: SprintOverview, dayIndex: number, catchup = false, weakCards: WeakCardInput[] = [], performance: "standard" | "strong" = "standard"): DailyLearnable {
  const day = overview.days[Math.min(dayIndex, overview.days.length) - 1];
  const minutes = overview.dailyStudyMinutes;
  const topic = overview.topic.trim();
  const sectionCount = minutes === 90 ? 7 : minutes === 60 ? 5 : 4;
  const weak = normalizeWeakCards(weakCards);
  const readingMinutes = Math.round(minutes * 0.62);
  const exampleMinutes = Math.round(minutes * 0.23);
  const exerciseMinutes = minutes - readingMinutes - exampleMinutes;

  return {
    sprintId: "supabase-active-sprint",
    dayIndex,
    title: day.title,
    objective: day.objective,
    estimatedMinutes: minutes,
    status: catchup ? "catchup" : "assigned",
    tone: performance === "strong" ? "advanced-practical-compressed" : dayIndex === 1 ? "clear-beginner-friendly" : "practical-work-focused",
    sections: [
      section("overview", "Study agenda", agenda(topic, minutes, readingMinutes, exampleMinutes, exerciseMinutes, catchup, performance)),
      ...Array.from({ length: sectionCount }, (_, index) => section("explanation", `Reading ${index + 1}: ${partTitle(index)}`, readingBlock(topic, overview, dayIndex, index, minutes, performance))),
      section("visual", "Diagram — concept map", conceptDiagram(topic, overview)),
      section("visual", "Diagram — production decision flow", decisionDiagram(topic)),
      section("example", "Worked example 1 — simple explanation", simpleExample(topic, overview)),
      section("example", "Worked example 2 — production scenario", productionExample(topic, overview, dayIndex)),
      section("example", "Common mistake walkthrough", mistakeWalkthrough(topic, overview)),
      ...(weak.length ? [section("review", "Weak-card reinforcement", weakReviewBlock(topic, weak))] : []),
      section("reflection", "Multiple-choice checkpoint", multipleChoiceCheckpoint(topic, overview, dayIndex)),
      section("reflection", "Written checkpoint", `In 5-8 sentences, explain ${topic} to a teammate. Include: the problem, the mental model, one tradeoff, one example, and one reason not to use it. If this is a catch-up day, keep the answer short and finish the flashcards immediately after.`),
    ],
    references: [
      { title: `${topic} official documentation`, url: `https://www.google.com/search?q=${encodeURIComponent(`${topic} official documentation`)}` },
      { title: `${topic} production examples`, url: `https://www.google.com/search?q=${encodeURIComponent(`${topic} production examples`)}` },
      { title: `${topic} tradeoffs`, url: `https://www.google.com/search?q=${encodeURIComponent(`${topic} tradeoffs architecture`)}` },
    ],
  };
}

export function generateExerciseCards(overview: SprintOverview, dayIndex: number, weakCards: WeakCardInput[] = [], performance: "standard" | "strong" = "standard"): Flashcard[] {
  const topic = overview.topic.trim();
  const count = overview.dailyStudyMinutes === 90 ? 15 : overview.dailyStudyMinutes === 60 ? 12 : 8;
  const weak = normalizeWeakCards(weakCards);
  const reviewCards: Flashcard[] = weak.map((card, index) => ({
    id: `day-${dayIndex}-review-${index + 1}`,
    type: "scenario",
    front: `${card.rating === "correct" ? "Cumulative review" : "Review weak card"}: ${card.front ?? "Explain the concept again."}`,
    back: card.back ?? card.answer ?? `Restate the concept in simpler words, then connect it to ${topic}.`,
    explanation: `This came back because the latest rating was ${card.rating ?? "review due"}. Wrong/unsure cards appear first; older correct cards still return for retention.`,
    difficulty: card.rating === "correct" && performance === "strong" ? "advanced" : card.rating === "correct" ? "medium" : "easy",
    tags: ["review", ...(card.rating === "correct" ? [] : ["weak-card"]), ...(card.tags ?? [])].slice(0, 6),
  }));
  const templates: Omit<Flashcard, "id">[] = [
    {
      type: "basic",
      front: `Explain ${topic} by naming the problem first, not the tool.` ,
      back: `${topic} should be explained as a response to a concrete problem: what is hard, what changes, what improves, and what new tradeoff appears.`,
      difficulty: "easy",
      tags: ["explanation", "mental-model"],
    },
    {
      type: "multiple_choice",
      front: `Which question should come first before recommending ${topic}?`,
      choices: ["Is it trendy?", "What problem and constraints are we solving?", "Can we rewrite the app?", "Will it look good in a demo?"],
      answer: "What problem and constraints are we solving?",
      explanation: "Production choices start from problem, constraints, reversibility, and team ability to operate the choice.",
      difficulty: "easy",
      tags: ["decision-making"],
    },
    {
      type: "cloze",
      front: `${topic} becomes risky when its ____ are ignored or undocumented.`,
      back: "tradeoffs",
      difficulty: "medium",
      tags: ["tradeoffs"],
    },
    {
      type: "scenario",
      front: `A teammate wants to use ${topic} in a production feature. What do you ask before agreeing?`,
      back: `Ask what user problem it solves, what constraints matter, what alternatives exist, how debugging changes, how reversible it is, and whether the team can maintain it.`,
      difficulty: "medium",
      tags: ["work-scenario"],
    },
    {
      type: "multiple_choice",
      front: `Which signal suggests you should slow down before adopting ${topic}?`,
      choices: ["You can describe the tradeoff clearly", "The team has a rollback path", "Nobody can explain what problem it solves", "There is an official guide"],
      answer: "Nobody can explain what problem it solves",
      explanation: "If the problem is unclear, the implementation will likely become cargo-cult architecture.",
      difficulty: "medium",
      tags: ["guardrails"],
    },
    {
      type: "scenario",
      front: `You see a bug after applying ${topic}. What is your first debugging path?`,
      back: `Trace the boundary where ${topic} changes data flow, ownership, rendering, state, caching, or execution timing. Bugs often appear where the abstraction meets the rest of the system.`,
      difficulty: "medium",
      tags: ["debugging"],
    },
  ];
  const newCount = Math.max(4, count - reviewCards.length);
  const newCards: Flashcard[] = Array.from({ length: newCount }, (_, i) => {
    const base = templates[i % templates.length];
    if (performance !== "strong") return { ...base, id: `day-${dayIndex}-card-${i + 1}` };
    return {
      ...base,
      id: `day-${dayIndex}-card-${i + 1}`,
      difficulty: base.difficulty === "easy" ? "medium" as const : "advanced" as const,
      front: `${base.front} Answer at senior-engineer depth: include constraints, failure mode, and operating rule.`,
      tags: [...base.tags, "strong-performance", "difficulty-ramp"].slice(0, 6),
    };
  });
  return [...reviewCards, ...newCards].slice(0, count);
}

function section(type: DailyLearnable["sections"][number]["type"], title: string, content: string) {
  return { type, title, content };
}

function dayObjective(topic: string, day: number, goal: string) {
  return [
    `Build a durable mental model of ${topic}, the vocabulary around it, and why it matters for: ${goal}.`,
    `Understand how ${topic} works through concrete mechanics and examples, not vague definitions.`,
    `Learn when ${topic} is the right or wrong production choice and what tradeoffs matter.`,
    `Map ${topic} to implementation patterns, boundaries, and operational failure modes.`,
    `Recognize common mistakes, debugging signals, and anti-patterns around ${topic}.`,
    `Reinforce weak areas and compress ${topic} into a practical explanation you can remember.`,
    `Create a work-ready decision checklist for applying ${topic} with confidence.`,
  ][Math.min(day, 7) - 1];
}

function dayOutcome(topic: string, day: number, targetOutcome: string) {
  return [
    `Can explain ${topic} clearly to a beginner and connect it to ${targetOutcome}.`,
    `Can walk through examples without hand-waving.`,
    `Can make a justified architecture recommendation.`,
    `Can identify safe implementation boundaries.`,
    `Can debug common issues and avoid traps.`,
    `Can recall important details through exercises.`,
    `Can use ${topic} in real work planning.`,
  ][Math.min(day, 7) - 1];
}

function agenda(topic: string, minutes: number, reading: number, examples: number, exercise: number, catchup: boolean, performance: "standard" | "strong") {
  const ramp = performance === "strong" ? `Strong-performance mode: recent cards were mostly correct, so today reduces beginner scaffolding and raises difficulty. Expect more decision pressure, edge cases, operational failure modes, and senior-level explanations.\n\n` : "";
  return `${catchup ? `Catch-up mode: do not skip ahead. Finish the current ${topic} lesson and cards before starting new content.\n\n` : ""}${ramp}This session is designed for about ${minutes} minutes: ~${reading} minutes reading, ~${examples} minutes examples/diagrams, and ~${exercise} minutes checkpoint questions. The goal is deep enough reading to explain ${topic}, reason about it at work, and make a practical decision — not a tiny summary or a task list.`;
}

function partTitle(index: number) {
  return ["Problem before solution", "Core mental model", "Vocabulary and moving parts", "Step-by-step mechanics", "Tradeoffs and constraints", "Operational signals", "How to explain it at work"][index] ?? "Extension reading";
}

function readingBlock(topic: string, overview: SprintOverview, dayIndex: number, index: number, minutes: number, performance: "standard" | "strong") {
  const deep = minutes === 90;
  const blocks = [
    `${topic} is easiest to learn when you start with the pressure that created it. In your context, the pressure is: ${overview.description}. Before memorizing terms, name what is currently difficult. Is the difficulty about performance, correctness, architecture clarity, team coordination, deployment risk, or debugging? A good learner can say: “The problem exists because X. ${topic} helps by changing Y. The cost is Z.”`,
    `The mental model for ${topic} should be small enough to draw. Think of it as a boundary that changes how information, responsibility, or execution moves through a system. On one side you have the old default behavior. On the other side you have a more explicit path. The useful question is: what becomes easier to reason about, and what becomes harder?`,
    `Vocabulary matters, but only after the model is clear. For ${topic}, collect terms into three buckets: inputs, mechanisms, and outputs. Inputs are the conditions or data it needs. Mechanisms are the rules it follows. Outputs are the observable results. If a term does not fit one of those buckets, it is probably not important yet.`,
    `Mechanically, walk through ${topic} one step at a time. Step one: identify where the decision starts. Step two: identify who owns the data or behavior. Step three: identify what changes at the boundary. Step four: identify what the user, developer, or runtime observes afterward. This is how you avoid vague “it just works” understanding.`,
    `Tradeoffs are the production layer. ${topic} can make one part of the system cleaner while moving complexity elsewhere. That is not a reason to avoid it; it is a reason to document the trade. For work decisions, write the trade as: “We gain A, accept B, and will watch C.”`,
    `Operationally, you should know what failure looks like. If ${topic} is misunderstood, bugs often show up as confusing ownership, incorrect assumptions, hidden coupling, unexpected performance behavior, or difficulty debugging. A strong learner can name the likely failure mode before it happens.`,
    `To explain ${topic} at work, use a crisp structure: problem, model, example, tradeoff, recommendation. Avoid sounding like a tutorial. Sound like someone making a responsible decision. The final answer should help a teammate decide what to do next.`,
  ];
  const strong = performance === "strong" ? `\n\nDifficulty ramp: because recent performance is strong, skip definitions you already know and stress-test ${topic}: identify one edge case, one misleading success metric, one rollback path, and one reason a senior reviewer might reject the approach.` : "";
  return `${blocks[index] ?? blocks[blocks.length - 1]}${deep ? `\n\nDeep-read note for a 90-minute session: pause here and compare ${topic} with the simplest alternative. Write one sentence for when the alternative is better. This makes your understanding decision-grade instead of trivia-grade.` : ""}${strong}\n\nConnection to your goal: ${overview.goal}`;
}

function conceptDiagram(topic: string, overview: SprintOverview) {
  return `Context: ${overview.description}\n\n[Current problem / confusion]\n        ↓\n[Signals and constraints]\n        ↓\n[${topic}]\n   ├─ changes responsibility\n   ├─ changes data/control flow\n   ├─ creates a tradeoff\n   └─ needs an operating rule\n        ↓\n[Work outcome: ${overview.targetOutcome}]\n\nUse this diagram by filling in each box with one concrete phrase from your actual work context.`;
}

function decisionDiagram(topic: string) {
  return `Should I use ${topic}?\n\n1. Can I state the problem in one sentence?\n   ├─ No → do not use it yet. Clarify the problem.\n   └─ Yes → continue.\n\n2. Do the constraints match what ${topic} is good at?\n   ├─ No → prefer a simpler option.\n   └─ Yes → continue.\n\n3. Can the team debug and operate it?\n   ├─ No → reduce scope or document runbooks first.\n   └─ Yes → continue.\n\n4. Is the decision reversible?\n   ├─ No → start with a smaller proof.\n   └─ Yes → use it, document tradeoffs, and monitor weak signals.`;
}

function simpleExample(topic: string, overview: SprintOverview) {
  return `Simple explanation: “We are trying to ${overview.targetOutcome}. The confusing part is ${overview.description}. ${topic} gives us a way to separate the concern into a clearer model. The benefit is better reasoning. The risk is that we may hide complexity or choose it where a simpler pattern would work.”\n\nNow turn that into a concrete example from your stack. Keep it small: one feature, one boundary, one decision, one tradeoff.`;
}

function productionExample(topic: string, overview: SprintOverview, dayIndex: number) {
  return `Production scenario for Day ${dayIndex}: imagine you are in a planning review and someone proposes ${topic}. Your answer should not be “yes” or “no” immediately. Say: “Use it if it improves ${overview.targetOutcome}, if the team can explain the boundary, and if we can test/debug the failure mode. Avoid it if it only adds novelty.”\n\nRecommendation format:\n- Use when: the problem is repeated, expensive, or risky without this model.\n- Avoid when: the team cannot explain the tradeoff or the simpler option is enough.\n- Verify by: building a tiny proof, checking logs/behavior, and writing a rollback path.`;
}

function mistakeWalkthrough(topic: string, overview: SprintOverview) {
  return `Common mistake: treating ${topic} as a magic label. That creates shallow understanding. Better: attach it to the specific goal “${overview.goal}.”\n\nBad explanation: “We should use ${topic} because it is modern.”\nBetter explanation: “We should use ${topic} because this problem has these constraints, this model clarifies the boundary, and these are the tradeoffs we accept.”\n\nIf you cannot write the better explanation yet, reread the mental model and decision-flow sections before doing flashcards.`;
}

function weakReviewBlock(topic: string, weak: Array<Omit<Partial<Flashcard>, "rating"> & { rating?: string }>) {
  const bullets = weak.map((card, index) => `${index + 1}. ${card.front ?? "Weak concept"} — latest rating: ${card.rating ?? "weak"}. Re-answer it before moving on.`).join("\n");
  return `Review loop for ${topic}: wrong and unsure cards come back first, and older correct cards can return for retention across days. Do not treat this as punishment; it is the adaptation loop doing its job.\n\n${bullets}\n\nAfter reviewing, write one corrected explanation for the weakest card and connect it to a real work decision.`;
}

function multipleChoiceCheckpoint(topic: string, overview: SprintOverview, dayIndex: number) {
  return `1. Before choosing ${topic}, what should you identify first?\nA. Whether it is popular\nB. The problem, constraints, and tradeoffs\nC. The longest tutorial\nD. A rewrite plan\nAnswer: B\n\n2. Which explanation is strongest?\nA. “${topic} is good because people use it.”\nB. “${topic} helps with ${overview.targetOutcome} when these constraints are true, but costs us complexity here.”\nC. “${topic} removes all problems.”\nD. “${topic} means we do not need tests.”\nAnswer: B\n\n3. On Day ${dayIndex}, what should count as real understanding?\nA. Recognizing the term\nB. Copying an example\nC. Explaining the problem, model, example, tradeoff, and recommendation\nD. Finishing the page quickly\nAnswer: C`;
}
