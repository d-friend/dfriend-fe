import { StudySessionWorkspace } from "@/components/student/study-session-workspace";

export default async function SessionTwoPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <StudySessionWorkspace lessonId={id} />; }
