import type { Metadata } from "next";

import { listAllBuildings } from "@/app/actions/admin";
import { AdminBuildingsClient } from "./_components/AdminBuildingsClient";

export const metadata: Metadata = {
  title: "Edifícios | Admin",
};

export default async function AdminBuildingsPage() {
  const buildings = await listAllBuildings();
  return <AdminBuildingsClient buildings={buildings} />;
}
