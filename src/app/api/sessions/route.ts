import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  OPERATION_KEYS,
  type LeaderboardEntry,
  type OperationKey,
  type SessionPayload,
} from "@/types/game";

const OPERATION_SET = new Set<string>(OPERATION_KEYS);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizePlayerName(value: unknown) {
  if (typeof value !== "string") return "Player";
  const trimmed = value.trim();
  return trimmed.slice(0, 24) || "Player";
}

function normalizeOperationSet(value: unknown): OperationKey[] {
  if (!Array.isArray(value)) return [...OPERATION_KEYS];
  const filtered = value.filter(
    (item): item is OperationKey => typeof item === "string" && OPERATION_SET.has(item),
  );
  return filtered.length ? filtered : [...OPERATION_KEYS];
}

function normalizeHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).filter((item) => isObject(item));
}

function normalizePayload(value: unknown): SessionPayload | null {
  if (!isObject(value)) return null;

  const score = toFiniteNumber(value.score);
  const accuracy = toFiniteNumber(value.accuracy);
  const bestStreak = toFiniteNumber(value.bestStreak);
  const correctAnswers = toFiniteNumber(value.correctAnswers);
  const totalAttempts = toFiniteNumber(value.totalAttempts);
  const durationSeconds = toFiniteNumber(value.durationSeconds);
  const averageResponseMs = toFiniteNumber(value.averageResponseMs);

  if (
    score === null ||
    accuracy === null ||
    bestStreak === null ||
    correctAnswers === null ||
    totalAttempts === null ||
    durationSeconds === null ||
    averageResponseMs === null
  ) {
    return null;
  }

  return {
    playerName: sanitizePlayerName(value.playerName),
    score: Math.max(0, Math.round(score)),
    accuracy: Math.max(0, Math.min(100, Number(accuracy.toFixed(1)))),
    bestStreak: Math.max(0, Math.round(bestStreak)),
    correctAnswers: Math.max(0, Math.round(correctAnswers)),
    totalAttempts: Math.max(0, Math.round(totalAttempts)),
    durationSeconds: Math.max(10, Math.round(durationSeconds)),
    averageResponseMs: Math.max(0, Math.round(averageResponseMs)),
    operationSet: normalizeOperationSet(value.operationSet),
    history: normalizeHistory(value.history) as unknown as SessionPayload["history"],
    // Default to guest=true so untagged sessions are treated conservatively.
    isGuest: value.isGuest === false ? false : true,
  };
}

function mapRowToEntry(row: Record<string, unknown>): LeaderboardEntry {
  return {
    id: String(row.id ?? ""),
    playerName: String(row.player_name ?? "Player"),
    score: Number(row.score ?? 0),
    accuracy: Number(row.accuracy ?? 0),
    bestStreak: Number(row.best_streak ?? 0),
    durationSeconds: Number(row.duration_seconds ?? 0),
    operationSet: Array.isArray(row.operation_set)
      ? row.operation_set.filter(
          (item): item is OperationKey => typeof item === "string" && OPERATION_SET.has(item),
        )
      : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function GET() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ disabled: true, entries: [] });
  }

  // Exclude guest rows that have passed the 5-minute TTL.
  const guestExpiryCutoff = new Date(
    Date.now() - 5 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("math_sessions")
    .select("id, player_name, score, accuracy, best_streak, duration_seconds, operation_set, created_at")
    .or(`is_guest.eq.false,created_at.gt.${guestExpiryCutoff}`)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message, entries: [] }, { status: 500 });
  }

  const entries = Array.isArray(data)
    ? data.map((row) => mapRowToEntry(row as Record<string, unknown>))
    : [];

  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ disabled: true, saved: false });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = normalizePayload(body);
  if (!payload) {
    return NextResponse.json({ error: "Invalid session payload" }, { status: 400 });
  }

  // Fire-and-forget: purge expired guest rows before inserting (Free-tier
  // fallback in case pg_cron is not available on this Supabase plan).
  const guestExpiryCutoff = new Date(
    Date.now() - 5 * 60 * 1000,
  ).toISOString();
  void supabase
    .from("math_sessions")
    .delete()
    .eq("is_guest", true)
    .lt("created_at", guestExpiryCutoff);

  const { data, error } = await supabase
    .from("math_sessions")
    .insert({
      player_name: payload.playerName,
      score: payload.score,
      accuracy: payload.accuracy,
      best_streak: payload.bestStreak,
      correct_answers: payload.correctAnswers,
      total_attempts: payload.totalAttempts,
      duration_seconds: payload.durationSeconds,
      average_response_ms: payload.averageResponseMs,
      operation_set: payload.operationSet,
      history: payload.history,
      is_guest: payload.isGuest ?? true,
    })
    .select("id, player_name, score, accuracy, best_streak, duration_seconds, operation_set, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, saved: false }, { status: 500 });
  }

  return NextResponse.json({
    saved: true,
    entry: mapRowToEntry(data as Record<string, unknown>),
  });
}
