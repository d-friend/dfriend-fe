"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LessonGenerationLoading } from "@/components/teacher/lesson-generation-loading";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";
import {
  waitForLessonGeneration,
  type LessonGenerationResult,
} from "@/lib/lesson-generation";

export function LessonGenerationJobWorkspace({ jobId }: { jobId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [detail, setDetail] = useState("Đang khôi phục tiến trình đã lưu");
  const [partial, setPartial] = useState<LessonGenerationResult | null>(null);
  const [error, setError] = useState("");
  const [activeJobId, setActiveJobId] = useState(jobId);
  const [retryNonce, setRetryNonce] = useState(0);
  const enqueueError = search.get("enqueueError") || "";
  const visibleError = enqueueError || error;

  useEffect(() => {
    if (enqueueError) {
      return;
    }
    let cancelled = false;
    void waitForLessonGeneration(activeJobId, setDetail)
      .then((result) => {
        if (cancelled) return;
        if (result.generationStatus === "partial") {
          setPartial(result);
          return;
        }
        const lessonId = String(result.lessonId || "");
        if (!lessonId) throw new Error("Backend chưa trả mã lesson để mở review.");
        router.replace(`/teacher/lessons/${encodeURIComponent(lessonId)}/review`);
      })
      .catch((generationError) => {
        if (!cancelled) {
          setError(getApiErrorMessage(generationError, generationError instanceof Error ? generationError.message : "Không thể tạo bài học."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeJobId, enqueueError, retryNonce, router]);

  async function retryMissing() {
    setError("");
    setPartial(null);
    setDetail("Đang tạo đúng các slot còn thiếu");
    try {
      const queued = await teacherApi.retryMissingLessonSlots(activeJobId);
      setActiveJobId(queued.jobId);
      router.replace(
        `/teacher/lessons/generating/${encodeURIComponent(queued.jobId)}${search.get("kind") ? `?kind=${encodeURIComponent(search.get("kind") || "")}` : ""}`,
      );
    } catch (retryError) {
      setError(getApiErrorMessage(retryError, "Chưa thể tạo tiếp các slot còn thiếu."));
    }
  }

  if (partial) {
    return (
      <section className="lesson-generation-screen">
        <div className="lesson-generation-panel">
          <WarningCircle size={34} />
          <p className="workspace-kicker">Bản nháp đã được giữ</p>
          <h1>Còn slot chưa đạt chuẩn</h1>
          <p className="lesson-generation-lead">
            Đã hoàn thành {partial.generationCompletedSlots || 0}
            {typeof partial.generationTotalSlots === "number" ? `/${partial.generationTotalSlots}` : ""} slot. Retry dùng lại đúng generation run này.
          </p>
          <button className="primary-button" onClick={retryMissing}>Tạo tiếp phần còn thiếu</button>
        </div>
      </section>
    );
  }

  if (visibleError) {
    return (
      <section className="lesson-generation-screen">
        <div className="lesson-generation-panel">
          <WarningCircle size={34} />
          <h1>Tiến trình tạo bài gặp lỗi</h1>
          <p className="lesson-generation-lead">{visibleError}</p>
          <button className="secondary-button" onClick={() => enqueueError ? router.back() : setRetryNonce((value) => value + 1)}>
            {enqueueError ? "Quay lại planning" : "Kiểm tra lại"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <LessonGenerationLoading
      origin={search.get("origin") === "wizard" ? "wizard" : "copilot"}
      detail={detail}
    />
  );
}
