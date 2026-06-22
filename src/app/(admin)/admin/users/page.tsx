import type { Metadata } from "next";

import { listAllUsers } from "@/app/actions/admin";
import { AdminUsersClient } from "./_components/AdminUsersClient";

export const metadata: Metadata = {
  title: "Utilizadores | Admin",
};

export default async function AdminUsersPage() {
  const users = await listAllUsers();
  return <AdminUsersClient users={users} />;
}
