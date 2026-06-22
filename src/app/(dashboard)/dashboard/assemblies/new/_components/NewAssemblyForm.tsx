"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { createAssembly } from "@/app/actions/assemblies";
import { ASSEMBLY_TYPES, type AssemblyType } from "@/lib/assemblies/constants";
import { Button } from "@/components/ui/button";
import { useBuilding } from "@/contexts/BuildingContext";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  type: z.enum(["ORDINÁRIA", "EXTRAORDINÁRIA"] as const),
  scheduledAt: z.string().min(1, "Data obrigatória."),
  location: z.string().max(500).optional(),
  quorumRequired: z
    .number({ message: "Introduza um valor numérico." })
    .gt(0, "Deve ser maior que 0.")
    .lte(100, "Não pode exceder 100%."),
});

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Shared input style
// ---------------------------------------------------------------------------

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError = "border-red-500 focus:border-red-500 focus:ring-red-500";
const labelBase = "mb-1.5 block text-sm font-medium text-zinc-300";

// ---------------------------------------------------------------------------
// NewAssemblyForm
// ---------------------------------------------------------------------------

export function NewAssemblyForm() {
  const router = useRouter();
  const { selectedBuilding } = useBuilding();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "ORDINÁRIA",
      scheduledAt: "",
      location: "",
      quorumRequired: 50.01,
    },
  });

  if (!selectedBuilding) {
    return (
      <p className="text-sm text-zinc-400">
        Selecione um edifício no menu lateral para criar uma assembleia.
      </p>
    );
  }

  if (selectedBuilding.userRole !== "GESTOR") {
    return (
      <p className="text-sm text-zinc-400">
        Apenas o Gestor pode criar assembleias.
      </p>
    );
  }

  async function onSubmit(values: FormValues) {
    if (!selectedBuilding) return;
    setServerError(null);

    // Convert local datetime to ISO
    const scheduledAt = new Date(values.scheduledAt).toISOString();

    const result = await createAssembly(
      selectedBuilding.id,
      values.type as AssemblyType,
      scheduledAt,
      values.quorumRequired,
      values.location ?? undefined,
    );

    if ("error" in result) {
      setServerError(result.error);
      return;
    }

    router.push(`/dashboard/assemblies/${result.id}`);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm space-y-5"
    >
      {/* Type */}
      <div>
        <label className={labelBase}>Tipo de assembleia</label>
        <select {...register("type")} className={inputBase}>
          {ASSEMBLY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "ORDINÁRIA" ? "Ordinária" : "Extraordinária"}
            </option>
          ))}
        </select>
        {errors.type && (
          <p className="mt-1 text-xs text-red-400">{errors.type.message}</p>
        )}
      </div>

      {/* Date & time */}
      <div>
        <label className={labelBase}>Data e hora</label>
        <input
          type="datetime-local"
          {...register("scheduledAt")}
          className={`${inputBase} ${errors.scheduledAt ? inputError : ""}`}
        />
        {errors.scheduledAt && (
          <p className="mt-1 text-xs text-red-400">{errors.scheduledAt.message}</p>
        )}
      </div>

      {/* Location */}
      <div>
        <label className={labelBase}>
          Local{" "}
          <span className="text-zinc-500 font-normal">(opcional)</span>
        </label>
        <input
          type="text"
          placeholder="ex. Sala de condomínio, Videoconferência…"
          {...register("location")}
          className={`${inputBase} ${errors.location ? inputError : ""}`}
        />
        {errors.location && (
          <p className="mt-1 text-xs text-red-400">{errors.location.message}</p>
        )}
      </div>

      {/* Quorum */}
      <div>
        <label className={labelBase}>Quórum necessário (%)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max="100"
          {...register("quorumRequired", { valueAsNumber: true })}
          className={`${inputBase} ${errors.quorumRequired ? inputError : ""}`}
        />
        <p className="mt-1 text-xs text-zinc-500">
          Percentagem mínima de permilagem para a assembleia ser válida.
        </p>
        {errors.quorumRequired && (
          <p className="mt-1 text-xs text-red-400">{errors.quorumRequired.message}</p>
        )}
      </div>

      {serverError && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {serverError}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar Assembleia
        </Button>
      </div>
    </form>
  );
}
