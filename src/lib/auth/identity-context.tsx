"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const GUEST_KEY = "ninimath-brain-lab:guest-name";

interface Identity {
  /** Resolved display name — always non-empty once the gate is passed. */
  playerName: string;
  isGuest: boolean;
  supabaseUser: User | null;
  /** Commit a guest session with the given display name. */
  playAsGuest: (name: string) => void;
  /** Clear the current identity and return to the login screen. */
  signOut: () => Promise<void>;
}

const IdentityContext = createContext<Identity | null>(null);

export function useIdentity(): Identity {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used inside <IdentityProvider>");
  return ctx;
}

interface Props {
  children: ReactNode;
}

export function IdentityProvider({ children }: Props) {
  const supabase = getSupabaseBrowserClient();

  // null  → not yet resolved (checking Supabase session / localStorage)
  // ""    → resolved, no identity yet → show login screen
  // "..." → resolved, identity set → show game
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(true);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);

  // Bootstrap: check Supabase session first, then fall back to localStorage guest.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!cancelled && session?.user) {
          const name =
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            session.user.email?.split("@")[0] ||
            "Player";
          setSupabaseUser(session.user);
          setIsGuest(false);
          setPlayerName(name as string);
          return;
        }
      }

      // Fall back to a saved guest session.
      if (!cancelled) {
        const saved =
          typeof window !== "undefined"
            ? window.localStorage.getItem(GUEST_KEY)
            : null;
        setPlayerName(saved ?? ""); // "" → show login screen
      }
    }

    void bootstrap();

    if (supabase) {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const name =
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            session.user.email?.split("@")[0] ||
            "Player";
          setSupabaseUser(session.user);
          setIsGuest(false);
          setPlayerName(name as string);
        }
      });
      return () => {
        cancelled = true;
        listener.subscription.unsubscribe();
      };
    }

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const playAsGuest = useCallback((name: string) => {
    const resolved = name.trim().slice(0, 24) || "Player";
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GUEST_KEY, resolved);
    }
    setIsGuest(true);
    setSupabaseUser(null);
    setPlayerName(resolved);
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(GUEST_KEY);
    }
    setPlayerName("");
    setIsGuest(true);
    setSupabaseUser(null);
  }, [supabase]);

  const value = useMemo<Identity>(
    () => ({
      playerName: playerName ?? "",
      isGuest,
      supabaseUser,
      playAsGuest,
      signOut,
    }),
    [playerName, isGuest, supabaseUser, playAsGuest, signOut],
  );

  // While bootstrapping, render nothing to avoid a flash.
  if (playerName === null) return null;

  return (
    <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
  );
}
