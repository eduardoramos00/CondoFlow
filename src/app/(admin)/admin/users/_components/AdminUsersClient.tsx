"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Users } from "lucide-react";

import type { AdminUser } from "@/app/actions/admin";
import { suspendUser, reactivateUser } from "@/app/actions/admin";
import { cn } from "@/lib/utils";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(fullName: string | null, email: string | undefined): string {
  const name = fullName?.trim() ?? email ?? "";
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export function AdminUsersClient({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = users.filter((u) => {
    const term = search.toLowerCase();
    return (
      (u.full_name ?? "").toLowerCase().includes(term) ||
      (u.email ?? "").toLowerCase().includes(term)
    );
  });

  function handleToggle(userId: string, isSuspended: boolean) {
    setError(null);
    setPendingUserId(userId);
    startTransition(async () => {
      const result = isSuspended
        ? await reactivateUser(userId)
        : await suspendUser(userId);
      setPendingUserId(null);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Utilizadores</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {users.length} utilizador{users.length !== 1 ? "es" : ""} na plataforma
          </p>
        </div>

        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Pesquisar por nome ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Utilizador
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Edifícios
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Último Acesso
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Estado
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-500">
                    <Users className="h-6 w-6" />
                    <p className="text-sm">Nenhum utilizador encontrado</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((u) => {
                const isPending = pendingUserId === u.id;
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "transition-colors hover:bg-zinc-800/40",
                      u.is_suspended && "opacity-60",
                    )}
                  >
                    {/* User identity */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-400 select-none">
                          {getInitials(u.full_name, u.email)}
                        </div>
                        <div>
                          <p className="font-medium text-zinc-200">
                            {u.full_name ?? <span className="text-zinc-500">Sem nome</span>}
                          </p>
                          <p className="text-xs text-zinc-500">{u.email ?? "—"}</p>
                        </div>
                      </div>
                    </td>

                    {/* Buildings */}
                    <td className="px-4 py-3">
                      {u.buildings.length === 0 ? (
                        <span className="text-zinc-600">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.buildings.map((b) => (
                            <span
                              key={b.building_id}
                              className="inline-flex items-center rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
                            >
                              {b.role === "GESTOR" ? "G" : "C"} · {b.building_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Last login */}
                    <td className="px-4 py-3 text-zinc-400">
                      {formatDate(u.last_sign_in_at)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {u.is_suspended ? (
                        <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                          Suspenso
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          Ativo
                        </span>
                      )}
                    </td>

                    {/* Toggle action */}
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleToggle(u.id, u.is_suspended)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                          u.is_suspended
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20",
                        )}
                      >
                        {isPending
                          ? "A processar…"
                          : u.is_suspended
                            ? "Reativar"
                            : "Suspender"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
