import type { AttemptRecord, OperationKey, SessionSummary } from "@/types/game";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function scoreAttempt(input: {
  isCorrect: boolean;
  responseMs: number;
  streak: number;
  difficulty: number;
}) {
  if (!input.isCorrect) {
    return 0;
  }

  const base = 48 + input.difficulty * 7;
  const speedBonus = clamp(Math.round((6500 - input.responseMs) / 140), 0, 30);
  const streakBonus = clamp(input.streak * 4, 0, 36);

  return base + speedBonus + streakBonus;
}

export function nextDifficulty(input: {
  current: number;
  isCorrect: boolean;
  responseMs: number;
}) {
  let delta = 0;

  if (input.isCorrect && input.responseMs <= 2600) {
    delta = 1;
  } else if (!input.isCorrect || input.responseMs >= 7000) {
    delta = -1;
  }

  return clamp(input.current + delta, 1, 12);
}

export function averageResponseMs(history: AttemptRecord[]) {
  if (history.length === 0) {
    return 0;
  }

  const total = history.reduce((sum, item) => sum + item.responseMs, 0);
  return Math.round(total / history.length);
}

export function accuracyPercent(correct: number, attempts: number) {
  if (attempts === 0) {
    return 0;
  }

  return Number(((correct / attempts) * 100).toFixed(1));
}

export function summarizeSession(input: {
  playerName: string;
  score: number;
  correctAnswers: number;
  totalAttempts: number;
  bestStreak: number;
  durationSeconds: number;
  history: AttemptRecord[];
  operationSet: OperationKey[];
}): SessionSummary {
  return {
    playerName: input.playerName,
    score: input.score,
    accuracy: accuracyPercent(input.correctAnswers, input.totalAttempts),
    bestStreak: input.bestStreak,
    correctAnswers: input.correctAnswers,
    totalAttempts: input.totalAttempts,
    durationSeconds: input.durationSeconds,
    averageResponseMs: averageResponseMs(input.history),
    operationSet: input.operationSet,
  };
}

export function formatMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0.0s";
  }

  return `${(ms / 1000).toFixed(1)}s`;
}