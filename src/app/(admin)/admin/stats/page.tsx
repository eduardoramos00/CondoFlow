import type { Metadata } from "next";

import { getPlatformStats } from "@/app/actions/admin";
import { AdminStatsClient } from "./_components/AdminStatsClient";

export const metadata: Metadata = {
  title: "Estatísticas | Admin",
};

export default async function AdminStatsPage() {
  const stats = await getPlatformStats();
  return <AdminStatsClient stats={stats} />;
}
