"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Check, Clapperboard, PencilLine, Sparkles, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EditorProjectSummary } from "@/lib/contracts";

export function EditorHome() {
  const router = useRouter();
  const createProject = useMutation("editorProjects:create" as never);
  const updateTitle = useMutation("editorProjects:updateTitle" as never);
  const deleteProject = useMutation("editorProjects:deleteProject" as never);
  const projects = useQuery("editorProjects:listRecentMine" as never, {}) as
    | EditorProjectSummary[]
    | undefined;
  const [creating, setCreating] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ projectId: string; message: string } | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<EditorProjectSummary | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

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

  function beginRename(project: EditorProjectSummary) {
    setEditingProjectId(project._id);
    setTitleDraft(project.title);
    setRowError(null);
    queueMicrotask(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }

  function cancelRename() {
    setEditingProjectId(null);
    setTitleDraft("");
    setRowError(null);
  }

  useEffect(() => {
    if (deleteCandidate === null) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => {
      const cancelButton = document.getElementById("delete-project-cancel");
      if (cancelButton instanceof HTMLElement) {
        cancelButton.focus();
      }
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && deletingProjectId === null) {
        setDeleteCandidate(null);
        setDeleteDialogError(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteCandidate, deletingProjectId]);

  async function handleSaveTitle(projectId: string) {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setRowError({ projectId, message: "Project title cannot be empty." });
      return;
    }

    setSavingProjectId(projectId);
    setRowError(null);
    try {
      await updateTitle({ projectId, title: nextTitle } as never);
      setEditingProjectId(null);
      setTitleDraft("");
    } catch (error) {
      setRowError({
        projectId,
        message: error instanceof Error ? error.message : "Could not rename project.",
      });
    } finally {
      setSavingProjectId(null);
    }
  }

  function openDeleteDialog(project: EditorProjectSummary) {
    setDeleteCandidate(project);
    setDeleteDialogError(null);
    setRowError(null);
  }

  function closeDeleteDialog() {
    if (deletingProjectId !== null) {
      return;
    }
    setDeleteCandidate(null);
    setDeleteDialogError(null);
  }

  async function handleDeleteProject() {
    if (deleteCandidate === null) {
      return;
    }

    setDeletingProjectId(deleteCandidate._id);
    setDeleteDialogError(null);
    try {
      await deleteProject({ projectId: deleteCandidate._id } as never);
      if (editingProjectId === deleteCandidate._id) {
        cancelRename();
      }
      setDeleteCandidate(null);
    } catch (error) {
      setDeleteDialogError(error instanceof Error ? error.message : "Could not delete project.");
    } finally {
      setDeletingProjectId(null);
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
            <span className="sticker">Recent projects</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Open a draft or start a new one
            </h2>
          </div>
          <Badge variant="outline">{projects?.length ?? 0} projects</Badge>
        </div>

        <div className="mt-6 grid gap-4">
          {projects === undefined ? (
            <div className="rounded-[1.5rem] border-[3px] border-border/60 bg-muted/25 p-5 text-sm text-muted-foreground">
              Loading editor history...
            </div>
          ) : projects.length ? (
            projects.map((project) => (
              <div
                key={project._id}
                className="spring rounded-[1.5rem] border-[3px] border-border/70 bg-background/40 p-5 shadow-[5px_5px_0_0_var(--shadow-stamp)] transition-[background-color,border-color] hover:border-primary/45 hover:bg-primary/5 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[8px_8px_0_0_var(--shadow-stamp)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    {editingProjectId === project._id ? (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Input
                            ref={titleInputRef}
                            value={titleDraft}
                            onChange={(event) => {
                              setTitleDraft(event.target.value);
                              if (rowError?.projectId === project._id) {
                                setRowError(null);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleSaveTitle(project._id);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            placeholder="Project title"
                            className="max-w-xl"
                            disabled={savingProjectId === project._id}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => void handleSaveTitle(project._id)}
                              disabled={savingProjectId === project._id}
                              aria-label="Save title"
                            >
                              <Check data-icon="inline-start" />
                              {savingProjectId === project._id ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelRename}
                              disabled={savingProjectId === project._id}
                            >
                              <X data-icon="inline-start" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {project.storylineSummary ??
                            "No rendered draft yet. Add clips and generate a first pass."}
                        </p>
                      </div>
                    ) : (
                      <Link
                        href={`/app/editor/${project._id}`}
                        className="block rounded-[1.1rem] transition-colors hover:text-foreground/90"
                      >
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
                      </Link>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{project.clipCount} clips</span>
                      <span>{project.warningCount} warnings</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Rename ${project.title}`}
                      onClick={() => beginRename(project)}
                      disabled={deletingProjectId === project._id || savingProjectId === project._id}
                    >
                      <PencilLine />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${project.title}`}
                      onClick={() => openDeleteDialog(project)}
                      disabled={deletingProjectId === project._id || savingProjectId === project._id}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {rowError?.projectId === project._id ? (
                  <p className="mt-3 text-sm text-destructive">{rowError.message}</p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border-[3px] border-dashed border-border/80 bg-muted/20 p-8 text-center">
              <Clapperboard className="mx-auto size-8 text-primary/70" />
              <p className="mt-4 text-base font-medium text-foreground">No AI editor projects yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Create a project to start assembling a rough cut from uploaded clips.
              </p>
            </div>
          )}
        </div>
      </section>

      {deleteCandidate ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={closeDeleteDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete project"
            aria-labelledby="delete-project-title"
            aria-describedby="delete-project-description"
            className="surface w-full max-w-md rounded-[2rem] border-[3px] border-border/80 p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <span className="sticker">Delete project</span>
                <h3
                  id="delete-project-title"
                  className="text-2xl font-semibold tracking-tight text-foreground"
                >
                  Delete “{deleteCandidate.title}”?
                </h3>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Close delete dialog"
                onClick={closeDeleteDialog}
                disabled={deletingProjectId === deleteCandidate._id}
              >
                <X />
              </Button>
            </div>
            <p
              id="delete-project-description"
              className="mt-4 text-sm leading-6 text-muted-foreground"
            >
              This removes the project from your AI Editor dashboard. Uploaded clips stay in your
              library, but the rough-cut project and its clip list will be removed.
            </p>
            {deleteDialogError ? (
              <p className="mt-3 text-sm text-destructive">{deleteDialogError}</p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                id="delete-project-cancel"
                variant="ghost"
                onClick={closeDeleteDialog}
                disabled={deletingProjectId === deleteCandidate._id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDeleteProject()}
                disabled={deletingProjectId === deleteCandidate._id}
              >
                <Trash2 data-icon="inline-start" />
                {deletingProjectId === deleteCandidate._id ? "Deleting..." : "Delete project"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
