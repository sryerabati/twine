"use client";

import type { ReactNode } from "react";
import { LockKeyhole, ServerCrash } from "lucide-react";
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";

import { LoginPanel } from "@/components/auth/login-panel";
import { AuthLoadingSkeleton } from "@/components/loading-states";
import { Badge } from "@/components/ui/badge";
import { isConvexConfigured } from "@/lib/convex";

export function AuthGate({ children }: { children: ReactNode }) {
  if (!isConvexConfigured()) {
    return (
      <CenteredAuthFrame>
        <ConvexSetupPanel />
      </CenteredAuthFrame>
    );
  }

  return (
    <>
      <AuthLoading>
        <CenteredAuthFrame>
          <AuthLoadingPanel />
        </CenteredAuthFrame>
      </AuthLoading>
      <Unauthenticated>
        <CenteredAuthFrame>
          <LoginPanel />
        </CenteredAuthFrame>
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

function CenteredAuthFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-screen w-full items-center justify-center px-6 py-10">{children}</div>;
}

function AuthLoadingPanel() {
  return <AuthLoadingSkeleton />;
}

function ConvexSetupPanel() {
  return (
    <div className="surface mx-auto flex w-full max-w-md flex-col gap-4 rounded-[1.75rem] p-8">
      <div className="flex items-start gap-4">
        <div className="rounded-[1.25rem] border-2 border-primary bg-primary p-3 text-primary-foreground shadow-[4px_4px_0_0_var(--color-primary)]">
          <ServerCrash className="size-6" />
        </div>
        <div className="space-y-2">
          <Badge variant="secondary">
            Auth setup required
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Connect Convex to continue</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Set `NEXT_PUBLIC_CONVEX_URL` and restart `npx convex dev` to bring auth online.
          </p>
        </div>
      </div>
      <div className="surface-soft rounded-[1.25rem] px-4 py-3 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <LockKeyhole className="size-4 text-primary" />
          Required env
        </div>
        <code className="text-xs">NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud</code>
      </div>
    </div>
  );
}
