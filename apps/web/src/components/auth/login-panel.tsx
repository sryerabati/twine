"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LoaderCircle, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function LoginPanel() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const result = await signIn("password", {
        flow: mode,
        email: email.trim(),
        password,
        ...(mode === "signUp" && name.trim() ? { name: name.trim() } : {}),
      });

      if (!result.signingIn) {
        setMessage("Verification started. Finish the auth flow to enter the app.");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-[1.75rem] border border-white/10 bg-card/80 p-8 shadow-[0_32px_110px_rgba(0,0,0,0.35)]">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
          <LockKeyhole className="size-3.5" />
          Secure workspace
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {mode === "signIn" ? "Sign in to VibeCheck" : "Create a VibeCheck account"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Email/password auth. Saved scans stay tied to your account.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-[1.1rem] border border-white/10 bg-black/20 p-1">
        <button
          type="button"
          className={cn(
            "rounded-[0.9rem] px-4 py-2 text-sm font-medium transition-colors",
            mode === "signIn"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/55 hover:text-white",
          )}
          onClick={() => setMode("signIn")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={cn(
            "rounded-[0.9rem] px-4 py-2 text-sm font-medium transition-colors",
            mode === "signUp"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/55 hover:text-white",
          )}
          onClick={() => setMode("signUp")}
        >
          Create account
        </button>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {mode === "signUp" ? (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder="Your creator name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            autoComplete="email"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            placeholder="Minimum 8 characters"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <Button type="submit" disabled={pending} className="rounded-full">
          {pending ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              {mode === "signIn" ? "Signing in" : "Creating account"}
            </>
          ) : (
            <>{mode === "signIn" ? "Enter workspace" : "Create workspace"}</>
          )}
        </Button>
      </form>
    </div>
  );
}
