// Expense category constants shared between server actions and client
// components. Kept outside src/app/actions/ because "use server" modules may
// only export async functions — const exports there break the build.

export type ExpenseCategory =
  | "MAINTENANCE"
  | "WATER"
  | "ELECTRICITY"
  | "INSURANCE"
  | "CLEANING"
  | "ELEVATOR"
  | "ADMINISTRATIVE"
  | "OTHER";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "MAINTENANCE",
  "WATER",
  "ELECTRICITY",
  "INSURANCE",
  "CLEANING",
  "ELEVATOR",
  "ADMINISTRATIVE",
  "OTHER",
];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  MAINTENANCE: "Manutenção",
  WATER: "Água",
  ELECTRICITY: "Eletricidade",
  INSURANCE: "Seguros",
  CLEANING: "Limpeza",
  ELEVATOR: "Elevador",
  ADMINISTRATIVE: "Administrativo",
  OTHER: "Outros",
};
