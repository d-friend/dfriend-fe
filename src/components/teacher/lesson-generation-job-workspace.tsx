"use client";

import { BookOpenText, WarningCircle } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LessonGenerationLoading } from "@/components/teacher/lesson-generation-loading";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";
import {
  replaceStoredLessonGenerationJob,
  waitForLessonGeneration,
  type LessonGenerationResult,
} from "@/lib/lesson-generation";

export function LessonGenerationJobWorkspace({ jobId }: { jobId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = useSearchParams();
  const [detail, setDetail] = useState("Đang kiểm tra tiến trình tạo bài");
  const [partial, setPartial] = useState<LessonGenerationResult | null>(null);
  const [error, setError] = useState("");
  const [retryableFailure, setRetryableFailure] = useState(false);
  const [activeJobId, setActiveJobId] = useState(jobId);
  const [retryNonce, setRetryNonce] = useState(0);
  const enqueueError = search.get("enqueueError") || "";
  const visibleError = enqueueError || error;
  const requestedKind = search.get("kind");
  const lessonKind = requestedKind === "remedial" || requestedKind === "advanced" ? requestedKind : "main";

  useEffect(() => {
    if (enqueueError) {
      return;
    }
    let cancelled = false;
    void waitForLessonGeneration(activeJobId, setDetail, (nextJobId) => {
      replaceStoredLessonGenerationJob(activeJobId, nextJobId);
      setActiveJobId(nextJobId);
      const params = new URLSearchParams(search.toString());
      router.replace(
        `/teacher/lessons/generating/${encodeURIComponent(nextJobId)}${params.size ? `?${params.toString()}` : ""}`,
      );
    })
      .then(async (result) => {
        if (cancelled) return;
        if (result.generationStatus === "partial_blocked" || result.generationStatus === "partial") {
          setPartial(result);
          return;
        }
        const lessonId = String(result.lessonId || "");
        const taxonomyVersion = Number(result.taxonomyVersion);
        if (!lessonId || !Number.isInteger(taxonomyVersion) || taxonomyVersion < 1) throw new Error("Backend chưa trả đủ lesson ID và taxonomy version để mở review.");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["teacher", "copilot", "draft", lessonId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["teacher", "draft", lessonId, "publish-readiness"],
          }),
        ]);
        replaceStoredLessonGenerationJob(activeJobId);
        router.replace(
          `/teacher/lessons/${encodeURIComponent(lessonId)}/review?taxonomyVersion=${taxonomyVersion}&generationJobId=${encodeURIComponent(activeJobId)}`,
        );
      })
      .catch((generationError) => {
        if (!cancelled) {
          const missingCheckpoint = generationError instanceof Error &&
            (generationError as Error & { code?: string }).code === "GENERATION_REQUEST_MISMATCH";
          if (generationError instanceof Error && generationError.name === "LessonGenerationFailed" && !missingCheckpoint) {
            replaceStoredLessonGenerationJob(activeJobId);
          }
          setRetryableFailure(missingCheckpoint);
          setError(getApiErrorMessage(generationError, generationError instanceof Error ? generationError.message : "Không thể tạo bài học."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeJobId, enqueueError, queryClient, retryNonce, router, search]);

  async function retryMissing() {
    setError("");
    setRetryableFailure(false);
    setPartial(null);
    setDetail(partial?.knowledge ? "Đang tạo các slot còn thiếu" : "Đang tạo lại phần kiến thức và các slot còn thiếu");
    try {
      const queued = await teacherApi.retryMissingLessonSlots(activeJobId);
      replaceStoredLessonGenerationJob(activeJobId, queued.jobId);
      setActiveJobId(queued.jobId);
      const params = new URLSearchParams(search.toString());
      router.replace(
        `/teacher/lessons/generating/${encodeURIComponent(queued.jobId)}${params.size ? `?${params.toString()}` : ""}`,
      );
    } catch (retryError) {
      setRetryableFailure(true);
      setError(getApiErrorMessage(retryError, "Chưa thể tạo tiếp các slot còn thiếu."));
    }
  }

  if (partial) {
    const partialLessonId = String(partial.lessonId || "");
    const partialTaxonomyVersion = Number(partial.taxonomyVersion);
    const masteryRetryExhausted = partial.masteryRetryExhausted === true;
    const hasKnowledge = !!partial.knowledge;
    return (
      <section className="lesson-generation-screen">
        <div className="lesson-generation-panel">
          <WarningCircle size={34} />
          <p className="workspace-kicker">{hasKnowledge && masteryRetryExhausted ? "Phần kiến thức đã được giữ" : "Bản nháp đã được giữ"}</p>
          <h1>{!hasKnowledge ? "Chưa tạo được phần kiến thức" : masteryRetryExhausted ? "Chưa tạo được arc bài tập hoàn chỉnh" : "Còn slot chưa đạt chuẩn"}</h1>
          <p className="lesson-generation-lead">
            {hasKnowledge && masteryRetryExhausted ? "D-Friend đã thử lại phần bài tập 2 lần. " : ""}
            Đã hoàn thành {partial.generationCompletedSlots || 0}
            {typeof partial.generationTotalSlots === "number" ? `/${partial.generationTotalSlots}` : ""} slot nhưng chưa có arc 4/4. {hasKnowledge ? "Thử lại sẽ giữ nguyên kiến thức và chỉ tạo các slot còn thiếu." : "Thử lại sẽ tạo phần kiến thức rồi tiếp tục các slot còn thiếu."}
          </p>
          <div className="lesson-generation-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={!partialLessonId || !Number.isInteger(partialTaxonomyVersion) || partialTaxonomyVersion < 1}
              onClick={() => router.push(`/teacher/lessons/${encodeURIComponent(partialLessonId)}/review?taxonomyVersion=${partialTaxonomyVersion}&generationJobId=${encodeURIComponent(activeJobId)}`)}
            >
              <BookOpenText size={16} /> Review bản hiện tại
            </button>
            {partial.retryAllowed !== false && (
              <button className="primary-button" type="button" onClick={retryMissing}>
                {!hasKnowledge ? "Thử tạo lại kiến thức" : masteryRetryExhausted ? "Thử tạo lại bài tập" : "Tạo tiếp phần còn thiếu"}
              </button>
            )}
          </div>
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
          {retryableFailure && <button className="primary-button" onClick={() => void retryMissing()}>Tạo lại bản nháp</button>}
        </div>
      </section>
    );
  }

  return (
    <LessonGenerationLoading
      origin={search.get("origin") === "wizard" ? "wizard" : "copilot"}
      detail={detail}
      lessonKind={lessonKind}
    />
  );
}
