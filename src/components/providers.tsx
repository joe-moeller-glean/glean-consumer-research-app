"use client";

import { SessionProvider } from "next-auth/react";

/** Client-side session context, needed for signIn/signOut helpers. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
