"use client";

import Link from "next/link";
import { Building2, MapPin, Plus } from "lucide-react";

import { useBuilding } from "@/contexts/BuildingContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/SkeletonCard";

export function BuildingsPageClient() {
  const { buildings, isLoading } = useBuilding();

  const managed = buildings.filter((b) => b.userRole === "GESTOR");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Edifícios</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Edifícios que gere nesta plataforma.
          </p>
        </div>
        <Link href="/dashboard/buildings/new">
          <Button className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95">
            <Plus className="mr-2 h-4 w-4" />
            Novo edifício
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : managed.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 py-16 text-center">
          <Building2 className="mb-3 h-10 w-10 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">
            Ainda não gere nenhum edifício.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Crie o primeiro edifício para começar.
          </p>
          <Link href="/dashboard/buildings/new" className="mt-4">
            <Button
              size="sm"
              className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Criar edifício
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {managed.map((building) => (
            <div
              key={building.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm transition-colors hover:border-zinc-700"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-100">
                    {building.name}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{building.address}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
