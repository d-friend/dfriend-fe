import { AdminWorkspace } from "@/components/admin/admin-workspace";
import { requireRole } from "@/lib/server-auth";

export default async function AdminPage() {
  await requireRole("ADMIN");
  return <AdminWorkspace />;
}
