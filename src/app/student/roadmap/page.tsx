import { MountainRoadmap } from "@/components/student/mountain-roadmap";

export default async function StudentRoadmapPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) { const params = await searchParams; return <MountainRoadmap initialClassId={params.class || ""} />; }
