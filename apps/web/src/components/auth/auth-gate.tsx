"use client";

import type { ReactNode } from "react";
import { LoaderCircle, LockKeyhole, ServerCrash } from "lucide-react";
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";

import { LoginPanel } from "@/components/auth/login-panel";
import { Badge } from "@/components/ui/badge";
import { isConvexConfigured } from "@/lib/convex";

export function AuthGate({ children }: { children: ReactNode }) {
  if (!isConvexConfigured()) {
    return <ConvexSetupPanel />;
  }

  return (
    <>
      <AuthLoading>
        <AuthLoadingPanel />
      </AuthLoading>
      <Unauthenticated>
        <LoginPanel />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

function AuthLoadingPanel() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-[1.75rem] border border-white/10 bg-card/80 p-8 shadow-[0_32px_110px_rgba(0,0,0,0.35)]">
      <Badge variant="secondary" className="w-fit rounded-full border border-white/10 bg-white/5 text-white/70">
        Secure workspace
      </Badge>
      <div className="flex items-center gap-3">
        <LoaderCircle className="size-5 animate-spin text-primary" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Loading VibeCheck</h1>
          <p className="text-sm text-muted-foreground">Restoring auth and saved scans.</p>
        </div>
      </div>
    </div>
  );
}

function ConvexSetupPanel() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-[1.75rem] border border-white/10 bg-card/80 p-8 shadow-[0_32px_110px_rgba(0,0,0,0.35)]">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-primary/12 p-3 text-primary">
          <ServerCrash className="size-6" />
        </div>
        <div className="space-y-2">
          <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/5 text-white/70">
            Auth setup required
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Connect Convex to continue</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Set `NEXT_PUBLIC_CONVEX_URL` and restart `npx convex dev` to bring auth online.
          </p>
        </div>
      </div>
      <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <LockKeyhole className="size-4 text-primary" />
          Required env
        </div>
        <code className="text-xs">NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud</code>
      </div>
    </div>
  );
}
