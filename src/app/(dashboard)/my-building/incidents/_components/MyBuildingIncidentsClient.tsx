"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Wrench,
} from "lucide-react";

import {
  getIncidents,
  type IncidentWithDetails,
} from "@/app/actions/incidents";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { ReportIncidentDrawer } from "@/components/incidents/ReportIncidentDrawer";
import { useBuilding } from "@/contexts/BuildingContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `há ${days}d`;
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// MyBuildingIncidentsClient
// ---------------------------------------------------------------------------

export function MyBuildingIncidentsClient() {
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

  // ── Guard states ──────────────────────────────────────────────────────────

  if (buildingLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>A carregar…</span>
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
          <h1 className="text-2xl font-semibold text-zinc-100">Ocorrências</h1>
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
            Reportar Ocorrência
          </Button>
        </div>
      </div>

      {/* List */}
      {incidents === undefined ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-800" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
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
        <div className="space-y-3">
          {incidents.map((incident) => (
            <div
              key={incident.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 shadow-sm transition-colors hover:border-zinc-700"
            >
              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={incident.status} />
                  {incident.priority && (
                    <StatusBadge status={incident.priority} />
                  )}
                  {incident.unit_identifier && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {incident.unit_identifier}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-medium text-zinc-200">
                  {incident.title}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatRelative(incident.created_at)}
                </p>
              </div>

              {/* Arrow */}
              <Link href={`/dashboard/incidents/${incident.id}`}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Report drawer */}
      <ReportIncidentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        buildingId={selectedBuilding.id}
        onDone={() => void fetchIncidents()}
      />
    </div>
  );
}
