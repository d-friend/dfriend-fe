import { SessionOneWorkspace } from "@/components/student/session-one-workspace";

export default async function SessionOnePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SessionOneWorkspace exerciseId={id} />; }
