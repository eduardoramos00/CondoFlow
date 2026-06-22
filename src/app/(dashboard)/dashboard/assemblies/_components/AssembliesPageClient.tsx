"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarCheck,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";

import {
  getAssemblies,
  transitionAssemblyStatus,
  type Assembly,
  type AssemblyStatus,
} from "@/app/actions/assemblies";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { useBuilding } from "@/contexts/BuildingContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  "ORDINÁRIA": "Ordinária",
  "EXTRAORDINÁRIA": "Extraordinária",
};

function formatScheduledAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Quick-action transitions available from the list row (GESTOR only).
const QUICK_TRANSITIONS: Partial<Record<AssemblyStatus, { label: string; next: AssemblyStatus }>> =
  {
    DRAFT: { label: "Publicar", next: "PUBLISHED" },
    PUBLISHED: { label: "Iniciar", next: "IN_PROGRESS" },
    IN_PROGRESS: { label: "Concluir", next: "CONCLUDED" },
  };

// ---------------------------------------------------------------------------
// AssembliesPageClient
// ---------------------------------------------------------------------------

export function AssembliesPageClient() {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [assemblies, setAssemblies] = useState<Assembly[] | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isGestor = selectedBuilding?.userRole === "GESTOR";

  const fetchAssemblies = useCallback(async () => {
    if (!selectedBuilding) return;
    setIsFetching(true);
    try {
      const data = await getAssemblies(selectedBuilding.id);
      setAssemblies(data);
    } finally {
      setIsFetching(false);
    }
  }, [selectedBuilding?.id]);

  useEffect(() => {
    if (!selectedBuilding) {
      setAssemblies(undefined);
      return;
    }
    setAssemblies(undefined);
    void fetchAssemblies();
  }, [selectedBuilding?.id, fetchAssemblies]);

  async function handleTransition(
    assemblyId: string,
    targetStatus: AssemblyStatus,
  ) {
    if (!selectedBuilding) return;
    setTransitioning(assemblyId);
    setActionError(null);

    const result = await transitionAssemblyStatus(
      assemblyId,
      selectedBuilding.id,
      targetStatus,
    );

    setTransitioning(null);

    if ("error" in result) {
      setActionError(result.error);
    } else {
      void fetchAssemblies();
    }
  }

  // ── Loading / empty states ─────────────────────────────────────────────────

  if (buildingLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>A carregar edifícios…</span>
      </div>
    );
  }

  if (!selectedBuilding) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
        <Building2 className="mb-4 h-10 w-10 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-400">
          Selecione um edifício no menu lateral
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Assembleias</h1>
          <p className="mt-0.5 text-sm text-zinc-400">{selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchAssemblies()}
            disabled={isFetching}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {isGestor && (
            <Link href="/dashboard/assemblies/new">
              <Button
                size="sm"
                className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Nova Assembleia
              </Button>
            </Link>
          )}
        </div>
      </div>

      {actionError && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {actionError}
        </p>
      )}

      {/* List */}
      {assemblies === undefined ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-zinc-800"
            />
          ))}
        </div>
      ) : assemblies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
          <CalendarCheck className="mb-4 h-10 w-10 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">
            Sem assembleias registadas
          </p>
          {isGestor && (
            <Link href="/dashboard/assemblies/new">
              <Button
                size="sm"
                className="mt-4 bg-indigo-600 text-white hover:bg-indigo-500"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Criar primeira assembleia
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {assemblies.map((a) => {
            const quickAction = isGestor ? QUICK_TRANSITIONS[a.status] : undefined;
            const isTransitioning = transitioning === a.id;

            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 shadow-sm transition-colors hover:border-zinc-700"
              >
                {/* Left: info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      {TYPE_LABELS[a.type] ?? a.type}
                    </span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-200">
                    {formatScheduledAt(a.scheduled_at)}
                  </p>
                  {a.location && (
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {a.location}
                    </p>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2">
                  {quickAction && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isTransitioning}
                      onClick={() => void handleTransition(a.id, quickAction.next)}
                      className="border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 active:scale-95"
                    >
                      {isTransitioning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        quickAction.label
                      )}
                    </Button>
                  )}
                  <Link href={`/dashboard/assemblies/${a.id}`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-400 hover:text-zinc-200"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
