import { type MathQuestion, type OperationKey } from "@/types/game";

function randomInt(min: number, max: number) {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

function createAdditionQuestion(difficulty: number): MathQuestion {
  const cap = 10 + difficulty * 9;
  const left = randomInt(Math.max(1, Math.floor(cap / 3)), cap);
  const right = randomInt(1, cap);

  return {
    id: makeId(),
    operation: "addition",
    prompt: `${left} + ${right}`,
    answer: left + right,
    operands: [left, right],
  };
}

function createSubtractionQuestion(difficulty: number): MathQuestion {
  const cap = 12 + difficulty * 8;
  const minuend = randomInt(Math.max(6, Math.floor(cap / 2)), cap);
  const subtrahend = randomInt(1, minuend);

  return {
    id: makeId(),
    operation: "subtraction",
    prompt: `${minuend} - ${subtrahend}`,
    answer: minuend - subtrahend,
    operands: [minuend, subtrahend],
  };
}

function createMultiplicationQuestion(difficulty: number): MathQuestion {
  const aMax = Math.min(12 + difficulty, 24);
  const bMax = Math.min(8 + difficulty * 2, 36);
  const left = randomInt(2, aMax);
  const right = randomInt(2, bMax);

  return {
    id: makeId(),
    operation: "multiplication",
    prompt: `${left} × ${right}`,
    answer: left * right,
    operands: [left, right],
  };
}

function createDivisionQuestion(difficulty: number): MathQuestion {
  const divisor = randomInt(2, Math.min(6 + difficulty, 16));
  const quotient = randomInt(2, Math.min(8 + difficulty * 2, 36));
  const dividend = divisor * quotient;

  return {
    id: makeId(),
    operation: "division",
    prompt: `${dividend} ÷ ${divisor}`,
    answer: quotient,
    operands: [dividend, divisor],
  };
}

export function generateQuestion(options: {
  enabledOperations: OperationKey[];
  difficulty: number;
}): MathQuestion {
  const operations =
    options.enabledOperations.length > 0
      ? options.enabledOperations
      : (["addition", "subtraction", "multiplication", "division"] as OperationKey[]);
  const difficulty = Math.max(1, Math.min(12, Math.round(options.difficulty)));
  const selected = operations[randomInt(0, operations.length - 1)];

  switch (selected) {
    case "addition":
      return createAdditionQuestion(difficulty);
    case "subtraction":
      return createSubtractionQuestion(difficulty);
    case "multiplication":
      return createMultiplicationQuestion(difficulty);
    case "division":
      return createDivisionQuestion(difficulty);
    default:
      return createSubtractionQuestion(difficulty);
  }
}

export function operationBadgeLabel(operation: OperationKey) {
  switch (operation) {
    case "addition":
      return "+";
    case "subtraction":
      return "-";
    case "multiplication":
      return "×";
    case "division":
      return "÷";
    default:
      return operation;
  }
}

export function operationDisplayName(operation: OperationKey) {
  switch (operation) {
    case "addition":
      return "[+] Addition";
    case "subtraction":
      return "[-] Subtraction";
    case "multiplication":
      return "[×] Multiplication";
    case "division":
      return "[÷] Division";
    default:
      return operation;
  }
}
