"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileWarning, LoaderCircle, Scissors, Sparkles, Trash2 } from "lucide-react";

import { UploadDropzone } from "@/components/upload-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchLatestEditorDraft,
  generateEditorDraft,
  uploadVideo,
} from "@/lib/api";
import type { EditorDraftResponse, EditorProjectDetail } from "@/lib/contracts";

function formatDuration(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "Unknown duration";
  }
  return `${value.toFixed(1)}s`;
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

  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [activeUploadIndex, setActiveUploadIndex] = useState(-1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftResponse, setDraftResponse] = useState<EditorDraftResponse | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!project?.latestLocalDraftId || project.status === "drafting") {
      return;
    }
    const resolvedProjectId = project._id;

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
        setDraftError(error instanceof Error ? error.message : "Could not load the latest draft.");
      }
    }

    void loadDraft();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [project?._id, project?.latestLocalDraftId]);

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
  const uploadQueueCount =
    activeUploadIndex >= 0 ? Math.max(uploadingFiles.length - activeUploadIndex - 1, 0) : 0;
  const uploading = activeUpload !== null;

  const canGenerate =
    project.clips.length >= 2 &&
    project.clips.every((clip) => clip.localUploadId) &&
    !uploading &&
    !generating;

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
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">AI Editor</Badge>
              <Badge variant="outline">{project.status}</Badge>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">{project.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Upload the clips you want to combine, then generate a first-pass edit that trims
                deadspace and assembles them into a sensible narrative order.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <Button onClick={() => void handleGenerate()} disabled={!canGenerate}>
              {generating ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
              Generate rough cut
            </Button>
            {!canGenerate ? (
              <p className="text-sm text-muted-foreground">
                Add at least two clips and wait for each upload to finish before generating.
              </p>
            ) : null}
          </div>
        </div>

        {actionError ? <p className="mt-4 text-sm text-destructive">{actionError}</p> : null}
        {draftError ? <p className="mt-4 text-sm text-destructive">{draftError}</p> : null}
        {project.errorMessage ? <p className="mt-4 text-sm text-destructive">{project.errorMessage}</p> : null}
      </section>

      <section className="surface rounded-[2rem] p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Source clips</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Upload and manage your sequence
            </h2>
          </div>
          <Badge variant="outline">{project.clips.length} clips</Badge>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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
            {project.clips.length ? (
              project.clips
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
                        onClick={() =>
                          void removeClip({ projectId, clipId: clip._id } as never)
                        }
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

        {uploadError ? <p className="mt-4 text-sm text-destructive">{uploadError}</p> : null}
      </section>

      <section className="surface rounded-[2rem] p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Draft review</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Latest generated edit
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

        {draftResponse?.payload && project.status !== "drafting" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
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
        ) : (
          <div className="mt-6 rounded-[1.5rem] border border-dashed border-border/80 bg-muted/20 p-6 text-sm text-muted-foreground">
            Generate a rough cut to review the exported draft, clip order, and transcript-based
            rationale here.
          </div>
        )}
      </section>
    </div>
  );
}
