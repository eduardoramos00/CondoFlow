import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { TopNav } from "@/components/layout/TopNav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <AdminSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopNav />

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
