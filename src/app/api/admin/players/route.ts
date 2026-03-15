import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export interface AdminPlayer {
  name: string;
  totalSessions: number;
  bestScore: number;
  totalScore: number;
  avgAccuracy: number;
  isGuest: boolean;
  lastActiveAt: string;
}

/** GET /api/admin/players — list all unique players with aggregated stats */
export async function GET() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("math_sessions")
    .select("player_name, score, accuracy, is_guest, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by player name
  const map = new Map<string, AdminPlayer>();
  for (const row of data ?? []) {
    const name = String(row.player_name);
    if (!map.has(name)) {
      map.set(name, {
        name,
        totalSessions: 0,
        bestScore: 0,
        totalScore: 0,
        avgAccuracy: 0,
        isGuest: Boolean(row.is_guest),
        lastActiveAt: String(row.created_at),
      });
    }
    const p = map.get(name)!;
    p.totalSessions++;
    p.bestScore = Math.max(p.bestScore, Number(row.score));
    p.totalScore += Number(row.score);
    // Accumulate accuracy for averaging below
    p.avgAccuracy += Number(row.accuracy);
    if (String(row.created_at) > p.lastActiveAt) {
      p.lastActiveAt = String(row.created_at);
    }
    // A player is considered authenticated if ANY session is non-guest
    if (!row.is_guest) p.isGuest = false;
  }

  // Finalise averages
  const players = [...map.values()].map((p) => ({
    ...p,
    avgAccuracy: p.totalSessions > 0
      ? Number((p.avgAccuracy / p.totalSessions).toFixed(1))
      : 0,
  }));

  // Sort: authenticated first, then by best score desc
  players.sort((a, b) => {
    if (a.isGuest !== b.isGuest) return a.isGuest ? 1 : -1;
    return b.bestScore - a.bestScore;
  });

  return NextResponse.json({ players });
}
