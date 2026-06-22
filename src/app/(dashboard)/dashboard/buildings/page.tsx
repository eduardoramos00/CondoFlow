import type { Metadata } from "next";

import { BuildingsPageClient } from "./_components/BuildingsPageClient";

export const metadata: Metadata = {
  title: "Edifícios | CondoFlow",
  description: "Gerir edifícios do condomínio",
};

export default function BuildingsPage() {
  return <BuildingsPageClient />;
}
