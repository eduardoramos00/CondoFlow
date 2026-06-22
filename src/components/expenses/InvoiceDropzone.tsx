"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Loader2, Paperclip, Upload, X } from "lucide-react";

import { uploadInvoice } from "@/app/actions/documents";

const ACCEPTED_MIME: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

type Props = {
  buildingId: string;
  onUploaded: (documentId: string) => void;
  onCleared: () => void;
};

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "done"; documentId: string; file: File; previewUrl: string | null }
  | { phase: "error"; message: string };

export function InvoiceDropzone({ buildingId, onUploaded, onCleared }: Props) {
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  // Revoke object URLs on cleanup to prevent memory leaks.
  useEffect(() => {
    return () => {
      if (state.phase === "done" && state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }
    };
  }, [state]);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;

      setState({ phase: "uploading" });

      const fd = new FormData();
      fd.append("file", file);

      const result = await uploadInvoice(buildingId, fd);

      if ("error" in result) {
        setState({ phase: "error", message: result.error });
        return;
      }

      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;

      setState({ phase: "done", documentId: result.documentId, file, previewUrl });
      onUploaded(result.documentId);
    },
    [buildingId, onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_MIME,
      maxSize: MAX_SIZE_BYTES,
      multiple: false,
      disabled: state.phase === "uploading" || state.phase === "done",
    });

  const rejectionMessage =
    fileRejections[0]?.errors[0]?.code === "file-too-large"
      ? "Ficheiro demasiado grande (máx. 10 MB)."
      : fileRejections[0]?.errors[0]?.code === "file-invalid-type"
        ? "Tipo não permitido. Use PDF, JPEG, PNG ou WebP."
        : null;

  const handleClear = () => {
    if (state.phase === "done" && state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
    }
    setState({ phase: "idle" });
    onCleared();
  };

  // ── Uploaded preview ──────────────────────────────────────────────────────
  if (state.phase === "done") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
        {state.previewUrl ? (
          // Image thumbnail
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.previewUrl}
            alt={state.file.name}
            className="h-12 w-12 rounded object-cover"
          />
        ) : (
          // PDF chip
          <div className="flex h-12 w-12 items-center justify-center rounded bg-zinc-700">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-200">
            {state.file.name}
          </p>
          <p className="text-xs text-emerald-400">
            <Paperclip className="mr-1 inline h-3 w-3" />
            Documento anexado
          </p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
          aria-label="Remover documento"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Uploading spinner ─────────────────────────────────────────────────────
  if (state.phase === "uploading") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 py-6 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>A fazer upload…</span>
      </div>
    );
  }

  // ── Dropzone ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-1.5">
      <div
        {...getRootProps()}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          isDragActive
            ? "border-indigo-500 bg-indigo-500/5"
            : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600 hover:bg-zinc-800/50",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <Upload
          className={`h-8 w-8 ${isDragActive ? "text-indigo-400" : "text-zinc-500"}`}
        />
        <div>
          <p className="text-sm font-medium text-zinc-300">
            {isDragActive ? "Largue o ficheiro aqui" : "Arraste ou clique para anexar"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            PDF, JPEG, PNG, WebP · máx. 10 MB
          </p>
        </div>
      </div>

      {(state.phase === "error" || rejectionMessage) && (
        <p className="text-xs text-red-400" role="alert">
          {state.phase === "error" ? state.message : rejectionMessage}
        </p>
      )}
    </div>
  );
}
