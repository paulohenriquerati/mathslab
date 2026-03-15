"use client";

import type { DayStat } from "@/app/api/stats/route";

interface Props {
  days: Record<string, DayStat>;
  year: number;
}

function getWeeklyBests(days: Record<string, DayStat>, year: number): { week: number; best: number; label: string }[] {
  const result: { week: number; best: number; label: string }[] = [];
  // Last 12 ISO weeks
  for (let w = 11; w >= 0; w--) {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);

    let best = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + d);
      const key = day.toISOString().slice(0, 10);
      if (days[key]) {
        best = Math.max(best, days[key].bestScore);
      }
    }

    const label = weekStart.toLocaleDateString("en", { month: "short", day: "numeric" });
    result.push({ week: 11 - w, best, label });
  }
  return result;
}

export default function WeeklyTrend({ days, year }: Props) {
  const weeks = getWeeklyBests(days, year);
  const maxVal = Math.max(...weeks.map((w) => w.best), 1);

  const W = 540;
  const H = 90;
  const PAD = { top: 10, right: 12, bottom: 28, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const pts = weeks.map((w, i) => ({
    x: PAD.left + (i / (weeks.length - 1)) * innerW,
    y: PAD.top + (1 - w.best / maxVal) * innerH,
    ...w,
  }));

  const pathD = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaD =
    pathD +
    ` L ${pts[pts.length - 1].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)}` +
    ` L ${pts[0].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  // Y axis labels
  const yTicks = [0, 0.5, 1].map((t) => ({
    y: PAD.top + (1 - t) * innerH,
    label: Math.round(t * maxVal).toLocaleString(),
  }));

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        12-Week Score Trend
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-white/60 p-3">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Y gridlines */}
          {yTicks.map((t) => (
            <g key={t.label}>
              <line
                x1={PAD.left}
                y1={t.y}
                x2={W - PAD.right}
                y2={t.y}
                stroke="var(--color-border)"
                strokeWidth={0.5}
                strokeDasharray="4,4"
              />
              <text x={PAD.left - 4} y={t.y + 4} textAnchor="end" fontSize={8} fill="var(--color-muted-foreground)">
                {t.label}
              </text>
            </g>
          ))}

          {/* Area fill */}
          <path d={areaD} fill="url(#areaGradient)" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Dots + X labels */}
          {pts.map((p) => (
            <g key={p.week}>
              {p.best > 0 && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill="var(--color-primary)"
                  stroke="white"
                  strokeWidth={1.5}
                />
              )}
              {p.week % 2 === 0 && (
                <text
                  x={p.x}
                  y={H - 4}
                  textAnchor="middle"
                  fontSize={8}
                  fill="var(--color-muted-foreground)"
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
