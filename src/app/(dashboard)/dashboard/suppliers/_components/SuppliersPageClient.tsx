"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  Building2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Truck,
  X,
} from "lucide-react";

import {
  createSupplier,
  deactivateSupplier,
  getSuppliers,
  reactivateSupplier,
  updateSupplier,
  type Supplier,
} from "@/app/actions/suppliers";
import { Button } from "@/components/ui/button";
import { useBuilding } from "@/contexts/BuildingContext";

// ---------------------------------------------------------------------------
// Zod schema (co-located with form)
// ---------------------------------------------------------------------------

const schema = z.object({
  name: z.string().min(1, "Nome obrigatório.").max(200),
  serviceType: z.string().min(1, "Tipo de serviço obrigatório.").max(100),
  nif: z.string().max(20).optional(),
  contactEmail: z
    .string()
    .email("Email inválido.")
    .max(200)
    .optional()
    .or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Shared input style tokens
// ---------------------------------------------------------------------------

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError = "border-red-500 focus:border-red-500 focus:ring-red-500";

// ---------------------------------------------------------------------------
// SupplierDrawer — slide-in panel for create / edit
// ---------------------------------------------------------------------------

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  buildingId: string;
  supplier: Supplier | null;
  onDone: () => void;
};

function SupplierDrawer({ open, onClose, buildingId, supplier, onDone }: DrawerProps) {
  const isEdit = supplier !== null;
  const [serverError, setServerError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      serviceType: "",
      nif: "",
      contactEmail: "",
    },
  });

  // Sync form values whenever the drawer opens with a different supplier.
  useEffect(() => {
    if (open) {
      reset({
        name: supplier?.name ?? "",
        serviceType: supplier?.service_type ?? "",
        nif: supplier?.nif ?? "",
        contactEmail: supplier?.contact_email ?? "",
      });
      setServerError(null);
      // Defer focus until after CSS transition completes.
      setTimeout(() => firstInputRef.current?.focus(), 310);
    }
  }, [open, supplier, reset]);

  // Close on Escape key.
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  const onSubmit = async (data: FormValues) => {
    setServerError(null);

    const result = isEdit
      ? await updateSupplier(
          supplier.id,
          buildingId,
          data.name,
          data.serviceType,
          data.nif || undefined,
          data.contactEmail || undefined,
        )
      : await createSupplier(
          buildingId,
          data.name,
          data.serviceType,
          data.nif || undefined,
          data.contactEmail || undefined,
        );

    if ("error" in result) {
      setServerError(result.error);
    } else {
      onDone();
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Editar fornecedor" : "Novo fornecedor"}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-100">
            {isEdit ? "Editar fornecedor" : "Novo fornecedor"}
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
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1 space-y-5 px-6 py-6">
            {/* Name */}
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Nome <span className="text-red-400">*</span>
              </label>
              <input
                id="name"
                type="text"
                placeholder="Ex: Reparações Silva Lda."
                aria-invalid={!!errors.name}
                className={`${inputBase} ${errors.name ? inputError : ""}`}
                {...register("name")}
                ref={(el) => {
                  register("name").ref(el);
                  (firstInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                }}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-400" role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Service type */}
            <div>
              <label htmlFor="serviceType" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Tipo de serviço <span className="text-red-400">*</span>
              </label>
              <input
                id="serviceType"
                type="text"
                placeholder="Ex: Manutenção elevadores"
                aria-invalid={!!errors.serviceType}
                className={`${inputBase} ${errors.serviceType ? inputError : ""}`}
                {...register("serviceType")}
              />
              {errors.serviceType && (
                <p className="mt-1 text-xs text-red-400" role="alert">
                  {errors.serviceType.message}
                </p>
              )}
            </div>

            {/* NIF */}
            <div>
              <label htmlFor="nif" className="mb-1.5 block text-sm font-medium text-zinc-300">
                NIF{" "}
                <span className="text-xs font-normal text-zinc-500">(opcional)</span>
              </label>
              <input
                id="nif"
                type="text"
                placeholder="Ex: 509 123 456"
                aria-invalid={!!errors.nif}
                className={`${inputBase} ${errors.nif ? inputError : ""}`}
                {...register("nif")}
              />
              {errors.nif && (
                <p className="mt-1 text-xs text-red-400" role="alert">
                  {errors.nif.message}
                </p>
              )}
            </div>

            {/* Contact email */}
            <div>
              <label htmlFor="contactEmail" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Email de contacto{" "}
                <span className="text-xs font-normal text-zinc-500">(opcional)</span>
              </label>
              <input
                id="contactEmail"
                type="email"
                placeholder="Ex: geral@exemplo.pt"
                aria-invalid={!!errors.contactEmail}
                className={`${inputBase} ${errors.contactEmail ? inputError : ""}`}
                {...register("contactEmail")}
              />
              {errors.contactEmail && (
                <p className="mt-1 text-xs text-red-400" role="alert">
                  {errors.contactEmail.message}
                </p>
              )}
            </div>

            {serverError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {serverError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-zinc-800 px-6 py-4">
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSubmitting ? "A guardar…" : isEdit ? "Guardar alterações" : "Criar fornecedor"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SupplierRow — single table row with inline actions
// ---------------------------------------------------------------------------

type RowProps = {
  supplier: Supplier;
  isGestor: boolean;
  buildingId: string;
  onEdit: (s: Supplier) => void;
  onRefresh: () => void;
};

function SupplierRow({ supplier, isGestor, buildingId, onEdit, onRefresh }: RowProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "error" | "ok"; message: string } | null>(null);

  const run = async (
    action: () => Promise<{ error: string } | { success: true }>,
    key: string,
  ) => {
    setFeedback(null);
    setLoading(key);
    const result = await action();
    setLoading(null);
    if ("error" in result) {
      setFeedback({ type: "error", message: result.error });
    } else {
      onRefresh();
    }
  };

  return (
    <tr className="transition-colors hover:bg-zinc-800/40">
      {/* Name + service type */}
      <td className="px-4 py-3">
        <p className="font-medium text-zinc-200">{supplier.name}</p>
        <p className="flex items-center gap-1 text-xs text-zinc-500">
          <Truck className="h-3 w-3 shrink-0" />
          {supplier.service_type}
        </p>
      </td>

      {/* NIF */}
      <td className="hidden px-4 py-3 text-sm text-zinc-400 sm:table-cell">
        {supplier.nif ?? <span className="text-zinc-600">—</span>}
      </td>

      {/* Email */}
      <td className="hidden px-4 py-3 md:table-cell">
        {supplier.contact_email ? (
          <a
            href={`mailto:${supplier.contact_email}`}
            className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            <Mail className="h-3 w-3 shrink-0" />
            {supplier.contact_email}
          </a>
        ) : (
          <span className="text-sm text-zinc-600">—</span>
        )}
      </td>

      {/* Active badge */}
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
            supplier.is_active
              ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
              : "bg-zinc-500/10 text-zinc-500 ring-zinc-500/20"
          }`}
        >
          {supplier.is_active ? "Ativo" : "Inativo"}
        </span>
      </td>

      {/* Actions */}
      {isGestor && (
        <td className="px-4 py-3 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(supplier)}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                aria-label={`Editar ${supplier.name}`}
              >
                <Pencil className="h-3 w-3" />
                Editar
              </button>

              {supplier.is_active ? (
                <button
                  type="button"
                  disabled={!!loading}
                  onClick={() =>
                    run(() => deactivateSupplier(supplier.id, buildingId), "toggle")
                  }
                  className="rounded px-2 py-1 text-xs text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-40"
                >
                  {loading === "toggle" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Desativar"
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!loading}
                  onClick={() =>
                    run(() => reactivateSupplier(supplier.id, buildingId), "toggle")
                  }
                  className="rounded px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  {loading === "toggle" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Reativar"
                  )}
                </button>
              )}
            </div>

            {feedback && (
              <p
                className={`text-xs ${feedback.type === "error" ? "text-red-400" : "text-emerald-400"}`}
                role="alert"
              >
                {feedback.type === "error" && (
                  <AlertTriangle className="mr-0.5 inline h-3 w-3" />
                )}
                {feedback.message}
              </p>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// SuppliersPageClient — main export
// ---------------------------------------------------------------------------

export function SuppliersPageClient() {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [suppliers, setSuppliers] = useState<Supplier[] | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Filter
  const [showInactive, setShowInactive] = useState(false);

  const isGestor = selectedBuilding?.userRole === "GESTOR";

  const fetchSuppliers = useCallback(async () => {
    if (!selectedBuilding) return;
    setIsFetching(true);
    try {
      const data = await getSuppliers(selectedBuilding.id);
      setSuppliers(data);
    } finally {
      setIsFetching(false);
    }
  }, [selectedBuilding?.id]);

  useEffect(() => {
    if (!selectedBuilding) {
      setSuppliers(undefined);
      return;
    }
    setSuppliers(undefined);
    void fetchSuppliers();
  }, [selectedBuilding?.id, fetchSuppliers]);

  const openCreate = () => {
    setEditingSupplier(null);
    setDrawerOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);

  const displayed = (suppliers ?? []).filter((s) => showInactive || s.is_active);
  const activeCount = (suppliers ?? []).filter((s) => s.is_active).length;
  const inactiveCount = (suppliers ?? []).filter((s) => !s.is_active).length;

  // ── Loading / empty states ────────────────────────────────────────────────

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
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Fornecedores</h1>
            <p className="mt-0.5 text-sm text-zinc-400">{selectedBuilding.name}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => void fetchSuppliers()}
              disabled={isFetching}
              aria-label="Atualizar"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            {isGestor && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo fornecedor
              </button>
            )}
          </div>
        </div>

        {/* Stats strip */}
        {suppliers !== undefined && (
          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Total</p>
              <p className="mt-0.5 text-xl font-semibold text-zinc-100">{suppliers.length}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Ativos</p>
              <p className="mt-0.5 text-xl font-semibold text-emerald-400">{activeCount}</p>
            </div>
            {inactiveCount > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Inativos</p>
                <p className="mt-0.5 text-xl font-semibold text-zinc-500">{inactiveCount}</p>
              </div>
            )}
          </div>
        )}

        {/* Filter toggle */}
        {inactiveCount > 0 && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500"
            />
            Mostrar fornecedores inativos
          </label>
        )}

        {/* Table */}
        {isFetching || suppliers === undefined ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-zinc-800"
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900">
            {displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <Truck className="mb-4 h-10 w-10 text-zinc-600" />
                <p className="text-sm font-medium text-zinc-400">
                  {(suppliers ?? []).length === 0
                    ? "Sem fornecedores registados."
                    : "Todos os fornecedores estão inativos."}
                </p>
                {isGestor && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                  >
                    Adicionar o primeiro fornecedor
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Fornecedor
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 sm:table-cell">
                        NIF
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 md:table-cell">
                        Email
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Estado
                      </th>
                      {isGestor && (
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Ações
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {displayed.map((supplier) => (
                      <SupplierRow
                        key={supplier.id}
                        supplier={supplier}
                        isGestor={isGestor}
                        buildingId={selectedBuilding.id}
                        onEdit={openEdit}
                        onRefresh={() => void fetchSuppliers()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawer — always mounted, toggled via CSS */}
      {isGestor && (
        <SupplierDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          buildingId={selectedBuilding.id}
          supplier={editingSupplier}
          onDone={() => void fetchSuppliers()}
        />
      )}
    </>
  );
}
