'use client';
import { SessionProvider } from "next-auth/react";

// Agora ele recebe a prop "session"
export function Providers({ children, session }: any) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}