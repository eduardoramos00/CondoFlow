import type { Metadata } from "next";

import { MyBuildingIncidentsClient } from "./_components/MyBuildingIncidentsClient";

export const metadata: Metadata = {
  title: "Ocorrências | CondoFlow",
  description: "Ocorrências e manutenção do seu edifício",
};

export default function MyBuildingIncidentsPage() {
  return (
    <div className="space-y-6 p-6">
      <MyBuildingIncidentsClient />
    </div>
  );
}
