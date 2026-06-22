import type { Metadata } from "next";

import { MyBuildingHomeClient } from "./_components/MyBuildingHomeClient";

export const metadata: Metadata = {
  title: "O Meu Condomínio | CondoFlow",
  description: "Estado do seu condomínio e histórico de quotas",
};

export default function MyBuildingPage() {
  return <MyBuildingHomeClient />;
}
