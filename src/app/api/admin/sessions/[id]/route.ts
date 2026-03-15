import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/admin/sessions/[id] — edit a single session's editable fields */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Object body required" }, { status: 400 });
  }

  const allowed = ["score", "accuracy", "best_streak", "player_name"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    const val = (body as Record<string, unknown>)[key];
    if (val !== undefined) update[key] = val;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("math_sessions")
    .update(update)
    .eq("id", id)
    .select("id, player_name, score, accuracy, best_streak")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session: data });
}

/** DELETE /api/admin/sessions/[id] — delete one session */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await supabase
    .from("math_sessions")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
