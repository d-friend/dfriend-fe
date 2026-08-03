import { ClassWorkspace } from "@/components/student/class-workspace";

export default async function StudentClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <ClassWorkspace classId={classId} />;
}
