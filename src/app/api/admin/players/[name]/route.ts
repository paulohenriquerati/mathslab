import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ name: string }> };

/** GET /api/admin/players/[name] — all sessions for a player */
export async function GET(_req: NextRequest, { params }: Params) {
  const { name } = await params;
  const playerName = decodeURIComponent(name);

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("math_sessions")
    .select("id, score, accuracy, best_streak, correct_answers, total_attempts, duration_seconds, operation_set, is_guest, created_at")
    .eq("player_name", playerName)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

/** PATCH /api/admin/players/[name] — rename player (updates ALL their sessions) */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { name } = await params;
  const playerName = decodeURIComponent(name);

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const newName = typeof body === "object" && body !== null && "newName" in body
    ? String((body as Record<string, unknown>).newName).trim().slice(0, 24)
    : "";

  if (!newName) return NextResponse.json({ error: "newName is required" }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await supabase
    .from("math_sessions")
    .update({ player_name: newName })
    .eq("player_name", playerName);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, from: playerName, to: newName });
}

/** DELETE /api/admin/players/[name] — delete ALL sessions for a player */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { name } = await params;
  const playerName = decodeURIComponent(name);

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error, count } = await supabase
    .from("math_sessions")
    .delete({ count: "exact" })
    .eq("player_name", playerName);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
