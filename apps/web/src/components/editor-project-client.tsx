"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  FileWarning,
  LoaderCircle,
  PencilLine,
  Scissors,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { UploadDropzone } from "@/components/upload-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchLatestEditorDraft,
  generateEditorDraft,
  uploadVideo,
} from "@/lib/api";
import type {
  EditorDraftResponse,
  EditorDraftStage,
  EditorProjectDetail,
} from "@/lib/contracts";

const DEFAULT_PROJECT_TITLE = "Untitled AI editor project";

function formatDuration(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "Unknown duration";
  }
  return `${value.toFixed(1)}s`;
}

function resolveScrollBehavior(): ScrollBehavior {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return "auto";
  }
  return "smooth";
}

function resolveDraftReviewScrollTop(target: HTMLElement): number {
  const targetTop = target.getBoundingClientRect().top + window.scrollY;
  const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const main = target.closest("main");
  const mainPaddingTop = main
    ? Number.parseFloat(window.getComputedStyle(main).paddingTop || "0") || 24
    : 24;

  return Math.max(0, Math.round(targetTop - headerBottom - mainPaddingTop));
}

const EDITOR_STAGE_ORDER: EditorDraftStage[] = [
  "queued",
  "preparing_clips",
  "ordering_story",
  "rendering_video",
  "finalizing",
];

const EDITOR_STAGE_META: Record<
  EditorDraftStage,
  {
    label: string;
    title: string;
    hint: string;
    progress: number;
  }
> = {
  queued: {
    label: "Queued",
    title: "Waiting to start",
    hint: "The rough cut is queued and waiting for the editor worker to pick it up.",
    progress: 5,
  },
  preparing_clips: {
    label: "Preparing clips",
    title: "Transcribing clips and trimming deadspace",
    hint: "Each uploaded clip is being reviewed for speech timing, silence, and weak stretches.",
    progress: 30,
  },
  ordering_story: {
    label: "Ordering story",
    title: "Resolving the narrative order",
    hint: "The editor is using transcript meaning to decide how the clips fit together.",
    progress: 66,
  },
  rendering_video: {
    label: "Rendering",
    title: "Building the full rough cut",
    hint: "Trimmed clips are being stitched together into the rendered draft video.",
    progress: 84,
  },
  finalizing: {
    label: "Finalizing",
    title: "Preparing the review page",
    hint: "The export is being saved and the clip-by-clip review data is being assembled.",
    progress: 94,
  },
  completed: {
    label: "Ready",
    title: "Rough cut ready",
    hint: "The rendered draft and the ordered clip breakdown are ready to review.",
    progress: 100,
  },
  failed: {
    label: "Failed",
    title: "Rough cut failed",
    hint: "The editor could not finish this draft successfully.",
    progress: 0,
  },
};

type DraftPresentation = {
  stage: EditorDraftStage;
  label: string;
  title: string;
  hint: string;
  progressPercent: number;
  statusMessage: string;
};

function resolveDraftStage(
  draftResponse: EditorDraftResponse | null,
  projectStatus: EditorProjectDetail["status"],
  generating: boolean,
): EditorDraftStage | null {
  if (draftResponse?.stage) {
    return draftResponse.stage;
  }
  if (draftResponse?.status === "completed" || projectStatus === "completed") {
    return "completed";
  }
  if (draftResponse?.status === "failed" || projectStatus === "failed") {
    return "failed";
  }
  if (draftResponse?.status === "running" || projectStatus === "running") {
    return "preparing_clips";
  }
  if (draftResponse?.status === "queued" || projectStatus === "queued" || generating) {
    return "queued";
  }
  return null;
}

function resolveDraftPresentation(
  draftResponse: EditorDraftResponse | null,
  projectStatus: EditorProjectDetail["status"],
  generating: boolean,
): DraftPresentation | null {
  const stage = resolveDraftStage(draftResponse, projectStatus, generating);
  if (!stage) {
    return null;
  }
  const meta = EDITOR_STAGE_META[stage];
  return {
    stage,
    label: meta.label,
    title: meta.title,
    hint: meta.hint,
    progressPercent: Math.max(
      0,
      Math.min(100, Math.round(draftResponse?.progressPercent ?? meta.progress)),
    ),
    statusMessage: draftResponse?.statusMessage ?? meta.hint,
  };
}

export function EditorProjectClient({ projectId }: { projectId: string }) {
  const project = useQuery("editorProjects:getMineById" as never, { projectId } as never) as
    | EditorProjectDetail
    | null
    | undefined;
  const createPendingUpload = useMutation("uploads:createPendingUpload" as never);
  const addClip = useMutation("editorProjects:addClip" as never);
  const removeClip = useMutation("editorProjects:removeClip" as never);
  const queueGeneration = useMutation("editorProjects:queueGeneration" as never);
  const updateTitle = useMutation("editorProjects:updateTitle" as never);

  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [activeUploadIndex, setActiveUploadIndex] = useState(-1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftResponse, setDraftResponse] = useState<EditorDraftResponse | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const draftReviewSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToDraftRef = useRef(false);

  useEffect(() => {
    if (!project?._id) {
      return;
    }
    const resolvedProjectId = project._id;
    const projectStatus = project.status;
    const shouldPoll =
      projectStatus !== "drafting" ||
      draftResponse?.status === "queued" ||
      draftResponse?.status === "running" ||
      draftResponse?.status === "completed" ||
      draftResponse?.status === "failed";
    if (!shouldPoll) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function loadDraft() {
      try {
        const next = await fetchLatestEditorDraft(resolvedProjectId);
        if (!active) {
          return;
        }
        setDraftResponse(next);
        setDraftError(null);
        if (next.status === "queued" || next.status === "running") {
          timer = setTimeout(loadDraft, 2500);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Could not load the latest draft.";
        if (
          message.includes("Editor draft not found") &&
          (projectStatus === "queued" ||
            projectStatus === "running" ||
            draftResponse?.status === "queued" ||
            draftResponse?.status === "running")
        ) {
          timer = setTimeout(loadDraft, 2500);
          return;
        }
        setDraftError(message);
      }
    }

    void loadDraft();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [draftResponse?.status, project?._id, project?.status]);

  useEffect(() => {
    if (!shouldScrollToDraftRef.current || !draftReviewSectionRef.current) {
      return;
    }

    const shouldScroll =
      generating ||
      draftResponse?.status === "queued" ||
      draftResponse?.status === "running" ||
      Boolean(draftResponse?.payload?.export.videoUrl);
    if (!shouldScroll) {
      return;
    }

    const target = draftReviewSectionRef.current;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: resolveDraftReviewScrollTop(target),
        behavior: resolveScrollBehavior(),
      });
      shouldScrollToDraftRef.current = false;
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [draftResponse?.payload?.export.videoUrl, draftResponse?.status, generating]);

  useEffect(() => {
    if (!project) {
      return;
    }
    if (!editingTitle) {
      setTitleDraft(project.title);
    }
  }, [editingTitle, project]);

  if (project === undefined) {
    return (
      <div className="surface rounded-[2rem] p-8 text-sm text-muted-foreground">
        Loading editor project...
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="surface flex flex-col items-center gap-3 rounded-[2rem] p-10 text-center">
        <FileWarning className="size-8 text-rose-300" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Project not found</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          This project either does not exist or is not owned by the current workspace.
        </p>
      </div>
    );
  }

  const activeUpload =
    activeUploadIndex >= 0 && activeUploadIndex < uploadingFiles.length
      ? uploadingFiles[activeUploadIndex]
      : null;
  const currentProject = project;
  const uploadQueueCount =
    activeUploadIndex >= 0 ? Math.max(uploadingFiles.length - activeUploadIndex - 1, 0) : 0;
  const uploading = activeUpload !== null;
  const draftPresentation = resolveDraftPresentation(
    draftResponse,
    currentProject.status,
    generating,
  );
  const draftIsProcessing =
    draftPresentation !== null &&
    draftPresentation.stage !== "completed" &&
    draftPresentation.stage !== "failed";
  const draftFailed = draftPresentation?.stage === "failed";
  const untitledProject = currentProject.title.trim() === DEFAULT_PROJECT_TITLE;
  const visibleProjectError =
    currentProject.status === "failed" && !draftResponse?.payload
      ? currentProject.errorMessage
      : null;

  const canGenerate =
    currentProject.clips.length >= 2 &&
    currentProject.clips.every((clip) => clip.localUploadId) &&
    !uploading &&
    !generating;
  const sourceReady = currentProject.clips.some((clip) => Boolean(clip.localUploadId));
  const showTitleInput = editingTitle || untitledProject;
  const draftBannerActive =
    generating ||
    draftResponse?.status === "queued" ||
    draftResponse?.status === "running";

  async function submitTitleChange() {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError("Project title cannot be empty.");
      return;
    }
    if (nextTitle === currentProject.title) {
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
    setTitleDraft(currentProject.title);
    setEditingTitle(false);
    setTitleError(null);
  }

  async function uploadClip(file: File) {
    const convexUploadId = (await createPendingUpload({
      filename: file.name,
      contentType: file.type || "video/mp4",
      sizeBytes: file.size,
    } as never)) as string;
    const uploaded = await uploadVideo(file, convexUploadId);
    await addClip({
      projectId,
      uploadId: convexUploadId,
      filenameSnapshot: uploaded.video.filename,
      durationSecSnapshot: uploaded.video.durationSec,
    } as never);
  }

  async function handleFilesAdd(files: File[]) {
    if (!files.length) {
      return;
    }
    setUploadingFiles(files);
    setActiveUploadIndex(0);
    setUploadError(null);
    const failedFiles: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setActiveUploadIndex(index);
        try {
          await uploadClip(file);
        } catch (error) {
          failedFiles.push(file.name);
          if (failedFiles.length === 1) {
            setUploadError(error instanceof Error ? error.message : "Upload failed.");
          }
        }
      }
      if (failedFiles.length > 1) {
        setUploadError(
          `Some clips failed to upload: ${failedFiles.slice(0, 3).join(", ")}${failedFiles.length > 3 ? ` and ${failedFiles.length - 3} more` : ""}.`,
        );
      }
    } finally {
      setActiveUploadIndex(-1);
      setUploadingFiles([]);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setActionError(null);
    shouldScrollToDraftRef.current = true;
    try {
      const queued = (await queueGeneration({ projectId } as never)) as {
        projectId: string;
        clips: Array<{
          clipId: string;
          uploadId: string;
          localUploadId: string;
          filename: string;
        }>;
      };
      const nextDraft = await generateEditorDraft(queued.projectId, queued.clips);
      setDraftResponse(nextDraft);
      setDraftError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start generation.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface rounded-[2rem] p-6 lg:p-8">
        <div className="space-y-4">
          <div className="space-y-3">
            <span className="sticker">Project name</span>
            <h1 className="font-cartoon text-[1.4rem] font-black text-foreground">
              Name your project
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">AI Editor</Badge>
            <Badge variant="outline">{currentProject.status}</Badge>
            {untitledProject ? <Badge variant="outline">Needs name</Badge> : null}
          </div>

          <div className="max-w-2xl space-y-3">
            <label htmlFor="editor-project-title" className="text-sm font-medium text-foreground">
              Project title
            </label>

            {showTitleInput ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    id="editor-project-title"
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
                    className="h-12 border-[3px] text-lg font-semibold"
                    disabled={savingTitle}
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void submitTitleChange()} disabled={savingTitle}>
                      {savingTitle ? (
                        <LoaderCircle data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <Check data-icon="inline-start" />
                      )}
                      Save
                    </Button>
                    {editingTitle ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelTitleEdit}
                        disabled={savingTitle}
                      >
                        <X data-icon="inline-start" />
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {untitledProject
                    ? "Give this draft a real name before you start piling on clips."
                    : "Rename the project inline. Press Enter to save or Escape to cancel."}
                </p>
              </div>
            ) : (
              <div className="surface-soft flex flex-col gap-3 rounded-[1.5rem] border-[3px] border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Current title
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
                    {currentProject.title}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTitleDraft(currentProject.title);
                    setEditingTitle(true);
                    setTitleError(null);
                  }}
                >
                  <PencilLine data-icon="inline-start" />
                  Rename
                </Button>
              </div>
            )}
          </div>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Upload the clips you want to combine, then generate a first-pass edit that trims
            deadspace and assembles them into a sensible narrative order.
          </p>

          {titleError ? <p className="text-sm text-destructive">{titleError}</p> : null}
        </div>
      </section>

      {draftBannerActive ? (
        <div className="surface-soft spring sticky top-[4.5rem] z-20 mb-4 rounded-[1.5rem] border-[3px] border-border/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <span className="sticker-green">Generating</span>
              <p className="text-sm font-medium text-foreground">
                {draftPresentation?.label ?? "Queued"}
              </p>
            </div>
            <p className="font-cartoon text-[1.2rem] font-black text-foreground">
              {draftPresentation?.progressPercent ?? 5}%
            </p>
          </div>
        </div>
      ) : null}

      <section className="surface space-y-4 rounded-[2rem] p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <span className="sticker-green">Step 1 · Upload clips</span>
            <h2 className="font-cartoon text-[1.4rem] font-black text-foreground">
              Bring your raw footage
            </h2>
          </div>
          <Badge variant="outline">{currentProject.clips.length} clips</Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <UploadDropzone
            label="Add clips"
            description="Drop multiple clips at once or browse for a batch. The editor preserves upload order until generation."
            file={activeUpload}
            status={uploading ? "uploading" : "idle"}
            multiple
            onFileChange={(file) => {
              void handleFilesAdd([file]);
            }}
            onFilesChange={(files) => {
              void handleFilesAdd(files);
            }}
          />

          <div className="space-y-3">
            {uploading ? (
              <div className="rounded-[1.5rem] border border-border/70 bg-muted/25 p-4 text-sm text-muted-foreground">
                Uploading clip {activeUploadIndex + 1} of {uploadingFiles.length}:{" "}
                <span className="font-medium text-foreground">{activeUpload?.name}</span>
                {uploadQueueCount ? ` · ${uploadQueueCount} remaining in queue` : ""}
              </div>
            ) : null}
            {currentProject.clips.length ? (
              currentProject.clips
                .slice()
                .sort((left, right) => left.sourceOrder - right.sourceOrder)
                .map((clip) => (
                  <article
                    key={clip._id}
                    className="rounded-[1.5rem] border border-border/70 bg-background/45 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">#{clip.sourceOrder + 1}</Badge>
                          <span className="text-base font-medium text-foreground">{clip.filename}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDuration(clip.durationSec)}
                          {clip.localUploadId ? " · Ready" : " · Upload still attaching"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void removeClip({ projectId, clipId: clip._id } as never)}
                      >
                        <Trash2 data-icon="inline-start" />
                        Remove
                      </Button>
                    </div>
                  </article>
                ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-muted/20 p-6 text-sm text-muted-foreground">
                No clips yet. Start by uploading the footage you want in the rough cut.
              </div>
            )}
          </div>
        </div>

        {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      </section>

      <section className="surface space-y-4 rounded-[2rem] p-6 lg:p-8">
        <div className="space-y-3">
          <span className="sticker-green">Step 2 · Generate draft</span>
          <h2 className="font-cartoon text-[1.4rem] font-black text-foreground">
            Let the AI arrange a first cut
          </h2>
        </div>

        {!sourceReady ? (
          <p className="text-sm text-muted-foreground">Upload at least one clip to unlock.</p>
        ) : null}

        <div
          aria-disabled={sourceReady ? undefined : "true"}
          className={sourceReady ? undefined : "opacity-60 pointer-events-none"}
        >
          <div className="surface-soft space-y-3 rounded-[1.5rem] border-[3px] border-border/70 p-5">
            <p className="text-sm text-muted-foreground">
              {sourceReady
                ? "Generate a first-pass draft once your clips are uploaded and ready."
                : "The draft generator stays visible here so the next step is clear."}
            </p>
            <div className="flex flex-col gap-3 lg:items-end">
              <Button className="w-full sm:w-auto" onClick={() => void handleGenerate()} disabled={!canGenerate}>
                {generating ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Sparkles data-icon="inline-start" />
                )}
                Generate rough cut
              </Button>
              {!canGenerate ? (
                <p className="text-sm text-muted-foreground lg:text-right">
                  Add at least two clips and wait for each upload to finish before generating.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
      </section>

      <section
        ref={draftReviewSectionRef}
        className="surface space-y-4 rounded-[2rem] p-6 lg:p-8"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <span className="sticker-green">Step 3 · Review &amp; export</span>
            <h2 className="font-cartoon text-[1.4rem] font-black text-foreground">
              Play it back and pick your exports
            </h2>
          </div>
          {draftResponse?.payload?.export.videoUrl ? (
            <Link
              href={draftResponse.payload.export.videoUrl}
              className="inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Open export
            </Link>
          ) : null}
        </div>

        {draftPresentation ? <DraftStatusPanel presentation={draftPresentation} /> : null}
        {draftError ? <p className="text-sm text-destructive">{draftError}</p> : null}
        {visibleProjectError ? <p className="text-sm text-destructive">{visibleProjectError}</p> : null}

        {draftResponse?.payload && currentProject.status !== "drafting" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-black/40">
                <video
                  controls
                  className="aspect-[9/16] w-full bg-black"
                  src={draftResponse.payload.export.videoUrl}
                />
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-background/45 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">{draftResponse.payload.orderingConfidence}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {draftResponse.payload.export.durationSec.toFixed(1)}s final duration
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  {draftResponse.payload.storylineSummary}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {draftResponse.payload.warnings.length ? (
                <div className="rounded-[1.5rem] border border-amber-300/30 bg-amber-300/8 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileWarning className="size-4 text-amber-300" />
                    Draft warnings
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {draftResponse.payload.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {draftResponse.payload.orderedClips.map((clip) => (
                <article
                  key={clip.clipId}
                  className="rounded-[1.5rem] border border-border/70 bg-background/45 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">#{clip.resolvedOrder}</Badge>
                    <span className="text-base font-medium text-foreground">{clip.filename}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-foreground">{clip.rationale}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{clip.transcriptPreview}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <span>{clip.trimmedDurationSec.toFixed(1)}s kept</span>
                    <span>{clip.removedSeconds.toFixed(1)}s removed</span>
                    <span>{clip.speechCoverage.toFixed(2)} speech coverage</span>
                  </div>
                  {clip.appliedCuts.length ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                      <Scissors className="size-3.5" />
                      {clip.appliedCuts.length} deadspace cuts applied
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : draftIsProcessing ? (
          <DraftReviewSkeleton presentation={draftPresentation} />
        ) : draftFailed ? (
          <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/5 p-6">
            <p className="text-base font-medium text-foreground">Rough cut failed</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {draftResponse?.error ||
                currentProject.errorMessage ||
                "The draft did not complete successfully."}
            </p>
          </div>
        ) : (
          <div
            aria-disabled="true"
            className="rounded-[1.5rem] border border-dashed border-border/80 bg-muted/20 p-6 text-sm text-muted-foreground opacity-60"
          >
            Generate a draft to see the rendered cut here.
          </div>
        )}
      </section>
    </div>
  );
}

function DraftStatusPanel({ presentation }: { presentation: DraftPresentation }) {
  const failed = presentation.stage === "failed";
  const completed = presentation.stage === "completed";

  return (
    <div
      className={`mt-6 rounded-[1.5rem] border p-5 ${
        failed
          ? "border-destructive/30 bg-destructive/5"
          : "border-border/70 bg-background/45"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={failed ? "outline" : completed ? "secondary" : "outline"}>
              {presentation.label}
            </Badge>
            {!failed ? (
              <span className="text-sm text-muted-foreground">
                {presentation.progressPercent}% complete
              </span>
            ) : null}
          </div>
          <div>
            <p className="text-base font-medium text-foreground">{presentation.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {presentation.statusMessage}
            </p>
          </div>
        </div>

        {!failed ? (
          <div className="min-w-[5rem] text-left lg:text-right">
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {presentation.progressPercent}%
            </p>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Progress
            </p>
          </div>
        ) : null}
      </div>

      {!failed ? (
        <div
          aria-label="Rough cut progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={presentation.progressPercent}
          className="mt-5 h-3 overflow-hidden rounded-full border border-border bg-[#151a16]"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#35b85f_0%,#73d18f_48%,#c8f0d0_100%)] transition-[width] duration-700 ease-out"
            style={{ width: `${presentation.progressPercent}%` }}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {EDITOR_STAGE_ORDER.map((stage) => {
          const active = presentation.stage === stage;
          const complete =
            presentation.stage === "completed" ||
            (!failed &&
              EDITOR_STAGE_ORDER.indexOf(stage) < EDITOR_STAGE_ORDER.indexOf(presentation.stage));
          return (
            <span
              key={stage}
              className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : complete
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-border/70 bg-background/35 text-muted-foreground"
              }`}
            >
              {EDITOR_STAGE_META[stage].label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function DraftReviewSkeleton({ presentation }: { presentation: DraftPresentation | null }) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-black/40">
          <Skeleton className="aspect-[9/16] w-full rounded-none bg-white/8" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-16 rounded-[1.2rem]" />
          <Skeleton className="h-16 rounded-[1.2rem]" />
          <Skeleton className="h-16 rounded-[1.2rem]" />
        </div>

        <div className="rounded-[1.5rem] border border-border/70 bg-background/45 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{presentation?.label ?? "Queued"}</Badge>
            <span className="text-sm text-muted-foreground">
              {presentation?.progressPercent ?? 0}% complete
            </span>
          </div>
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-10/12" />
          <Skeleton className="mt-2 h-4 w-8/12" />
        </div>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <article
            key={index}
            className="rounded-[1.5rem] border border-border/70 bg-background/45 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-7 w-14 rounded-full" />
              <Skeleton className="h-5 w-36" />
            </div>
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-11/12" />
            <Skeleton className="mt-2 h-4 w-8/12" />
            <div className="mt-4 flex flex-wrap gap-3">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
