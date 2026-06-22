"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { resetPassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

const schema = z
  .object({
    password: z
      .string()
      .min(8, { message: "Mínimo de 8 caracteres" }),
    confirm_password: z.string().min(1, { message: "Campo obrigatório" }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "As palavras-passe não coincidem",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors duration-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError =
  "border-red-500 focus:border-red-500 focus:ring-red-500";

export default function ResetPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    const result = await resetPassword(data.password);
    if ("error" in result) {
      setServerError(result.error);
      return;
    }
    // Full page load so client-side auth state re-initialises from the cookies.
    window.location.assign(result.redirectTo);
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">
          Definir nova palavra-passe
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Escolha uma palavra-passe segura para a sua conta.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Nova palavra-passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            className={`${inputBase} ${errors.password ? inputError : ""}`}
            {...register("password")}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Confirmar palavra-passe
          </label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm_password}
            className={`${inputBase} ${errors.confirm_password ? inputError : ""}`}
            {...register("confirm_password")}
          />
          {errors.confirm_password && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.confirm_password.message}
            </p>
          )}
        </div>

        {serverError && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
          >
            {serverError}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          size="lg"
          className="w-full"
        >
          {isSubmitting ? "A guardar…" : "Guardar nova palavra-passe"}
        </Button>
      </form>
    </>
  );
}
