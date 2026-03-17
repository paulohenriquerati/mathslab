"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import Link from "next/link";
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
import { useIdentity } from "@/lib/auth/identity-context";
import SessionResultsModal from "@/components/session-results-modal";
import NumberCustomizer from "@/components/number-customizer";
import FocusModeModal, { type FeedbackState } from "@/components/focus-mode-modal";
import {
  playCorrect,
  playWrong,
  playStreak,
  setMuted,
  isMuted,
} from "@/lib/audio/sounds";
import {
  type AttemptRecord,
  type LeaderboardEntry,
  type MathQuestion,
  type NumberConfig,
  OPERATION_KEYS,
  type OperationKey,
  type SessionPayload,
} from "@/types/game";

// FeedbackState is re-exported from focus-mode-modal to avoid duplication

type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

const ROUND_OPTIONS = [15, 30, 60, 90, 120, 180] as const;
const TICK_MS = 100;
const LOCAL_LEADERBOARD_KEY = "ninimath-brain-lab:leaderboard";
const ALL_OPERATIONS = [...OPERATION_KEYS] as OperationKey[];

type OperationMode = "all" | OperationKey;

const MODE_PRESETS: { mode: OperationMode; label: string; ops: OperationKey[] }[] = [
  { mode: "all",            label: "All",              ops: [...ALL_OPERATIONS] },
  { mode: "addition",       label: "[+] Addition",      ops: ["addition"] },
  { mode: "subtraction",    label: "[-] Subtraction",   ops: ["subtraction"] },
  { mode: "multiplication", label: "[×] Multiplication",ops: ["multiplication"] },
  { mode: "division",       label: "[÷] Division",      ops: ["division"] },
];

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
  index = 0,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "success" | "warning";
  index?: number;
}) {
  const toneClass =
    tone === "accent"
      ? "border-primary/25 bg-primary/10"
      : tone === "success"
        ? "border-success/30 bg-success/10"
        : tone === "warning"
          ? "border-warning/35 bg-warning/12"
          : "border-border bg-white/55";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={`panel-soft p-4 ${toneClass}`}
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <motion.div
        key={String(value)}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        className="mt-2 font-mono text-2xl font-semibold text-foreground"
      >
        {value}
      </motion.div>
    </motion.div>
  );
}

export default function MathTrainer() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const supabaseConfigured = Boolean(getSupabaseBrowserClient());
  const { playerName, isGuest, signOut } = useIdentity();

  const [operationMode, setOperationMode] = useState<OperationMode>("all");
  const [roundSeconds, setRoundSeconds] = useState(90);
  const [numberConfig, setNumberConfig] = useState<NumberConfig | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showFocusModal, setShowFocusModal] = useState(false);

  // Sound mute toggle — persisted to localStorage
  const [soundMuted, setSoundMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("ninimath:muted");
    const val = saved === "true";
    setMuted(val);
    return val;
  });

  function toggleMute() {
    setSoundMuted((prev) => {
      const next = !prev;
      setMuted(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("ninimath:muted", String(next));
      }
      return next;
    });
  }

  const enabledOperations = MODE_PRESETS.find((p) => p.mode === operationMode)?.ops ?? ALL_OPERATIONS;

  const [question, setQuestion] = useState<MathQuestion>(() =>
    generateQuestion({ enabledOperations: ALL_OPERATIONS, difficulty: 1, numberConfig: null }),
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
  const [showModal, setShowModal] = useState(false);

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
        numberConfig,
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
    setShowFocusModal(false);
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
      isGuest,
    };

    setLastSummary(payload);
    void persistSession(payload);
    setShowModal(true);
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
    setShowModal(false);
    setTimeLeftMs(roundSeconds * 1000);
    setIsRunning(true);
    setQuestion(generateQuestion({ enabledOperations: activeOperations, difficulty: 1, numberConfig }));
    questionStartedAtRef.current = performance.now();
    if (isFocusMode) {
      setShowFocusModal(true);
    } else {
      setShowFocusModal(false);
      queueMicrotask(() => answerInputRef.current?.focus());
    }
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

    // Play sounds
    if (isCorrect) {
      playCorrect();
      playStreak(nextStreak);
    } else {
      playWrong();
    }

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
      {/* Focus Mode Modal */}
      <AnimatePresence>
        {showFocusModal && (
          <FocusModeModal
            question={question}
            isRunning={isRunning}
            timeLeftMs={timeLeftMs}
            totalRoundMs={totalRoundMs}
            score={score}
            streak={streak}
            accuracy={accuracy}
            answer={answer}
            setAnswer={setAnswer}
            feedback={feedback}
            onSubmit={submitAnswer}
            onExit={() => {
              setShowFocusModal(false);
              queueMicrotask(() => answerInputRef.current?.focus());
            }}
            prefersReducedMotion={prefersReducedMotion}
          />
        )}
      </AnimatePresence>

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
                  BrainLab
                </div>
                <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-4xl">
                  Your math mental gym!
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Timed mental arithmetic with adaptive difficulty for addition,
                  subtraction, multiplication, and division. Minimal UI, instant feedback,
                  and optional Supabase persistence.
                </p>
              </div>
              {/* Identity pill */}
              <div className="flex flex-col items-end gap-2 self-start">
                <div className="pill border-border bg-white/80 text-foreground">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  {playerName}
                  {isGuest && (
                    <span className="text-red-600">&nbsp;(GUEST)</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href="/stats"
                    className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition hover:text-foreground"
                  >
                    📊 Stats
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    disabled={isRunning}
                    className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border bg-white/65 p-3 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] uppercase tracking-[0.18em] text-red-500">
                    Round Timer
                  </div>
                  <motion.div
                    key={formatClock(timeLeftMs)}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14 }}
                    className="mt-1 font-mono text-2xl font-semibold tracking-tight sm:text-3xl"
                  >
                    {formatClock(timeLeftMs)}
                  </motion.div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ROUND_OPTIONS.map((seconds) => (
                    <motion.button
                      key={seconds}
                      type="button"
                      onClick={() => setRoundSeconds(seconds)}
                      disabled={isRunning}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.93 }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${roundSeconds === seconds
                        ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-white/70 text-foreground hover:bg-white"
                        } disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      {seconds}s
                    </motion.button>
                  ))}
                </div>
              </div>
              <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-muted/70">
                <motion.div
                  className={`h-full rounded-full ${progressToneClass}`}
                  animate={{ width: `${(timeLeftMs / totalRoundMs) * 100}%` }}
                  transition={{ duration: 0.12, ease: "linear" }}
                />
              </div>
            </div>

            {/* Operation mode selector */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Mode
                </div>
                <div className="flex items-center gap-2">
                  {/* Sound mute toggle */}
                  <motion.button
                    type="button"
                    onClick={toggleMute}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.9 }}
                    title={soundMuted ? "Unmute sounds" : "Mute sounds"}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white/70 text-base transition hover:bg-white"
                  >
                    {soundMuted ? "🔇" : "🔊"}
                  </motion.button>
                  {/* Focus Mode toggle */}
                  <motion.button
                    type="button"
                    disabled={isRunning}
                    onClick={() => setIsFocusMode((v) => !v)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                      isFocusMode
                        ? "border-foreground/40 bg-foreground text-background"
                        : "border-border bg-white/70 text-foreground hover:bg-white"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span>{isFocusMode ? "◉" : "○"}</span>
                    Focus Mode
                  </motion.button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {MODE_PRESETS.map(({ mode, label }) => {
                  const selected = operationMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={isRunning}
                      onClick={() => setOperationMode(mode)}
                      aria-pressed={selected}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        selected
                          ? mode === "all"
                            ? "border-primary/40 bg-primary/12 text-primary"
                            : "border-accent/45 bg-accent/20 text-accent-foreground"
                          : "border-border bg-white/70 text-foreground hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Number customizer */}
              <NumberCustomizer
                config={numberConfig}
                onChange={setNumberConfig}
                disabled={isRunning}
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Score" value={score} tone="accent" index={0} />
              <StatTile label="Streak" value={streak} tone="success" index={1} />
              <StatTile label="Accuracy" value={`${accuracy}%`} tone="warning" index={2} />
              <StatTile label="Difficulty" value={`${difficulty}/12`} index={3} />
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
                  className="h-14 flex-1 rounded-2xl border bg-white px-4 font-mono text-2xl outline-none placeholder:font-sans placeholder:text-base placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-4 focus:ring-primary/12 disabled:cursor-not-allowed disabled:bg-muted/60 transition-shadow"
                />
                <div className="flex gap-3 sm:w-auto">
                  <motion.button
                    type="submit"
                    disabled={!isRunning}
                    whileHover={{ scale: isRunning ? 1.02 : 1 }}
                    whileTap={{ scale: isRunning ? 0.95 : 1 }}
                    className="h-14 flex-1 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none"
                  >
                    Submit
                  </motion.button>
                  {!isRunning ? (
                    <motion.button
                      type="button"
                      onClick={() => startSession()}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                      className="h-14 flex-1 rounded-2xl border border-foreground/10 bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-95 sm:flex-none"
                    >
                      {isSessionOver ? "Play Again" : "Start Round"}
                    </motion.button>
                  ) : (
                    <motion.button
                      type="button"
                      onClick={() => finishSession("manual")}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      className="h-14 flex-1 rounded-2xl border border-danger/20 bg-danger/10 px-5 text-sm font-semibold text-danger transition hover:bg-danger/15 sm:flex-none"
                    >
                      End
                    </motion.button>
                  )}
                </div>
              </form>

              <div className="mt-4 flex min-h-8 items-center justify-between gap-3 text-sm">
                <div className="font-medium">
                  <AnimatePresence mode="wait">
                    {feedback ? (
                      <motion.span
                        key={`${feedback.kind}-${feedback.label}`}
                        initial={{ opacity: 0, y: 8, scale: 0.85 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 480, damping: 28 }}
                        className={`inline-block ${feedback.kind === "correct" ? "text-success-foreground" : "text-danger"}`}
                      >
                        {feedback.label}
                        {feedback.kind === "correct" && (
                          <motion.span
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="ml-1.5 font-semibold"
                          >
                            +{feedback.delta}
                          </motion.span>
                        )}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-muted-foreground"
                      >
                        {isRunning ? "Press Enter to submit quickly" : "Choose settings and start"}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Best streak {bestStreak}
                </div>
              </div>
            </div>

            {/* Session results modal */}
            <SessionResultsModal
              summary={showModal && isSessionOver ? lastSummary : null}
              leaderboard={leaderboard}
              saveStateLabel={saveStateLabel}
              onPlayAgain={() => startSession()}
              onClose={() => setShowModal(false)}
              prefersReducedMotion={prefersReducedMotion}
            />
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
                <motion.div
                  key={`${entry.id}-${entry.createdAt}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.28, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  className="panel-soft panel-soft-hover flex items-center justify-between gap-3 p-3 cursor-default"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-xs font-semibold ${
                        index === 0 ? "border-warning/50 bg-warning/15 text-warning-foreground" :
                        index === 1 ? "border-muted-foreground/30 bg-muted/50 text-muted-foreground" :
                        "bg-white border-border"
                      }`}>
                        {index + 1}
                      </span>
                      <span className="truncate text-sm font-semibold">{entry.playerName}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entry.accuracy}% acc | streak {entry.bestStreak} | {entry.durationSeconds}s
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm font-semibold">{entry.score}</div>
                </motion.div>
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
              <AnimatePresence initial={false}>
                {deferredHistory.map((attempt) => (
                  <motion.div
                    key={`${attempt.questionId}-${attempt.createdAt}`}
                    initial={{ opacity: 0, x: 20, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -10, scale: 0.96 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className={`panel-soft p-3 ${attempt.isCorrect ? "border-success/25 bg-success/8" : "border-danger/18 bg-danger/5"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-sm font-semibold">{attempt.prompt}</div>
                      <div
                        className={`text-xs font-semibold uppercase tracking-[0.15em] ${attempt.isCorrect ? "text-success-foreground" : "text-danger"
                          }`}
                      >
                        {attempt.isCorrect ? "✓ OK" : "✗ MISS"}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div>
                        You: {attempt.rawAnswer || "-"} | Correct: {attempt.correctAnswer}
                      </div>
                      <div className="font-mono">{formatMs(attempt.responseMs)}</div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

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
