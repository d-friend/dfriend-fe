import { LessonGenerationJobWorkspace } from "@/components/teacher/lesson-generation-job-workspace";

export default async function LessonGenerationJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <LessonGenerationJobWorkspace jobId={jobId} />;
}
