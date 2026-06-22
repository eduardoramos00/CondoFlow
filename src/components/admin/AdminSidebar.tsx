"use client";

import Link from "next/link";
import { useCallback, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, LayoutDashboard, LogOut, ShieldCheck, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { signOut } from "@/app/actions/auth";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Edifícios", href: "/admin/buildings", icon: Building2 },
  { label: "Utilizadores", href: "/admin/users", icon: Users },
  { label: "Estatísticas", href: "/admin/stats", icon: BarChart3 },
];

function getInitials(fullName?: string, email?: string): string {
  const name = fullName?.trim() ?? email ?? "";
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "SA";
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const handleSignOut = useCallback(async () => {
    const { redirectTo } = await signOut();
    // Full page load so all user-scoped client state is cleared.
    window.location.assign(redirectTo);
  }, []);

  const fullName = user?.user_metadata?.["full_name"] as string | undefined;
  const initials = getInitials(fullName, user?.email);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-800 px-5">
        <ShieldCheck className="h-4 w-4 shrink-0 text-rose-400" />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-zinc-100">CondoFlow</span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-rose-400">
            SuperAdmin
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Plataforma
        </p>
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                  isActive
                    ? "bg-rose-500/10 font-medium text-rose-400"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-3 py-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-all duration-200 hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Voltar ao Dashboard
        </Link>

        <div className="mt-0.5 flex items-center gap-2 rounded-lg px-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-[10px] font-semibold text-rose-400 select-none">
            {initials}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium text-zinc-300">
              {fullName ?? user?.email ?? "—"}
            </span>
            {fullName && (
              <span className="truncate text-[10px] text-zinc-500">{user?.email}</span>
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
