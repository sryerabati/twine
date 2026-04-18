"use client";

import type { ReactNode } from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

import { getConvexClient } from "@/lib/convex";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = getConvexClient();

  if (client === null) {
    return <>{children}</>;
  }

  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
