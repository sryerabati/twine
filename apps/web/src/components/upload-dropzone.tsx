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
  onFileChange: (file: File) => void;
  className?: string;
};

export function UploadDropzone({
  label,
  description,
  file,
  status = "idle",
  disabled = false,
  accept = "video/mp4,video/*",
  onFileChange,
  className,
}: UploadDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const busy = disabled || status !== "idle";

  function openPicker() {
    if (busy) {
      return;
    }
    inputRef.current?.click();
  }

  function commitFile(nextFile: File | null | undefined) {
    if (!nextFile || busy) {
      return;
    }
    onFileChange(nextFile);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    commitFile(event.dataTransfer.files[0]);
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
        "group relative overflow-hidden rounded-[1.9rem] border border-white/10 bg-white/[0.04] p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.28)] transition",
        busy ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:border-pink-300/40 hover:bg-white/[0.06]",
        isDragging && "border-pink-300 bg-pink-500/10",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          commitFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p id={`${inputId}-description`} className="mt-1 text-sm leading-6 text-slate-300">
            {description}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-slate-200">
          {status === "uploading" ? "Uploading" : status === "analyzing" ? "Queued" : "Ready"}
        </span>
      </div>

      <div className="mt-5 rounded-[1.6rem] border border-dashed border-white/10 bg-black/20 p-5">
        {file ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-medium text-white">{file.name}</p>
              <p className="mt-1 text-sm text-slate-300">{formatBytes(file.size)}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
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
              <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-2xl bg-pink-500/15 text-pink-200">
                <Upload className="size-4" />
              </span>
              <div>
                <p className="text-base font-medium text-white">
                  Drop file here
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Or browse from your device.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
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
