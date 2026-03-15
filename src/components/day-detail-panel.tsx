"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { DayStat } from "@/app/api/stats/route";
import { formatMs } from "@/lib/math/scoring";

const OP_ICON: Record<string, string> = {
  addition: "+",
  subtraction: "−",
  multiplication: "×",
  division: "÷",
};

interface Props {
  stat: DayStat | null;
  date: string | null;
  onClose: () => void;
}

export default function DayDetailPanel({ stat, date, onClose }: Props) {
  return (
    <AnimatePresence>
      {stat && date && (
        <motion.div
          key={date}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2 }}
          className="panel-soft border p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {date}
              </div>
              <h3 className="mt-0.5 text-lg font-semibold tracking-tight">
                {stat.totalSessions} session{stat.totalSessions !== 1 ? "s" : ""}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-muted-foreground transition hover:text-foreground"
            >
              ✕ Close
            </button>
          </div>

          {/* Quick stats row */}
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border bg-white/55 p-2">
              <div className="font-mono text-lg font-semibold">{stat.bestScore}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Best Score</div>
            </div>
            <div className="rounded-xl border bg-white/55 p-2">
              <div className="font-mono text-lg font-semibold">{stat.bestAccuracy.toFixed(1)}%</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Best Acc.</div>
            </div>
            <div className="rounded-xl border bg-white/55 p-2">
              <div className="font-mono text-lg font-semibold">{stat.bestStreak}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Best Streak</div>
            </div>
          </div>

          {/* Session bars chart */}
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Sessions
            </div>
            {[...stat.sessions]
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((session, i) => {
                const pct = stat.bestScore > 0 ? (session.score / stat.bestScore) * 100 : 0;
                const time = new Date(session.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div key={session.id} className="group rounded-xl border bg-white/50 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-white text-[10px] font-semibold">
                          {i + 1}
                        </span>
                        <div className="flex gap-1">
                          {session.operationSet.map((op) => (
                            <span
                              key={op}
                              className="pill border-accent/30 bg-accent/15 text-accent-foreground px-1.5 py-0 text-[10px]"
                            >
                              {OP_ICON[op] ?? op}
                            </span>
                          ))}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{time}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-sm font-semibold">{session.score}</span>
                        <span className="ml-1 text-[11px] text-muted-foreground">pts</span>
                      </div>
                    </div>
                    {/* Score bar */}
                    <div className="h-1.5 rounded-full bg-muted/60">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.05 }}
                        className="h-full rounded-full bg-primary"
                      />
                    </div>
                    <div className="mt-1.5 flex gap-3 text-[10px] text-muted-foreground">
                      <span>{session.accuracy.toFixed(1)}% acc</span>
                      <span>streak {session.bestStreak}</span>
                      <span>{session.durationSeconds}s round</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
