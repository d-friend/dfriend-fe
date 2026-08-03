import { Suspense } from "react";
import { ClassWorkspace } from "@/components/teacher/class-workspace";

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return (
    <Suspense fallback={<div className="center-state"><div className="skeleton h-32 w-80" /></div>}>
      <ClassWorkspace classId={classId} />
    </Suspense>
  );
}
