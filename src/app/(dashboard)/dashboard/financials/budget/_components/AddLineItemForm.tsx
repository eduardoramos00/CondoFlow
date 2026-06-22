"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { addLineItem, type BudgetCategory } from "@/app/actions/budgets";
import { decimalToCents } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";

const CATEGORIES: { value: BudgetCategory; label: string }[] = [
  { value: "MAINTENANCE", label: "Manutenção" },
  { value: "WATER", label: "Água" },
  { value: "ELECTRICITY", label: "Eletricidade" },
  { value: "INSURANCE", label: "Seguros" },
  { value: "CLEANING", label: "Limpeza" },
  { value: "ELEVATOR", label: "Elevador" },
  { value: "ADMINISTRATIVE", label: "Administrativo" },
  { value: "OTHER", label: "Outros" },
];

const schema = z.object({
  category: z.enum([
    "MAINTENANCE",
    "WATER",
    "ELECTRICITY",
    "INSURANCE",
    "CLEANING",
    "ELEVATOR",
    "ADMINISTRATIVE",
    "OTHER",
  ] as const),
  // z.number() with { valueAsNumber: true } in register() — correct for RHF v7 + resolvers v5.
  amount: z.number().positive("O montante deve ser positivo"),
  description: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError = "border-red-500 focus:border-red-500 focus:ring-red-500";

type Props = {
  budgetId: string;
  buildingId: string;
  onSuccess: () => void;
};

export function AddLineItemForm({ budgetId, buildingId, onSuccess }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    const amountCents = decimalToCents(data.amount);
    const result = await addLineItem(
      budgetId,
      buildingId,
      data.category,
      amountCents,
      data.description ?? undefined,
    );
    if ("error" in result) {
      setServerError(result.error);
    } else {
      reset();
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Category */}
        <div>
          <label
            htmlFor="category"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Categoria
          </label>
          <select
            id="category"
            aria-invalid={!!errors.category}
            className={`${inputBase} ${errors.category ? inputError : ""}`}
            {...register("category")}
          >
            <option value="">Selecionar…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
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
          <label
            htmlFor="lineItemAmount"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Montante (€)
          </label>
          <input
            id="lineItemAmount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="1500.00"
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

        {/* Description */}
        <div>
          <label
            htmlFor="lineItemDescription"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Descrição
            <span className="ml-1.5 text-xs text-zinc-500">(opcional)</span>
          </label>
          <input
            id="lineItemDescription"
            type="text"
            maxLength={500}
            placeholder="Ex: Contrato de limpeza semanal"
            className={`${inputBase} ${errors.description ? inputError : ""}`}
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

      <Button type="submit" disabled={isSubmitting} variant="outline">
        {isSubmitting ? "A adicionar…" : "Adicionar item"}
      </Button>
    </form>
  );
}
