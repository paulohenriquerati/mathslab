import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const GUEST_TTL_SECONDS = 5 * 60; // must match the cleanup interval

export interface NameCheckResponse {
  available: boolean;
  /** Seconds until the name is freed (only present when available === false) */
  expiresInSeconds?: number;
  /** ISO timestamp of the most-recent active session for this name */
  lastActiveAt?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playerName = searchParams.get("playerName")?.trim() ?? "";

  if (!playerName) {
    return NextResponse.json({ available: true } satisfies NameCheckResponse);
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    // If Supabase is not configured, always allow.
    return NextResponse.json({ available: true } satisfies NameCheckResponse);
  }

  // Look for any guest session for this name created within the last 5 minutes.
  const cutoff = new Date(Date.now() - GUEST_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await supabase
    .from("math_sessions")
    .select("created_at")
    .eq("player_name", playerName)
    .eq("is_guest", true)
    .gt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ available: true } satisfies NameCheckResponse);
  }

  // There is an active guest session under this name.
  const lastActiveAt = String(data[0].created_at);
  const ageMs = Date.now() - new Date(lastActiveAt).getTime();
  const expiresInSeconds = Math.ceil((GUEST_TTL_SECONDS * 1000 - ageMs) / 1000);

  return NextResponse.json({
    available: false,
    expiresInSeconds: Math.max(1, expiresInSeconds),
    lastActiveAt,
  } satisfies NameCheckResponse);
}
