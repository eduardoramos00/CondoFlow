"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getUserBuildings, type UserBuilding } from "@/app/actions/buildings";
import { useUser } from "./UserContext";

type BuildingContextValue = {
  buildings: UserBuilding[];
  selectedBuilding: UserBuilding | null;
  selectBuilding: (id: string) => void;
  isLoading: boolean;
};

const BuildingContext = createContext<BuildingContextValue>({
  buildings: [],
  selectedBuilding: null,
  selectBuilding: () => undefined,
  isLoading: true,
});

const STORAGE_KEY = "condoflow:selected_building_id";

export function BuildingProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: userLoading } = useUser();
  const [buildings, setBuildings] = useState<UserBuilding[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<UserBuilding | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setBuildings([]);
      setSelectedBuilding(null);
      setIsLoading(false);
      return;
    }

    void getUserBuildings()
      .then((list) => {
        setBuildings(list);

        const savedId =
          typeof window !== "undefined"
            ? localStorage.getItem(STORAGE_KEY)
            : null;
        const saved = savedId
          ? (list.find((b) => b.id === savedId) ?? null)
          : null;
        setSelectedBuilding(saved ?? list[0] ?? null);
      })
      .catch(() => {
        // Fail gracefully — buildings list stays empty, user can still navigate.
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [user?.id, userLoading]);

  const selectBuilding = useCallback(
    (id: string) => {
      const building = buildings.find((b) => b.id === id) ?? null;
      setSelectedBuilding(building);
      if (building && typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, building.id);
      }
    },
    [buildings],
  );

  return (
    <BuildingContext.Provider
      value={{ buildings, selectedBuilding, selectBuilding, isLoading }}
    >
      {children}
    </BuildingContext.Provider>
  );
}

export function useBuilding(): BuildingContextValue {
  return useContext(BuildingContext);
}
