"use client";

import type { ReactNode } from "react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

import { getConvexClient } from "@/lib/convex";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = getConvexClient();

  if (client === null) {
    return <>{children}</>;
  }

  return <ConvexAuthNextjsProvider client={client}>{children}</ConvexAuthNextjsProvider>;
}
