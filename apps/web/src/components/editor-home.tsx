"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Clapperboard, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EditorProjectSummary } from "@/lib/contracts";

export function EditorHome() {
  const router = useRouter();
  const createProject = useMutation("editorProjects:create" as never);
  const projects = useQuery("editorProjects:listRecentMine" as never, {}) as
    | EditorProjectSummary[]
    | undefined;
  const [creating, setCreating] = useState(false);

  async function handleCreateProject() {
    setCreating(true);
    try {
      const projectId = (await createProject({} as never)) as string;
      startTransition(() => {
        router.push(`/app/editor/${projectId}`);
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface rounded-[2rem] p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary">AI Editor</Badge>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
                Build a rough cut from raw clips.
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Upload multiple source clips, let the editor trim deadspace, resolve a sensible
                transcript-driven order, and render a shareable first draft.
              </p>
            </div>
          </div>
          <Button onClick={() => void handleCreateProject()} disabled={creating}>
            <Sparkles data-icon="inline-start" />
            {creating ? "Creating..." : "New project"}
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
              Open a draft or start a new one
            </h2>
          </div>
          <Badge variant="outline">{projects?.length ?? 0} projects</Badge>
        </div>

        <div className="mt-6 grid gap-4">
          {projects === undefined ? (
            <div className="rounded-[1.5rem] border border-border/60 bg-muted/25 p-5 text-sm text-muted-foreground">
              Loading editor history...
            </div>
          ) : projects.length ? (
            projects.map((project) => (
              <Link
                key={project._id}
                href={`/app/editor/${project._id}`}
                className="rounded-[1.5rem] border border-border/70 bg-background/40 p-5 transition-colors hover:border-primary/45 hover:bg-primary/5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold tracking-tight text-foreground">
                        {project.title}
                      </span>
                      <Badge variant="outline">{project.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {project.storylineSummary ??
                        "No rendered draft yet. Add clips and generate a first pass."}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{project.clipCount} clips</span>
                    <span>{project.warningCount} warnings</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-muted/20 p-8 text-center">
              <Clapperboard className="mx-auto size-8 text-primary/70" />
              <p className="mt-4 text-base font-medium text-foreground">No AI editor projects yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Create a project to start assembling a rough cut from uploaded clips.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
