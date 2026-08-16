import { TeacherShell } from "@/components/teacher/teacher-shell";
import { requireRole } from "@/lib/server-auth";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  await requireRole("TEACHER");
  return <TeacherShell>{children}</TeacherShell>;
}
