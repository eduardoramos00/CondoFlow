"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Loader2,
  MapPin,
  PercentSquare,
  AlertTriangle,
} from "lucide-react";

import {
  getAgendaItems,
  getAssembly,
  transitionAssemblyStatus,
  type AgendaItem,
  type Assembly,
  type AssemblyStatus,
} from "@/app/actions/assemblies";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { useBuilding } from "@/contexts/BuildingContext";
import { AgendaTab } from "./AgendaTab";
import { VotacaoTab } from "./VotacaoTab";
import { AtaTab } from "./AtaTab";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  "ORDINÁRIA": "Assembleia Ordinária",
  "EXTRAORDINÁRIA": "Assembleia Extraordinária",
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Transitions available from the detail page header (GESTOR only).
type TransitionOption = { label: string; next: AssemblyStatus; variant: "default" | "danger" };
const TRANSITIONS: Partial<Record<AssemblyStatus, TransitionOption[]>> = {
  DRAFT: [
    { label: "Publicar", next: "PUBLISHED", variant: "default" },
    { label: "Arquivar", next: "ARCHIVED", variant: "danger" },
  ],
  PUBLISHED: [
    { label: "Iniciar assembleia", next: "IN_PROGRESS", variant: "default" },
    { label: "Arquivar", next: "ARCHIVED", variant: "danger" },
  ],
  IN_PROGRESS: [
    { label: "Concluir assembleia", next: "CONCLUDED", variant: "default" },
  ],
  CONCLUDED: [
    { label: "Arquivar", next: "ARCHIVED", variant: "danger" },
  ],
};

type Tab = "agenda" | "votacao" | "ata";

// ---------------------------------------------------------------------------
// AssemblyDetailClient
// ---------------------------------------------------------------------------

export function AssemblyDetailClient({ assemblyId }: { assemblyId: string }) {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [assembly, setAssembly] = useState<Assembly | null | undefined>(undefined);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("agenda");
  const [transitioning, setTransitioning] = useState<AssemblyStatus | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const buildingId = selectedBuilding?.id ?? "";
  const isGestor = selectedBuilding?.userRole === "GESTOR";

  const loadAssembly = useCallback(async () => {
    if (!buildingId) return;
    const data = await getAssembly(assemblyId, buildingId);
    setAssembly(data);
  }, [assemblyId, buildingId]);

  const loadItems = useCallback(async () => {
    const data = await getAgendaItems(assemblyId);
    setAgendaItems(data);
  }, [assemblyId]);

  useEffect(() => {
    if (!buildingId) return;
    setAssembly(undefined);
    void loadAssembly();
    void loadItems();
  }, [assemblyId, buildingId, loadAssembly, loadItems]);

  async function handleTransition(targetStatus: AssemblyStatus) {
    if (!buildingId) return;
    setTransitioning(targetStatus);
    setTransitionError(null);
    const result = await transitionAssemblyStatus(assemblyId, buildingId, targetStatus);
    setTransitioning(null);
    if ("error" in result) { setTransitionError(result.error); return; }
    void loadAssembly();
  }

  function onRefresh() {
    void loadAssembly();
    void loadItems();
  }

  // ── States ─────────────────────────────────────────────────────────────────

  if (buildingLoading || assembly === undefined) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar assembleia…
      </div>
    );
  }

  if (!selectedBuilding) {
    return (
      <p className="text-sm text-zinc-400">
        Selecione um edifício no menu lateral.
      </p>
    );
  }

  if (assembly === null) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
        <AlertTriangle className="mb-3 h-8 w-8 text-zinc-600" />
        <p className="text-sm text-zinc-400">Assembleia não encontrada</p>
      </div>
    );
  }

  const transitions = isGestor ? (TRANSITIONS[assembly.status] ?? []) : [];

  // Condómino tab visibility rules:
  // - Votação: only if IN_PROGRESS, CONCLUDED, or ARCHIVED
  // - Ata: only if CONCLUDED or ARCHIVED
  const showVotacaoTab =
    isGestor ||
    ["IN_PROGRESS", "CONCLUDED", "ARCHIVED"].includes(assembly.status);
  const showAtaTab =
    isGestor || ["CONCLUDED", "ARCHIVED"].includes(assembly.status);

  const TABS: { id: Tab; label: string; visible: boolean }[] = [
    { id: "agenda", label: "Ordem do Dia", visible: true },
    { id: "votacao", label: "Votação", visible: showVotacaoTab },
    { id: "ata", label: "Ata", visible: showAtaTab },
  ];

  return (
    <div className="space-y-6">
      {/* Assembly header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-zinc-100">
                {TYPE_LABELS[assembly.type] ?? assembly.type}
              </h1>
              <StatusBadge status={assembly.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDateTime(assembly.scheduled_at)}
              </span>
              {assembly.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {assembly.location}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <PercentSquare className="h-3.5 w-3.5" />
                Quórum: {assembly.quorum_required}%
              </span>
            </div>
          </div>

          {/* Transition actions */}
          {transitions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {transitions.map((t) => (
                <Button
                  key={t.next}
                  size="sm"
                  disabled={transitioning !== null}
                  onClick={() => void handleTransition(t.next)}
                  className={
                    t.variant === "danger"
                      ? "border border-red-800 bg-transparent text-red-400 hover:bg-red-900/30 active:scale-95"
                      : "bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
                  }
                >
                  {transitioning === t.next ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {t.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {transitionError && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {transitionError}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div>
        {/* Tab bar */}
        <div className="flex border-b border-zinc-800">
          {TABS.filter((t) => t.visible).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "text-indigo-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
              {activeTab === t.id && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-indigo-500" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-6">
          {activeTab === "agenda" && (
            <AgendaTab
              assembly={assembly}
              items={agendaItems}
              isGestor={isGestor}
              buildingId={buildingId}
              onRefresh={onRefresh}
            />
          )}
          {activeTab === "votacao" && showVotacaoTab && (
            <VotacaoTab
              assembly={assembly}
              items={agendaItems}
              isGestor={isGestor}
            />
          )}
          {activeTab === "ata" && showAtaTab && (
            <AtaTab
              assembly={assembly}
              isGestor={isGestor}
              buildingId={buildingId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
