"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { DigitCount, NumberConfig } from "@/types/game";

/* ─── Constants ──────────────────────────────── */
const DIGIT_OPTIONS: { digits: DigitCount; label: string; example: string }[] = [
  { digits: 1, label: "1-digit", example: "1–9" },
  { digits: 2, label: "2-digit", example: "10–99" },
  { digits: 3, label: "3-digit", example: "100–999" },
];

const MAX_ANSWER_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: undefined, label: "Any" },
  { value: 20,        label: "< 20" },
  { value: 100,       label: "< 100" },
  { value: 1000,      label: "< 1000" },
];

/* ─── Preview builder ────────────────────────── */
function buildPreview(config: NumberConfig | null): string {
  if (!config) return "";
  const aMax = config.aDigits === 1 ? 9 : config.aDigits === 2 ? 99 : 999;
  const aMin = config.aDigits === 1 ? 1 : config.aDigits === 2 ? 10 : 100;
  const bMax = config.bDigits === 1 ? 9 : config.bDigits === 2 ? 99 : 999;
  const bMin = config.bDigits === 1 ? 1 : config.bDigits === 2 ? 10 : 100;
  // pick midpoint-ish values for illustration
  const a = Math.round((aMin + aMax) / 2);
  const b = Math.round((bMin + bMax) / 2);
  const maxNote = config.maxAnswer !== undefined ? ` (answer ≤ ${config.maxAnswer})` : "";
  return `e.g.  ${a}  +  ${b}  =  ?${maxNote}`;
}

interface Props {
  config: NumberConfig | null;
  onChange: (cfg: NumberConfig | null) => void;
  disabled?: boolean;
}

export default function NumberCustomizer({ config, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  const isActive = config !== null;

  function setADigits(d: DigitCount) {
    onChange({ aDigits: d, bDigits: config?.bDigits ?? 1, maxAnswer: config?.maxAnswer });
  }
  function setBDigits(d: DigitCount) {
    onChange({ aDigits: config?.aDigits ?? 1, bDigits: d, maxAnswer: config?.maxAnswer });
  }
  function setMaxAnswer(v: number | undefined) {
    onChange({ aDigits: config?.aDigits ?? 1, bDigits: config?.bDigits ?? 1, maxAnswer: v });
  }
  function clearConfig() {
    onChange(null);
  }

  return (
    <div className="mt-4">
      {/* Toggle button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
            isActive
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-white/70 text-foreground hover:bg-white"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span className="text-base">🔢</span>
          Numbers
          {isActive && (
            <span className="pill border-primary/30 bg-primary/15 px-1.5 py-0 text-[10px] text-primary">
              Custom
            </span>
          )}
          <span className="ml-0.5 text-muted-foreground">{open ? "▲" : "▼"}</span>
        </button>

        {isActive && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={clearConfig}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:text-danger transition"
          >
            Reset to auto
          </motion.button>
        )}
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-2xl border bg-white/70 p-4 backdrop-blur-sm space-y-4">

              {/* Operand A */}
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Operand A
                </div>
                <div className="flex flex-wrap gap-2">
                  {DIGIT_OPTIONS.map(({ digits, label, example }) => (
                    <motion.button
                      key={digits}
                      type="button"
                      disabled={disabled}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setADigits(digits)}
                      className={`flex flex-col items-center rounded-xl border px-4 py-2 text-xs font-medium transition ${
                        config?.aDigits === digits
                          ? "border-primary/45 bg-primary/12 text-primary shadow-sm"
                          : "border-border bg-white/80 hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <span className="font-semibold">{label}</span>
                      <span className="mt-0.5 text-[10px] text-muted-foreground">{example}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Operand B */}
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Operand B
                </div>
                <div className="flex flex-wrap gap-2">
                  {DIGIT_OPTIONS.map(({ digits, label, example }) => (
                    <motion.button
                      key={digits}
                      type="button"
                      disabled={disabled}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setBDigits(digits)}
                      className={`flex flex-col items-center rounded-xl border px-4 py-2 text-xs font-medium transition ${
                        config?.bDigits === digits
                          ? "border-accent/50 bg-accent/15 text-accent-foreground shadow-sm"
                          : "border-border bg-white/80 hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <span className="font-semibold">{label}</span>
                      <span className="mt-0.5 text-[10px] text-muted-foreground">{example}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Max answer cap */}
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Max Answer
                </div>
                <div className="flex flex-wrap gap-2">
                  {MAX_ANSWER_OPTIONS.map(({ value, label }) => (
                    <motion.button
                      key={label}
                      type="button"
                      disabled={disabled || !isActive}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setMaxAnswer(value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        config?.maxAnswer === value
                          ? "border-warning/45 bg-warning/15 text-warning-foreground shadow-sm"
                          : "border-border bg-white/80 hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-dashed border-primary/25 bg-primary/4 px-4 py-2.5 text-center font-mono text-sm text-primary"
                  >
                    {buildPreview(config)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
