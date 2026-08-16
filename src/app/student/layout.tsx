import { StudentShell } from "@/components/student/student-shell";
import { requireRole } from "@/lib/server-auth";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireRole("STUDENT");
  return <StudentShell>{children}</StudentShell>;
}
