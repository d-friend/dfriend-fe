import { teacherApi } from "@/lib/api-client";

export type LessonGenerationResult = Record<string, unknown> & {
  lessonId?: string;
  problemCount?: number;
  generationStatus?: "complete" | "partial" | null;
  generationCompletedSlots?: number;
  generationTotalSlots?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function waitForLessonGeneration(
  jobId: string,
  onStage: (stage: string) => void,
): Promise<LessonGenerationResult> {
  const timeoutAt = Date.now() + 10 * 60_000;
  while (Date.now() < timeoutAt) {
    const job = await teacherApi.lessonGenerationJob(jobId);
    const progress = isRecord(job.progress) ? String(job.progress.stage || "") : "";
    if (progress === "precheck") onStage("Đang kiểm tra kỹ năng và nguồn bài phù hợp");
    if (progress === "knowledge") onStage("Đang soạn Session 1 theo kỹ năng và mục tiêu");
    if (progress === "partial") onStage("Đã giữ phần đạt chuẩn, còn một số slot cần tạo tiếp");
    if (job.status === "ready" && isRecord(job.result)) return job.result;
    if (job.status === "failed") {
      const error = new Error(String(job.error || "Không thể tạo bài học."));
      error.name = "LessonGenerationFailed";
      throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
  throw new Error("Tạo bài học mất nhiều thời gian hơn dự kiến. Tiến trình vẫn được lưu để tiếp tục sau.");
}
