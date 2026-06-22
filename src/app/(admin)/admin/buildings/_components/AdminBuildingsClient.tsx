"use client";

import { useState } from "react";
import { AlertTriangle, Building2, Search } from "lucide-react";

import type { AdminBuilding } from "@/app/actions/admin";
import { cn } from "@/lib/utils";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AdminBuildingsClient({ buildings }: { buildings: AdminBuilding[] }) {
  const [search, setSearch] = useState("");

  const filtered = buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.gestor_name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Edifícios</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {buildings.length} edifício{buildings.length !== 1 ? "s" : ""} na plataforma
          </p>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Pesquisar edifício ou gestor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Edifício
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Gestor
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                Frações
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                Incidentes
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Última Quota
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-500">
                    <Building2 className="h-6 w-6" />
                    <p className="text-sm">Nenhum edifício encontrado</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr
                  key={b.id}
                  className="transition-colors hover:bg-zinc-800/40"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-zinc-200">{b.name}</p>
                      <p className="text-xs text-zinc-500">{b.address}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {b.gestor_name ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-300">
                    {b.unit_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.open_incident_count > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {b.open_incident_count}
                      </span>
                    ) : (
                      <span className="text-zinc-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {formatDate(b.last_quota_run_date)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
