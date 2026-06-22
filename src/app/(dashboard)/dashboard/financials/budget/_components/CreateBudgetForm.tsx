"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createBudget } from "@/app/actions/budgets";
import { decimalToCents } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";

const schema = z
  .object({
    // z.number() with { valueAsNumber: true } in register() — the input is
    // already a number via HTMLInputElement.valueAsNumber, so no coercion needed.
    fiscalYear: z
      .number()
      .int()
      .min(2000, "Ano inválido")
      .max(2100, "Ano inválido"),
    totalAmount: z.number().positive("O total deve ser positivo"),
    reserveAmount: z.number().min(0, "O fundo de reserva não pode ser negativo"),
  })
  .refine((d) => d.reserveAmount <= d.totalAmount, {
    message: "O fundo de reserva não pode exceder o total",
    path: ["reserveAmount"],
  });

type FormValues = z.infer<typeof schema>;

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError = "border-red-500 focus:border-red-500 focus:ring-red-500";

type Props = {
  buildingId: string;
  defaultYear: number;
  onSuccess: () => void;
};

export function CreateBudgetForm({ buildingId, defaultYear, onSuccess }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fiscalYear: defaultYear },
  });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    // decimalToCents uses decimal.js — IEEE 754 safe
    const totalCents = decimalToCents(data.totalAmount);
    const reserveCents = decimalToCents(data.reserveAmount);
    const result = await createBudget(
      buildingId,
      data.fiscalYear,
      totalCents,
      reserveCents,
    );
    if ("error" in result) {
      setServerError(result.error);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Fiscal year */}
        <div>
          <label
            htmlFor="fiscalYear"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Ano fiscal
          </label>
          <input
            id="fiscalYear"
            type="number"
            min={2000}
            max={2100}
            aria-invalid={!!errors.fiscalYear}
            className={`${inputBase} ${errors.fiscalYear ? inputError : ""}`}
            {...register("fiscalYear", { valueAsNumber: true })}
          />
          {errors.fiscalYear && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.fiscalYear.message}
            </p>
          )}
        </div>

        {/* Total amount */}
        <div>
          <label
            htmlFor="totalAmount"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Total orçamentado (€)
          </label>
          <input
            id="totalAmount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="12000.00"
            aria-invalid={!!errors.totalAmount}
            className={`${inputBase} ${errors.totalAmount ? inputError : ""}`}
            {...register("totalAmount", { valueAsNumber: true })}
          />
          {errors.totalAmount && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.totalAmount.message}
            </p>
          )}
        </div>

        {/* Reserve amount */}
        <div>
          <label
            htmlFor="reserveAmount"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Fundo de reserva (€)
            <span className="ml-1.5 text-xs text-zinc-500">mín. 10%</span>
          </label>
          <input
            id="reserveAmount"
            type="number"
            step="0.01"
            min="0"
            placeholder="1200.00"
            aria-invalid={!!errors.reserveAmount}
            className={`${inputBase} ${errors.reserveAmount ? inputError : ""}`}
            {...register("reserveAmount", { valueAsNumber: true })}
          />
          {errors.reserveAmount && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.reserveAmount.message}
            </p>
          )}
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

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "A criar…" : "Criar orçamento"}
      </Button>
    </form>
  );
}
