"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCircle, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";
import { DraftProblemList, normalizeProblems } from "@/components/teacher/lesson-authoring";

export function LessonReview({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [classIds, setClassIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<Array<Record<string, unknown>>>([]);
  const [published, setPublished] = useState(false);

  const draftQuery = useQuery({ queryKey: ["teacher", "copilot", "draft", lessonId], queryFn: () => teacherApi.copilotDraft(lessonId) });
  const classes = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  const draft = draftQuery.data;
  const kind = String(draft?.kind || draft?.lesson_kind || "main");
  const followUp = kind === "remedial" || kind === "advanced";
  const problems = useMemo(() => normalizeProblems(findProblems(draft)), [draft]);
  const title = String(draft?.title || draft?.lesson_title || "Bản nháp từ Copilot");
  const goal = String(draft?.lesson_goal_raw || draft?.goal_text || draft?.goal || "Review nội dung trước khi xuất bản.");

  const approveGenerated = useMutation({ mutationFn: () => teacherApi.approveGenerated(lessonId), onSuccess: () => draftQuery.refetch(), onError: (approvalError) => setError(getApiErrorMessage(approvalError)) });
  const publish = useMutation({
    mutationFn: () => followUp ? teacherApi.publishFollowUpDraft(lessonId) : teacherApi.publishCopilotDraft(lessonId, { classIds, deadline: new Date(deadline).toISOString(), title }),
    onSuccess: () => setPublished(true),
    onError: (publishError) => {
      const body = (publishError as { response?: { data?: { blockers?: Array<Record<string, unknown>> } } }).response?.data;
      setBlockers(body?.blockers || []);
      setError(getApiErrorMessage(publishError, "Bản nháp chưa đủ điều kiện xuất bản."));
    },
  });

  if (draftQuery.isLoading) return <div className="lesson-immersive"><div className="review-layout"><div className="skeleton h-28" /><div className="skeleton h-96 mt-5" /></div></div>;
  if (draftQuery.isError) return <div className="lesson-immersive"><div className="center-state"><WarningCircle size={30} /><h1>Không mở được bản nháp</h1><p>{getApiErrorMessage(draftQuery.error)}</p><button className="secondary-button" onClick={() => router.back()}>Quay lại</button></div></div>;
  if (published) return <div className="lesson-immersive"><div className="publish-success"><span><CheckCircle size={32} weight="fill" /></span><h1>Đã xuất bản bài học</h1><p>{followUp ? "Bài tập đã được gửi đúng nhóm học sinh." : "Các lớp đã nhận được bài học mới."}</p><button className="primary-button" onClick={() => router.push(classIds[0] ? `/teacher/classes/${classIds[0]}?tab=learning-path` : "/teacher/classes")}>Về lớp học</button></div></div>;

  return (
    <section className="lesson-immersive">
      <header className="lesson-immersive-header"><button className="text-button" onClick={() => router.back()}><ArrowLeft size={16} /> Quay lại</button><div className="review-safe"><ShieldCheck size={16} /> Chưa xuất bản</div><span /></header>
      <div className="review-layout">
        <header className="review-heading"><div><p className="workspace-kicker">{followUp ? kind === "remedial" ? "Bài phụ đạo" : "Bài nâng cao" : "Bản nháp Copilot"}</p><h1>{title}</h1><p>{goal}</p></div><div>{hasUnapprovedGenerated(draft) && <button className="secondary-button" onClick={() => approveGenerated.mutate()} disabled={approveGenerated.isPending}><Check size={16} /> Duyệt bài AI soạn</button>}<button className="primary-button" disabled={publish.isPending || rejected.size > 0 || (!followUp && classIds.length === 0)} onClick={() => publish.mutate()}><Check size={16} /> {publish.isPending ? "Đang xuất bản" : "Xuất bản"}</button></div></header>
        {(error || blockers.length > 0) && <div className="publish-blockers"><WarningCircle size={22} /><div><strong>{error}</strong>{blockers.map((item, index) => <p key={index}>{String(item.message || item.detail || item.code || "Cần chỉnh sửa bản nháp.")}</p>)}</div></div>}
        <div className="review-grid"><main><DraftProblemList problems={problems} rejected={rejected} onToggle={(id) => setRejected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} /></main><aside>{followUp ? <section><h2>Nhóm nhận bài</h2><p>Bài này chỉ gửi cho nhóm học sinh Copilot đã chọn từ báo cáo. Không thể chuyển sang cả lớp.</p></section> : <><section><h2>Lớp nhận bài</h2><div className="class-picker vertical">{(classes.data || []).map((item) => <label key={item.class_id}><input type="checkbox" checked={classIds.includes(item.class_id)} onChange={(event) => setClassIds((current) => event.target.checked ? [...current, item.class_id] : current.filter((id) => id !== item.class_id))} /><span><strong>{item.class_name}</strong><small>{item.student_count} học sinh</small></span></label>)}</div></section><section><h2>Deadline</h2><input className="input" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></section></>}<section><h2>Kiểm soát chất lượng</h2><p>{rejected.size ? `${rejected.size} bài đang được đánh dấu cần thay.` : "Bạn đã xem toàn bộ danh sách và chưa đánh dấu bài cần thay."}</p></section><small>ID bản nháp: {lessonId}</small></aside></div>
      </div>
    </section>
  );
}

function findProblems(draft: Record<string, unknown> | undefined) {
  if (!draft) return [];
  if (Array.isArray(draft.problems)) return draft.problems;
  if (Array.isArray(draft.problem_list)) return draft.problem_list;
  const mastery = draft.mastery;
  if (mastery && typeof mastery === "object" && Array.isArray((mastery as Record<string, unknown>).problems)) return (mastery as Record<string, unknown>).problems;
  return [];
}

function hasUnapprovedGenerated(draft: Record<string, unknown> | undefined) {
  if (!draft) return false;
  if (draft.has_unapproved_ai_problems === true) return true;
  const blockers = draft.publish_blockers;
  return Array.isArray(blockers) && blockers.some((item) => String((item as Record<string, unknown>)?.code || item).includes("unapproved"));
}

function defaultDeadline() { const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); date.setMinutes(0, 0, 0); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
