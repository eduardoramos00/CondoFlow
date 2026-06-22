"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { signUp } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

const schema = z
  .object({
    full_name: z
      .string()
      .min(2, { message: "Nome demasiado curto (mínimo 2 caracteres)" }),
    email: z.string().email({ message: "Email inválido" }),
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

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    const result = await signUp(data.full_name, data.email, data.password);
    if ("error" in result) {
      setServerError(result.error);
    } else {
      setRegistered(true);
    }
  };

  if (registered) {
    return (
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-400">
            ✓
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">Conta criada!</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Verifique o seu email para confirmar a conta antes de entrar.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm text-indigo-400 transition-colors duration-200 hover:text-indigo-300"
        >
          Ir para o login →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Criar conta</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Comece a gerir o seu condomínio
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="full_name"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Nome completo
          </label>
          <input
            id="full_name"
            type="text"
            autoComplete="name"
            aria-invalid={!!errors.full_name}
            className={`${inputBase} ${errors.full_name ? inputError : ""}`}
            {...register("full_name")}
          />
          {errors.full_name && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.full_name.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            className={`${inputBase} ${errors.email ? inputError : ""}`}
            {...register("email")}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Palavra-passe
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
          {isSubmitting ? "A criar conta…" : "Criar conta"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-zinc-400">
        Já tem conta?{" "}
        <Link
          href="/login"
          className="text-indigo-400 transition-colors duration-200 hover:text-indigo-300"
        >
          Entrar
        </Link>
      </p>
    </>
  );
}
