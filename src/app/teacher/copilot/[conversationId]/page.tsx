import { CopilotWorkspace } from "@/components/teacher/copilot-workspace";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <CopilotWorkspace conversationId={conversationId} />;
}
