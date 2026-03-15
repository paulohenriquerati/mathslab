import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { OperationKey } from "@/types/game";

export interface DaySession {
  id: string;
  score: number;
  accuracy: number;
  bestStreak: number;
  durationSeconds: number;
  operationSet: OperationKey[];
  createdAt: string;
}

export interface DayStat {
  date: string; // "YYYY-MM-DD"
  sessions: DaySession[];
  bestScore: number;
  totalSessions: number;
  bestAccuracy: number;
  bestStreak: number;
}

export interface StatsResponse {
  days: Record<string, DayStat>;
  playerName: string;
  year: number;
}

function toLocalDate(isoString: string): string {
  return isoString.slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playerName = searchParams.get("playerName") ?? "";
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  const supabase = getSupabaseAdminClient();
  if (!supabase || !playerName) {
    return NextResponse.json({ days: {}, playerName, year });
  }

  const startDate = `${year}-01-01T00:00:00.000Z`;
  const endDate = `${year + 1}-01-01T00:00:00.000Z`;

  const { data, error } = await supabase
    .from("math_sessions")
    .select(
      "id, score, accuracy, best_streak, duration_seconds, operation_set, created_at",
    )
    .eq("player_name", playerName)
    .gte("created_at", startDate)
    .lt("created_at", endDate)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message, days: {}, playerName, year },
      { status: 500 },
    );
  }

  // Group sessions by local date string.
  const days: Record<string, DayStat> = {};

  for (const row of data ?? []) {
    const date = toLocalDate(String(row.created_at));
    if (!days[date]) {
      days[date] = {
        date,
        sessions: [],
        bestScore: 0,
        totalSessions: 0,
        bestAccuracy: 0,
        bestStreak: 0,
      };
    }
    const session: DaySession = {
      id: String(row.id),
      score: Number(row.score),
      accuracy: Number(row.accuracy),
      bestStreak: Number(row.best_streak),
      durationSeconds: Number(row.duration_seconds),
      operationSet: Array.isArray(row.operation_set)
        ? (row.operation_set as OperationKey[])
        : [],
      createdAt: String(row.created_at),
    };
    const day = days[date];
    day.sessions.push(session);
    day.totalSessions++;
    day.bestScore = Math.max(day.bestScore, session.score);
    day.bestAccuracy = Math.max(day.bestAccuracy, session.accuracy);
    day.bestStreak = Math.max(day.bestStreak, session.bestStreak);
  }

  return NextResponse.json({ days, playerName, year } satisfies StatsResponse);
}
