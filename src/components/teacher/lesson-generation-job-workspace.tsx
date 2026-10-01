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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function LessonGenerationJobWorkspace({ jobId }: { jobId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = useSearchParams();
  const [detail, setDetail] = useState("Đang kiểm tra tiến trình tạo bài");
  const [partial, setPartial] = useState<LessonGenerationResult | null>(null);
  const [sourceStage, setSourceStage] = useState<LessonGenerationResult | null>(null);
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
        if (["waiting_for_extraction", "source_review_required", "source_failed",
          "processing_source", "source_processing"].includes(String(result.generationStatus))) {
          setSourceStage(result);
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
          const failedJob = generationError instanceof Error &&
            generationError.name === "LessonGenerationFailed";
          if (failedJob) {
            replaceStoredLessonGenerationJob(activeJobId);
          }
          setRetryableFailure(failedJob);
          const message = getApiErrorMessage(generationError, generationError instanceof Error ? generationError.message : "Không thể tạo bài học.");
          const code = generationError && typeof generationError === "object" && "code" in generationError && typeof generationError.code === "string"
            ? generationError.code : "";
          setError(code && !message.includes(code) ? `${message} (${code})` : message);
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
    setSourceStage(null);
    setDetail(sourceStage ? "Đang tiếp tục xử lý bài nguồn Marker" : partial?.knowledge ? "Đang tạo các slot còn thiếu" : "Đang tạo lại phần kiến thức và các slot còn thiếu");
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

  if (sourceStage) {
    const status = sourceStage.generationStatus;
    const waiting = status === "waiting_for_extraction";
    const failed = status === "source_failed";
    const processing = status === "processing_source" || status === "source_processing";
    return <section className="lesson-generation-screen"><div className="lesson-generation-panel">
      <WarningCircle size={34} />
      <p className="workspace-kicker">Tài liệu Marker</p>
      <h1>{waiting ? "Đang chờ trích xuất" : failed ? "Chưa xử lý được tài liệu" : processing ? "Nguồn cần xử lý tiếp" : "Cần duyệt bài nguồn"}</h1>
      <p className="lesson-generation-lead">{waiting
        ? "Marker chưa hoàn tất trích xuất. Tiến trình được lưu; hãy tiếp tục sau khi tài liệu sẵn sàng."
        : failed ? "Nguồn đã báo lỗi xử lý. Kiểm tra tài liệu trong Kho tài liệu trước khi thử lại."
          : processing ? "Các batch đã hoàn thành được giữ lại. Tiếp tục để xử lý phần nguồn còn lại."
          : `Đã tìm thấy ${sourceStage.sourceCount ?? "chưa rõ"} bài nguồn; ${sourceStage.verifiedCount ?? "chưa rõ"} bài đã duyệt; ${sourceStage.materializedCount ?? "chưa rõ"} bài đã chuẩn bị và lưu vào kho. Kiểm tra hình, đáp án, chuẩn bị và lưu ít nhất một bài phù hợp trước khi tiếp tục tạo lesson.`}</p>
      <div className="lesson-generation-actions">
        <button type="button" className="secondary-button" onClick={() => router.push("/teacher/documents")}>Mở Kho tài liệu</button>
        <button type="button" className="primary-button" onClick={() => void retryMissing()}>Kiểm tra lại và tiếp tục</button>
      </div>
    </div></section>;
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
            {hasKnowledge && masteryRetryExhausted
              ? partial.masteryRetryStopReason === "no_progress"
                ? "D-Friend đã dừng tự động thử lại vì lượt vừa rồi không hoàn thành thêm slot nào. "
                : "D-Friend đã dừng tự động thử lại phần bài tập. "
              : ""}
            Đã hoàn thành {partial.generationCompletedSlots || 0}
            {typeof partial.generationTotalSlots === "number" ? `/${partial.generationTotalSlots}` : ""} slot nhưng chưa có arc 4/4. {hasKnowledge ? "Thử lại sẽ giữ nguyên kiến thức và chỉ tạo các slot còn thiếu." : "Thử lại sẽ tạo phần kiến thức rồi tiếp tục các slot còn thiếu."}
          </p>
          {Boolean(partial.selectedDocumentIds?.length) && <p className="lesson-generation-lead">{asRecord(partial.sourceSummary)?.countsUpdatedAfterGeneration === true
            ? `Lesson đã dùng ${asRecord(partial.sourceSummary)?.selectedCount ?? 0} bài nguồn đã kiểm tra và ${asRecord(partial.sourceSummary)?.generatedCount ?? 0} bài AI soạn.`
            : "Tài liệu đã được tìm tự động. Hệ thống tiếp tục dùng kho bài và chuẩn bị bài cho các slot còn thiếu."}</p>}
          <div className="lesson-generation-actions">
            {Boolean(partial.selectedDocumentIds?.length) && <button className="secondary-button" type="button" onClick={() => router.push("/teacher/documents")}>Kiểm tra bài nguồn</button>}
            {Number(partial.generationCompletedSlots || 0) > 0 && <button
              className="secondary-button"
              type="button"
              disabled={!partialLessonId || !Number.isInteger(partialTaxonomyVersion) || partialTaxonomyVersion < 1}
              onClick={() => router.push(`/teacher/lessons/${encodeURIComponent(partialLessonId)}/review?taxonomyVersion=${partialTaxonomyVersion}&generationJobId=${encodeURIComponent(activeJobId)}`)}
            >
              <BookOpenText size={16} /> Review bản hiện tại
            </button>}
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
