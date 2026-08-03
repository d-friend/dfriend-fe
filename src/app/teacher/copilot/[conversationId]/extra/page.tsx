import { FollowUpWorkspace } from "@/components/teacher/follow-up-workspace";

export default async function FollowUpPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <FollowUpWorkspace lessonId={conversationId} />;
}
