"use client";

import Link from "next/link";
import { Paperclip } from "lucide-react";

import type { IncidentWithDetails } from "@/app/actions/incidents";
import { StatusBadge } from "@/components/ui/StatusBadge";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `há ${days}d`;
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}

type IncidentCardProps = {
  incident: IncidentWithDetails;
};

export function IncidentCard({ incident }: IncidentCardProps) {
  return (
    <Link
      href={`/dashboard/incidents/${incident.id}`}
      className="block rounded-xl border border-zinc-800 bg-zinc-900 p-3.5 shadow-sm transition-colors hover:border-zinc-600 hover:bg-zinc-800/80"
    >
      <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">
        {incident.title}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {incident.priority && <StatusBadge status={incident.priority} />}
        {incident.unit_identifier && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 ring-1 ring-zinc-700">
            {incident.unit_identifier}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-500">
        <span>{formatRelative(incident.created_at)}</span>
        {incident.attachment_count > 0 && (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {incident.attachment_count}
          </span>
        )}
      </div>
    </Link>
  );
}
