"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { DayStat } from "@/app/api/stats/route";
import type { OperationKey } from "@/types/game";

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];
const DAYS = ["","Mon","","Wed","","Fri",""];

type ModeFilter = "all" | OperationKey;

interface Props {
  days: Record<string, DayStat>;
  year: number;
  onDaySelect: (stat: DayStat | null, date: string) => void;
  selectedDate: string | null;
}

function getIntensity(score: number, maxScore: number): number {
  if (score === 0 || maxScore === 0) return 0;
  return Math.ceil((score / maxScore) * 4);
}

function intensityClass(level: number, isSelected: boolean): string {
  if (isSelected) return "fill-primary stroke-primary/30";
  switch (level) {
    case 1: return "fill-accent/30 stroke-accent/20";
    case 2: return "fill-accent/55 stroke-accent/30";
    case 3: return "fill-primary/50 stroke-primary/30";
    case 4: return "fill-primary stroke-primary/40";
    default: return "fill-muted/60 stroke-border";
  }
}

function buildWeeks(year: number, days: Record<string, DayStat>, mode: ModeFilter) {
  const jan1 = new Date(year, 0, 1);
  const startOffset = jan1.getDay(); // 0=Sun
  // Build 53 weeks × 7 days
  const cells: { date: string; stat: DayStat | null; score: number }[][] = [];
  let week: { date: string; stat: DayStat | null; score: number }[] = [];

  // Pad start
  for (let i = 0; i < startOffset; i++) {
    week.push({ date: "", stat: null, score: 0 });
  }

  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const totalDays = isLeap ? 366 : 365;

  for (let d = 0; d < totalDays; d++) {
    const date = new Date(year, 0, d + 1);
    const key = date.toISOString().slice(0, 10);
    let stat = days[key] ?? null;

    // Filter by mode
    let score = 0;
    if (stat) {
      if (mode !== "all") {
        const filtered = stat.sessions.filter((s) =>
          s.operationSet.length === 1 && s.operationSet[0] === mode,
        );
        score = filtered.length > 0 ? Math.max(...filtered.map((s) => s.score)) : 0;
      } else {
        score = stat.bestScore;
      }
    }

    week.push({ date: key, stat: score > 0 ? stat : null, score });

    if (week.length === 7) {
      cells.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ date: "", stat: null, score: 0 });
    cells.push(week);
  }

  return cells;
}

const MODE_OPTIONS: { mode: ModeFilter; label: string }[] = [
  { mode: "all", label: "All" },
  { mode: "addition", label: "[+]" },
  { mode: "subtraction", label: "[-]" },
  { mode: "multiplication", label: "[×]" },
  { mode: "division", label: "[÷]" },
];

export default function ActivityHeatmap({ days, year, onDaySelect, selectedDate }: Props) {
  const [mode, setMode] = useState<ModeFilter>("all");
  const [tooltip, setTooltip] = useState<{ date: string; score: number; x: number; y: number } | null>(null);

  const weeks = buildWeeks(year, days, mode);
  const allScores = weeks.flat().map((c) => c.score);
  const maxScore = Math.max(...allScores, 1);

  const CELL = 13;
  const GAP = 3;
  const STRIDE = CELL + GAP;
  const svgW = weeks.length * STRIDE + 28;
  const svgH = 7 * STRIDE + 22;

  return (
    <div className="space-y-4">
      {/* Mode filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mode</span>
        {MODE_OPTIONS.map(({ mode: m, label }) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              mode === m
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-white/70 hover:bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Heatmap SVG */}
      <div className="relative overflow-x-auto">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="font-mono"
        >
          {/* Day labels */}
          {DAYS.map((label, i) =>
            label ? (
              <text
                key={i}
                x={4}
                y={22 + i * STRIDE + CELL / 2 + 4}
                fontSize={9}
                className="fill-muted-foreground"
              >
                {label}
              </text>
            ) : null,
          )}

          {/* Month labels */}
          {weeks.map((week, wi) => {
            const firstFull = week.find((c) => c.date);
            if (!firstFull) return null;
            const d = new Date(firstFull.date);
            if (d.getDate() <= 7) {
              return (
                <text
                  key={wi}
                  x={28 + wi * STRIDE}
                  y={10}
                  fontSize={9}
                  className="fill-muted-foreground"
                >
                  {MONTHS[d.getMonth()]}
                </text>
              );
            }
            return null;
          })}

          {/* Cells */}
          {weeks.map((week, wi) =>
            week.map((cell, di) => {
              if (!cell.date) return null;
              const cx = 28 + wi * STRIDE;
              const cy = 22 + di * STRIDE;
              const intensity = getIntensity(cell.score, maxScore);
              const isSelected = cell.date === selectedDate;

              return (
                <g key={`${wi}-${di}`}>
                  <rect
                    x={cx}
                    y={cy}
                    width={CELL}
                    height={CELL}
                    rx={3}
                    className={`cursor-pointer transition-all ${intensityClass(intensity, isSelected)} stroke-[0.5]`}
                    onClick={() => onDaySelect(cell.stat, cell.date)}
                    onMouseEnter={(e) => {
                      const rect = (e.target as SVGRectElement).getBoundingClientRect();
                      setTooltip({ date: cell.date, score: cell.score, x: rect.left, y: rect.top });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                </g>
              );
            }),
          )}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-none fixed z-50 rounded-xl border bg-card px-3 py-2 shadow-lg text-xs"
            style={{ left: tooltip.x + 18, top: tooltip.y - 8 }}
          >
            <div className="font-semibold text-foreground">{tooltip.date}</div>
            <div className="text-muted-foreground">
              {tooltip.score > 0 ? `Best score: ${tooltip.score}` : "No sessions"}
            </div>
          </motion.div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {[0, 1, 2, 3, 4].map((lv) => (
          <rect
            key={lv}
            className={`inline-block h-3 w-3 rounded-sm ${intensityClass(lv, false)}`}
          />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  );
}
