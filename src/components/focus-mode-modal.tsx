"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MathQuestion } from "@/types/game";
import { operationBadgeLabel } from "@/lib/math/generator";

export type FeedbackState =
  | { kind: "correct" | "wrong"; label: string; delta: number }
  | null;

/* ─── Timer helpers ────────────────────────── */
function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ─── Circular timer ring ───────────────────── */
function TimerRing({ ratio, urgent }: { ratio: number; urgent: boolean }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  return (
    <svg className="-rotate-90 absolute inset-0" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r={r} stroke="currentColor" strokeWidth="4"
        className="text-white/15" />
      <motion.circle
        cx="60" cy="60" r={r}
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className={urgent ? "text-red-400" : "text-white/70"}
        strokeDasharray={circ}
        animate={{ strokeDashoffset: circ * (1 - ratio) }}
        transition={{ duration: 0.12, ease: "linear" }}
      />
    </svg>
  );
}

/* ─── Props ────────────────────────────────── */
export interface FocusModeProps {
  question: MathQuestion;
  isRunning: boolean;
  timeLeftMs: number;
  totalRoundMs: number;
  score: number;
  streak: number;
  accuracy: number;
  answer: string;
  setAnswer: (v: string) => void;
  feedback: FeedbackState;
  onSubmit: () => void;
  onExit: () => void;
  prefersReducedMotion: boolean;
}

/* ─── Main component ────────────────────────── */
export default function FocusModeModal({
  question,
  isRunning,
  timeLeftMs,
  totalRoundMs,
  score,
  streak,
  accuracy,
  answer,
  setAnswer,
  feedback,
  onSubmit,
  onExit,
  prefersReducedMotion,
}: FocusModeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ratio = totalRoundMs > 0 ? timeLeftMs / totalRoundMs : 1;
  const urgent = timeLeftMs < 15_000;

  /* Auto-focus the input whenever the modal first mounts or question changes */
  useEffect(() => {
    inputRef.current?.focus();
  }, [question.id]);

  return (
    <motion.div
      key="focus-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(18px) saturate(0.6)", WebkitBackdropFilter: "blur(18px) saturate(0.6)" }}
    >
      {/* Dark veil */}
      <div className="absolute inset-0 bg-foreground/50" />

      {/* Focus card */}
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 32 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-4 w-full max-w-lg"
      >
        {/* Card body */}
        <div className="overflow-hidden rounded-3xl border border-white/20 bg-foreground/90 shadow-[0_32px_80px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">

          {/* Top bar — timer + stats */}
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
            {/* Circular timer */}
            <div className="relative flex h-[120px] w-[120px] shrink-0 items-center justify-center">
              <TimerRing ratio={ratio} urgent={urgent} />
              <div className="relative text-center">
                <div className={`font-mono text-2xl font-bold tabular-nums ${urgent ? "text-red-400" : "text-white"}`}>
                  {formatClock(timeLeftMs)}
                </div>
                <div className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-white/50">remaining</div>
              </div>
            </div>

            {/* Stats pills */}
            <div className="flex flex-1 flex-col gap-2">
              {[
                { label: "Score", value: score, color: "text-primary" },
                { label: "Streak", value: streak, color: "text-success" },
                { label: "Accuracy", value: `${accuracy}%`, color: "text-warning" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/6 px-3 py-1.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-white/50">{label}</span>
                  <motion.span
                    key={String(value)}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 26 }}
                    className={`font-mono text-sm font-bold ${color}`}
                  >
                    {value}
                  </motion.span>
                </div>
              ))}
            </div>
          </div>

          {/* Question */}
          <div className="px-6 py-8">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-xs text-white/60">
                {operationBadgeLabel(question.operation)}
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">Focus Mode</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={question.id}
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.97 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="font-mono text-5xl font-bold tracking-tight text-white sm:text-6xl"
              >
                {question.prompt}
              </motion.div>
            </AnimatePresence>

            {/* Feedback */}
            <div className="mt-3 h-7">
              <AnimatePresence mode="wait">
                {feedback && (
                  <motion.div
                    key={`${feedback.kind}-${feedback.label}`}
                    initial={{ opacity: 0, y: 6, scale: 0.88 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ type: "spring", stiffness: 460, damping: 28 }}
                    className={`text-sm font-semibold ${feedback.kind === "correct" ? "text-green-400" : "text-red-400"}`}
                  >
                    {feedback.label}
                    {feedback.kind === "correct" && (
                      <span className="ml-1.5">+{feedback.delta}</span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input + Submit */}
            <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="mt-4 flex gap-3">
              <input
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={!isRunning}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Your answer…"
                className="h-14 flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 font-mono text-2xl text-white outline-none placeholder:font-sans placeholder:text-base placeholder:text-white/30 focus:border-primary/60 focus:ring-4 focus:ring-primary/20 disabled:opacity-50 transition-shadow"
              />
              <motion.button
                type="submit"
                disabled={!isRunning}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                className="h-14 rounded-2xl bg-primary px-6 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                Submit
              </motion.button>
            </form>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/10 px-6 py-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/30">
              Press Enter to submit fast
            </span>
            <button
              type="button"
              onClick={onExit}
              className="text-xs text-white/40 transition hover:text-white/80"
            >
              Exit focus mode ✕
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
