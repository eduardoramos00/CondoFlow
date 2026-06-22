"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

import { reportIncident } from "@/app/actions/incidents";
import { Button } from "@/components/ui/button";

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

type ReportIncidentDrawerProps = {
  open: boolean;
  onClose: () => void;
  buildingId: string;
  onDone: () => void;
};

export function ReportIncidentDrawer({
  open,
  onClose,
  buildingId,
  onDone,
}: ReportIncidentDrawerProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setServerError(null);
      setTitleError(null);
      setTimeout(() => firstInputRef.current?.focus(), 310);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTitleError(null);
    setServerError(null);

    if (!title.trim()) {
      setTitleError("Título obrigatório.");
      return;
    }

    setIsSubmitting(true);
    const result = await reportIncident(
      buildingId,
      null,
      title.trim(),
      description.trim() || undefined,
    );
    setIsSubmitting(false);

    if ("error" in result) {
      setServerError(result.error);
    } else {
      onDone();
      onClose();
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reportar nova ocorrência"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-100">
            Reportar Nova Ocorrência
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1 space-y-5 px-6 py-6">
            {/* Title */}
            <div>
              <label
                htmlFor="incident-title"
                className="mb-1.5 block text-sm font-medium text-zinc-300"
              >
                Título <span className="text-red-400">*</span>
              </label>
              <input
                id="incident-title"
                type="text"
                placeholder="Ex: Infiltração no teto do corredor"
                maxLength={300}
                aria-invalid={!!titleError}
                className={`${inputBase} ${titleError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                ref={firstInputRef}
              />
              {titleError && (
                <p className="mt-1 text-xs text-red-400" role="alert">
                  {titleError}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="incident-description"
                className="mb-1.5 block text-sm font-medium text-zinc-300"
              >
                Descrição{" "}
                <span className="text-xs font-normal text-zinc-500">(opcional)</span>
              </label>
              <textarea
                id="incident-description"
                rows={5}
                placeholder="Descreva a ocorrência em detalhe…"
                maxLength={5000}
                className={`${inputBase} resize-none`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {serverError && (
              <p
                className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400"
                role="alert"
              >
                {serverError}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
            >
              {isSubmitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Reportar
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
