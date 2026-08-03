import { FeedbackWorkspace } from "@/components/student/feedback-workspace";

export default async function StudentFeedbackPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <FeedbackWorkspace lessonId={id} />; }
