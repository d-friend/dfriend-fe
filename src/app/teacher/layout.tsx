import { TeacherShell } from "@/components/teacher/teacher-shell";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
