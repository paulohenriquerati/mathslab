"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import {
  type FormEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import {
  generateQuestion,
  operationBadgeLabel,
  operationDisplayName,
} from "@/lib/math/generator";
import {
  accuracyPercent,
  formatMs,
  nextDifficulty,
  scoreAttempt,
  summarizeSession,
} from "@/lib/math/scoring";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  type AttemptRecord,
  type LeaderboardEntry,
  type MathQuestion,
  OPERATION_KEYS,
  type OperationKey,
  type SessionPayload,
} from "@/types/game";

type FeedbackState =
  | { kind: "correct" | "wrong"; label: string; delta: number }
  | null;

type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

const ROUND_OPTIONS = [60, 90, 120, 180] as const;
const TICK_MS = 100;
const LOCAL_LEADERBOARD_KEY = "ninimath-brain-lab:leaderboard";
const ALL_OPERATIONS = [...OPERATION_KEYS] as OperationKey[];

function formatClock(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseAnswer(raw: string) {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function sortLeaderboard(entries: LeaderboardEntry[]) {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function dedupeLeaderboard(entries: LeaderboardEntry[]) {
  const map = new Map<string, LeaderboardEntry>();
  for (const entry of entries) {
    const key = entry.id || `${entry.playerName}:${entry.score}:${entry.createdAt}`;
    if (!map.has(key)) map.set(key, entry);
  }
  return sortLeaderboard([...map.values()]).slice(0, 12);
}

function loadLocalLeaderboard(): LeaderboardEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? dedupeLeaderboard(parsed as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLocalLeaderboard(entries: LeaderboardEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(dedupeLeaderboard(entries)));
  } catch {
    // ignore
  }
}

function makeLocalLeaderboardEntry(payload: SessionPayload): LeaderboardEntry {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    playerName: payload.playerName,
    score: payload.score,
    accuracy: payload.accuracy,
    bestStreak: payload.bestStreak,
    durationSeconds: payload.durationSeconds,
    operationSet: payload.operationSet,
    createdAt: new Date().toISOString(),
  };
}

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "success" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "border-primary/25 bg-primary/8"
      : tone === "success"
        ? "border-success/30 bg-success/10"
        : tone === "warning"
          ? "border-warning/35 bg-warning/12"
          : "border-border bg-white/55";

  return (
    <div className={`panel-soft p-4 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default function MathTrainer() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const supabaseConfigured = Boolean(getSupabaseBrowserClient());

  const [playerName, setPlayerName] = useState("Player");
  const [enabledOperations, setEnabledOperations] = useState<OperationKey[]>([...ALL_OPERATIONS]);
  const [roundSeconds, setRoundSeconds] = useState(90);

  const [question, setQuestion] = useState<MathQuestion>(() =>
    generateQuestion({ enabledOperations: ALL_OPERATIONS, difficulty: 1 }),
  );
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [history, setHistory] = useState<AttemptRecord[]>([]);

  const [timeLeftMs, setTimeLeftMs] = useState(90000);
  const [isRunning, setIsRunning] = useState(false);
  const [isSessionOver, setIsSessionOver] = useState(false);
  const [lastSummary, setLastSummary] = useState<SessionPayload | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const deferredHistory = useDeferredValue(history);

  const answerInputRef = useRef<HTMLInputElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const feedbackFlashRef = useRef<HTMLDivElement>(null);
  const questionStartedAtRef = useRef(0);
  const finishedRef = useRef(false);

  const activeOperations = enabledOperations.length ? enabledOperations : ALL_OPERATIONS;
  const totalRoundMs = roundSeconds * 1000;
  const accuracy = accuracyPercent(correctAnswers, totalAttempts);

  const animateFeedback = useEffectEvent((kind: "correct" | "wrong") => {
    const el = feedbackFlashRef.current;
    if (!el) return;

    if (prefersReducedMotion) {
      el.style.opacity = "0";
      return;
    }

    const backgroundColor =
      kind === "correct"
        ? "rgba(60, 179, 113, 0.22)"
        : "rgba(220, 66, 66, 0.18)";

    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { opacity: 0.95, scale: 0.985, backgroundColor },
      { opacity: 0, scale: 1.01, duration: 0.4, ease: "power2.out" },
    );
  });

  const setNextQuestion = useEffectEvent((nextDifficultyValue: number) => {
    setQuestion(
      generateQuestion({
        enabledOperations: activeOperations,
        difficulty: nextDifficultyValue,
      }),
    );
    questionStartedAtRef.current = performance.now();
  });

  const persistSession = useEffectEvent(async (payload: SessionPayload) => {
    const localEntry = makeLocalLeaderboardEntry(payload);
    setLeaderboard((prev) => {
      const next = dedupeLeaderboard([localEntry, ...prev]);
      saveLocalLeaderboard(next);
      return next;
    });

    if (!supabaseConfigured) {
      setSaveState("offline");
      return;
    }

    try {
      setSaveState("saving");
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        saved?: boolean;
        disabled?: boolean;
        entry?: LeaderboardEntry;
      };

      if (!response.ok) {
        setSaveState("error");
        return;
      }

      if (data.disabled) {
        setSaveState("offline");
        return;
      }

      if (data.entry) {
        setLeaderboard((prev) => {
          const next = dedupeLeaderboard([data.entry as LeaderboardEntry, ...prev]);
          saveLocalLeaderboard(next);
          return next;
        });
      }

      setSaveState(data.saved ? "saved" : "offline");
    } catch {
      setSaveState("error");
    }
  });

  const finishSession = useEffectEvent((reason: "timeout" | "manual") => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    setIsRunning(false);
    setIsSessionOver(true);
    setFeedback(
      reason === "timeout"
        ? { kind: "wrong", label: "Time is up", delta: 0 }
        : { kind: "wrong", label: "Round ended", delta: 0 },
    );

    const payload: SessionPayload = {
      ...summarizeSession({
        playerName: playerName.trim() || "Player",
        score,
        correctAnswers,
        totalAttempts,
        bestStreak,
        durationSeconds: roundSeconds,
        history,
        operationSet: activeOperations,
      }),
      history,
    };

    setLastSummary(payload);
    void persistSession(payload);
  });

  const startSession = useEffectEvent(() => {
    finishedRef.current = false;
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setDifficulty(1);
    setCorrectAnswers(0);
    setTotalAttempts(0);
    setHistory([]);
    setAnswer("");
    setFeedback(null);
    setLastSummary(null);
    setSaveState("idle");
    setIsSessionOver(false);
    setTimeLeftMs(roundSeconds * 1000);
    setIsRunning(true);
    setQuestion(generateQuestion({ enabledOperations: activeOperations, difficulty: 1 }));
    questionStartedAtRef.current = performance.now();
    queueMicrotask(() => answerInputRef.current?.focus());
  });

  const submitAnswer = useEffectEvent((event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!isRunning || isSessionOver) return;

    const parsedAnswer = parseAnswer(answer);
    const responseMs = Math.max(0, Math.round(performance.now() - questionStartedAtRef.current));
    const isCorrect = parsedAnswer !== null && parsedAnswer === question.answer;
    const nextStreak = isCorrect ? streak + 1 : 0;
    const delta = scoreAttempt({ isCorrect, responseMs, streak: nextStreak, difficulty });
    const nextDifficultyValue = nextDifficulty({ current: difficulty, isCorrect, responseMs });

    const attempt: AttemptRecord = {
      questionId: question.id,
      operation: question.operation,
      prompt: question.prompt,
      rawAnswer: answer,
      parsedAnswer,
      correctAnswer: question.answer,
      isCorrect,
      responseMs,
      createdAt: new Date().toISOString(),
    };

    setScore((prev) => prev + delta);
    setStreak(nextStreak);
    setBestStreak((prev) => Math.max(prev, nextStreak));
    setDifficulty(nextDifficultyValue);
    if (isCorrect) setCorrectAnswers((prev) => prev + 1);
    setTotalAttempts((prev) => prev + 1);
    setAnswer("");

    const nextFeedback: FeedbackState = isCorrect
      ? { kind: "correct", label: "Correct", delta }
      : { kind: "wrong", label: `Answer: ${question.answer}`, delta: 0 };

    setFeedback(nextFeedback);
    animateFeedback(nextFeedback.kind);

    startTransition(() => {
      setHistory((prev) => [attempt, ...prev].slice(0, 60));
      setNextQuestion(nextDifficultyValue);
    });

    queueMicrotask(() => answerInputRef.current?.focus());
  });

  const tick = useEffectEvent(() => {
    setTimeLeftMs((prev) => {
      if (!isRunning || isSessionOver) return prev;
      const next = Math.max(0, prev - TICK_MS);
      if (next === 0) queueMicrotask(() => finishSession("timeout"));
      return next;
    });
  });

  useEffect(() => {
    const local = loadLocalLeaderboard();
    setLeaderboard(local);

    let cancelled = false;
    const load = async () => {
      setLoadingLeaderboard(true);
      setLeaderboardError(null);
      try {
        const response = await fetch("/api/sessions", { cache: "no-store" });
        const data = (await response.json()) as {
          entries?: LeaderboardEntry[];
          disabled?: boolean;
        };

        if (cancelled) return;

        if (Array.isArray(data.entries)) {
          const merged = dedupeLeaderboard([...data.entries, ...local]);
          setLeaderboard(merged);
          saveLocalLeaderboard(merged);
        } else if (!data.disabled) {
          setLeaderboardError("Leaderboard unavailable");
        }
      } catch {
        if (!cancelled) setLeaderboardError("Offline leaderboard mode");
      } finally {
        if (!cancelled) setLoadingLeaderboard(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isRunning || isSessionOver) return;
    const id = window.setInterval(() => tick(), TICK_MS);
    return () => window.clearInterval(id);
  }, [isRunning, isSessionOver, tick]);

  useEffect(() => {
    const el = progressFillRef.current;
    if (!el) return;

    const widthPercent = Math.max(0, Math.min(100, (timeLeftMs / totalRoundMs) * 100));
    const targetWidth = `${widthPercent}%`;

    if (prefersReducedMotion) {
      el.style.width = targetWidth;
      return;
    }

    gsap.to(el, {
      width: targetWidth,
      duration: 0.16,
      ease: "power2.out",
      overwrite: "auto",
    });
  }, [timeLeftMs, totalRoundMs, prefersReducedMotion]);

  useEffect(() => {
    if (isRunning) return;
    setTimeLeftMs(roundSeconds * 1000);
  }, [roundSeconds, isRunning]);

  const progressToneClass =
    timeLeftMs < 15000 ? "bg-danger" : timeLeftMs < 30000 ? "bg-warning" : "bg-primary";

  const saveStateLabel =
    saveState === "saving"
      ? "Saving to Supabase..."
      : saveState === "saved"
        ? "Saved"
        : saveState === "offline"
          ? "Local save only"
          : saveState === "error"
            ? "Save failed"
            : supabaseConfigured
              ? "Supabase ready"
              : "Supabase optional";

  return (
    <main className="relative min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
          className="panel relative overflow-hidden p-4 sm:p-6"
        >
          <div className="pointer-events-none absolute inset-0 grid-dot opacity-40" />
          <div ref={feedbackFlashRef} className="pointer-events-none absolute inset-0 opacity-0" />

          <div className="relative">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="pill border-primary/25 bg-primary/8 text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Ninimath-inspired brain drills
                </div>
                <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-4xl">
                  NiniMath Brain Lab
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Timed mental arithmetic with adaptive difficulty for addition,
                  subtraction, multiplication, and division. Minimal UI, instant feedback,
                  and optional Supabase persistence.
                </p>
              </div>
              <div className="grid min-w-[220px] gap-2 self-start">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Player
                </label>
                <input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
                  disabled={isRunning}
                  className="h-11 rounded-xl border bg-white/80 px-3 text-sm outline-none focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-70"
                  placeholder="Player"
                  maxLength={24}
                />
              </div>
            </div>

            <div className="mt-5 rounded-2xl border bg-white/65 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Round Timer
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
                    {formatClock(timeLeftMs)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ROUND_OPTIONS.map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setRoundSeconds(seconds)}
                      disabled={isRunning}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        roundSeconds === seconds
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-white/70 text-foreground hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-muted/70">
                <div
                  ref={progressFillRef}
                  className={`h-full rounded-full ${progressToneClass}`}
                  style={{ width: `${(timeLeftMs / totalRoundMs) * 100}%` }}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {ALL_OPERATIONS.map((operation) => {
                const selected = enabledOperations.includes(operation);
                return (
                  <button
                    key={operation}
                    type="button"
                    disabled={isRunning}
                    onClick={() => {
                      setEnabledOperations((prev) => {
                        const exists = prev.includes(operation);
                        if (exists) {
                          if (prev.length === 1) return prev;
                          return prev.filter((item) => item !== operation);
                        }
                        return [...prev, operation];
                      });
                    }}
                    className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-accent/45 bg-accent/20 text-accent-foreground"
                        : "border-border bg-white/70 text-foreground hover:bg-white"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    aria-pressed={selected}
                  >
                    {operationDisplayName(operation)}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Score" value={score} tone="accent" />
              <StatTile label="Streak" value={streak} tone="success" />
              <StatTile label="Accuracy" value={`${accuracy}%`} tone="warning" />
              <StatTile label="Difficulty" value={`${difficulty}/12`} />
            </div>

            <div className="mt-6 rounded-3xl border bg-white/80 p-4 shadow-[0_18px_60px_-40px_rgba(0,0,0,0.4)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="pill border-border bg-white/80 text-foreground">
                    {operationBadgeLabel(question.operation)}
                  </span>
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {isRunning ? "Live round" : isSessionOver ? "Round complete" : "Ready"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">Attempts {totalAttempts}</div>
              </div>

              <div className="relative mt-5 min-h-[148px] rounded-2xl border bg-gradient-to-br from-white to-muted/50 p-4 sm:min-h-[170px] sm:p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={question.id}
                    initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.98 }}
                    animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
                    className="flex min-h-[116px] flex-col justify-center"
                  >
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Solve mentally
                    </div>
                    <div className="mt-3 font-mono text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
                      {question.prompt}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <form onSubmit={submitAnswer} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <label htmlFor="brain-answer" className="sr-only">
                  Your answer
                </label>
                <input
                  id="brain-answer"
                  ref={answerInputRef}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={!isRunning}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={isRunning ? "Type answer" : "Press Start Round"}
                  className="h-14 flex-1 rounded-2xl border bg-white px-4 font-mono text-2xl outline-none placeholder:font-sans placeholder:text-base placeholder:text-muted-foreground/70 focus:border-primary/40 disabled:cursor-not-allowed disabled:bg-muted/60"
                />
                <div className="flex gap-3 sm:w-auto">
                  <button
                    type="submit"
                    disabled={!isRunning}
                    className="h-14 flex-1 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none"
                  >
                    Submit
                  </button>
                  {!isRunning ? (
                    <button
                      type="button"
                      onClick={() => startSession()}
                      className="h-14 flex-1 rounded-2xl border border-foreground/10 bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-95 sm:flex-none"
                    >
                      {isSessionOver ? "Play Again" : "Start Round"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => finishSession("manual")}
                      className="h-14 flex-1 rounded-2xl border border-danger/20 bg-danger/10 px-5 text-sm font-semibold text-danger transition hover:bg-danger/15 sm:flex-none"
                    >
                      End
                    </button>
                  )}
                </div>
              </form>

              <div className="mt-4 flex min-h-8 items-center justify-between gap-3 text-sm">
                <div className="font-medium">
                  {feedback ? (
                    <span className={feedback.kind === "correct" ? "text-success-foreground" : "text-danger"}>
                      {feedback.label}
                      {feedback.kind === "correct" ? `  +${feedback.delta}` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {isRunning ? "Press Enter to submit quickly" : "Choose settings and start"}
                    </span>
                  )}
                </div>
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Best streak {bestStreak}
                </div>
              </div>
            </div>

            {isSessionOver && lastSummary ? (
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
                className="mt-5 rounded-2xl border border-primary/20 bg-primary/6 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Round summary
                    </div>
                    <div className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                      {lastSummary.playerName}: {lastSummary.score} pts, {lastSummary.accuracy}% accuracy
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {lastSummary.correctAnswers}/{lastSummary.totalAttempts} correct, avg {formatMs(lastSummary.averageResponseMs)}, streak {lastSummary.bestStreak}
                    </div>
                  </div>
                  <div className="pill border-border bg-white/80 text-foreground">{saveStateLabel}</div>
                </div>
              </motion.div>
            ) : null}
          </div>
        </motion.section>

        <motion.aside
          initial={prefersReducedMotion ? false : { opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.35, delay: prefersReducedMotion ? 0 : 0.05 }}
          className="grid gap-6"
        >
          <section className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leaderboard</div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Best rounds</h2>
              </div>
              <div className="pill border-border bg-white/70 text-muted-foreground">
                {loadingLeaderboard ? "Loading" : supabaseConfigured ? "Supabase" : "Local"}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {leaderboard.slice(0, 8).map((entry, index) => (
                <div key={`${entry.id}-${entry.createdAt}`} className="panel-soft flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border bg-white px-2 text-xs font-semibold">
                        {index + 1}
                      </span>
                      <span className="truncate text-sm font-semibold">{entry.playerName}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entry.accuracy}% acc | streak {entry.bestStreak} | {entry.durationSeconds}s
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm font-semibold">{entry.score}</div>
                </div>
              ))}

              {leaderboard.length === 0 ? (
                <div className="panel-soft p-4 text-sm text-muted-foreground">
                  Play a round to create the first score.
                </div>
              ) : null}
            </div>

            {leaderboardError ? (
              <p className="mt-3 text-xs text-muted-foreground">{leaderboardError}</p>
            ) : null}
          </section>

          <section className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent attempts</div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Live log</h2>
              </div>
              <div className="pill border-border bg-white/70 text-muted-foreground">{deferredHistory.length}</div>
            </div>

            <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
              {deferredHistory.map((attempt) => (
                <div
                  key={`${attempt.questionId}-${attempt.createdAt}`}
                  className={`panel-soft p-3 ${
                    attempt.isCorrect ? "border-success/25 bg-success/8" : "border-danger/18 bg-danger/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-sm font-semibold">{attempt.prompt}</div>
                    <div
                      className={`text-xs font-semibold uppercase tracking-[0.15em] ${
                        attempt.isCorrect ? "text-success-foreground" : "text-danger"
                      }`}
                    >
                      {attempt.isCorrect ? "OK" : "MISS"}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <div>
                      You: {attempt.rawAnswer || "-"} | Correct: {attempt.correctAnswer}
                    </div>
                    <div className="font-mono">{formatMs(attempt.responseMs)}</div>
                  </div>
                </div>
              ))}

              {deferredHistory.length === 0 ? (
                <div className="panel-soft p-4 text-sm text-muted-foreground">
                  Your answers will appear here during the round.
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel p-4 sm:p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Stack</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "Next.js 16",
                "React 19 + TypeScript",
                "Tailwind CSS v4",
                "Framer Motion",
                "GSAP",
                "Supabase",
              ].map((tag) => (
                <span key={tag} className="pill border-border bg-white/70 text-foreground">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        </motion.aside>
      </div>
    </main>
  );
}
