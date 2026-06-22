"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { forgotPassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.string().email({ message: "Email inválido" }),
});

type FormValues = z.infer<typeof schema>;

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors duration-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError =
  "border-red-500 focus:border-red-500 focus:ring-red-500";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    const result = await forgotPassword(data.email);
    if (result?.error) {
      setServerError(result.error);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10 text-2xl text-indigo-400">
            ✉
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">Email enviado</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Se o endereço estiver registado, receberá um link para redefinir a
          palavra-passe em breve.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm text-indigo-400 transition-colors duration-200 hover:text-indigo-300"
        >
          ← Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">
          Recuperar palavra-passe
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Introduza o seu email e enviaremos um link de recuperação.
        </p>
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
          {isSubmitting ? "A enviar…" : "Enviar link de recuperação"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-zinc-400">
        <Link
          href="/login"
          className="text-indigo-400 transition-colors duration-200 hover:text-indigo-300"
        >
          ← Voltar ao login
        </Link>
      </p>
    </>
  );
}
