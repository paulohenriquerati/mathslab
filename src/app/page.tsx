"use client";

import LoginScreen from "@/components/login-screen";
import MathTrainer from "@/components/math-trainer";
import { useIdentity } from "@/lib/auth/identity-context";

export default function HomePage() {
  const { playerName } = useIdentity();

  if (!playerName) {
    return <LoginScreen />;
  }

  return <MathTrainer />;
}