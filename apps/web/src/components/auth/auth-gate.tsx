"use client";

import { ReactNode } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
} from "convex/react";

import { LoginPanel } from "./login-panel";

/**
 * Shows `children` only when the current user is authenticated. Shows a
 * login panel when logged out and a minimal loading shell while auth
 * status is being determined.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-foreground/70">
          Checking your session…
        </div>
      </AuthLoading>
      <Unauthenticated>
        <LoginPanel />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}
