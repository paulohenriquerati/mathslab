export const OPERATION_KEYS = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
] as const;

export type OperationKey = (typeof OPERATION_KEYS)[number];

export interface MathQuestion {
  id: string;
  operation: OperationKey;
  prompt: string;
  answer: number;
  operands: [number, number];
}

export interface AttemptRecord {
  questionId: string;
  operation: OperationKey;
  prompt: string;
  rawAnswer: string;
  parsedAnswer: number | null;
  correctAnswer: number;
  isCorrect: boolean;
  responseMs: number;
  createdAt: string;
}

export interface SessionSummary {
  playerName: string;
  score: number;
  accuracy: number;
  bestStreak: number;
  correctAnswers: number;
  totalAttempts: number;
  durationSeconds: number;
  averageResponseMs: number;
  operationSet: OperationKey[];
}

export interface SessionPayload extends SessionSummary {
  history: AttemptRecord[];
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  accuracy: number;
  bestStreak: number;
  durationSeconds: number;
  operationSet: OperationKey[];
  createdAt: string;
}
