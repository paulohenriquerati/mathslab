"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPlayer } from "@/app/api/admin/players/route";

/* ──────────────────── Types ─────────────────── */
interface SessionRow {
  id: string;
  score: number;
  accuracy: number;
  best_streak: number;
  correct_answers: number;
  total_attempts: number;
  duration_seconds: number;
  operation_set: string[];
  is_guest: boolean;
  created_at: string;
}

/* ──────────────────── Helpers ───────────────── */
const OP_ICON: Record<string, string> = {
  addition: "+", subtraction: "−", multiplication: "×", division: "÷",
};

function fmt(date: string) {
  return new Date(date).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

/* ──────────────────── Confirm Dialog ───────────── */
function ConfirmDialog({
  message, onConfirm, onCancel,
}: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="panel w-full max-w-sm p-6"
      >
        <p className="mb-5 text-sm font-medium">{message}</p>
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className="flex-1 h-10 rounded-xl bg-danger text-sm font-semibold text-white transition hover:opacity-90">
            Confirm Delete
          </button>
          <button onClick={onCancel}
            className="flex-1 h-10 rounded-xl border text-sm font-medium transition hover:bg-white">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ──────────────────── Session Row ───────────── */
function SessionItem({
  session, onDelete, onUpdate,
}: {
  session: SessionRow;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<SessionRow>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(String(session.score));
  const [accuracy, setAccuracy] = useState(String(session.accuracy));
  const [streak, setStreak] = useState(String(session.best_streak));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/admin/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: Number(score),
        accuracy: Number(accuracy),
        best_streak: Number(streak),
      }),
    });
    if (res.ok) {
      onUpdate(session.id, { score: Number(score), accuracy: Number(accuracy), best_streak: Number(streak) });
      setEditing(false);
    }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white/50 px-3 py-2 text-sm">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{fmt(session.created_at)}</span>
      <div className="flex gap-0.5">
        {session.operation_set.map((op) => (
          <span key={op} className="pill border-accent/30 bg-accent/10 text-accent-foreground px-1.5 py-0 text-[10px]">
            {OP_ICON[op] ?? op}
          </span>
        ))}
      </div>
      {editing ? (
        <>
          <input value={score} onChange={(e) => setScore(e.target.value)} className="w-16 rounded border px-1.5 py-0.5 text-xs" placeholder="Score" />
          <input value={accuracy} onChange={(e) => setAccuracy(e.target.value)} className="w-14 rounded border px-1.5 py-0.5 text-xs" placeholder="Acc%" />
          <input value={streak} onChange={(e) => setStreak(e.target.value)} className="w-10 rounded border px-1.5 py-0.5 text-xs" placeholder="Stk" />
          <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-2 py-0.5 text-[11px] font-semibold text-white transition hover:opacity-90">
            {saving ? "…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
        </>
      ) : (
        <>
          <span className="w-16 font-mono font-medium">{session.score} pts</span>
          <span className="w-14 text-muted-foreground">{session.accuracy}%</span>
          <span className="w-10 text-muted-foreground">×{session.best_streak}</span>
          <span className="text-muted-foreground">{session.duration_seconds}s</span>
          {session.is_guest && <span className="pill border-warning/30 bg-warning/10 text-warning-foreground px-1.5 py-0 text-[10px]">guest</span>}
          <div className="ml-auto flex gap-2">
            <button onClick={() => setEditing(true)} className="text-[11px] text-muted-foreground hover:text-primary">Edit</button>
            <button onClick={() => onDelete(session.id)} className="text-[11px] text-muted-foreground hover:text-danger">Delete</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ──────────────────── Player Row ────────────── */
function PlayerRow({
  player, onDeleted,
}: { player: AdminPlayer; onDeleted: (name: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(player.name);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadSessions() {
    if (sessions.length > 0) return;
    setLoadingSessions(true);
    const res = await fetch(`/api/admin/players/${encodeURIComponent(player.name)}`);
    const data = await res.json() as { sessions: SessionRow[] };
    setSessions(data.sessions ?? []);
    setLoadingSessions(false);
  }

  async function handleExpand() {
    if (!expanded) await loadSessions();
    setExpanded((v) => !v);
  }

  async function deleteSession(id: string) {
    setConfirm(id);
  }

  async function confirmDeleteSession() {
    if (!confirm) return;
    await fetch(`/api/admin/sessions/${confirm}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== confirm));
    setConfirm(null);
  }

  async function deletePlayer() {
    setConfirm("__player__");
  }

  async function confirmDeletePlayer() {
    await fetch(`/api/admin/players/${encodeURIComponent(player.name)}`, { method: "DELETE" });
    onDeleted(player.name);
    setConfirm(null);
  }

  async function renamePlayer() {
    if (!newName.trim() || newName.trim() === player.name) { setRenaming(false); return; }
    setSaving(true);
    await fetch(`/api/admin/players/${encodeURIComponent(player.name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName: newName.trim() }),
    });
    setSaving(false);
    setRenaming(false);
    onDeleted(player.name); // refresh list
  }

  function updateSession(id: string, patch: Partial<SessionRow>) {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  return (
    <>
      {confirm === "__player__" && (
        <ConfirmDialog
          message={`Delete ALL ${player.totalSessions} sessions for "${player.name}"? This cannot be undone.`}
          onConfirm={confirmDeletePlayer}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm && confirm !== "__player__" && (
        <ConfirmDialog
          message="Delete this session? This cannot be undone."
          onConfirm={confirmDeleteSession}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="rounded-2xl border bg-white/60 overflow-hidden">
        {/* Player header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={`h-8 w-8 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
              player.isGuest ? "border-warning/40 bg-warning/10 text-warning-foreground" : "border-primary/30 bg-primary/8 text-primary"
            }`}
          >
            {player.name.slice(0, 1).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.slice(0, 24))}
                  className="rounded-lg border px-2 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
                <button onClick={renamePlayer} disabled={saving}
                  className="rounded-lg bg-primary px-3 py-0.5 text-xs font-semibold text-white hover:opacity-90">
                  {saving ? "…" : "Save"}
                </button>
                <button onClick={() => { setRenaming(false); setNewName(player.name); }}
                  className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{player.name}</span>
                {player.isGuest && <span className="pill border-warning/30 bg-warning/10 text-warning-foreground px-1.5 py-0 text-[10px]">guest</span>}
                {!player.isGuest && <span className="pill border-primary/30 bg-primary/8 text-primary px-1.5 py-0 text-[10px]">Google</span>}
              </div>
            )}
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {player.totalSessions} sessions · Best {player.bestScore} pts · {player.avgAccuracy}% avg acc · last {fmt(player.lastActiveAt)}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button onClick={handleExpand}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-white">
              {expanded ? "▲ Hide" : "▼ Sessions"}
            </button>
            <button onClick={() => setRenaming(true)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-white">
              Rename
            </button>
            <button onClick={deletePlayer}
              className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/15">
              Delete All
            </button>
          </div>
        </div>

        {/* Sessions */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden border-t bg-white/40 px-4 pb-3 pt-3"
            >
              {loadingSessions ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Loading sessions…</div>
              ) : sessions.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">No sessions yet.</div>
              ) : (
                <div className="space-y-1.5">
                  {sessions.map((s) => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      onDelete={deleteSession}
                      onUpdate={updateSession}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/* ──────────────────── Main Dashboard ───────── */
export default function AdminPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/players");
    const data = await res.json() as { players: AdminPlayer[] };
    setPlayers(data.players ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 grid-dot opacity-25" />

      <div className="relative mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="pill border-danger/30 bg-danger/8 text-danger mb-2">
              <span className="h-2 w-2 rounded-full bg-danger" />
              Admin Console
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Player Management</h1>
            <p className="mt-1 text-sm text-muted-foreground">{players.length} players · {players.reduce((s, p) => s + p.totalSessions, 0)} total sessions</p>
          </div>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="rounded-xl border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground hover:bg-white"
          >
            {loggingOut ? "…" : "Sign out"}
          </button>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Players", value: players.length },
            { label: "Guest Players", value: players.filter((p) => p.isGuest).length },
            { label: "Google Users", value: players.filter((p) => !p.isGuest).length },
            { label: "Total Sessions", value: players.reduce((s, p) => s + p.totalSessions, 0) },
          ].map(({ label, value }) => (
            <div key={label} className="panel-soft border p-4 text-center">
              <div className="font-mono text-2xl font-bold">{value}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search players…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 flex-1 rounded-xl border bg-white/80 px-4 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          />
          <button onClick={load} className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-white">
            ↻ Refresh
          </button>
        </div>

        {/* Player list */}
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading players…</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No players found.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <PlayerRow
                key={p.name}
                player={p}
                onDeleted={() => void load()}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
