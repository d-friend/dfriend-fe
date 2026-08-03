import { LessonReview } from "@/components/teacher/lesson-review";

export default async function LessonReviewPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <LessonReview lessonId={lessonId} />;
}
