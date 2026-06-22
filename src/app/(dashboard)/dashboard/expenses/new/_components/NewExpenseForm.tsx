"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ChevronDown, Loader2 } from "lucide-react";

import {
  createExpense,
  getActiveSuppliers,
  type ActiveSupplier,
} from "@/app/actions/expenses";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/lib/expenses/categories";
import { InvoiceDropzone } from "@/components/expenses/InvoiceDropzone";
import { Button } from "@/components/ui/button";
import { useBuilding } from "@/contexts/BuildingContext";
import { decimalToCents } from "@/lib/utils/currency";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  supplierId: z.string().uuid({ message: "Selecione um fornecedor." }),
  category: z.enum(
    EXPENSE_CATEGORIES as [ExpenseCategory, ...ExpenseCategory[]],
  ),
  amount: z.number().positive("O valor deve ser positivo."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .refine((d) => !isNaN(Date.parse(d)), "Data inválida."),
  description: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// SupplierCombobox — searchable dropdown
// ---------------------------------------------------------------------------

type ComboboxProps = {
  suppliers: ActiveSupplier[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  error?: boolean;
};

function SupplierCombobox({ suppliers, value, onChange, disabled, error }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const selected = suppliers.find((s) => s.id === value);
  const filtered =
    search.trim() === ""
      ? suppliers
      : suppliers.filter(
          (s) =>
            s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.service_type.toLowerCase().includes(search.toLowerCase()),
        );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors",
          "focus:outline-none focus:ring-1",
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
            : "border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-indigo-500 focus:ring-indigo-500",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-zinc-600",
        ].join(" ")}
      >
        <span className={selected ? "text-zinc-100" : "text-zinc-500"}>
          {selected ? selected.name : "Selecione um fornecedor…"}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar fornecedor…"
              className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500">Sem resultados.</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onChange(s.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={[
                    "flex w-full flex-col px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800",
                    s.id === value ? "bg-indigo-500/10 text-indigo-300" : "text-zinc-200",
                  ].join(" ")}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-zinc-500">{s.service_type}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewExpenseForm
// ---------------------------------------------------------------------------

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError =
  "border-red-500 focus:border-red-500 focus:ring-red-500";

export function NewExpenseForm() {
  const router = useRouter();
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [suppliers, setSuppliers] = useState<ActiveSupplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
    },
  });

  const fetchSuppliers = useCallback(async (buildingId: string) => {
    setSuppliersLoading(true);
    try {
      const list = await getActiveSuppliers(buildingId);
      setSuppliers(list);
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBuilding) void fetchSuppliers(selectedBuilding.id);
    else setSuppliers([]);
  }, [selectedBuilding?.id, fetchSuppliers]);

  const onSubmit = async (data: FormValues) => {
    if (!selectedBuilding) return;
    setServerError(null);

    const result = await createExpense(
      selectedBuilding.id,
      data.supplierId,
      data.category,
      decimalToCents(data.amount),
      data.date,
      data.description,
      documentId ?? undefined,
    );

    if ("error" in result) {
      setServerError(result.error);
    } else {
      router.push("/dashboard/expenses");
    }
  };

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
      <p className="text-sm text-zinc-500">
        Selecione um edifício no menu lateral para registar uma despesa.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {/* Invoice upload (optional) */}
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          Fatura / Recibo{" "}
          <span className="text-xs font-normal text-zinc-500">(opcional)</span>
        </label>
        <InvoiceDropzone
          buildingId={selectedBuilding.id}
          onUploaded={(id) => setDocumentId(id)}
          onCleared={() => setDocumentId(null)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Supplier */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Fornecedor
          </label>
          {suppliersLoading ? (
            <div className="flex h-10 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
              <span className="text-sm text-zinc-500">A carregar fornecedores…</span>
            </div>
          ) : (
            <Controller
              control={control}
              name="supplierId"
              render={({ field }) => (
                <SupplierCombobox
                  suppliers={suppliers}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  error={!!errors.supplierId}
                />
              )}
            />
          )}
          {errors.supplierId && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.supplierId.message}
            </p>
          )}
          {!suppliersLoading && suppliers.length === 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              Nenhum fornecedor ativo.{" "}
              <a href="/dashboard/suppliers" className="text-indigo-400 hover:underline">
                Adicione um fornecedor
              </a>{" "}
              antes de criar uma despesa.
            </p>
          )}
        </div>

        {/* Category */}
        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Categoria
          </label>
          <select
            id="category"
            aria-invalid={!!errors.category}
            className={`${inputBase} ${errors.category ? inputError : ""}`}
            {...register("category")}
          >
            <option value="">Selecione…</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
          {errors.category && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.category.message}
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Valor (€)
          </label>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0,00"
            aria-invalid={!!errors.amount}
            className={`${inputBase} ${errors.amount ? inputError : ""}`}
            {...register("amount", { valueAsNumber: true })}
          />
          {errors.amount && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.amount.message}
            </p>
          )}
        </div>

        {/* Date */}
        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Data da despesa
          </label>
          <input
            id="date"
            type="date"
            aria-invalid={!!errors.date}
            className={`${inputBase} ${errors.date ? inputError : ""}`}
            {...register("date")}
          />
          {errors.date && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.date.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="sm:col-span-2">
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Descrição{" "}
            <span className="text-xs font-normal text-zinc-500">(opcional)</span>
          </label>
          <textarea
            id="description"
            rows={3}
            maxLength={1000}
            placeholder="Notas adicionais sobre esta despesa…"
            className={`${inputBase} resize-none`}
            {...register("description")}
          />
        </div>
      </div>

      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
        >
          {serverError}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSubmitting ? "A guardar…" : "Guardar como Rascunho"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/expenses")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
