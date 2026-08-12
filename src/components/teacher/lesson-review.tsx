"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowsClockwise, Check, CheckCircle, CircleNotch, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";
import { buildRegenerationTargets, DraftReviewContent, normalizeDraftReview } from "@/components/teacher/lesson-authoring";

export function LessonReview({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [classIds, setClassIds] = useState<string[] | null>(null);
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<Array<Record<string, unknown>>>([]);
  const [published, setPublished] = useState(false);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);

  const draftQuery = useQuery({ queryKey: ["teacher", "copilot", "draft", lessonId], queryFn: () => teacherApi.copilotDraft(lessonId) });
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
  const draftClassIds = Array.isArray(draft?.class_ids)
    ? draft.class_ids.filter((id): id is string => typeof id === "string")
    : typeof draft?.class_id === "string"
      ? [draft.class_id]
      : [];
  const selectedClassIds = classIds ?? draftClassIds;
  const blueprint = asRecord(draft?.mastery_blueprint ?? draft?.masteryBlueprint);
  const poolDeficitCount = Array.isArray(blueprint?.slots)
    ? blueprint.slots.filter((slot) => !asRecord(slot)?.problem_id).length
    : 0;

  const approve = useMutation({
    mutationFn: () => teacherApi.approveLessonReview(lessonId),
    onSuccess: () => { setError(""); setBlockers([]); void draftQuery.refetch(); },
    onError: (approvalError) => setError(getApiErrorMessage(approvalError)),
  });
  const regenerate = useMutation({
    mutationFn: () => {
      const targets = buildRegenerationTargets(review, rejected);
      if (targets.length !== rejected.size) {
        throw new Error("Một số câu trong bản nháp thiếu mã nguồn để soạn lại an toàn.");
      }
      return teacherApi.regenerateLessonReview(lessonId, targets);
    },
    onSuccess: () => { setRejected(new Set()); setError(""); void draftQuery.refetch(); },
    onError: (regenerationError) => setError(getApiErrorMessage(regenerationError, "Không thể soạn lại các câu đã chọn.")),
  });
  const completePool = useMutation({
    mutationFn: () => teacherApi.completeLessonReviewPool(lessonId),
    onSuccess: () => { setError(""); setBlockers([]); void draftQuery.refetch(); },
    onError: (completionError) => setError(getApiErrorMessage(completionError, "Không thể bù bài còn thiếu.")),
  });
  const publish = useMutation({
    mutationFn: () => followUp ? teacherApi.publishFollowUpDraft(lessonId) : teacherApi.publishCopilotDraft(lessonId, { classIds: selectedClassIds, deadline: new Date(deadline).toISOString(), title: title.trim() }),
    onSuccess: () => setPublished(true),
    onError: (publishError) => {
      const body = (publishError as { response?: { data?: { blockers?: Array<Record<string, unknown>>; message?: string }; message?: string } }).response?.data;
      setBlockers(body?.blockers || []);
      setError(getApiErrorMessage(publishError, "Bản nháp chưa đủ điều kiện xuất bản."));
    },
  });

  if (draftQuery.isLoading) return <div className="lesson-immersive"><div className="review-layout"><div className="skeleton h-28" /><div className="skeleton h-96 mt-5" /></div></div>;
  if (draftQuery.isError) return <div className="lesson-immersive"><div className="center-state"><WarningCircle size={30} /><h1>Không mở được bản nháp</h1><p>{getApiErrorMessage(draftQuery.error)}</p><button className="secondary-button" onClick={() => router.back()}>Quay lại</button></div></div>;
  if (published) return <div className="lesson-immersive"><div className="publish-success"><span><CheckCircle size={32} weight="fill" /></span><h1>Đã xuất bản bài học</h1><p>{followUp ? "Bài tập đã được gửi đúng nhóm học sinh." : "Các lớp đã nhận được bài học mới."}</p><button className="primary-button" onClick={() => router.push(selectedClassIds[0] ? `/teacher/classes/${selectedClassIds[0]}?tab=learning-path` : "/teacher/classes")}>Về lớp học</button></div></div>;

  const publishDisabled = publish.isPending || !approved || poolDeficitCount > 0 || rejected.size > 0 || (!followUp && (selectedClassIds.length === 0 || !title.trim()));

  return (
    <section className="lesson-immersive draft-review-page">
      <header className="draft-review-actionbar">
        <button className="text-button" onClick={() => router.back()}><ArrowLeft size={16} /> Quay lại</button>
        <span className={`review-state ${approved ? "approved" : "draft"}`}><ShieldCheck size={16} /> {approved ? `Đã duyệt · bản ${revision}` : `Bản nháp · bản ${revision}`}</span>
        <div>
          {rejected.size > 0 && <button className="secondary-button" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>{regenerate.isPending ? <CircleNotch className="animate-spin" size={16} /> : <ArrowsClockwise size={16} />} Soạn lại {rejected.size} câu</button>}
          {poolDeficitCount > 0 && <button className="secondary-button" onClick={() => completePool.mutate()} disabled={completePool.isPending}>{completePool.isPending ? <CircleNotch className="animate-spin" size={16} /> : <ArrowsClockwise size={16} />} Bù {poolDeficitCount} bài còn thiếu</button>}
          {!approved && <button className="secondary-button" onClick={() => approve.mutate()} disabled={approve.isPending || poolDeficitCount > 0 || rejected.size > 0}>{approve.isPending ? <CircleNotch className="animate-spin" size={16} /> : <Check size={16} />} Duyệt toàn bộ bản nháp</button>}
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
          <DraftReviewContent review={review} rejected={rejected} onToggle={(id) => setRejected((current) => toggleSet(current, id))} />
        </main>

        <aside className="draft-review-settings">
          {!followUp && <><section><h2>Lớp nhận bài</h2><div className="class-picker vertical">{(classes.data || []).map((item) => <label key={item.class_id}><input type="checkbox" checked={selectedClassIds.includes(item.class_id)} onChange={(event) => setClassIds(event.target.checked ? [...selectedClassIds, item.class_id] : selectedClassIds.filter((id) => id !== item.class_id))} /><span><strong>{item.class_name}</strong><small>{item.student_count} học sinh</small></span></label>)}</div></section><section><h2>Deadline</h2><input className="input" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></section></>}
          <section><h2>Độ phủ</h2><Coverage draft={draft} /></section>
          <BlueprintSummary draft={draft} />
          <section><h2>Nguồn nội dung</h2><p>Kiến thức: {provenanceLabel((draft?.knowledge as Record<string, unknown> | undefined)?.provenance)}</p><p>Bài luyện tập: {provenanceLabel(draft?.mastery_provenance)}</p></section>
          <section><h2>Kiểm soát chất lượng</h2><p>{rejected.size ? `${rejected.size} câu cần được soạn lại trước khi duyệt.` : approved ? "Toàn bộ nội dung ở bản hiện tại đã được duyệt." : "Đánh dấu Cần thay, hoặc duyệt toàn bộ bản nháp."}</p></section>
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

function BlueprintSummary({ draft }: { draft?: Record<string, unknown> }) {
  const blueprint = asRecord(draft?.mastery_blueprint ?? draft?.masteryBlueprint);
  if (!blueprint) return <section><h2>Mastery coverage</h2><p>Chưa có blueprint v2 cho bản nháp này.</p></section>;
  const counts = asRecord(blueprint.origin_counts);
  const skills = Array.isArray(blueprint.coverage_by_skill)
    ? blueprint.coverage_by_skill.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
    : [];
  const guaranteed = blueprint.student_session_guaranteed === true;
  return <section className="mastery-blueprint-summary">
    <h2>Mastery coverage</h2>
    <p>{guaranteed ? "Mỗi học sinh sẽ gặp đủ kỹ năng đã chọn." : "Chưa bảo đảm mỗi học sinh gặp đủ kỹ năng."}</p>
    <dl>
      {skills.map((item) => <div key={String(item.skill_id)}><dt>{readableSkill(String(item.skill_id))}</dt><dd>{Number(item.pool_count || 0)}/{Number(item.required_pool_count || 0)} bài</dd></div>)}
    </dl>
    <p>{Number(counts?.source_exact || 0)} trích nguyên · {Number(counts?.source_converted || 0)} chuyển thành trắc nghiệm · {Number(counts?.source_derived || 0)} biến thể · {Number(counts?.ai_generated || 0)} AI tự soạn</p>
  </section>;
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
function readableSkill(value: string) { return (value.split("#").pop() || value).replace(/[-_]+/g, " "); }
