"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import type { LeaderboardEntry, SessionPayload } from "@/types/game";
import { formatMs } from "@/lib/math/scoring";

interface Props {
  summary: SessionPayload | null;
  leaderboard: LeaderboardEntry[];
  saveStateLabel: string;
  onPlayAgain: () => void;
  onClose: () => void;
  prefersReducedMotion: boolean;
}

function ScoreDelta({ current, best }: { current: number; best: number }) {
  if (best === 0 || current === best) return null;
  const delta = current - best;
  const pct = Math.abs(Math.round((delta / best) * 100));
  const positive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
        positive
          ? "bg-success/15 text-success-foreground"
          : "bg-danger/10 text-danger"
      }`}
    >
      {positive ? "▲" : "▼"} {pct}%{" "}
      <span className="font-normal opacity-80">
        {positive ? "above" : "below"} best
      </span>
    </span>
  );
}

function Ring({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${color} font-mono text-lg font-bold`}
      >
        {value}
      </div>
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export default function SessionResultsModal({
  summary,
  leaderboard,
  saveStateLabel,
  onPlayAgain,
  onClose,
  prefersReducedMotion,
}: Props) {
  if (!summary) return null;

  // Personal best from leaderboard (excluding the current result — it's already
  // merged in, so we take the top score overall; the current score is summary.score).
  const topScore = leaderboard.length > 0
    ? Math.max(...leaderboard.map((e) => e.score))
    : 0;
  const isNewBest = summary.score > 0 && summary.score >= topScore;

  // Previous best = best among entries OTHER than this session's score
  // We approximate by using the second-highest unique score.
  const sortedScores = [...new Set(leaderboard.map((e) => e.score))].sort(
    (a, b) => b - a,
  );
  const prevBest = sortedScores.length > 1 ? sortedScores[1] : sortedScores[0] ?? 0;
  const comparisonBase = isNewBest ? prevBest : topScore;

  const accuracy = summary.accuracy;
  const grade =
    accuracy >= 95
      ? { label: "S", color: "border-primary text-primary" }
      : accuracy >= 85
        ? { label: "A", color: "border-success text-success-foreground" }
        : accuracy >= 70
          ? { label: "B", color: "border-accent text-accent-foreground" }
          : accuracy >= 50
            ? { label: "C", color: "border-warning text-warning-foreground" }
            : { label: "D", color: "border-danger text-danger" };

  return (
    <AnimatePresence>
      {summary && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Round results"
            initial={
              prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.96 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }
            }
            transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
          >
            <div className="panel relative my-auto w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden">
              {/* Dot grid deco */}
              <div className="pointer-events-none absolute inset-0 grid-dot opacity-25" />

              {/* Top color accent bar */}
              <div
                className={`h-1 w-full ${isNewBest ? "bg-primary" : "bg-accent"}`}
              />

              <div className="relative flex flex-col overflow-y-auto p-5 sm:p-6">
                {/* Header */}
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    {isNewBest ? (
                      <div className="pill mb-2 border-primary/30 bg-primary/10 text-primary">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        🏆 New personal best!
                      </div>
                    ) : (
                      <div className="pill mb-2 border-border bg-white/70 text-muted-foreground">
                        Round complete
                      </div>
                    )}
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                      {summary.playerName}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {summary.durationSeconds}s ·{" "}
                        {summary.operationSet
                          .map((op) =>
                            op === "addition"
                              ? "+"
                              : op === "subtraction"
                                ? "−"
                                : op === "multiplication"
                                  ? "×"
                                  : "÷",
                          )
                          .join(" ")}
                      </span>
                    </div>
                  </div>

                  {/* Grade ring */}
                  <Ring value={grade.label} label="Grade" color={grade.color} />
                </div>

                {/* Main score */}
                <div className="mb-4 rounded-2xl border bg-white/60 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Score
                  </div>
                  <div className="mt-1 flex items-end gap-3">
                    <span className="font-mono text-5xl font-bold tracking-tight">
                      {summary.score}
                    </span>
                    <span className="mb-1.5 text-sm text-muted-foreground">pts</span>
                    <div className="mb-1.5">
                      <ScoreDelta
                        current={summary.score}
                        best={comparisonBase}
                      />
                    </div>
                  </div>
                  {isNewBest && comparisonBase > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Previous best: {comparisonBase} pts
                    </div>
                  )}
                </div>

                {/* Stats grid */}
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border bg-white/55 p-3 text-center">
                    <div className="font-mono text-xl font-semibold">
                      {accuracy}%
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Accuracy
                    </div>
                  </div>
                  <div className="rounded-xl border bg-white/55 p-3 text-center">
                    <div className="font-mono text-xl font-semibold">
                      {summary.correctAnswers}/{summary.totalAttempts}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Correct
                    </div>
                  </div>
                  <div className="rounded-xl border bg-white/55 p-3 text-center">
                    <div className="font-mono text-xl font-semibold">
                      {summary.bestStreak}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Best Streak
                    </div>
                  </div>
                  <div className="col-span-3 rounded-xl border bg-white/55 p-3 text-center">
                    <div className="font-mono text-xl font-semibold">
                      {formatMs(summary.averageResponseMs)}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Avg Response Time
                    </div>
                  </div>
                </div>

                {/* Save status */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="pill border-border bg-white/70 text-muted-foreground text-[11px]">
                    {saveStateLabel}
                  </span>
                </div>

                {/* CTAs */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={onPlayAgain}
                    className="h-12 flex-1 rounded-2xl bg-foreground text-sm font-semibold text-background transition hover:opacity-90 active:scale-[0.98]"
                    autoFocus
                  >
                    Play Again
                  </button>
                  <Link
                    href="/stats"
                    className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-border bg-white/70 text-sm font-medium text-foreground transition hover:bg-white active:scale-[0.98]"
                  >
                    📊 View Stats
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
