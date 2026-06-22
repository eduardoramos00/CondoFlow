"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Plus, RefreshCw, Wrench } from "lucide-react";

import {
  getIncidents,
  type IncidentStatus,
  type IncidentWithDetails,
} from "@/app/actions/incidents";
import { Button } from "@/components/ui/button";
import { ReportIncidentDrawer } from "@/components/incidents/ReportIncidentDrawer";
import { useBuilding } from "@/contexts/BuildingContext";
import { IncidentCard } from "./IncidentCard";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMNS: { status: IncidentStatus; label: string; dot: string }[] = [
  { status: "REPORTED",            label: "Reportado",              dot: "bg-amber-400" },
  { status: "ASSESSED",            label: "Avaliado",               dot: "bg-sky-400" },
  { status: "SUPPLIER_DISPATCHED", label: "Fornecedor Despachado",  dot: "bg-violet-400" },
  { status: "IN_PROGRESS",         label: "Em Curso",               dot: "bg-indigo-400" },
  { status: "RESOLVED",            label: "Resolvido",              dot: "bg-emerald-400" },
  { status: "CLOSED",              label: "Encerrado",              dot: "bg-zinc-500" },
];

// ---------------------------------------------------------------------------
// KanbanBoard
// ---------------------------------------------------------------------------

export function KanbanBoard() {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [incidents, setIncidents] = useState<IncidentWithDetails[] | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchIncidents = useCallback(async () => {
    if (!selectedBuilding) return;
    setIsFetching(true);
    try {
      const data = await getIncidents(selectedBuilding.id);
      setIncidents(data);
    } finally {
      setIsFetching(false);
    }
  }, [selectedBuilding?.id]);

  useEffect(() => {
    if (!selectedBuilding) {
      setIncidents(undefined);
      return;
    }
    setIncidents(undefined);
    void fetchIncidents();
  }, [selectedBuilding?.id, fetchIncidents]);

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

  const byStatus = (status: IncidentStatus): IncidentWithDetails[] =>
    (incidents ?? []).filter((i) => i.status === status);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Incidentes</h1>
          <p className="mt-0.5 text-sm text-zinc-400">{selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchIncidents()}
            disabled={isFetching}
            className="text-zinc-400 hover:text-zinc-200"
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
            onClick={() => setDrawerOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nova Ocorrência
          </Button>
        </div>
      </div>

      {/* Board */}
      {incidents === undefined ? (
        // Skeleton
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className="flex min-w-[280px] animate-pulse flex-col rounded-xl border border-zinc-800 bg-zinc-900/50"
            >
              <div className="h-10 rounded-t-xl bg-zinc-800/50" />
              <div className="flex-1 space-y-3 p-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-20 rounded-lg bg-zinc-800/40" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : incidents.length === 0 ? (
        // Empty state
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
          <Wrench className="mb-4 h-10 w-10 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">
            Sem ocorrências registadas
          </p>
          <Button
            size="sm"
            className="mt-4 bg-indigo-600 text-white hover:bg-indigo-500"
            onClick={() => setDrawerOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Reportar primeira ocorrência
          </Button>
        </div>
      ) : (
        // Kanban columns
        <div className="flex gap-3 overflow-x-auto pb-6">
          {COLUMNS.map((col) => {
            const cards = byStatus(col.status);
            return (
              <div
                key={col.status}
                className="flex max-h-[calc(100vh-220px)] min-w-[280px] flex-col rounded-xl border border-zinc-800 bg-zinc-900/50"
              >
                {/* Column header */}
                <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      {col.label}
                    </span>
                  </div>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
                  {cards.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-xs text-zinc-600">Sem ocorrências</p>
                    </div>
                  ) : (
                    cards.map((incident) => (
                      <IncidentCard key={incident.id} incident={incident} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Report new incident drawer */}
      <ReportIncidentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        buildingId={selectedBuilding.id}
        onDone={() => void fetchIncidents()}
      />
    </div>
  );
}
