import { Suspense } from "react";
import { LessonAuthoring } from "@/components/teacher/lesson-authoring";

export default function NewLessonPage() {
  return (
    <Suspense fallback={<div className="center-state"><div className="skeleton h-32 w-80" /></div>}>
      <LessonAuthoring />
    </Suspense>
  );
}
