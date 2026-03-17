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
import { useUser, useClerk } from "@clerk/nextjs";

const GUEST_KEY = "ninimath-brain-lab:guest-name";

interface Identity {
  /** Resolved display name — always non-empty once the gate is passed. */
  playerName: string;
  isGuest: boolean;
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
  const { user, isLoaded: clerkLoaded } = useUser();
  const clerk = useClerk();

  // null  → not yet resolved
  // ""    → resolved, no identity → show login screen
  // "..." → resolved, identity set → show game
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(true);

  // Bootstrap: Clerk user takes priority, then fall back to localStorage guest.
  useEffect(() => {
    if (!clerkLoaded) return; // wait for Clerk to hydrate

    if (user) {
      // Signed-in Clerk user
      const name =
        user.fullName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
        "Player";
      setIsGuest(false);
      setPlayerName(name);
      return;
    }

    // No Clerk user — check for saved guest session
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem(GUEST_KEY)
        : null;
    setPlayerName(saved ?? ""); // "" → show login screen
    setIsGuest(true);
  }, [clerkLoaded, user]);

  const playAsGuest = useCallback((name: string) => {
    const resolved = name.trim().slice(0, 24) || "Player";
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GUEST_KEY, resolved);
    }
    setIsGuest(true);
    setPlayerName(resolved);
  }, []);

  const signOut = useCallback(async () => {
    if (user) {
      await clerk.signOut();
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(GUEST_KEY);
    }
    setPlayerName("");
    setIsGuest(true);
  }, [user, clerk]);

  const value = useMemo<Identity>(
    () => ({
      playerName: playerName ?? "",
      isGuest,
      playAsGuest,
      signOut,
    }),
    [playerName, isGuest, playAsGuest, signOut],
  );

  // While bootstrapping (Clerk not yet loaded, or playerName not yet resolved), render nothing.
  if (!clerkLoaded || playerName === null) return null;

  return (
    <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
  );
}
