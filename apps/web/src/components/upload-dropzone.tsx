"use client";

import { useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, MouseEvent } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";

type UploadDropzoneProps = {
  label: string;
  description: string;
  file: File | null;
  status?: "idle" | "uploading" | "analyzing";
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  onFileChange: (file: File) => void;
  onFilesChange?: (files: File[]) => void;
  className?: string;
};

export function UploadDropzone({
  label,
  description,
  file,
  status = "idle",
  disabled = false,
  accept = "video/mp4,video/*",
  multiple = false,
  onFileChange,
  onFilesChange,
  className,
}: UploadDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const busy = disabled || status !== "idle";
  const quietActionClassName =
    "h-auto border-transparent bg-transparent px-0 py-0 text-sm font-semibold text-primary shadow-none hover:bg-transparent hover:text-primary hover:underline focus-visible:ring-0";

  function openPicker() {
    if (busy) {
      return;
    }
    inputRef.current?.click();
  }

  function commitFiles(nextFiles: FileList | File[] | null | undefined) {
    if (!nextFiles || busy) {
      return;
    }
    const files = Array.from(nextFiles).filter(Boolean);
    if (!files.length) {
      return;
    }
    if (multiple && onFilesChange) {
      onFilesChange(files);
      return;
    }
    onFileChange(files[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    commitFiles(event.dataTransfer.files);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={`${inputId}-description`}
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!busy) {
          setIsDragging(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) {
          setIsDragging(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        "group relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-muted/35 p-5 text-foreground transition-colors",
        busy ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:border-primary/70 hover:bg-muted/55",
        isDragging && "border-primary bg-primary/10",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          commitFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p id={`${inputId}-description`} className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <span className="rounded-full border border-border/80 bg-secondary/80 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-secondary-foreground">
          {status === "uploading" ? "Uploading" : status === "analyzing" ? "Queued" : "Ready"}
        </span>
      </div>

      <div className="mt-5 border-t border-border/60 pt-5">
        {file ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-full border border-primary/80 bg-primary text-primary-foreground">
                <Upload className="size-4" />
              </span>
              <div>
                <p className="text-base font-medium text-foreground">{file.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              className={quietActionClassName}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                openPicker();
              }}
              disabled={busy}
            >
              Replace file
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-full border border-primary/80 bg-primary text-primary-foreground">
                <Upload className="size-4" />
              </span>
              <div>
                <p className="text-base font-medium text-foreground">Drop file here</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Or browse from your device.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              className={quietActionClassName}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                openPicker();
              }}
              disabled={busy}
            >
              Browse files
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
