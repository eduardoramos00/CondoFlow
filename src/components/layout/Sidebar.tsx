"use client";

import Link from "next/link";
import { useCallback, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { useBuilding } from "@/contexts/BuildingContext";
import { can, type AppRole } from "@/lib/auth/can";
import { signOut } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/SkeletonCard";

// ---------------------------------------------------------------------------
// Nav data model
// ---------------------------------------------------------------------------

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  gestorOnly?: boolean;
  superAdminOnly?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Geral",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Financeiro",
    items: [
      { label: "Orçamento", href: "/dashboard/financials/budget", icon: BarChart3 },
      { label: "Quotas", href: "/dashboard/financials/quotas", icon: CreditCard },
      { label: "Despesas", href: "/dashboard/expenses", icon: FileText },
      { label: "Fornecedores", href: "/dashboard/suppliers", icon: Truck, gestorOnly: true },
    ],
  },
  {
    title: "Condomínio",
    items: [
      { label: "Edifícios", href: "/dashboard/buildings", icon: Building2 },
      { label: "Assembleias", href: "/dashboard/assemblies", icon: CalendarCheck },
      { label: "Incidentes", href: "/dashboard/incidents", icon: Wrench },
    ],
  },
  {
    title: "Administração",
    items: [
      { label: "Plataforma", href: "/admin", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(fullName: string | undefined, email: string | undefined): string {
  const name = fullName?.trim() ?? email ?? "";
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "CF";
}

function isItemVisible(item: NavItem, role: AppRole | null): boolean {
  if (item.superAdminOnly) return role === "SUPERADMIN";
  if (!role) return item.href === "/dashboard";
  if (item.gestorOnly) return can("view_suppliers", role);
  return true;
}

// ---------------------------------------------------------------------------
// NavLink
// ---------------------------------------------------------------------------

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
        isActive
          ? "bg-indigo-500/10 font-medium text-indigo-400"
          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const { user } = useUser();
  const { buildings, selectedBuilding, selectBuilding, isLoading } = useBuilding();

  const handleSignOut = useCallback(async () => {
    const { redirectTo } = await signOut();
    // Full page load so all user-scoped client state is cleared.
    window.location.assign(redirectTo);
  }, []);

  const isSuperAdmin = user?.app_metadata?.["role"] === "SUPERADMIN";
  const effectiveRole: AppRole | null = isSuperAdmin
    ? "SUPERADMIN"
    : (selectedBuilding?.userRole ?? null);

  const fullName = user?.user_metadata?.["full_name"] as string | undefined;
  const initials = getInitials(fullName, user?.email);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* Brand */}
      <div className="flex h-14 items-center border-b border-zinc-800 px-5">
        <span className="text-base font-semibold tracking-tight text-zinc-100">
          CondoFlow
        </span>
      </div>

      {/* Building selector */}
      <div className="border-b border-zinc-800 px-3 py-3">
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : buildings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-sm text-zinc-500">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">Sem edifícios</span>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-700 active:scale-95"
              aria-label="Selecionar edifício"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="truncate">
                  {selectedBuilding?.name ?? "Selecionar edifício"}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start">
              {buildings.map((building) => (
                <DropdownMenuItem
                  key={building.id}
                  onClick={() => selectBuilding(building.id)}
                  className="gap-2"
                >
                  <span
                    className={cn(
                      "flex min-w-0 items-center gap-2 truncate",
                      selectedBuilding?.id === building.id
                        ? "text-indigo-400"
                        : "text-zinc-300",
                    )}
                  >
                    {selectedBuilding?.id === building.id ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {building.name}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) =>
            isItemVisible(item, effectiveRole),
          );
          if (!visibleItems.length) return null;
          return (
            <div key={group.title} className="mb-6 last:mb-0">
              <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer: settings + user row */}
      <div className="border-t border-zinc-800 px-3 py-3">
        <Link
          href="/dashboard/settings/notifications"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-all duration-200 hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          <Settings className="h-4 w-4 shrink-0" />
          Definições
        </Link>

        <div className="mt-0.5 flex items-center gap-2 rounded-lg px-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-semibold text-indigo-400 select-none">
            {initials}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium text-zinc-300">
              {fullName ?? user?.email ?? "—"}
            </span>
            {fullName && (
              <span className="truncate text-[10px] text-zinc-500">
                {user?.email}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Terminar sessão"
            onClick={() => {
              void handleSignOut();
            }}
            className="shrink-0 rounded p-1 text-zinc-500 transition-all duration-200 hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
