"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Clapperboard, LoaderCircle, PencilLine, Sparkles, X } from "lucide-react";

import { UploadDropzone } from "@/components/upload-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchLatestRepurposeResult,
  generateRepurposeResult,
  uploadVideo,
} from "@/lib/api";
import type {
  RepurposeProjectDetail,
  RepurposeResultResponse,
  RepurposeStage,
} from "@/lib/contracts";

const DEFAULT_PROJECT_TITLE = "Untitled repurpose project";

function formatDuration(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "Unknown duration";
  }
  return `${value.toFixed(1)}s`;
}

const STAGE_COPY: Record<
  RepurposeStage,
  { label: string; hint: string; progress: number }
> = {
  queued: {
    label: "Queued",
    hint: "Waiting for the repurpose worker to start.",
    progress: 5,
  },
  preparing_source: {
    label: "Preparing source",
    hint: "Inspecting the source video for reusable beats.",
    progress: 24,
  },
  planning_variants: {
    label: "Planning variants",
    hint: "Choosing the strongest alternate angles from the source.",
    progress: 52,
  },
  rendering_variants: {
    label: "Rendering variants",
    hint: "Rendering the repurposed exports.",
    progress: 82,
  },
  finalizing: {
    label: "Finalizing",
    hint: "Saving export metadata and review details.",
    progress: 94,
  },
  completed: {
    label: "Ready",
    hint: "The repurposed variants are ready to review.",
    progress: 100,
  },
  failed: {
    label: "Failed",
    hint: "Repurpose generation failed.",
    progress: 0,
  },
};

export function RepurposeProjectClient({ projectId }: { projectId: string }) {
  const project = useQuery("repurposeProjects:getMineById" as never, { projectId } as never) as
    | RepurposeProjectDetail
    | null
    | undefined;
  const createPendingUpload = useMutation("uploads:createPendingUpload" as never);
  const attachSourceUpload = useMutation("repurposeProjects:attachSourceUpload" as never);
  const queueGeneration = useMutation("repurposeProjects:queueGeneration" as never);
  const updateTitle = useMutation("repurposeProjects:updateTitle" as never);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resultResponse, setResultResponse] = useState<RepurposeResultResponse | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const autoPromptedForTitleRef = useRef(false);

  useEffect(() => {
    if (!project?._id) {
      return;
    }
    const resolvedProjectId = project._id;
    const projectStatus = project.status;
    const shouldPoll =
      project.latestLocalResultId !== null ||
      projectStatus === "queued" ||
      projectStatus === "running" ||
      projectStatus === "completed" ||
      projectStatus === "failed";
    if (!shouldPoll) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function loadResult() {
      try {
        const next = await fetchLatestRepurposeResult(resolvedProjectId);
        if (!active) {
          return;
        }
        setResultResponse(next);
        setResultError(null);
        if (next.status === "queued" || next.status === "running") {
          timer = setTimeout(loadResult, 2500);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Could not load the latest repurpose result.";
        if (
          message.includes("Repurpose result not found") &&
          (projectStatus === "queued" || projectStatus === "running")
        ) {
          timer = setTimeout(loadResult, 2500);
          return;
        }
        setResultError(message);
      }
    }

    void loadResult();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [project?._id, project?.latestLocalResultId, project?.status]);

  useEffect(() => {
    if (!project) {
      return;
    }
    if (!editingTitle) {
      setTitleDraft(project.title);
    }
    if (
      !autoPromptedForTitleRef.current &&
      project.title.trim() === DEFAULT_PROJECT_TITLE
    ) {
      autoPromptedForTitleRef.current = true;
      setEditingTitle(true);
      setTitleError(null);
    }
  }, [editingTitle, project]);

  useEffect(() => {
    if (!editingTitle || !titleInputRef.current) {
      return;
    }
    titleInputRef.current.focus();
    titleInputRef.current.select();
  }, [editingTitle]);

  async function handleSourceFile(file: File) {
    if (!project?._id) {
      return;
    }
    setSourceFile(file);
    setUploading(true);
    setUploadError(null);
    setActionError(null);
    try {
      const uploadId = (await createPendingUpload({
        filename: file.name,
        contentType: file.type || "video/mp4",
        sizeBytes: file.size,
      } as never)) as string;
      const uploaded = await uploadVideo(file, uploadId);
      await attachSourceUpload({
        projectId,
        uploadId,
        filenameSnapshot: uploaded.video.filename,
        durationSecSnapshot: uploaded.video.durationSec,
      } as never);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not upload the source video.");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!project?._id) {
      return;
    }
    setGenerating(true);
    setActionError(null);
    try {
      const queued = (await queueGeneration({ projectId } as never)) as {
        projectId: string;
        sourceUploadId: string;
        localUploadId: string;
        filename: string;
      };
      const next = await generateRepurposeResult(queued.projectId, {
        sourceUploadId: queued.sourceUploadId,
        localUploadId: queued.localUploadId,
        filename: queued.filename,
      });
      setResultResponse(next);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not generate repurpose variants.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function submitTitleChange() {
    if (!project?._id) {
      return;
    }
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError("Project title cannot be empty.");
      return;
    }
    if (nextTitle === project.title) {
      setEditingTitle(false);
      setTitleError(null);
      return;
    }
    setSavingTitle(true);
    setTitleError(null);
    try {
      await updateTitle({ projectId, title: nextTitle } as never);
      setEditingTitle(false);
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : "Could not rename project.");
    } finally {
      setSavingTitle(false);
    }
  }

  function cancelTitleEdit() {
    if (!project) {
      return;
    }
    setTitleDraft(project.title);
    setEditingTitle(false);
    setTitleError(null);
  }

  if (project === undefined) {
    return (
      <div className="rounded-[1.5rem] border border-border/70 bg-muted/25 p-6 text-sm text-muted-foreground">
        Loading repurpose project...
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="rounded-[1.5rem] border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        Repurpose project not found.
      </div>
    );
  }

  const stageMeta = resultResponse?.stage ? STAGE_COPY[resultResponse.stage] : null;
  const sourceReady = Boolean(project.sourceUploadId);
  const untitledProject = project.title.trim() === DEFAULT_PROJECT_TITLE;

  return (
    <div className="space-y-6">
      <section className="surface rounded-[2rem] p-6 lg:p-8">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">Repurpose</Badge>
            <Badge variant="outline">{project.status}</Badge>
            {untitledProject ? <Badge variant="outline">Needs name</Badge> : null}
          </div>
          <div>
            {editingTitle ? (
              <div className="max-w-2xl space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    ref={titleInputRef}
                    aria-label="Project title"
                    value={titleDraft}
                    onChange={(event) => {
                      setTitleDraft(event.target.value);
                      if (titleError) {
                        setTitleError(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void submitTitleChange();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelTitleEdit();
                      }
                    }}
                    placeholder="Name this project"
                    className="h-12 text-lg font-semibold"
                    disabled={savingTitle}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void submitTitleChange()}
                      disabled={savingTitle}
                    >
                      {savingTitle ? (
                        <LoaderCircle data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <Check data-icon="inline-start" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelTitleEdit}
                      disabled={savingTitle}
                    >
                      <X data-icon="inline-start" />
                      Cancel
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {untitledProject
                    ? "Give this repurpose project a real name so it is easy to find later."
                    : "Rename the project inline. Press Enter to save or Escape to cancel."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
                    {project.title}
                  </h1>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTitleDraft(project.title);
                      setEditingTitle(true);
                      setTitleError(null);
                    }}
                  >
                    <PencilLine data-icon="inline-start" />
                    Rename
                  </Button>
                </div>
                {untitledProject ? (
                  <p className="text-sm text-muted-foreground">
                    This project still has the default name. Rename it now so it is easy to find later.
                  </p>
                ) : null}
              </div>
            )}
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Upload one source video, then generate up to three alternate cuts built only from
              the original footage.
            </p>
          </div>
        </div>
        {titleError ? <p className="mt-4 text-sm text-destructive">{titleError}</p> : null}
      </section>

      <section className="surface rounded-[2rem] p-6 lg:p-8">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Source video</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Upload one finished source
            </h2>
          </div>

          <UploadDropzone
            label="Source video"
            description="Upload one source video for the repurpose engine."
            file={sourceFile}
            status={uploading ? "uploading" : generating ? "analyzing" : "idle"}
            onFileChange={(file) => {
              void handleSourceFile(file);
            }}
          />

          {project.sourceFilename ? (
            <article className="rounded-[1.5rem] border border-border/70 bg-background/40 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">{project.status}</Badge>
                <span className="text-sm text-muted-foreground">{project.sourceFilename}</span>
                <span className="text-sm text-muted-foreground">
                  {formatDuration(project.sourceDurationSec)}
                </span>
              </div>
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">Upload a source video to start.</p>
          )}

          {uploadError ? (
            <p className="text-sm text-destructive">{uploadError}</p>
          ) : null}
          {actionError ? (
            <p className="text-sm text-destructive">{actionError}</p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {sourceReady
                ? "Generate up to three alternate cuts from this source."
                : "Upload a source video before generating variants."}
            </p>
            <Button
              onClick={() => void handleGenerate()}
              disabled={!sourceReady || generating || uploading}
            >
              {generating ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
              Generate variants
            </Button>
          </div>
        </div>
      </section>

      {stageMeta ? (
        <section className="surface rounded-[2rem] p-6 lg:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{stageMeta.label}</Badge>
            <p className="text-sm text-muted-foreground">
              {resultResponse?.statusMessage ?? stageMeta.hint}
            </p>
          </div>
          <div className="mt-4 h-2 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${resultResponse?.progressPercent ?? stageMeta.progress}%` }}
            />
          </div>
        </section>
      ) : null}

      {resultError ? (
        <section className="rounded-[1.5rem] border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
          {resultError}
        </section>
      ) : null}

      {resultResponse?.payload ? (
        <section className="surface rounded-[2rem] p-6 lg:p-8">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Variants</p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Up to three alternate cuts from the same source
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {resultResponse.payload.summary}
            </p>
          </div>

          <div
            className={`mt-6 grid gap-4 ${
              resultResponse.payload.variants.length >= 3 ? "xl:grid-cols-3" : "xl:grid-cols-2"
            }`}
          >
            {resultResponse.payload.variants.map((variant) => (
              <article
                key={variant.variantId}
                className="rounded-[1.5rem] border border-border/70 bg-background/40 p-5"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{variant.durationTarget}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(variant.durationSec)}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-foreground">
                      {variant.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {variant.angleSummary}
                    </p>
                  </div>
                  <p className="text-sm text-foreground/85">{variant.rationale}</p>
                  <div className="overflow-hidden rounded-[1.25rem] border border-border/70 bg-black/70">
                    {variant.videoUrl ? (
                      <video
                        className="aspect-[9/16] w-full bg-black object-cover"
                        src={variant.videoUrl}
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex aspect-[9/16] items-center justify-center text-sm text-muted-foreground">
                        Export unavailable
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clapperboard className="size-4" />
                      <span>{variant.segmentCount} segments</span>
                    </div>
                    <a
                      href={variant.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open export ${variant.title}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Open export
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
