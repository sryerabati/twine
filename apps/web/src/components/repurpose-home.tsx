"use client";

import Link from "next/link";
import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RepurposeProjectSummary } from "@/lib/contracts";

function formatDuration(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "No source yet";
  }
  return `${value.toFixed(1)}s source`;
}

export function RepurposeHome() {
  const router = useRouter();
  const createProject = useMutation("repurposeProjects:create" as never);
  const projects = useQuery("repurposeProjects:listRecentMine" as never, {}) as
    | RepurposeProjectSummary[]
    | undefined;

  async function handleCreateProject() {
    const projectId = (await createProject({} as never)) as string;
    startTransition(() => {
      router.push(`/app/repurpose/${projectId}`);
    });
  }

  return (
    <div className="space-y-6">
      <section className="surface rounded-[2rem] p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary">Repurpose</Badge>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
                Turn one source video into up to three alternate cuts.
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Upload one finished video, let the system find reusable beats, and get multiple
                repurposed exports built only from the original footage.
              </p>
            </div>
          </div>
          <Button onClick={() => void handleCreateProject()}>
            <Sparkles data-icon="inline-start" />
            New project
          </Button>
        </div>
      </section>

      <section className="surface rounded-[2rem] p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Recent projects
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Open a result or start a new repurpose run
            </h2>
          </div>
          <Badge variant="outline">{projects?.length ?? 0} projects</Badge>
        </div>

        <div className="mt-6 grid gap-4">
          {projects === undefined ? (
            <div className="rounded-[1.5rem] border border-border/60 bg-muted/25 p-5 text-sm text-muted-foreground">
              Loading repurpose history...
            </div>
          ) : projects.length ? (
            projects.map((project) => (
              <Link
                key={project._id}
                href={`/app/repurpose/${project._id}`}
                className="rounded-[1.5rem] border border-border/70 bg-background/40 p-5 transition-colors hover:border-primary/45 hover:bg-primary/5"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold tracking-tight text-foreground">
                      {project.title}
                    </span>
                    <Badge variant="outline">{project.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {project.summary ?? "No completed repurpose result yet."}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <span>{project.sourceFilename ?? "No source"}</span>
                    <span>{formatDuration(project.sourceDurationSec)}</span>
                    <span>{project.variantCount} variants</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              No repurpose projects yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
