"use client";

import type { ReactNode } from "react";

import { UserProvider } from "@/contexts/UserContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { BuildingProvider } from "@/contexts/BuildingContext";

// Dependency order: UserProvider → NotificationProvider (needs useUser for
// Realtime scoping) → BuildingProvider (needs useUser to fetch buildings).
export function Providers({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <NotificationProvider>
        <BuildingProvider>{children}</BuildingProvider>
      </NotificationProvider>
    </UserProvider>
  );
}
