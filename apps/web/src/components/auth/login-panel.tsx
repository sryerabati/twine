"use client";

import { FormEvent, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

import { Button } from "@/components/ui/button";

/**
 * Email + password login/signup. Users toggle between "sign-in" and "sign-up"
 * locally; the server accepts both via the same Password provider.
 *
 * Google OAuth is commented out. To enable, uncomment the Google button below
 * and enable the Google provider in `convex/auth.ts`.
 */
export function LoginPanel() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("flow", mode);
    setSubmitting(true);
    try {
      await signIn("password", formData);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Sign in failed. Double-check your email and password.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-xl border border-foreground/10 bg-background/40 p-8 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold">
          {mode === "signIn" ? "Sign in" : "Create your account"}
        </h1>
        <p className="text-sm text-foreground/70">
          {mode === "signIn"
            ? "Enter your email and password to continue."
            : "Use an email you can access — we tie your scans to this account."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-foreground/15 bg-background px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={
              mode === "signIn" ? "current-password" : "new-password"
            }
            className="rounded-md border border-foreground/15 bg-background px-3 py-2"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Working…"
            : mode === "signIn"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>

      {/*
        To enable Google OAuth:
        <Button
          type="button"
          variant="outline"
          onClick={() => signIn("google")}
        >
          Continue with Google
        </Button>
      */}

      <button
        type="button"
        className="text-xs text-foreground/60 underline-offset-2 hover:underline"
        onClick={() =>
          setMode((current) => (current === "signIn" ? "signUp" : "signIn"))
        }
      >
        {mode === "signIn"
          ? "Need an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
