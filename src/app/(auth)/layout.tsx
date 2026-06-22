import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Acesso",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      {/* Brand mark */}
      <div className="mb-8 flex flex-col items-center gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-zinc-100">
          CondoFlow
        </span>
        <span className="text-sm text-zinc-400">
          Gestão de condomínios simplificada
        </span>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
