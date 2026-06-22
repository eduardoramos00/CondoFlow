import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Status → style map
// Every platform entity status is mapped here. This is the ONLY place that
// maps status strings to colors — all other components import from here.
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  // ---- Generic / shared lifecycle ----
  DRAFT: "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  REJECTED: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",

  // ---- Quota lifecycle ----
  PENDING: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  PAID: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  OVERDUE: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  WAIVED: "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20",

  // ---- Expense lifecycle ----
  AWAITING_APPROVAL: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  RECONCILED: "bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20",

  // ---- Assembly lifecycle ----
  SCHEDULED: "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20",
  PUBLISHED: "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20",
  IN_PROGRESS: "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20",
  CONCLUDED: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  ARCHIVED: "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20",

  // ---- Incident status lifecycle ----
  REPORTED:            "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  ASSESSED:            "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20",
  SUPPLIER_DISPATCHED: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  // IN_PROGRESS reuses the assembly definition above
  RESOLVED: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  CLOSED: "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20",

  // ---- Incident priority ----
  LOW:      "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20",
  MEDIUM:   "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  HIGH:     "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20",
  CRITICAL: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",

  // ---- Roles ----
  GESTOR: "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20",
  "CONDÓMINO": "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20",
  SUPERADMIN: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
};

// Portuguese labels for all statuses
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  CANCELLED: "Cancelado",
  REJECTED: "Rejeitado",
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Em Atraso",
  WAIVED: "Isento",
  AWAITING_APPROVAL: "Aguarda Aprovação",
  PENDING_APPROVAL: "Aguarda Aprovação",
  APPROVED: "Aprovado",
  RECONCILED: "Reconciliado",
  SCHEDULED: "Agendada",
  PUBLISHED: "Publicada",
  IN_PROGRESS: "Em Curso",
  CONCLUDED: "Concluída",
  ARCHIVED: "Arquivada",
  // ---- Incident status labels ----
  REPORTED:            "Reportado",
  ASSESSED:            "Avaliado",
  SUPPLIER_DISPATCHED: "Fornecedor Despachado",
  RESOLVED:            "Resolvido",
  CLOSED:              "Encerrado",

  // ---- Incident priority labels ----
  LOW:      "Baixa",
  MEDIUM:   "Média",
  HIGH:     "Alta",
  CRITICAL: "Crítico",

  OPEN: "Aberto",
  AWAITING_PARTS: "Aguarda Material",
  GESTOR: "Gestor",
  "CONDÓMINO": "Condómino",
  SUPERADMIN: "Super Admin",
};

const FALLBACK_STYLE = "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20";

type StatusBadgeProps = {
  status: string;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? FALLBACK_STYLE;
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}
