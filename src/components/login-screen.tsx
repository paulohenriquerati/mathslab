"use client";

import { AnimatePresence, motion } from "framer-motion";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useIdentity } from "@/lib/auth/identity-context";
import type { NameCheckResponse } from "@/app/api/check-name/route";


type NameStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken"; expiresInSeconds: number };

export default function LoginScreen() {
  const { playAsGuest } = useIdentity();
  const [name, setName] = useState("");
  const [nameStatus, setNameStatus] = useState<NameStatus>({ kind: "idle" });
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (checkRef.current) { clearTimeout(checkRef.current); checkRef.current = null; }
  }

  async function checkName(playerName: string): Promise<NameCheckResponse> {
    const res = await fetch(
      `/api/check-name?playerName=${encodeURIComponent(playerName)}`,
    );
    return res.json() as Promise<NameCheckResponse>;
  }

  // When name changes, debounce a check (300 ms).
  useEffect(() => {
    clearTimers();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameStatus({ kind: "idle" });
      return;
    }
    setNameStatus({ kind: "checking" });
    checkRef.current = setTimeout(async () => {
      const result = await checkName(trimmed);
      if (result.available) {
        setNameStatus({ kind: "available" });
      } else {
        setNameStatus({ kind: "taken", expiresInSeconds: result.expiresInSeconds ?? 300 });
        // Poll every 5 s to update the countdown and re-enable when free.
        pollRef.current = setInterval(async () => {
          const r = await checkName(trimmed);
          if (r.available) {
            clearTimers();
            setNameStatus({ kind: "available" });
          } else {
            setNameStatus({ kind: "taken", expiresInSeconds: r.expiresInSeconds ?? 300 });
          }
        }, 5000);
      }
    }, 300);
    return clearTimers;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const isTaken = nameStatus.kind === "taken";
  const isChecking = nameStatus.kind === "checking";

  async function handleGuestSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { playAsGuest(""); return; }

    // Re-check right before submitting (belt-and-suspenders).
    const result = await checkName(trimmed);
    if (!result.available) {
      setNameStatus({ kind: "taken", expiresInSeconds: result.expiresInSeconds ?? 300 });
      return;
    }
    clearTimers();
    playAsGuest(trimmed);
  }

  function handleGoogle() {
    setOauthLoading(true);
    // Redirect to Clerk-managed sign-in page (handles Google OAuth)
    window.location.href = "/sign-in?strategy=oauth_google";
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      {/* Decorative dot grid */}
      <div className="pointer-events-none absolute inset-0 grid-dot opacity-35" />

      {/* Animated floating blobs */}
      <div
        className="pointer-events-none absolute left-[8%] top-[12%] h-80 w-80 rounded-full animate-float-slow opacity-60"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 35%, white), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute right-[6%] top-[8%] h-64 w-64 rounded-full animate-float-mid opacity-50"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 28%, white), transparent 70%)", animationDelay: "1.4s" }}
      />
      <div
        className="pointer-events-none absolute bottom-[12%] left-[38%] h-48 w-48 rounded-full animate-float-fast opacity-40"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--secondary) 40%, white), transparent 70%)", animationDelay: "2.8s" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="panel relative z-10 w-full max-w-md overflow-hidden p-8"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="pill mx-auto mb-4 border-primary/25 bg-primary/8 text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
            BrainLab
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Who&apos;s playing?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your name to start training, or sign in to save your scores across devices.
          </p>
        </div>

        {/* Guest form */}
        <form onSubmit={handleGuestSubmit} className="grid gap-3">
          <label
            htmlFor="guest-name"
            className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            Your display name
          </label>
          <input
            id="guest-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 24))}
            placeholder="e.g. Einstein"
            maxLength={24}
            autoFocus
            className={`h-12 rounded-2xl border bg-white/80 px-4 text-sm outline-none transition focus:ring-2 ${
              isTaken
                ? "border-danger/50 focus:border-danger/50 focus:ring-danger/10"
                : nameStatus.kind === "available"
                  ? "border-success/40 focus:border-success/40 focus:ring-success/10"
                  : "focus:border-primary/40 focus:ring-primary/15"
            }`}
          />

          {/* Name status feedback */}
          <AnimatePresence mode="wait">
            {isTaken && (
              <motion.div
                key="taken"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/8 px-3 py-2"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
                </span>
                <span className="text-xs text-danger">
                  <strong>"{name.trim()}"</strong> is currently in use by an active session.
                  {" "}Freeing up in ~{nameStatus.expiresInSeconds}s — you'll be notified automatically.
                </span>
              </motion.div>
            )}
            {nameStatus.kind === "available" && name.trim() && (
              <motion.div
                key="available"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 px-1 text-xs text-success-foreground"
              >
                <span className="h-2 w-2 rounded-full bg-success" />
                Name is available
              </motion.div>
            )}
            {isChecking && name.trim() && (
              <motion.div
                key="checking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-1 text-[11px] text-muted-foreground"
              >
                Checking availability…
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={isTaken || isChecking}
            className="h-12 rounded-2xl bg-foreground text-sm font-semibold text-background transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isTaken
              ? `⏳ Waiting for "${name.trim()}" to free up…`
              : isChecking
                ? "Checking…"
                : name.trim()
                  ? `Play as "${name.trim()}"`
                  : "Play as Guest"}
          </button>
        </form>

        {/* Divider + Google sign-in */}
        {(
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={oauthLoading}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border bg-white/80 text-sm font-medium transition hover:bg-white hover:shadow-sm active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            >
              {oauthLoading ? (
                <Spinner />
              ) : (
                <GoogleIcon />
              )}
              {oauthLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            <AnimatePresence>
              {oauthError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 text-center text-xs text-danger"
                >
                  {oauthError}
                </motion.p>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Footer note */}
        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Scores are saved locally.{" "}
          Sign in with Google to sync to the global leaderboard.
        </p>
      </motion.div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.908c1.7018-1.5668 2.6836-3.874 2.6836-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.8064 5.9563-2.1805l-2.908-2.2581c-.8064.5409-1.8382.8618-3.0482.8618-2.3427 0-4.3282-1.5832-5.036-3.71H.957v2.3318C2.4382 15.9832 5.4818 18 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.59.1018-1.1641.2818-1.71V4.9582H.957A8.9965 8.9965 0 0 0 0 9c0 1.4509.3477 2.8232.9573 4.0418L3.964 10.71Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.5795c1.3227 0 2.5077.4546 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.957 4.9582L3.964 7.29C4.6718 5.1632 6.6573 3.5795 9 3.5795Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
