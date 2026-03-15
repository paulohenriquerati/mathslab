"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ActivityHeatmap from "@/components/activity-heatmap";
import DayDetailPanel from "@/components/day-detail-panel";
import WeeklyTrend from "@/components/weekly-trend";
import { useIdentity } from "@/lib/auth/identity-context";
import type { DayStat, StatsResponse } from "@/app/api/stats/route";

export default function StatsPage() {
  const { playerName } = useIdentity();
  const year = new Date().getFullYear();

  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStat, setSelectedStat] = useState<DayStat | null>(null);

  useEffect(() => {
    if (!playerName) return;
    setLoading(true);
    setError(null);
    fetch(`/api/stats?year=${year}&playerName=${encodeURIComponent(playerName)}`)
      .then((r) => r.json())
      .then((d: StatsResponse) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load stats"); setLoading(false); });
  }, [playerName, year]);

  const handleDaySelect = useCallback((stat: DayStat | null, date: string) => {
    if (date === selectedDate) {
      setSelectedDate(null);
      setSelectedStat(null);
    } else {
      setSelectedDate(date);
      setSelectedStat(stat);
    }
  }, [selectedDate]);

  // Summary stats
  const days = data?.days ?? {};
  const allSessions = Object.values(days).flatMap((d) => d.sessions);
  const totalSessions = allSessions.length;
  const bestScore = allSessions.length > 0 ? Math.max(...allSessions.map((s) => s.score)) : 0;
  const activeDays = Object.keys(days).length;
  const avgAccuracy = totalSessions > 0
    ? (allSessions.reduce((sum, s) => sum + s.accuracy, 0) / totalSessions).toFixed(1)
    : "—";

  return (
    <main className="relative min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      {/* Dot grid background */}
      <div className="pointer-events-none fixed inset-0 grid-dot opacity-30" />

      <div className="relative mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <Link
              href="/"
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
            >
              ← Back to game
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {playerName}&apos;s Stats
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{year} activity overview</p>
          </div>
          <div className="pill border-primary/25 bg-primary/8 text-primary self-start">
            <span className="h-2 w-2 rounded-full bg-primary" />
            BrainLab
          </div>
        </motion.div>

        {/* Summary tiles */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {[
            { label: "Total Sessions", value: totalSessions.toString() },
            { label: "Active Days", value: activeDays.toString() },
            { label: "Personal Best", value: bestScore > 0 ? bestScore.toLocaleString() : "—" },
            { label: "Avg Accuracy", value: `${avgAccuracy}%` },
          ].map(({ label, value }) => (
            <div key={label} className="panel-soft border p-4 text-center">
              <div className="font-mono text-2xl font-bold">{value}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {label}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Heatmap */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="panel p-5 sm:p-6"
        >
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Activity Map</div>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
              {year} — every day
            </h2>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Loading activity…
            </div>
          ) : error ? (
            <div className="flex h-32 items-center justify-center text-sm text-danger">{error}</div>
          ) : (
            <ActivityHeatmap
              days={days}
              year={year}
              onDaySelect={handleDaySelect}
              selectedDate={selectedDate}
            />
          )}
        </motion.section>

        {/* Day detail */}
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <DayDetailPanel
              stat={selectedStat}
              date={selectedDate}
              onClose={() => { setSelectedDate(null); setSelectedStat(null); }}
            />
          </motion.div>
        )}

        {/* Weekly trend */}
        {!loading && !error && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="panel p-5 sm:p-6"
          >
            <WeeklyTrend days={days} year={year} />
          </motion.section>
        )}

        {/* Empty state */}
        {!loading && !error && totalSessions === 0 && (
          <div className="rounded-3xl border border-dashed bg-white/50 p-10 text-center">
            <div className="text-4xl mb-3">📊</div>
            <h3 className="font-semibold tracking-tight">No sessions yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Play some rounds and come back to see your activity map.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex h-10 items-center rounded-xl bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90"
            >
              Start playing
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
