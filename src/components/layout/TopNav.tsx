"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  LogOut,
  Search,
  User,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { signOut } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Breadcrumb helpers
// ---------------------------------------------------------------------------

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  financials: "Financeiro",
  budget: "Orçamento",
  quotas: "Quotas",
  expenses: "Despesas",
  suppliers: "Fornecedores",
  buildings: "Edifícios",
  assemblies: "Assembleias",
  incidents: "Incidentes",
  settings: "Definições",
  notifications: "Notificações",
  admin: "Administração",
  users: "Utilizadores",
  stats: "Estatísticas",
  "my-building": "O Meu Edifício",
};

function useBreadcrumbs(): { label: string; href: string }[] {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((segment, index) => ({
    label: SEGMENT_LABELS[segment] ?? segment,
    href: "/" + segments.slice(0, index + 1).join("/"),
  }));
}

function getInitials(fullName: string | undefined, email: string | undefined): string {
  const name = fullName?.trim() ?? email ?? "";
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "CF";
}

// Keys match notification_event_enum values from migration 005.
const EVENT_LABELS: Record<string, string> = {
  QUOTA_OVERDUE:         "Quota em atraso",
  QUOTA_REMINDER:        "Lembrete de quota",
  ASSEMBLY_SCHEDULED:    "Assembleia agendada",
  ASSEMBLY_REMINDER_48H: "Assembleia em 48 horas",
  VOTE_OPEN:             "Votação aberta",
  INCIDENT_REPORTED:     "Novo incidente reportado",
  INCIDENT_RESOLVED:     "Incidente resolvido",
};

type EventIconConfig = { Icon: LucideIcon; colorClass: string };

const EVENT_ICONS: Record<string, EventIconConfig> = {
  QUOTA_OVERDUE:         { Icon: AlertCircle,  colorClass: "text-red-400" },
  QUOTA_REMINDER:        { Icon: Clock,         colorClass: "text-amber-400" },
  ASSEMBLY_SCHEDULED:    { Icon: Calendar,      colorClass: "text-indigo-400" },
  ASSEMBLY_REMINDER_48H: { Icon: Clock,         colorClass: "text-indigo-300" },
  VOTE_OPEN:             { Icon: CheckSquare,   colorClass: "text-indigo-400" },
  INCIDENT_REPORTED:     { Icon: AlertTriangle, colorClass: "text-amber-400" },
  INCIDENT_RESOLVED:     { Icon: CheckCircle2,  colorClass: "text-emerald-400" },
};

function NotificationIcon({ eventType }: { eventType: string }) {
  const config = EVENT_ICONS[eventType];
  if (!config) return <Bell className="h-3.5 w-3.5 text-zinc-400" />;
  const { Icon, colorClass } = config;
  return <Icon className={cn("h-3.5 w-3.5", colorClass)} />;
}

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);

  if (mins  <  1) return "agora";
  if (mins  < 60) return `há ${mins}m`;
  if (hours < 24) return `há ${hours}h`;
  if (days  <  7) return `há ${days}d`;
  return new Date(isoString).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
  });
}

// ---------------------------------------------------------------------------
// TopNav
// ---------------------------------------------------------------------------

export function TopNav() {
  const router = useRouter();
  const { user } = useUser();
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const breadcrumbs = useBreadcrumbs();

  const fullName = user?.user_metadata?.["full_name"] as string | undefined;
  const initials = getInitials(fullName, user?.email);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 overflow-hidden">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.href} className="flex shrink-0 items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
            )}
            {index === breadcrumbs.length - 1 ? (
              <span className="text-sm font-medium text-zinc-200">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Action cluster */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Pesquisar"
          className="rounded-lg p-2 text-zinc-400 transition-all duration-200 hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
        >
          <Search className="h-4 w-4" />
        </button>

        {/* Notification bell */}
        <Popover>
          <PopoverTrigger
            className="relative rounded-lg p-2 text-zinc-400 transition-all duration-200 hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
            aria-label={
              unreadCount > 0
                ? `Notificações — ${unreadCount} não lidas`
                : "Notificações"
            }
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-80 p-0">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
              <span className="text-sm font-medium text-zinc-200">
                Notificações
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                  {unreadCount} não lidas
                </span>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <Bell className="h-6 w-6 text-zinc-600" />
                  <p className="text-sm text-zinc-500">
                    Sem notificações de momento
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {notifications.map((n) => {
                    const isUnread = n.delivery_status !== "READ";
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3 transition-colors",
                          isUnread ? "bg-indigo-500/5" : "hover:bg-zinc-800/40",
                        )}
                      >
                        {/* Event icon */}
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800">
                          <NotificationIcon eventType={n.event_type} />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm leading-snug",
                              isUnread
                                ? "font-medium text-zinc-200"
                                : "text-zinc-400",
                            )}
                          >
                            {EVENT_LABELS[n.event_type] ?? n.event_type}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {relativeTime(n.created_at)}
                          </p>
                        </div>

                        {/* Unread indicator + mark-read action */}
                        {isUnread && (
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                            <button
                              type="button"
                              onClick={() => markAsRead(n.id)}
                              className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                            >
                              Lido
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Menu do utilizador"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400 transition-all duration-200 hover:bg-indigo-500/30 active:scale-95 select-none"
          >
            {initials}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-56">
            {/* User identity */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-zinc-200">
                    {fullName ?? user?.email ?? "—"}
                  </span>
                  {fullName && user?.email && (
                    <span className="text-xs text-zinc-500">{user.email}</span>
                  )}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onClick={() => router.push("/dashboard/settings/notifications")}
            >
              <User className="h-4 w-4" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="gap-2"
              onClick={() => {
                // Full page load so all user-scoped client state is cleared.
                void signOut().then(({ redirectTo }) =>
                  window.location.assign(redirectTo),
                );
              }}
            >
              <LogOut className="h-4 w-4" />
              Terminar sessão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
