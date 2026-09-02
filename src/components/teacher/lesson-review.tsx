"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowsClockwise, Check, CheckCircle, CircleNotch, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";
import {
  buildRegenerationTargets,
  DraftProblemList,
  DraftReviewContent,
  normalizeDraftReview,
  type DraftReviewModel,
  type ProblemView,
} from "@/components/teacher/lesson-authoring";

type BlueprintSlot = {
  slot_id: string;
  primary_skill_id: string;
  role: string;
  arc_id?: string | null;
  position?: string | null;
  experience?: string | null;
  problem_id?: string | null;
};

type BlueprintArc = {
  arc_id: string;
  slot_ids?: string[];
};

type BlueprintModel = {
  slots: BlueprintSlot[];
  arcs: BlueprintArc[];
  slotSequence: Array<{ position: string; role: string; experience?: string }>;
};

export function LessonReview({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const generationJobId = searchParams.get("generationJobId") || "";
  const [classIds, setClassIds] = useState<string[] | null>(null);
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<Array<Record<string, unknown>>>([]);
  const [published, setPublished] = useState(false);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);

  const draftQuery = useQuery({
    queryKey: ["teacher", "copilot", "draft", lessonId],
    queryFn: () => teacherApi.copilotDraft(lessonId),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const classes = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  const draft = draftQuery.data;
  const kind = String(draft?.kind || draft?.lesson_kind || "main");
  const followUp = kind === "remedial" || kind === "advanced";
  const review = useMemo(() => normalizeDraftReview(draft), [draft]);
  const suggestedTitle = String(draft?.title || draft?.lesson_title || draft?.lesson_goal_raw || "Bản nháp từ Copilot");
  const title = titleOverride ?? suggestedTitle;
  const goal = String(draft?.lesson_goal_raw || draft?.goal_text || "Review nội dung trước khi xuất bản.");
  const revision = Number(draft?.revision || 1);
  const approved = Number(draft?.approved_revision || 0) === revision;
  const readinessQuery = useQuery({
    queryKey: ["teacher", "draft", lessonId, "publish-readiness", revision, approved],
    queryFn: () => teacherApi.checkLessonPublish(lessonId, revision),
    enabled: Boolean(draft),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const draftClassIds = Array.isArray(draft?.class_ids)
    ? draft.class_ids.filter((id): id is string => typeof id === "string")
    : typeof draft?.class_id === "string"
      ? [draft.class_id]
      : [];
  const selectedClassIds = classIds ?? draftClassIds;
  const blueprint = asRecord(draft?.mastery_blueprint ?? draft?.masteryBlueprint);
  const matrix = useMemo(() => buildBlueprintModel(blueprint), [blueprint]);
  const problemByBankId = useMemo(() => {
    const entries = review.masteryProblems
      .map((problem) => [String(problem.source?.bank_problem_id || ""), problem] as const)
      .filter(([id]) => Boolean(id));
    return new Map(entries);
  }, [review.masteryProblems]);
  const completeArcIds = useMemo(
    () => completeBlueprintArcIds(matrix, problemByBankId),
    [matrix, problemByBankId],
  );
  const notices = useMemo(
    () => normalizeContentNotices(draft?.mastery_notices ?? draft?.masteryNotices),
    [draft],
  );
  const poolDeficitCount = matrix
    ? matrix.slots.filter((slot) => !slot.problem_id || !problemByBankId.has(slot.problem_id)).length
    : 0;
  const hasCompleteArc = matrix ? completeArcIds.length > 0 : poolDeficitCount === 0;
  const contentWithoutMastery: DraftReviewModel = useMemo(
    () => ({ ...review, masteryProblems: matrix ? [] : review.masteryProblems }),
    [matrix, review],
  );
  const hasNonMasteryContent = contentWithoutMastery.knowledgeSections.length > 0 || contentWithoutMastery.knowledgeProblems.length > 0 || contentWithoutMastery.masteryProblems.length > 0;

  const approve = useMutation({
    mutationFn: () => teacherApi.approveLessonReview(lessonId, revision),
    onSuccess: async () => { setError(""); setBlockers([]); await draftQuery.refetch(); },
    onError: async (approvalError) => { setError(getApiErrorMessage(approvalError)); await draftQuery.refetch(); },
  });
  const regenerate = useMutation({
    mutationFn: () => {
      const targets = buildRegenerationTargets(review, rejected);
      if (targets.length !== rejected.size) {
        throw new Error("Một số câu trong bản nháp thiếu mã nguồn để soạn lại an toàn.");
      }
      return teacherApi.regenerateLessonReview(lessonId, targets, revision);
    },
    onSuccess: async () => { setRejected(new Set()); setError(""); await draftQuery.refetch(); },
    onError: async (regenerationError) => { setError(getApiErrorMessage(regenerationError, "Không thể soạn lại các câu đã chọn.")); await draftQuery.refetch(); },
  });
  const completePool = useMutation({
    mutationFn: () => teacherApi.completeLessonReviewPool(lessonId, revision),
    onSuccess: async () => { setError(""); setBlockers([]); await draftQuery.refetch(); },
    onError: async (completionError) => { setError(getApiErrorMessage(completionError, "Không thể bù bài còn thiếu.")); await draftQuery.refetch(); },
  });
  const retryMissing = useMutation({
    mutationFn: () => teacherApi.retryMissingLessonSlots(generationJobId),
    onSuccess: (queued) => router.push(
      `/teacher/lessons/generating/${encodeURIComponent(queued.jobId)}`,
    ),
    onError: (retryError) => setError(
      getApiErrorMessage(retryError, "Chưa thể tạo tiếp các slot còn thiếu."),
    ),
  });
  const publish = useMutation({
    mutationFn: () => followUp ? teacherApi.publishFollowUpDraft(lessonId, revision) : teacherApi.publishCopilotDraft(lessonId, { classIds: selectedClassIds, deadline: new Date(deadline).toISOString(), title: title.trim(), expectedRevision: revision }),
    onSuccess: () => setPublished(true),
    onError: async (publishError) => {
      const body = (publishError as { response?: { data?: { blockers?: Array<Record<string, unknown>>; message?: string }; message?: string } }).response?.data;
      setBlockers(body?.blockers || []);
      setError(getApiErrorMessage(publishError, "Bản nháp chưa đủ điều kiện xuất bản."));
      await draftQuery.refetch();
    },
  });

  if (draftQuery.isLoading) return <div className="lesson-immersive"><div className="review-layout"><div className="skeleton h-28" /><div className="skeleton h-96 mt-5" /></div></div>;
  if (draftQuery.isError) return <div className="lesson-immersive"><div className="center-state"><WarningCircle size={30} /><h1>Không mở được bản nháp</h1><p>{getApiErrorMessage(draftQuery.error)}</p><button className="secondary-button" onClick={() => router.back()}>Quay lại</button></div></div>;
  if (published) return <div className="lesson-immersive"><div className="publish-success"><span><CheckCircle size={32} weight="fill" /></span><h1>Đã xuất bản bài học</h1><p>{followUp ? "Bài tập đã được gửi đúng nhóm học sinh." : "Các lớp đã nhận được bài học mới."}</p><button className="primary-button" onClick={() => router.push(selectedClassIds[0] ? `/teacher/classes/${selectedClassIds[0]}?tab=learning-path` : "/teacher/classes")}>Về lớp học</button></div></div>;

  const reviewMutationPending =
    approve.isPending ||
    regenerate.isPending ||
    completePool.isPending ||
    retryMissing.isPending ||
    publish.isPending;
  const publishDisabled = reviewMutationPending || readinessQuery.isLoading || readinessQuery.data?.publishable !== true || !approved || !hasCompleteArc || rejected.size > 0 || (!followUp && (selectedClassIds.length === 0 || !title.trim()));

  return (
    <section className="lesson-immersive draft-review-page">
      <header className="draft-review-actionbar">
        <button className="text-button" onClick={() => router.back()}><ArrowLeft size={16} /> Quay lại</button>
        <span className={`review-state ${approved ? "approved" : "draft"}`}><ShieldCheck size={16} /> {approved ? `Đã duyệt · bản ${revision}` : `Bản nháp · bản ${revision}`}</span>
        <div>
          {rejected.size > 0 && <button className="secondary-button" onClick={() => regenerate.mutate()} disabled={reviewMutationPending}>{regenerate.isPending ? <CircleNotch className="animate-spin" size={16} /> : <ArrowsClockwise size={16} />} Soạn lại {rejected.size} câu</button>}
          {poolDeficitCount > 0 && <button className="secondary-button" onClick={() => generationJobId ? retryMissing.mutate() : completePool.mutate()} disabled={reviewMutationPending}>{completePool.isPending || retryMissing.isPending ? <CircleNotch className="animate-spin" size={16} /> : <ArrowsClockwise size={16} />} Bù {poolDeficitCount} bài còn thiếu</button>}
          {!approved && <button className="secondary-button" onClick={() => approve.mutate()} disabled={reviewMutationPending || !hasCompleteArc || rejected.size > 0}>{approve.isPending ? <CircleNotch className="animate-spin" size={16} /> : <Check size={16} />} Duyệt arc sẵn sàng</button>}
          <button className="primary-button" disabled={publishDisabled} onClick={() => publish.mutate()}><Check size={16} /> {publish.isPending ? "Đang xuất bản" : "Xuất bản"}</button>
        </div>
      </header>

      <div className="draft-review-shell">
        <nav className="draft-review-toc" aria-label="Mục lục bản nháp">
          <p className="workspace-kicker">Nội dung</p>
          <a href="#session-1-knowledge">Session 1</a>
          <a href="#session-1-checkpoints">Câu kiểm tra <span>{review.knowledgeProblems.length}</span></a>
          <a href="#session-2-mastery">Session 2 <span>{review.masteryProblems.length}</span></a>
        </nav>

        <main className="draft-review-main">
          <header className="draft-review-title">
            <p className="workspace-kicker">{followUp ? kind === "remedial" ? "Bài phụ đạo" : "Bài nâng cao" : "Bản nháp Copilot"}</p>
            {followUp ? <h1>{suggestedTitle}</h1> : <label className="review-title-field"><span>Tên bài học</span><input value={title} onChange={(event) => setTitleOverride(event.target.value)} maxLength={120} placeholder="Nhập tên bài học" /></label>}
            <p>{goal}</p>
          </header>
          {(error || blockers.length > 0) && <div className="publish-blockers"><WarningCircle size={22} /><div><strong>{error}</strong>{blockers.map((item, index) => <p key={index}>{blockerLabel(item)}</p>)}</div></div>}
          {notices.length > 0 && <div className="publish-blockers" role="status"><WarningCircle size={22} /><div><strong>Nguồn bài và fallback</strong>{notices.map((notice, index) => <p key={`${notice.code}:${index}`}><b>{noticeLabel(notice.code)}</b>: {notice.detail || "Hãy kiểm tra các bài được đánh dấu trước khi xuất bản."}{notice.slotIds.length ? ` (${notice.slotIds.length} slot)` : ""}</p>)}</div></div>}
          {completePool.data?.failed_slots?.length ? <div className="publish-blockers"><WarningCircle size={22} /><div><strong>Một số slot chưa bù được</strong>{completePool.data.failed_slots.map((slot) => <p key={slot.slot_id}>{slot.slot_id}: {slot.reason}</p>)}</div></div> : null}
          {hasNonMasteryContent || !matrix ? <DraftReviewContent review={contentWithoutMastery} rejected={rejected} onToggle={(id) => setRejected((current) => toggleSet(current, id))} /> : null}
          {matrix ? <MasteryArcMatrix matrix={matrix} problems={problemByBankId} completeArcIds={completeArcIds} rejected={rejected} onToggle={(id) => setRejected((current) => toggleSet(current, id))} kind={kind} /> : null}
        </main>

        <aside className="draft-review-settings">
          {!followUp && <><section><h2>Lớp nhận bài</h2><div className="class-picker vertical">{(classes.data || []).map((item) => <label key={item.class_id}><input type="checkbox" checked={selectedClassIds.includes(item.class_id)} onChange={(event) => setClassIds(event.target.checked ? [...selectedClassIds, item.class_id] : selectedClassIds.filter((id) => id !== item.class_id))} /><span><strong>{item.class_name}</strong><small>{item.student_count} học sinh</small></span></label>)}</div></section><section><h2>Deadline</h2><input className="input" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></section></>}
          <section><h2>Độ phủ</h2><Coverage draft={draft} /></section>
          <BlueprintSummary draft={draft} completeArcCount={completeArcIds.length} missingSlotCount={poolDeficitCount} />
          <section><h2>Nguồn nội dung</h2><p>Kiến thức: {provenanceLabel((draft?.knowledge as Record<string, unknown> | undefined)?.provenance)}</p><p>Bài luyện tập: {provenanceLabel(draft?.mastery_provenance)}</p></section>
          <section><h2>Kiểm soát chất lượng</h2><p>{rejected.size ? `${rejected.size} câu cần được soạn lại trước khi duyệt.` : approved ? readinessQuery.data?.publishable ? `${readinessQuery.data.publishable_arc_ids.length} arc đã qua gate xuất bản.` : "Bản nháp đã duyệt nhưng publish gate vẫn còn blocker." : "Đánh dấu Cần thay, hoặc duyệt toàn bộ bản nháp."}</p></section>
          <small>ID bản nháp: {lessonId}</small>
        </aside>
      </div>
    </section>
  );
}

function Coverage({ draft }: { draft?: Record<string, unknown> }) {
  const coverage = draft?.coverage as Record<string, unknown> | undefined;
  const percent = typeof coverage?.coverage === "number" ? Math.round(coverage.coverage * 100) : null;
  const missing = Array.isArray(coverage?.missing_skill_ids) ? coverage.missing_skill_ids.length : 0;
  return <><strong className="coverage-value">{percent === null ? "—" : `${percent}%`}</strong><p>{missing ? `${missing} kỹ năng còn thiếu nguồn bài.` : "Đã phủ các kỹ năng trong mục tiêu."}</p></>;
}

function MasteryArcMatrix({
  matrix,
  problems,
  completeArcIds,
  rejected,
  onToggle,
  kind,
}: {
  matrix: BlueprintModel;
  problems: Map<string, ProblemView>;
  completeArcIds: string[];
  rejected: Set<string>;
  onToggle: (id: string) => void;
  kind: string;
}) {
  return (
    <section id="session-2-mastery" className="draft-review-section mastery-arc-review">
      <header>
        <div>
          <span>Session 2</span>
          <h2>Ma trận mastery P1-P4</h2>
        </div>
        <small>{completeArcIds.length} arc sẵn sàng</small>
      </header>
      <div className="mastery-arc-grid">
        {matrix.arcs.map((arc, index) => {
          const arcSlots = matrix.slotSequence.map((expected) =>
            matrix.slots.find(
              (slot) => slot.arc_id === arc.arc_id && slot.position === expected.position,
            ),
          );
          const complete = completeArcIds.includes(arc.arc_id);
          return (
            <article key={arc.arc_id} className="mastery-arc-card" data-complete={complete}>
              <header>
                <div>
                  <span>Arc {index + 1}</span>
                  <h3>{complete ? "Sẵn sàng xuất bản" : "Còn thiếu slot"}</h3>
                </div>
                <b>{arcSlots.filter((slot) => slot?.problem_id && problems.has(slot.problem_id)).length}/4</b>
              </header>
              <div className="mastery-slot-grid">
                {arcSlots.map((slot, slotIndex) => {
                  const position = slot?.position || matrix.slotSequence[slotIndex]?.position || `P${slotIndex + 1}`;
                  const problem = slot?.problem_id ? problems.get(slot.problem_id) : undefined;
                  return (
                    <div key={slot?.slot_id || `${arc.arc_id}:${position}`} className="mastery-slot-card" data-missing={!problem}>
                      <div className="mastery-slot-head">
                        <span>{position}</span>
                        <div>
                          <strong>{slotLabel(kind, position, slot?.role || matrix.slotSequence[slotIndex]?.role)}</strong>
                          <small>{readableSkill(slot?.primary_skill_id || "")}</small>
                        </div>
                      </div>
                      {problem ? (
                        <DraftProblemList problems={[problem]} rejected={rejected} onToggle={onToggle} />
                      ) : (
                        <div className="mastery-slot-empty">
                          <WarningCircle size={18} />
                          <span>Chưa có bài cho slot này</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BlueprintSummary({ draft, completeArcCount, missingSlotCount }: { draft?: Record<string, unknown>; completeArcCount: number; missingSlotCount: number }) {
  const blueprint = asRecord(draft?.mastery_blueprint ?? draft?.masteryBlueprint);
  if (!blueprint) return <section><h2>Mastery coverage</h2><p>Chưa có blueprint v2 cho bản nháp này.</p></section>;
  const counts = asRecord(blueprint.origin_counts);
  const skills = Array.isArray(blueprint.coverage_by_skill)
    ? blueprint.coverage_by_skill.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
    : [];
  const guaranteed = completeArcCount > 0 || blueprint.student_session_guaranteed === true;
  return <section className="mastery-blueprint-summary">
    <h2>Mastery coverage</h2>
    <p>{guaranteed ? `${completeArcCount} arc P1-P4 đã sẵn sàng cho học sinh.` : "Chưa có arc P1-P4 hoàn chỉnh để bắt đầu."}</p>
    {missingSlotCount > 0 && <p>{missingSlotCount} slot còn thiếu, hiển thị như notice.</p>}
    <dl>
      {skills.map((item) => <div key={String(item.skill_id)}><dt>{readableSkill(String(item.skill_id))}</dt><dd>{Number(item.pool_count || 0)}/{Number(item.required_pool_count || 0)} bài</dd></div>)}
    </dl>
    <p>{Number(counts?.source_exact || 0)} trích nguyên · {Number(counts?.source_converted || 0)} chuyển thành trắc nghiệm · {Number(counts?.source_derived || 0)} biến thể · {Number(counts?.ai_generated || 0)} AI tự soạn</p>
  </section>;
}

function buildBlueprintModel(value: Record<string, unknown> | null): BlueprintModel | null {
  if (!value || !Array.isArray(value.slots)) return null;
  const slots = value.slots.filter(isRecord).map((slot) => ({
    slot_id: String(slot.slot_id || ""),
    primary_skill_id: String(slot.primary_skill_id || ""),
    role: String(slot.role || ""),
    arc_id: typeof slot.arc_id === "string" ? slot.arc_id : null,
    position: typeof slot.position === "string" ? slot.position : inferPosition(String(slot.slot_id || "")),
    experience: typeof slot.experience === "string" ? slot.experience : null,
    problem_id: typeof slot.problem_id === "string" ? slot.problem_id : null,
  })).filter((slot) => slot.slot_id);
  const arcIds = Array.from(new Set(slots.map((slot) => slot.arc_id).filter((id): id is string => Boolean(id))));
  const arcs = Array.isArray(value.arcs)
    ? value.arcs.filter(isRecord).map((arc) => ({
      arc_id: String(arc.arc_id || ""),
      slot_ids: Array.isArray(arc.slot_ids) ? arc.slot_ids.map(String) : [],
    })).filter((arc) => arc.arc_id)
    : arcIds.map((arc_id) => ({ arc_id }));
  const slotSequence = Array.isArray(value.slot_sequence)
    ? value.slot_sequence.filter(isRecord).map((slot, index) => ({
      position: String(slot.position || `P${index + 1}`),
      role: String(slot.role || ""),
      experience: typeof slot.experience === "string" ? slot.experience : undefined,
    }))
    : ["P1", "P2", "P3", "P4"].map((position) => {
      const sample = slots.find((slot) => slot.position === position);
      return { position, role: sample?.role || "" };
    });
  return { slots, arcs, slotSequence: slotSequence.slice(0, 4) };
}

function completeBlueprintArcIds(matrix: BlueprintModel | null, problems: Map<string, ProblemView>) {
  if (!matrix) return [];
  return matrix.arcs
    .filter((arc) => matrix.slotSequence.every((expected) => {
      const slot = matrix.slots.find((item) => item.arc_id === arc.arc_id && item.position === expected.position);
      return Boolean(slot?.problem_id && problems.has(slot.problem_id));
    }))
    .map((arc) => arc.arc_id);
}

function normalizeContentNotices(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    code: String(item.code || "content_notice"),
    detail: typeof item.detail === "string" ? item.detail : "",
    slotIds: Array.isArray(item.slot_ids) ? item.slot_ids.filter((id): id is string => typeof id === "string") : [],
  }));
}

function noticeLabel(code: string) {
  if (code === "ai_fallback_used" || code === "pool_completed_by_generation") return "AI đã lấp phần tài liệu còn thiếu";
  if (code === "source_extraction_failed") return "Không đọc được một tài liệu nguồn";
  if (code === "source_not_usable_for_slots") return "Tài liệu không tạo được bài đạt chuẩn";
  if (code === "composed_from_source_structure") return "Biến thể dựa trên cấu trúc tài liệu";
  if (code === "source_images_dropped") return "Công thức trong ảnh có thể bị bỏ sót";
  if (code === "mastery_slots_missing") return "Ma trận còn thiếu slot";
  return "Lưu ý nguồn nội dung";
}

function inferPosition(slotId: string) {
  const match = slotId.match(/:(P[1-4]):/);
  return match?.[1] || null;
}

function slotLabel(kind: string, position: string, role?: string) {
  if (kind === "remedial") {
    if (position === "P1") return "Sửa nền";
    if (position === "P2") return "Lặp nhẹ";
    if (position === "P3") return "Gỡ hiểu nhầm";
    if (position === "P4") return "Thử thách nhỏ";
  }
  if (kind === "advanced") {
    if (position === "P1") return "Challenge 1";
    if (position === "P2") return "Challenge 2";
    if (position === "P3") return "The Break";
    if (position === "P4") return "The Build";
  }
  if (position === "P1") return "The Warm-Up";
  if (position === "P2") return "The Push";
  if (position === "P3") return "The Break";
  if (position === "P4") return "The Build";
  return role || "Mastery";
}

function provenanceLabel(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const origin = String(record?.origin || "");
  if (origin === "sourced") return "Từ tài liệu";
  if (origin === "hybrid") return "Kết hợp tài liệu + AI";
  if (origin === "generated") return "AI soạn, cần giáo viên duyệt";
  return "Chưa có thông tin";
}

function blockerLabel(item: Record<string, unknown>) {
  const code = String(item.code || "");
  if (code === "draft_not_approved") return "Cần duyệt toàn bộ bản nháp trước khi xuất bản.";
  if (code === "unapproved_ai_problems") return "Còn bài AI soạn chưa được duyệt.";
  if (code === "session_coverage_not_guaranteed") return "Chưa bảo đảm mỗi học sinh được đánh giá đủ các kỹ năng đã chọn.";
  return String(item.message || item.detail || code || "Cần chỉnh sửa bản nháp.");
}

function toggleSet(current: Set<string>, id: string) { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }
function defaultDeadline() { const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); date.setMinutes(0, 0, 0); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(asRecord(value)); }
function readableSkill(value: string) { return (value.split("#").pop() || value).replace(/[-_]+/g, " "); }
