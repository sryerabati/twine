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
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-[2rem] border border-border/70 bg-white/90 px-8 py-14 text-center shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
      <Badge variant="secondary" className="rounded-full bg-accent/10 text-foreground">
        Secure workspace
      </Badge>
      <LoaderCircle className="size-8 animate-spin text-primary" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Loading your Cortent workspace</h1>
        <p className="text-sm text-muted-foreground">
          Checking your Convex session and restoring saved scans.
        </p>
      </div>
    </div>
  );
}

function ConvexSetupPanel() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-[2rem] border border-border/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-primary/12 p-3 text-primary">
          <ServerCrash className="size-6" />
        </div>
        <div className="space-y-2">
          <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary">
            Auth setup required
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Connect Convex to unlock auth</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            The app routes are ready, but this workspace does not have
            `NEXT_PUBLIC_CONVEX_URL` configured yet. Add your Convex deployment, run `npx convex
            dev`, and the saved scan history plus email/password auth will come online.
          </p>
        </div>
      </div>
      <div className="grid gap-3 rounded-[1.5rem] border border-border/70 bg-background/70 p-5 text-sm text-muted-foreground md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-border/60 bg-white px-4 py-3">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <LockKeyhole className="size-4 text-primary" />
            Frontend env
          </div>
          <code className="text-xs">NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud</code>
        </div>
        <div className="rounded-[1.25rem] border border-border/60 bg-white px-4 py-3">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <LockKeyhole className="size-4 text-primary" />
            Backend bridge
          </div>
          <code className="text-xs">
            CONVEX_SITE_URL=...convex.site / CONVEX_SERVICE_SECRET=...
          </code>
        </div>
      </div>
    </div>
  );
}
