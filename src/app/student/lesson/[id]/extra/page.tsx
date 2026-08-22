import { redirect } from "next/navigation";

export default async function LegacyExtraLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const classQuery = query.class
    ? `?class=${encodeURIComponent(query.class)}`
    : "";

  redirect(`/student/lesson/extra_${encodeURIComponent(id)}/part1${classQuery}`);
}
