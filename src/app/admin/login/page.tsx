"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin";

  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });

    if (res.ok) {
      router.push(next);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "Invalid secret");
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="panel relative z-10 w-full max-w-sm overflow-hidden p-8"
    >
      <div className="mb-8 text-center">
        <div className="pill mx-auto mb-4 border-danger/30 bg-danger/8 text-danger">
          <span className="h-2 w-2 rounded-full bg-danger" />
          Admin Access
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">BrainLab Admin</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Enter your admin secret to continue.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3">
        <input
          type="password"
          placeholder="Admin secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="h-12 rounded-2xl border bg-white/80 px-4 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
        {error && (
          <p className="text-center text-xs text-danger">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !secret}
          className="h-12 rounded-2xl bg-foreground text-sm font-semibold text-background transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "Verifying…" : "Enter Admin Panel"}
        </button>
      </form>
    </motion.div>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 grid-dot opacity-30" />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, color-mix(in oklab, var(--danger) 15%, white) 0%, transparent 45%)",
        }}
      />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
