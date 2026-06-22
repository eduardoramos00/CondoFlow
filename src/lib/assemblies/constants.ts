// Assembly type constants shared between server actions and client
// components. Kept outside src/app/actions/ because "use server" modules may
// only export async functions — const exports there break the page at runtime.

export type AssemblyType = "ORDINÁRIA" | "EXTRAORDINÁRIA";

export const ASSEMBLY_TYPES: AssemblyType[] = ["ORDINÁRIA", "EXTRAORDINÁRIA"];
