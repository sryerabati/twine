"use client";

import { CircleAlert, Cpu, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { HealthResponse } from "@/lib/contracts";

export function HealthBanner({ health }: { health: HealthResponse | null }) {
  if (!health) {
    return null;
  }

  const degraded = !health.ok || health.modelStatus === "error";

  return (
    <Alert
      variant={degraded ? "destructive" : "default"}
      className="surface rounded-3xl"
    >
      {degraded ? <ShieldAlert /> : <Cpu />}
      <AlertTitle>
        {degraded ? "Local environment needs attention" : "Local environment looks ready"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Python {health.pythonVersion}</Badge>
          <Badge variant="secondary">Device {health.selectedDevice}</Badge>
          <Badge variant="secondary">Model {health.modelStatus}</Badge>
          <Badge variant="secondary">
            HF token {health.huggingFaceTokenPresent ? "present" : "missing"}
          </Badge>
        </div>
        {health.blockers.length ? (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {health.blockers.map((blocker) => (
              <li key={blocker} className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-4 text-destructive" />
                <span>{blocker}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            The app can accept uploads immediately. Real TRIBE execution still depends on the local
            Python environment and Hugging Face access.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
