import { ClassWorkspace } from "@/components/student/class-workspace";

export default async function StudentClassesPage({ searchParams }: { searchParams: Promise<{ join?: string }> }) {
  const { join } = await searchParams;
  return <ClassWorkspace joinInitially={join === "1"} />;
}
