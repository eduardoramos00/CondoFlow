"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import {
  transitionIncident,
  type IncidentStatus,
} from "@/app/actions/incidents";
import { Button } from "@/components/ui/button";

// Transitions handled by the generic transitionIncident server action.
// assessIncident (REPORTED→ASSESSED) and dispatchSupplier (ASSESSED→SUPPLIER_DISPATCHED)
// have dedicated forms in the detail page and are excluded here.
const TRANSITIONS: Partial<
  Record<IncidentStatus, { label: string; next: IncidentStatus; danger?: boolean }[]>
> = {
  REPORTED:            [{ label: "Encerrar", next: "CLOSED", danger: true }],
  ASSESSED:            [
    { label: "Marcar Em Curso",   next: "IN_PROGRESS" },
    { label: "Encerrar",          next: "CLOSED", danger: true },
  ],
  SUPPLIER_DISPATCHED: [
    { label: "Marcar Em Curso",   next: "IN_PROGRESS" },
    { label: "Encerrar",          next: "CLOSED", danger: true },
  ],
  IN_PROGRESS:         [
    { label: "Marcar Resolvido",  next: "RESOLVED" },
    { label: "Encerrar",          next: "CLOSED", danger: true },
  ],
  RESOLVED:            [{ label: "Encerrar", next: "CLOSED", danger: true }],
};

type TransitionButtonProps = {
  incidentId: string;
  currentStatus: IncidentStatus;
  isGestor: boolean;
  comment?: string;
  onSuccess?: () => void;
};

export function TransitionButton({
  incidentId,
  currentStatus,
  isGestor,
  comment,
  onSuccess,
}: TransitionButtonProps) {
  const [loading, setLoading] = useState<IncidentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isGestor) return null;

  const options = TRANSITIONS[currentStatus];
  if (!options || options.length === 0) return null;

  async function handleTransition(next: IncidentStatus) {
    setLoading(next);
    setError(null);
    const result = await transitionIncident(incidentId, next, comment);
    setLoading(null);
    if ("error" in result) {
      setError(result.error);
    } else {
      onSuccess?.();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Button
            key={opt.next}
            size="sm"
            variant="outline"
            disabled={loading !== null}
            onClick={() => void handleTransition(opt.next)}
            className={
              opt.danger
                ? "border-red-700 text-red-400 hover:border-red-500 hover:text-red-300 active:scale-95"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 active:scale-95"
            }
          >
            {loading === opt.next ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              opt.label
            )}
          </Button>
        ))}
      </div>
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
