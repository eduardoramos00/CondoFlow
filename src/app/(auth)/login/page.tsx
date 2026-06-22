"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { signIn } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.string().email({ message: "Email inválido" }),
  password: z.string().min(1, { message: "Palavra-passe obrigatória" }),
});

type FormValues = z.infer<typeof schema>;

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors duration-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError =
  "border-red-500 focus:border-red-500 focus:ring-red-500";

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    const result = await signIn(data.email, data.password);
    if ("error" in result) {
      setServerError(result.error);
      return;
    }
    // Full page load so the Supabase browser client and the user-scoped
    // contexts re-initialise from the new auth cookies (account switch).
    window.location.assign(result.redirectTo);
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Entrar</h1>
        <p className="mt-1 text-sm text-zinc-400">Aceda à sua conta CondoFlow</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-sm font-medium text-zinc-300"
            >
              Palavra-passe
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-indigo-400 transition-colors duration-200 hover:text-indigo-300"
            >
              Esqueceu?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
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
          {isSubmitting ? "A entrar…" : "Entrar"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-zinc-400">
        Não tem conta?{" "}
        <Link
          href="/register"
          className="text-indigo-400 transition-colors duration-200 hover:text-indigo-300"
        >
          Criar conta
        </Link>
      </p>
    </>
  );
}
