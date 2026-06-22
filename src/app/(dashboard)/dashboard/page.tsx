import type { Metadata } from "next";

import { DashboardHomeClient } from "./_components/DashboardHomeClient";

export const metadata: Metadata = {
  title: "Dashboard | CondoFlow",
  description: "Visão geral financeira e operacional do condomínio",
};

export default function DashboardPage() {
  return <DashboardHomeClient />;
}
