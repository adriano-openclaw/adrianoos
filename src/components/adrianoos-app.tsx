"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Brain, CalendarCheck, CheckCircle2, Download, Flame, Lock, LogOut, Play, Upload } from "lucide-react";
import { initialState } from "@/lib/learning";
import type { CardRating, DailyLearnable, Flashcard, LearningState, ProgressStatus, TopicInput } from "@/lib/types";

const STORAGE_KEY = "adrianoos:client-metadata";
type Tab = "intake" | "overview" | "today" | "flashcards" | "progress" | "import-export";

export function AdrianoOSApp() {
  const [state, setState] = useState<LearningState>(initialState);
  const [tab, setTab] = useState<Tab>("intake");
  const [booting, setBooting] = useState(true);
  const [secretInput, setSecretInput] = useState("");
  const [tokenName, setTokenName] = useState("adriano-openclaw");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupError, setSetupError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const setupResponse = await fetch("/api/setup-status", { cache: "no-store" }).catch(() => null);
      const setup = await setupResponse?.json().catch(() => null);
      if (!cancelled && setup?.setupComplete) {
        const sessionResponse = await fetch("/api/session", { cache: "no-store" }).catch(() => null);
        const session = await sessionResponse?.json().catch(() => null);
        if (session?.authenticated) {
          const activeResponse = await fetch("/api/sprints/active", { cache: "no-store" });
          const active = await activeResponse.json().catch(() => null);
          if (active?.ok && active.state) setState({ ...active.state, setupComplete: true, isAuthenticated: true });
          else setState((current) => ({ ...current, setupComplete: true, isAuthenticated: true }));
        } else {
          setState((current) => ({ ...current, setupComplete: true, isAuthenticated: false }));
        }
      }
      if (!cancelled) setBooting(false);
    }
    void boot();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (booting) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ setupComplete: state.setupComplete, lastSeen: new Date().toISOString() }));
  }, [booting, state]);

  const streak = useMemo(() => Object.values(state.progress).filter((status) => status === "complete").length, [state.progress]);
  const activeCards = state.cards[state.activeDay] ?? [];
  const activeCard = activeCards[cardIndex];

  async function finishSetup() {
    if (setupPassword.length < 8) {
      setSetupError("Use at least 8 characters for the production password.");
      return;
    }

    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenName, password: setupPassword }),
    });
    const result = await response.json().catch(() => ({ ok: false, error: "Setup failed." }));

    if (!response.ok || !result.ok) {
      setSetupError(result.error ?? "Setup failed.");
      return;
    }

    setSetupError("");
    setState((current) => ({ ...current, setupComplete: true, isAuthenticated: true }));
  }
  async function login() {
    setBusy(true);
    setLoginError("");
    const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenName, password: secretInput }) });
    if (!response.ok) { setLoginError("Invalid token name or password."); setBusy(false); return; }
    const stateResponse = await fetch("/api/state");
    const result = await stateResponse.json().catch(() => null);
    const activeResponse = await fetch("/api/sprints/active");
    const active = await activeResponse.json().catch(() => null);
    if (active?.ok && active.state) setState({ ...active.state, setupComplete: true, isAuthenticated: true });
    else if (result?.ok && result.state) setState({ ...initialState, ...result.state, setupComplete: true, isAuthenticated: true });
    else setState((current) => ({ ...current, setupComplete: true, isAuthenticated: true }));
    setBusy(false);
  }
  async function createSprint(formData: FormData) {
    const input: TopicInput = {
      topic: String(formData.get("topic") || ""), description: String(formData.get("description") || ""), currentLevel: String(formData.get("currentLevel") || ""), goal: String(formData.get("goal") || ""), targetOutcome: String(formData.get("targetOutcome") || ""), dailyStudyMinutes: Number(formData.get("dailyStudyMinutes")) as 30 | 60 | 90, sprintDays: Math.min(Math.max(Number(formData.get("sprintDays") || 7), 1), 14), urgency: String(formData.get("urgency") || ""),
    };
    setBusy(true);
    const response = await fetch("/api/sprints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) { setBusy(false); return; }
    const activeResponse = await fetch("/api/sprints/active");
    const active = await activeResponse.json().catch(() => null);
    if (active?.ok && active.state) setState({ ...active.state, setupComplete: true, isAuthenticated: true });
    setTab("overview");
    setBusy(false);
  }
  function startSprint() { setTab("today"); }
  async function completeLesson() {
    const day = state.learnables[state.activeDay] as DailyLearnable & { dbId?: string };
    if (day?.dbId) await fetch(`/api/days/${day.dbId}/lesson-complete`, { method: "POST" });
    const activeResponse = await fetch("/api/sprints/active");
    const active = await activeResponse.json().catch(() => null);
    if (active?.ok && active.state) setState({ ...active.state, setupComplete: true, isAuthenticated: true });
  }
  async function rateCard(rating: CardRating) {
    if (activeCard?.id) await fetch(`/api/flashcards/${activeCard.id}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating }) });
    const activeResponse = await fetch("/api/sprints/active");
    const active = await activeResponse.json().catch(() => null);
    if (active?.ok && active.state) setState({ ...active.state, setupComplete: true, isAuthenticated: true });
    setRevealed(false);
    setCardIndex((index) => Math.min(index + 1, activeCards.length - 1));
  }
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setState({ ...initialState, setupComplete: true, isAuthenticated: false });
    setSecretInput("");
  }
  async function exportJson() { const response = await fetch("/api/export"); const data = await response.json(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "adrianoos-export.json"; link.click(); URL.revokeObjectURL(url); }
  async function importJson(file?: File) { if (!file) return; const json = JSON.parse(await file.text()); const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) }); if (!response.ok) return; const activeResponse = await fetch("/api/sprints/active"); const active = await activeResponse.json().catch(() => null); if (active?.ok && active.state) setState({ ...active.state, setupComplete: true, isAuthenticated: true }); setTab("overview"); }

  if (booting) return <Shell><CenteredCard icon={<Lock />} title="Checking AdrianoOS" note="Verifying setup status from Supabase..."><div className="h-2 rounded-full bg-[#E7F6FF]"><div className="h-2 w-1/2 animate-pulse rounded-full bg-[#0AA5FF]" /></div></CenteredCard></Shell>;
  if (!state.setupComplete) return <Shell><SecretSetup tokenName={tokenName} setTokenName={setTokenName} password={setupPassword} setPassword={setSetupPassword} error={setupError} onSubmit={finishSetup} /></Shell>;
  if (!state.isAuthenticated) return <Shell><Login tokenName={tokenName} setTokenName={setTokenName} secret={secretInput} setSecret={setSecretInput} error={loginError} busy={busy} onSubmit={login} /></Shell>;
  return <Shell><Header state={state} streak={streak} activeCards={activeCards} tab={tab} setTab={setTab} onLogout={logout} /><main className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">{tab === "intake" && <Intake onSubmit={createSprint} />}{tab === "overview" && <Overview state={state} onStart={startSprint} />}{tab === "today" && <Today state={state} onComplete={completeLesson} onCards={() => setTab("flashcards")} />}{tab === "flashcards" && <Flashcards card={activeCard} cards={activeCards} index={cardIndex} total={activeCards.length} revealed={revealed} setRevealed={setRevealed} onRate={rateCard} />}{tab === "progress" && <Progress progress={state.progress} streak={streak} activeDay={state.activeDay} cards={state.cards} />}{tab === "import-export" && <ImportExport onExport={exportJson} onImport={importJson} state={state} />}</main></Shell>;
}

function Header({ state, streak, activeCards, tab, setTab, onLogout }: { state: LearningState; streak: number; activeCards: Flashcard[]; tab: Tab; setTab: (tab: Tab) => void; onLogout: () => void }) {
  return <header className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"><div className="flex flex-col gap-4 rounded-[2rem] bg-[#001632] p-6 text-white shadow-2xl shadow-sky-100 md:flex-row md:items-end md:justify-between"><div><p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">AdrianoOS</p><h1 className="max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">Personal Learning OS for fast, practical technical sprints.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-sky-100">Topic → 7-day overview → daily learnable → flashcards → progress → adaptive catch-up → 5 AM Discord report.</p></div><div className="grid grid-cols-3 gap-2 rounded-3xl bg-white/10 p-3 text-center"><Metric label="Streak" value={`${streak}`} icon={<Flame size={18} />} /><Metric label="Day" value={`${state.activeDay}/14`} icon={<CalendarCheck size={18} />} /><Metric label="Cards" value={`${activeCards.filter((card) => card.rating).length}/${activeCards.length || 0}`} icon={<Brain size={18} />} /></div><button onClick={onLogout} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/20"><LogOut size={16}/> Logout</button></div><nav className="grid grid-cols-2 gap-2 rounded-3xl border border-[#E7EDF0] bg-white p-2 shadow-sm md:grid-cols-6">{(["intake", "overview", "today", "flashcards", "progress", "import-export"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-2xl px-3 py-3 text-sm font-bold capitalize transition ${tab === item ? "bg-[#0AA5FF] text-white" : "text-[#546681] hover:bg-[#F3F9FF]"}`}>{item.replace("-", " / ")}</button>)}</nav></header>;
}
function Shell({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#E7F6FF,transparent_35%),linear-gradient(180deg,#F8FDFF,#FFFFFF)] text-[#001632]">{children}</div>; }
function SecretSetup(props: { tokenName: string; setTokenName: (v: string) => void; password: string; setPassword: (v: string) => void; error: string; onSubmit: () => void | Promise<void> }) { return <CenteredCard icon={<Lock />} title="First visit setup" note="Production setup stores a hashed password in Supabase and starts an HTTP-only session."><input className="field" placeholder="Token name" value={props.tokenName} onChange={(e) => props.setTokenName(e.target.value)} /><input className="field" placeholder="Choose production password" type="password" value={props.password} onChange={(e) => props.setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && props.onSubmit()} />{props.error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{props.error}</p>}<button type="button" className="primary" onClick={props.onSubmit}>Secure app</button></CenteredCard>; }
function Login(props: { tokenName: string; setTokenName: (v: string) => void; secret: string; setSecret: (v: string) => void; error: string; busy: boolean; onSubmit: () => void | Promise<void> }) { return <CenteredCard icon={<Lock />} title="AdrianoOS is private" note="Enter the token name and password every visit."><input className="field" placeholder="Token name" value={props.tokenName} onChange={(e) => props.setTokenName(e.target.value)} /><input className="field" placeholder="Password" type="password" value={props.secret} onChange={(e) => props.setSecret(e.target.value)} onKeyDown={(e) => e.key === "Enter" && props.onSubmit()} />{props.error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{props.error}</p>}<button className="primary" disabled={props.busy} onClick={props.onSubmit}>{props.busy ? "Unlocking..." : "Unlock"}</button></CenteredCard>; }
function CenteredCard({ icon, title, note, children }: { icon: React.ReactNode; title: string; note: string; children: React.ReactNode }) { return <div className="flex min-h-screen items-center justify-center p-4"><div className="w-full max-w-md rounded-[2rem] border border-[#E7EDF0] bg-white p-8 shadow-xl"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E7F6FF] text-[#0AA5FF]">{icon}</div><h1 className="text-3xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-[#546681]">{note}</p><div className="mt-6 grid gap-3">{children}</div></div></div>; }
function Intake({ onSubmit }: { onSubmit: (formData: FormData) => void }) { return <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><form action={onSubmit} className="card grid gap-4"><h2 className="section-title">Send a topic to Adriano</h2><p className="text-sm leading-6 text-[#546681]">Fill the fields. Adriano ingests this into a sprint plan; the daily cron then advances content only when prior learnables/cards are actually complete.</p><input required name="topic" className="field" placeholder="Topic / concept name" /><textarea required name="description" className="field min-h-28" placeholder="Description / context" /><input required name="currentLevel" className="field" placeholder="Current level" /><input required name="goal" className="field" placeholder="Learning goal" /><input required name="targetOutcome" className="field" placeholder="Target outcome / work use case" /><div className="grid gap-3 sm:grid-cols-2"><select name="dailyStudyMinutes" className="field" defaultValue="90"><option value="30">30 minutes/day</option><option value="60">60 minutes/day</option><option value="90">90 minutes/day</option></select><input name="sprintDays" className="field" type="number" min="1" max="14" defaultValue="7" placeholder="Sprint days" /></div><input name="urgency" className="field" placeholder="Optional urgency or deadline" /><button className="primary" type="submit"><Play size={18} /> Ask Adriano for sprint plan</button></form><div className="card"><h3 className="section-title">No provider key flow</h3><ul className="mt-5 space-y-4 text-sm text-[#546681]">{["You send topic details inside the app.", "Adriano generates the n-day sprint overview and descriptions.", "Before 5 AM PH, cron checks Supabase progress.", "If yesterday is unfinished, it assigns catch-up instead of skipping ahead.", "If complete, it generates the next learnable and flashcards."].map((text) => <li className="flex gap-3" key={text}><CheckCircle2 className="mt-0.5 text-[#0AA5FF]" size={18} />{text}</li>)}</ul></div></section>; }
function Overview({ state, onStart }: { state: LearningState; onStart: () => void }) { if (!state.overview) return <Empty title="No sprint yet" />; const targetEnd = state.targetEndDate || (state.overview.defaultDays ? `Day ${state.overview.defaultDays}` : "Day 7"); const maxEnd = state.maxEndDate || "Day 14"; return <section className="card"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><h2 className="section-title">{state.overview.topic}</h2><p className="mt-2 max-w-3xl text-[#546681]">{state.overview.description}</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.14em]"><span className="badge">Current day {state.activeDay}</span><span className="badge-soft">Target finish {targetEnd}</span><span className="badge-soft">Max {maxEnd}</span>{state.sprintStatus === "completed" && <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white">Completed</span>}</div></div><button className="primary" onClick={onStart}>{state.sprintStarted ? "Continue sprint" : "Start sprint"}</button></div><div className="mt-8 grid gap-3">{state.overview.days.map((day) => <div key={day.dayIndex} className={`rounded-3xl border p-5 ${day.dayIndex === state.activeDay ? "border-[#0AA5FF] bg-[#E7F6FF]" : "border-[#E7EDF0] bg-[#F8FDFF]"}`}><div className="flex flex-wrap items-center gap-2"><span className="badge">Day {day.dayIndex}</span>{day.dayIndex === state.activeDay && <span className="rounded-full bg-[#0AA5FF] px-3 py-1 text-xs font-black text-white">Current</span>}<span className="badge-soft">{day.focus}</span><span className="badge-soft">{day.difficulty}</span></div><h3 className="mt-3 text-xl font-black">{day.title}</h3><p className="mt-2 text-sm text-[#546681]">{day.objective}</p><p className="mt-2 text-sm font-semibold text-[#001632]">Outcome: {day.expectedOutcome}</p></div>)}</div></section>; }
function Today({ state, onComplete, onCards }: { state: LearningState; onComplete: () => void; onCards: () => void }) { const learnable = state.learnables[state.activeDay]; if (!learnable) return <Empty title="Start a sprint first" />; const behind = state.progress[state.activeDay] === "catchup"; const refs = learnable.references ?? []; return <section className="grid gap-6 lg:grid-cols-[1fr_320px]"><article className="card"><div className="flex flex-wrap gap-2">{behind && <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">Catch-up required</span>}<span className="badge">Day {learnable.dayIndex}</span><span className="badge-soft">{learnable.estimatedMinutes} min</span></div><h2 className="mt-4 text-3xl font-black">{learnable.title}</h2><p className="mt-2 text-[#546681]">{learnable.objective}</p><div className="mt-8 grid gap-4">{learnable.sections.map((section, index) => <div key={index} className="rounded-3xl border border-[#E7EDF0] bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#0AA5FF]">{section.type.replace("_", " ")}</p><h3 className="mt-2 text-lg font-black">{section.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#546681]">{section.content || section.instructions || section.prompt}</p></div>)}</div>{refs.length > 0 && <div className="mt-8 rounded-3xl border border-[#E7EDF0] bg-[#F8FDFF] p-5"><h3 className="text-lg font-black">References</h3><ul className="mt-3 grid gap-2 text-sm text-[#546681]">{refs.map((ref) => <li key={ref.url}><a className="font-bold text-[#0AA5FF] underline-offset-4 hover:underline" href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a></li>)}</ul></div>}</article><aside className="card h-fit"><h3 className="section-title">Next action</h3><p className="mt-3 text-sm text-[#546681]">Full completion requires the lesson and all flashcards. Streak counts complete days only.</p><div className="mt-5 grid gap-3"><button className="primary" onClick={onComplete}><BookOpen size={18} /> Mark lesson complete</button><button className="secondary" onClick={onCards}><Brain size={18} /> Start / continue flashcards</button></div><div className="mt-6 rounded-2xl bg-[#F3F9FF] p-4 text-sm font-bold text-[#001632]">Status: {state.progress[state.activeDay] ?? "none"}</div><div className="mt-5 grid grid-cols-7 gap-2">{Array.from({ length: 7 }, (_, i) => <span key={i} className={`aspect-square rounded-md border ${colorFor(state.progress[i + 1])} ${i + 1 === state.activeDay ? "ring-2 ring-[#001632] ring-offset-1" : ""}`} title={`Day ${i + 1}`} />)}</div></aside></section>; }
function Flashcards({ card, cards, index, total, revealed, setRevealed, onRate }: { card?: Flashcard; cards: Flashcard[]; index: number; total: number; revealed: boolean; setRevealed: (v: boolean) => void; onRate: (r: CardRating) => void }) { const reviewed = cards.filter((item) => item.rating).length; if (!card || (total > 0 && reviewed === total)) return <section className="mx-auto max-w-2xl"><div className="card text-center"><h2 className="section-title">Flashcards complete</h2><p className="mt-3 text-[#546681]">You reviewed {reviewed}/{total} cards. Today only counts as complete after both lesson and flashcards are done.</p><div className="mt-6 grid gap-3 sm:grid-cols-4"><Metric label="Correct" value={`${cards.filter((item) => item.rating === "correct").length}`} icon={<CheckCircle2 size={18} />} /><Metric label="Wrong" value={`${cards.filter((item) => item.rating === "wrong").length}`} icon={<Brain size={18} />} /><Metric label="Unsure" value={`${cards.filter((item) => item.rating === "unsure").length}`} icon={<BookOpen size={18} />} /></div></div></section>; const weak = card.tags?.includes("weak-card") || card.tags?.includes("review"); return <section className="mx-auto max-w-2xl"><div className="card"><div className="flex justify-between text-sm font-bold text-[#546681]"><span>Card {index + 1} of {total}</span><span>{card.type.replace("_", " ")}</span></div>{weak && <div className="mt-4 rounded-2xl bg-orange-50 px-4 py-3 text-sm font-black text-orange-700">Weak/review card — answer this before new material.</div>}<div className="mt-6 min-h-64 rounded-[2rem] border border-[#E7EDF0] bg-[#F8FDFF] p-8"><h2 className="text-2xl font-black leading-tight">{card.front}</h2>{card.choices && <ul className="mt-5 grid gap-2">{card.choices.map((choice) => <li className="rounded-2xl bg-white p-3 text-sm font-semibold" key={choice}>{choice}</li>)}</ul>}{revealed && <div className="mt-6 rounded-2xl bg-white p-5 text-sm leading-6 text-[#546681]"><strong className="text-[#001632]">Answer:</strong> {card.back || card.answer}<br />{card.explanation}</div>}</div><div className="mt-5 grid gap-3 sm:grid-cols-4"><button className="secondary sm:col-span-1" onClick={() => setRevealed(true)}>Reveal</button><button className="grade bg-emerald-500" onClick={() => onRate("correct")}>Correct</button><button className="grade bg-rose-500" onClick={() => onRate("wrong")}>Wrong</button><button className="grade bg-amber-500" onClick={() => onRate("unsure")}>Unsure</button></div></div></section>; }
function Progress({ progress, streak, activeDay, cards }: { progress: Record<number, ProgressStatus>; streak: number; activeDay: number; cards: Record<number, Flashcard[]> }) { const complete = Object.values(progress).filter((status) => status === "complete").length; const partial = Object.values(progress).filter((status) => status === "lesson_done" || status === "cards_done" || status === "started").length; const missed = Object.values(progress).filter((status) => status === "missed").length; const weakCards = Object.values(cards).flat().filter((card) => card.rating === "wrong" || card.rating === "unsure").length; const rate = Math.round((complete / 7) * 100); return <section className="card"><h2 className="section-title">Progress and streak</h2><p className="mt-2 text-[#546681]">Current streak: <strong className="text-[#001632]">{streak}</strong> full completion day(s). Completion rate: <strong className="text-[#001632]">{rate}%</strong> of the default 7-day sprint.</p><div className="mt-5 grid gap-3 sm:grid-cols-4"><Metric label="Complete" value={`${complete}`} icon={<CheckCircle2 size={18} />} /><Metric label="Partial" value={`${partial}`} icon={<BookOpen size={18} />} /><Metric label="Missed" value={`${missed}`} icon={<CalendarCheck size={18} />} /><Metric label="Weak cards" value={`${weakCards}`} icon={<Brain size={18} />} /></div><div className="mt-8 grid grid-cols-7 gap-3 sm:grid-cols-14">{Array.from({ length: 14 }, (_, i) => <div key={i} className={`aspect-square rounded-xl border ${colorFor(progress[i + 1])} ${i + 1 === activeDay ? "ring-4 ring-[#001632] ring-offset-2" : ""}`} title={`Day ${i + 1}: ${progress[i + 1] ?? "none"}${i + 1 === activeDay ? " — current" : ""}`}><span className="sr-only">Day {i + 1}</span></div>)}</div><div className="mt-8 flex flex-wrap gap-3 text-xs font-bold text-[#546681]">{["none", "started", "lesson_done", "cards_done", "complete", "missed", "catchup"].map((item) => <span key={item} className="flex items-center gap-2"><span className={`h-4 w-4 rounded ${colorFor(item as ProgressStatus)}`} />{item}</span>)}<span className="flex items-center gap-2"><span className="h-4 w-4 rounded border-2 border-[#001632]" />current day outline</span></div></section>; }
function ImportExport({ onExport, onImport, state }: { onExport: () => void; onImport: (file?: File) => void; state: LearningState }) { return <section className="grid gap-6 lg:grid-cols-2"><div className="card"><h2 className="section-title">Export JSON</h2><p className="mt-2 text-sm text-[#546681]">Exports current sprint overview, daily content, flashcards, and progress.</p><button className="primary mt-6" onClick={onExport}><Download size={18} /> Export plan JSON</button></div><div className="card"><h2 className="section-title">Import JSON</h2><p className="mt-2 text-sm text-[#546681]">Production import validates the export shape before creating a new Supabase-backed sprint.</p><label className="secondary mt-6 cursor-pointer"><Upload size={18} /> Import JSON<input type="file" accept="application/json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} /></label></div><pre className="card max-h-96 overflow-auto text-xs lg:col-span-2">{JSON.stringify({ overview: state.overview, progress: state.progress }, null, 2)}</pre></section>; }
function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-2xl bg-white/10 p-3"><div className="mx-auto mb-1 flex justify-center text-sky-200">{icon}</div><div className="text-2xl font-black">{value}</div><div className="text-[10px] font-bold uppercase tracking-widest text-sky-100">{label}</div></div>; }
function Empty({ title }: { title: string }) { return <div className="card text-center"><p className="text-xl font-black">{title}</p><p className="mt-2 text-[#546681]">Create or start a sprint to unlock this section.</p></div>; }
function colorFor(status?: ProgressStatus) { switch (status) { case "complete": return "border-sky-400 bg-[#0AA5FF]"; case "lesson_done": return "border-amber-300 bg-amber-300"; case "cards_done": return "border-cyan-300 bg-cyan-300"; case "started": return "border-blue-200 bg-blue-100"; case "catchup": return "border-orange-400 bg-orange-400"; case "missed": return "border-slate-300 bg-slate-300"; default: return "border-[#E7EDF0] bg-[#F3F9FF]"; } }
