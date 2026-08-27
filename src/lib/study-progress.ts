import type { StudyProblem, StudySession } from "@/types/contracts";

export function deriveStudyProgress(problems: StudyProblem[], session: StudySession | null) {
  const rawProgress = session?.current_progress ?? session?.current_process ?? 0;
  const progressPercent = Math.max(0, Math.min(100, Number(rawProgress) || 0));
  const total = session?.total_problem_count || problems.length;
  const completedFromSession =
    typeof session?.completed_problem_count === "number"
      ? Math.max(0, Math.min(total, session.completed_problem_count))
      : null;

  if (!problems.length) return { progressPercent, completedCount: 0, allComplete: false };
  if (session?.session_completed || progressPercent >= 100) {
    return { progressPercent, completedCount: problems.length, allComplete: true };
  }
  if (completedFromSession !== null) {
    return {
      progressPercent,
      completedCount: Math.min(problems.length, completedFromSession),
      allComplete: completedFromSession >= problems.length,
    };
  }

  const currentIndex = problems.findIndex((problem) => problem.problem_id === session?.current_problem_id);
  const completedCount = currentIndex >= 0
    ? currentIndex
    : Math.min(problems.length - 1, Math.ceil((progressPercent / 100) * problems.length));

  return { progressPercent, completedCount, allComplete: false };
}
