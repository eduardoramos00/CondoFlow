"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Home,
  Loader2,
  Paperclip,
  Truck,
  Upload,
} from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import {
  assessIncident,
  dispatchSupplier,
  getIncident,
  getIncidentAttachments,
  getIncidentHistory,
  getSupplierDispatches,
  uploadIncidentAttachment,
  type IncidentAttachment,
  type IncidentHistoryRow,
  type IncidentPriority,
  type IncidentWithDetails,
  type SupplierDispatch,
} from "@/app/actions/incidents";
import { getSuppliers, type Supplier } from "@/app/actions/suppliers";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { TransitionButton } from "@/components/incidents/TransitionButton";
import { useBuilding } from "@/contexts/BuildingContext";
import { decimalToCents, formatCurrency } from "@/lib/utils/currency";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_VALUES: IncidentPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const PRIORITY_LABELS: Record<IncidentPriority, string> = {
  LOW:      "Baixa",
  MEDIUM:   "Média",
  HIGH:     "Alta",
  CRITICAL: "Crítico",
};

const STATUS_ICON_MAP: Record<string, React.ReactNode> = {
  REPORTED:            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
  ASSESSED:            <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />,
  SUPPLIER_DISPATCHED: <Truck className="h-3.5 w-3.5 text-violet-400" />,
  IN_PROGRESS:         <Clock className="h-3.5 w-3.5 text-indigo-400" />,
  RESOLVED:            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  CLOSED:              <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />,
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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

// ---------------------------------------------------------------------------
// IncidentDetailClient
// ---------------------------------------------------------------------------

export function IncidentDetailClient({ incidentId }: { incidentId: string }) {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [incident, setIncident] = useState<IncidentWithDetails | null | undefined>(undefined);
  const [history, setHistory] = useState<IncidentHistoryRow[]>([]);
  const [attachments, setAttachments] = useState<IncidentAttachment[]>([]);
  const [dispatches, setDispatches] = useState<SupplierDispatch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Attachment upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Assess form (REPORTED → ASSESSED)
  const [assessPriority, setAssessPriority] = useState<IncidentPriority | "">("");
  const [assessLoading, setAssessLoading] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);

  // Dispatch form (ASSESSED → SUPPLIER_DISPATCHED)
  const [dispatchSupplierId, setDispatchSupplierId] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [dispatchCost, setDispatchCost] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const isGestor = selectedBuilding?.userRole === "GESTOR";
  const buildingId = selectedBuilding?.id ?? "";

  const fetchAll = useCallback(async () => {
    if (!buildingId) return;
    setIsFetching(true);
    try {
      const [inc, hist, attach, disps] = await Promise.all([
        getIncident(incidentId, buildingId),
        getIncidentHistory(incidentId),
        getIncidentAttachments(incidentId),
        getSupplierDispatches(incidentId),
      ]);
      setIncident(inc);
      setHistory(hist);
      setAttachments(attach);
      setDispatches(disps);

      // Fetch suppliers only for GESTOR when needed
      if (isGestor && inc?.status === "ASSESSED") {
        const sups = await getSuppliers(buildingId);
        setSuppliers(sups.filter((s) => s.is_active));
      }
    } finally {
      setIsFetching(false);
    }
  }, [incidentId, buildingId, isGestor]);

  useEffect(() => {
    if (!buildingId) {
      setIncident(undefined);
      return;
    }
    setIncident(undefined);
    void fetchAll();
  }, [buildingId, fetchAll]);

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

  if (incident === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-zinc-800" />
        <div className="h-4 w-1/3 animate-pulse rounded-lg bg-zinc-800" />
        <div className="h-32 animate-pulse rounded-xl bg-zinc-800" />
        <div className="h-64 animate-pulse rounded-xl bg-zinc-800" />
      </div>
    );
  }

  if (incident === null) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
        <AlertTriangle className="mb-4 h-10 w-10 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-400">Ocorrência não encontrada</p>
      </div>
    );
  }

  // ── Action handlers ────────────────────────────────────────────────────────

  async function handleAssess() {
    if (!assessPriority) {
      setAssessError("Selecione uma prioridade.");
      return;
    }
    setAssessLoading(true);
    setAssessError(null);
    const result = await assessIncident(incidentId, assessPriority as IncidentPriority);
    setAssessLoading(false);
    if ("error" in result) {
      setAssessError(result.error);
    } else {
      void fetchAll();
    }
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (!dispatchSupplierId || !dispatchDate) {
      setDispatchError("Fornecedor e data são obrigatórios.");
      return;
    }
    setDispatchLoading(true);
    setDispatchError(null);
    const cost = dispatchCost ? decimalToCents(Number(dispatchCost)) : undefined;
    const result = await dispatchSupplier(
      incidentId,
      dispatchSupplierId,
      dispatchDate,
      cost,
      dispatchNotes || undefined,
    );
    setDispatchLoading(false);
    if ("error" in result) {
      setDispatchError(result.error);
    } else {
      setDispatchSupplierId("");
      setDispatchDate("");
      setDispatchCost("");
      setDispatchNotes("");
      void fetchAll();
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadIncidentAttachment(incidentId, fd);
    setUploading(false);
    if (e.target) e.target.value = "";
    if ("error" in result) {
      setUploadError(result.error);
    } else {
      void fetchAll();
    }
  }

  // Image-only slides for the lightbox
  const imageAttachments = attachments.filter(
    (a) => a.mime_type.startsWith("image/") && a.signed_url,
  );
  const lightboxSlides = imageAttachments.map((a) => ({ src: a.signed_url! }));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold leading-snug text-zinc-100">
            {incident.title}
          </h1>
          {isFetching && (
            <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-zinc-500" />
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={incident.status} />
          {incident.priority && <StatusBadge status={incident.priority} />}
          {incident.unit_identifier && (
            <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400 ring-1 ring-zinc-700">
              <Home className="h-3 w-3" />
              {incident.unit_identifier}
            </span>
          )}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
          <CalendarDays className="h-3.5 w-3.5" />
          Reportado em {formatDateTime(incident.created_at)}
        </p>
      </div>

      {/* Description */}
      {incident.description && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Descrição
          </h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-300">
            {incident.description}
          </p>
        </div>
      )}

      {/* GESTOR: Assess form */}
      {isGestor && incident.status === "REPORTED" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-amber-400">
            Avaliar Ocorrência
          </h2>
          <p className="mb-4 text-xs text-zinc-400">
            Atribua uma prioridade para avançar o estado para{" "}
            <span className="font-medium text-zinc-300">Avaliado</span>.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[160px]">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Prioridade <span className="text-red-400">*</span>
              </label>
              <select
                value={assessPriority}
                onChange={(e) => setAssessPriority(e.target.value as IncidentPriority | "")}
                className={`${inputBase} cursor-pointer`}
              >
                <option value="">Selecionar…</option>
                {PRIORITY_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              disabled={assessLoading || !assessPriority}
              onClick={() => void handleAssess()}
              size="sm"
              className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
            >
              {assessLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Avaliar
            </Button>
          </div>
          {assessError && (
            <p className="mt-2 text-xs text-red-400" role="alert">
              {assessError}
            </p>
          )}
        </div>
      )}

      {/* GESTOR: Dispatch supplier form */}
      {isGestor && incident.status === "ASSESSED" && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-violet-400">
            Despachar Fornecedor
          </h2>
          <form onSubmit={(e) => void handleDispatch(e)} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Supplier select */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Fornecedor <span className="text-red-400">*</span>
                </label>
                <select
                  value={dispatchSupplierId}
                  onChange={(e) => setDispatchSupplierId(e.target.value)}
                  className={`${inputBase} cursor-pointer`}
                >
                  <option value="">Selecionar fornecedor…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.service_type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scheduled date */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Data agendada <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className={`${inputBase} cursor-pointer`}
                />
              </div>

              {/* Quoted cost */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Orçamento estimado (€){" "}
                  <span className="text-xs font-normal text-zinc-500">(opcional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={dispatchCost}
                  onChange={(e) => setDispatchCost(e.target.value)}
                  className={inputBase}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Notas{" "}
                <span className="text-xs font-normal text-zinc-500">(opcional)</span>
              </label>
              <textarea
                rows={3}
                placeholder="Instruções ou observações para o fornecedor…"
                maxLength={2000}
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                className={`${inputBase} resize-none`}
              />
            </div>

            {dispatchError && (
              <p className="text-xs text-red-400" role="alert">
                {dispatchError}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={dispatchLoading}
                size="sm"
                className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
              >
                {dispatchLoading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Truck className="mr-1.5 h-3.5 w-3.5" />
                )}
                Despachar
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* GESTOR: Transition buttons */}
      {isGestor && incident.status !== "CLOSED" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Ações de Estado
          </h2>
          <TransitionButton
            incidentId={incidentId}
            currentStatus={incident.status}
            isGestor={isGestor}
            onSuccess={() => void fetchAll()}
          />
        </div>
      )}

      {/* Supplier dispatches */}
      {dispatches.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Fornecedores Despachados
          </h2>
          <div className="space-y-3">
            {dispatches.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-800 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{d.supplier_name}</p>
                  <p className="text-xs text-zinc-500">{d.supplier_service_type}</p>
                  {d.notes && (
                    <p className="mt-1 text-xs text-zinc-400">{d.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm text-zinc-300">{formatDate(d.scheduled_date)}</p>
                  {d.quoted_cost_cents !== null && (
                    <p className="text-xs text-zinc-400">
                      {formatCurrency(d.quoted_cost_cents)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Anexos{" "}
            <span className="ml-1 text-zinc-500">({attachments.length}/5)</span>
          </h2>
          {incident.status !== "CLOSED" && attachments.length < 5 && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => void handleFileChange(e)}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="text-zinc-400 hover:text-zinc-200"
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                Adicionar
              </Button>
            </div>
          )}
        </div>

        {uploadError && (
          <p className="mb-3 text-xs text-red-400" role="alert">
            {uploadError}
          </p>
        )}

        {attachments.length === 0 ? (
          <p className="text-sm text-zinc-600">Sem anexos.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {attachments.map((a, idx) => {
              const isImage = a.mime_type.startsWith("image/");
              const imgIdx = imageAttachments.findIndex((img) => img.id === a.id);

              return (
                <div key={a.id} className="group relative">
                  {isImage && a.signed_url ? (
                    <button
                      type="button"
                      onClick={() => {
                        setLightboxIndex(imgIdx >= 0 ? imgIdx : 0);
                        setLightboxOpen(true);
                      }}
                      className="block w-full overflow-hidden rounded-lg border border-zinc-800 transition-colors hover:border-zinc-600"
                      aria-label="Ver imagem"
                    >
                      <div className="relative aspect-square w-full">
                        <Image
                          src={a.signed_url}
                          alt={`Anexo ${idx + 1}`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 33vw, 25vw"
                        />
                      </div>
                    </button>
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/50">
                      <Paperclip className="h-6 w-6 text-zinc-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History timeline */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Histórico
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-600">Sem histórico.</p>
        ) : (
          <ol className="relative border-l border-zinc-800 pl-5">
            {history.map((entry, i) => (
              <li
                key={entry.id}
                className={`relative pb-5 ${i === history.length - 1 ? "" : ""}`}
              >
                {/* Dot */}
                <span className="absolute -left-[1.1rem] flex h-5 w-5 items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-zinc-600 ring-2 ring-zinc-900" />
                </span>

                <div className="ml-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {STATUS_ICON_MAP[entry.to_status] ?? null}
                    <span className="text-xs font-medium text-zinc-200">
                      {entry.from_status
                        ? `${entry.from_status} → ${entry.to_status}`
                        : `Criado como ${entry.to_status}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatDateTime(entry.transitioned_at)}
                  </p>
                  {entry.comment && (
                    <p className="mt-1 text-xs text-zinc-400 italic">
                      &ldquo;{entry.comment}&rdquo;
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Lightbox */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={lightboxSlides}
        index={lightboxIndex}
      />
    </div>
  );
}
