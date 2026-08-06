"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  CircleNotch,
  FileArrowUp,
  Lightbulb,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MathContent } from "@/components/shared/math-content";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";

export interface ProblemView {
  id: string;
  prompt: string;
  role?: string;
  skill?: string;
  choices?: string[];
  answer?: string;
  solution?: string;
  source?: Record<string, unknown>;
}

export interface KnowledgeSectionView {
  id: string;
  title: string;
  content: string;
}

export interface DraftReviewModel {
  knowledgeSections: KnowledgeSectionView[];
  knowledgeProblems: ProblemView[];
  masteryProblems: ProblemView[];
}

const emptyDraftReview: DraftReviewModel = { knowledgeSections: [], knowledgeProblems: [], masteryProblems: [] };

type AuthoringPhase = "goal" | "precheck" | "generating" | "review" | "publishing" | "published";

export function LessonAuthoring() {
  const router = useRouter();
  const search = useSearchParams();
  const [phase, setPhase] = useState<AuthoringPhase>("goal");
  const [generationStep, setGenerationStep] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lessonGoal, setLessonGoal] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [concept, setConcept] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [file, setFile] = useState<File | null>(null);
  const [draftExerciseId, setDraftExerciseId] = useState("");
  const [aiLessonId, setAiLessonId] = useState("");
  const [problems, setProblems] = useState<ProblemView[]>([]);
  const [draftReview, setDraftReview] = useState<DraftReviewModel>(emptyDraftReview);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [coverage, setCoverage] = useState<Record<string, unknown> | null>(null);
  const [notices, setNotices] = useState<Array<Record<string, unknown>>>([]);
  const [precheckData, setPrecheckData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<Array<Record<string, unknown>>>([]);
  const [approved, setApproved] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const reportId = search.get("fromReport");
  const appliedReportId = useRef<string | null>(null);

  const classes = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  const curriculum = useQuery({ queryKey: ["curriculum"], queryFn: teacherApi.curriculum, staleTime: Infinity });
  const reportPrefill = useQuery({
    queryKey: ["teacher", "copilot", reportId, "report"],
    queryFn: () => teacherApi.report(reportId as string),
    enabled: Boolean(reportId),
  });
  const approveDraft = useMutation({
    mutationFn: () => teacherApi.approveLessonReview(aiLessonId),
    onSuccess: () => { setApproved(true); setError(""); setBlockers([]); },
    onError: (approvalError) => setError(getApiErrorMessage(approvalError, "Không thể duyệt bản nháp.")),
  });
  const regenerateDraft = useMutation({
    mutationFn: () => {
      const targets = buildRegenerationTargets(draftReview, rejected);
      if (targets.length !== rejected.size) {
        throw new Error("Một số câu trong bản nháp thiếu mã nguồn để soạn lại an toàn.");
      }
      return teacherApi.regenerateLessonReview(aiLessonId, targets);
    },
    onSuccess: (updated) => {
      const nextReview = normalizeDraftReview(updated);
      setDraftReview(nextReview);
      setProblems([...nextReview.knowledgeProblems, ...nextReview.masteryProblems]);
      setCoverage(asRecord(updated.coverage));
      setNotices(Array.isArray(updated.mastery_notices) ? updated.mastery_notices.filter(isRecord) : []);
      setRejected(new Set());
      setApproved(false);
      setError("");
      setBlockers([]);
    },
    onError: (regenerationError) => setError(getApiErrorMessage(regenerationError, "Không thể soạn lại các câu đã chọn.")),
  });

  const topics = useMemo(() => curriculum.data?.find((item) => item.value === subject)?.topics || [], [curriculum.data, subject]);
  const concepts = useMemo(() => topics.find((item) => item.value === topic)?.concepts || [], [topics, topic]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // A report-driven follow-up is always a new lesson. Restoring the last
      // wizard draft here could silently update or publish an unrelated lesson.
      if (reportId) {
        setStorageReady(true);
        return;
      }
      try {
        const raw = window.localStorage.getItem("teacher:lesson-draft-form:v1");
        if (raw) {
          const saved = JSON.parse(raw) as Record<string, unknown>;
          setTitle(String(saved.title || ""));
          setDescription(String(saved.description || ""));
          setLessonGoal(String(saved.lessonGoal || ""));
          setSubject(String(saved.subject || ""));
          setTopic(String(saved.topic || ""));
          setConcept(String(saved.concept || ""));
          setClassIds(Array.isArray(saved.classIds) ? saved.classIds.map(String) : []);
          if (saved.deadline) setDeadline(String(saved.deadline));
          if (saved.draftExerciseId) setDraftExerciseId(String(saved.draftExerciseId));
        }
      } catch {
        window.localStorage.removeItem("teacher:lesson-draft-form:v1");
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reportId]);

  useEffect(() => {
    if (!reportPrefill.data || !reportId || appliedReportId.current === reportId) return;
    appliedReportId.current = reportId;
    const data = reportPrefill.data;
    const weakSkills = uniqueStrings([
      ...(data.report?.top_weak_skill_ids || []),
      ...(data.report?.gaps || []),
    ]).slice(0, 4);
    const weakSkillText = weakSkills.length
      ? weakSkills.map(readableSkill).join(", ")
      : "các kỹ năng lớp còn yếu trong báo cáo";
    setPhase("goal");
    setDescription("");
    setFile(null);
    setDraftExerciseId("");
    setAiLessonId("");
    setProblems([]);
    setDraftReview(emptyDraftReview);
    setRejected(new Set());
    setCoverage(null);
    setNotices([]);
    setPrecheckData(null);
    setError("");
    setBlockers([]);
    setApproved(false);
    setSubject(data.subject || "");
    setTopic(data.topic || "");
    setConcept(data.concept || "");
    setClassIds(data.classIds || []);
    setTitle(`Bài tiếp theo: ${data.title || "báo cáo gần nhất"}`);
    setLessonGoal(
      `Sau bài này, học sinh củng cố được ${weakSkillText}. ` +
        `Ưu tiên sửa đúng các lỗi được phát hiện sau bài “${data.title || "gần nhất"}”.`,
    );
  }, [reportId, reportPrefill.data]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      "teacher:lesson-draft-form:v1",
      JSON.stringify({ title, description, lessonGoal, subject, topic, concept, classIds, deadline, draftExerciseId }),
    );
  }, [storageReady, title, description, lessonGoal, subject, topic, concept, classIds, deadline, draftExerciseId]);

  async function begin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBlockers([]);
    if (!title.trim() || !lessonGoal.trim() || !subject || !topic || !concept || !classIds.length) {
      setError("Điền đủ mục tiêu, taxonomy và chọn ít nhất một lớp.");
      return;
    }
    setPhase("precheck");
    try {
      const result = await teacherApi.precheckLesson({ title: title.trim(), lessonGoal: lessonGoal.trim(), subject, topic, concept });
      const verdict = String(result.verdict || result.status || "");
      if (verdict === "no_material") {
        setPrecheckData(result);
        return;
      }
      await generate(false);
    } catch (precheckError) {
      // Precheck is the hard spending/quality gate. A network or auth failure is not
      // evidence that material exists, so do not fall through into two LLM calls.
      setError(getApiErrorMessage(precheckError, "Chưa kiểm tra được nguồn bài. Vui lòng thử lại trước khi tạo."));
      setPhase("goal");
    }
  }

  async function generate(allowGenerated: boolean) {
    setPrecheckData(null);
    setPhase("generating");
    setError("");
    try {
      setGenerationStep("Đang phân tích mục tiêu và tìm tài liệu phù hợp");
      const form1 = new FormData();
      if (file) form1.append("file", file);
      form1.append("title", title.trim());
      form1.append("description", description.trim());
      form1.append("lessonGoal", lessonGoal.trim());
      form1.append("subject", subject);
      form1.append("topic", topic);
      form1.append("concept", concept);
      form1.append("classIds", JSON.stringify(classIds));
      if (draftExerciseId) form1.append("lessonId", draftExerciseId);
      if (allowGenerated) form1.append("allowGenerated", "true");
      const lesson1 = await teacherApi.generateLesson1(form1);
      const nextDraftId = String(lesson1.draftExerciseId || "");
      setDraftExerciseId(nextDraftId);
      setAiLessonId(String(lesson1.lessonId || ""));
      setCoverage(asRecord(lesson1.coverage));
      setNotices(Array.isArray(lesson1.masteryNotices) ? lesson1.masteryNotices.filter(isRecord) : []);

      setGenerationStep("Đang hoàn thiện bộ bài tập và gắn vào lớp");
      const form2 = new FormData();
      form2.append("draftExerciseId", nextDraftId);
      form2.append("classIds", JSON.stringify(classIds));
      const lesson2 = await teacherApi.generateLesson2(form2);
      const mastery = { ...(asRecord(lesson1.mastery) || {}), problems: lesson2.problems };
      const nextReview = normalizeDraftReview({ knowledge: lesson1.knowledge, problems: lesson1.problems, mastery });
      setDraftReview(nextReview);
      setProblems([...nextReview.knowledgeProblems, ...nextReview.masteryProblems]);
      setRejected(new Set());
      setApproved(false);
      setPhase("review");
    } catch (generationError) {
      setError(getApiErrorMessage(generationError, "Không thể tạo bài học. Bản nháp đã được giữ lại để thử tiếp."));
      setPhase("goal");
    }
  }

  async function publish() {
    if (rejected.size) {
      setError("Bạn đã đánh dấu bài cần thay. Tạo lại bộ bài trước khi xuất bản.");
      return;
    }
    if (!approved) {
      setError("Cần duyệt toàn bộ bản nháp trước khi xuất bản.");
      return;
    }
    setPhase("publishing");
    setError("");
    setBlockers([]);
    try {
      await teacherApi.publishWizardDraft(draftExerciseId, { classIds, deadline: new Date(deadline).toISOString() });
      setPhase("published");
      window.localStorage.removeItem("teacher:lesson-draft-form:v1");
    } catch (publishError) {
      const body = (publishError as { response?: { data?: { blockers?: Array<Record<string, unknown>> } } }).response?.data;
      setBlockers(body?.blockers || []);
      setError(getApiErrorMessage(publishError, "Bài học chưa đủ điều kiện xuất bản."));
      setPhase("review");
    }
  }

  if (phase === "published") {
    return <div className="lesson-immersive"><div className="publish-success"><span><CheckCircle size={32} weight="fill" /></span><h1>Đã xuất bản bài học</h1><p>Học sinh trong lớp đã nhận được bài và deadline.</p><button className="primary-button" onClick={() => router.push(`/teacher/classes/${classIds[0]}?tab=learning-path`)}>Về lộ trình lớp</button></div></div>;
  }

  return (
    <section className="lesson-immersive">
      <header className="lesson-immersive-header">
        <button className="text-button" onClick={() => router.back()}><ArrowLeft size={16} /> Quay lại</button>
        <div className="authoring-steps"><span data-active={phase === "goal" || phase === "precheck"}>Mục tiêu</span><span data-active={phase === "generating"}>Tạo bài</span><span data-active={phase === "review" || phase === "publishing"}>Review</span></div>
        <span className="autosave-status"><Check size={14} /> Đã tự lưu</span>
      </header>

      {(phase === "goal" || phase === "precheck") && (
        <form className="authoring-layout" onSubmit={begin}>
          <div className="authoring-copy"><p className="workspace-kicker">{reportId ? "Bài tiếp theo từ báo cáo" : "Bài học mới"}</p><h1>{reportId ? "Biến khoảng trống vừa thấy thành bước học tiếp theo." : "Bắt đầu từ điều học sinh cần làm được."}</h1><p>{reportId ? "Copilot đã điền taxonomy, lớp và các kỹ năng yếu từ báo cáo. Bạn vẫn là người chỉnh mục tiêu trước khi tạo." : "Copilot dùng mục tiêu của bạn để chọn đúng kỹ năng và tìm bài trong kho trước khi tự soạn."}</p><div className="authoring-principle"><ShieldCheck size={20} /><span><strong>Giáo viên giữ quyền quyết định</strong><small>Không có nội dung nào tới học sinh trước khi bạn review và xuất bản.</small></span></div></div>
          <div className="authoring-form">
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="form-field"><label htmlFor="lesson-title">Tên bài học</label><input id="lesson-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Thu gọn đơn thức" required /></div>
            <div className="form-field"><label htmlFor="lesson-goal">Mục tiêu bài học</label><textarea id="lesson-goal" className="textarea" maxLength={1000} value={lessonGoal} onChange={(event) => setLessonGoal(event.target.value)} placeholder="Sau buổi học, học sinh nhận biết được đơn thức, xác định hệ số và thu gọn đơn thức..." required /><small>{lessonGoal.length}/1000 ký tự. Viết bằng ngôn ngữ bạn thường dùng.</small></div>
            <div className="taxonomy-grid"><div className="form-field"><label htmlFor="lesson-subject">Môn học</label><select id="lesson-subject" className="select" value={subject} onChange={(event) => { setSubject(event.target.value); setTopic(""); setConcept(""); }}><option value="">Chọn môn</option>{(curriculum.data || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div className="form-field"><label htmlFor="lesson-topic">Chủ đề</label><select id="lesson-topic" className="select" value={topic} disabled={!subject} onChange={(event) => { setTopic(event.target.value); setConcept(""); }}><option value="">Chọn chủ đề</option>{topics.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div className="form-field"><label htmlFor="lesson-concept">Khái niệm</label><select id="lesson-concept" className="select" value={concept} disabled={!topic} onChange={(event) => setConcept(event.target.value)}><option value="">Chọn khái niệm</option>{concepts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></div>
            <div className="form-field"><label>Lớp nhận bài</label><div className="class-picker">{(classes.data || []).map((item) => <label key={item.class_id}><input type="checkbox" checked={classIds.includes(item.class_id)} onChange={(event) => setClassIds((current) => event.target.checked ? [...current, item.class_id] : current.filter((id) => id !== item.class_id))} /><span><strong>{item.class_name}</strong><small>{item.student_count} học sinh</small></span></label>)}</div></div>
            <div className="form-row"><div className="form-field"><label htmlFor="lesson-deadline">Deadline</label><input id="lesson-deadline" className="input" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></div><div className="form-field"><label htmlFor="lesson-file">Tài liệu riêng cho bài này</label><label className="file-input"><FileArrowUp size={17} /><span>{file?.name || "Chọn tệp không bắt buộc"}</span><input id="lesson-file" type="file" accept=".pdf,.docx,.md,.txt" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></div></div>
            <div className="form-field"><label htmlFor="lesson-description">Ghi chú</label><textarea id="lesson-description" className="textarea !min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Cách tổ chức lớp hoặc điều cần tránh" /></div>
            <button className="primary-button authoring-submit" type="submit" disabled={phase === "precheck"}><Sparkle size={17} weight="fill" /> {phase === "precheck" ? "Đang kiểm tra nguồn bài" : "Kiểm tra và tạo bài"}<ArrowRight size={16} /></button>
          </div>
        </form>
      )}

      {precheckData && (
        <div className="precheck-gate"><WarningCircle size={27} /><h2>Kho bài chưa phủ đủ mục tiêu</h2><p>Copilot đã tìm trong kho nhưng còn thiếu kỹ năng. Bạn có thể quay lại tải tài liệu, hoặc cho phép AI soạn phần còn thiếu rồi review kỹ trước khi dùng.</p><MissingSkills data={precheckData} /><div><button className="secondary-button" onClick={() => { setPrecheckData(null); setPhase("goal"); }}>Quay lại</button><button className="primary-button" onClick={() => void generate(true)}>Cho phép AI soạn phần thiếu</button></div></div>
      )}

      {phase === "generating" && <GeneratingLesson step={generationStep} />}

      {(phase === "review" || phase === "publishing") && (
        <div className="review-layout">
          <header className="review-heading"><div><p className="workspace-kicker">{approved ? "Đã duyệt" : "Bản nháp"}</p><h1>{title}</h1><p>{problems.length} bài tập đã được chọn theo mục tiêu và taxonomy.</p></div><div><button className="secondary-button" onClick={() => { setApproved(false); setPhase("goal"); }}>Sửa mục tiêu</button>{!approved && <button className="secondary-button" disabled={approveDraft.isPending || rejected.size > 0 || !aiLessonId} onClick={() => approveDraft.mutate()}>{approveDraft.isPending ? <CircleNotch className="animate-spin" size={16} /> : <Check size={16} />} Duyệt toàn bộ bản nháp</button>}<button className="primary-button" disabled={phase === "publishing" || rejected.size > 0 || !approved} onClick={() => void publish()}>{phase === "publishing" ? <CircleNotch className="animate-spin" size={16} /> : <Check size={16} />} {phase === "publishing" ? "Đang xuất bản" : "Xuất bản"}</button></div></header>
          {(error || blockers.length > 0) && <div className="publish-blockers"><WarningCircle size={22} /><div><strong>{error || "Bài học chưa đủ điều kiện xuất bản."}</strong>{blockers.map((item, index) => <p key={index}>{String(item.message || item.detail || item.code || "Cần chỉnh sửa bản nháp.")}</p>)}</div></div>}
          <div className="review-grid"><main><DraftReviewContent review={draftReview} rejected={rejected} onToggle={(id) => setRejected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} /></main><aside><section><h2>Độ phủ mục tiêu</h2><DataSummary data={coverage} empty="Chưa có dữ liệu độ phủ." /></section><section><h2>Lưu ý nội dung</h2>{notices.length ? notices.map((notice, index) => <p key={index}>{String(notice.detail || notice.message || "Kiểm tra nội dung trước khi dùng.")}</p>) : <p>Không có cảnh báo nội dung.</p>}</section>{rejected.size > 0 && <button className="secondary-button w-full" disabled={regenerateDraft.isPending || !aiLessonId} onClick={() => regenerateDraft.mutate()}>{regenerateDraft.isPending ? <CircleNotch className="animate-spin" size={16} /> : null}{regenerateDraft.isPending ? "Đang soạn lại" : `Soạn lại ${rejected.size} câu đã chọn`}</button>}<small>ID bản nháp: {draftExerciseId || aiLessonId}</small></aside></div>
        </div>
      )}
    </section>
  );
}

export function DraftProblemList({ problems, rejected, onToggle }: { problems: ProblemView[]; rejected: Set<string>; onToggle: (id: string) => void }) {
  if (!problems.length) return <div className="list-empty"><Lightbulb size={26} /><h3>Chưa tìm thấy danh sách bài</h3><p>Bản nháp có thể cần được tạo lại.</p></div>;
  return <div className="draft-problem-list">{problems.map((problem, index) => <article key={problem.id} data-rejected={rejected.has(problem.id)}><header><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{problem.role || "Bài luyện tập"}</strong><small>{problem.skill || "Theo mục tiêu bài học"}</small></div><button className={rejected.has(problem.id) ? "secondary-button" : "text-button"} onClick={() => onToggle(problem.id)}>{rejected.has(problem.id) ? "Giữ lại" : "Cần thay"}</button></header><MathContent>{problem.prompt}</MathContent>{problem.choices?.length ? <ol type="A">{problem.choices.map((choice, choiceIndex) => <li key={`${problem.id}:${choiceIndex}`}><MathContent answer>{choice}</MathContent></li>)}</ol> : null}{problem.answer ? <div className="draft-answer"><span>Đáp án</span><MathContent answer>{problem.answer}</MathContent></div> : null}{problem.solution ? <details className="draft-solution"><summary>Xem lời giải Copilot sẽ dùng</summary><MathContent>{problem.solution}</MathContent></details> : null}</article>)}</div>;
}

export function DraftReviewContent({ review, rejected, onToggle }: { review: DraftReviewModel; rejected: Set<string>; onToggle: (id: string) => void }) {
  const hasContent = review.knowledgeSections.length || review.knowledgeProblems.length || review.masteryProblems.length;
  if (!hasContent) return <div className="list-empty"><Lightbulb size={26} /><h3>Bản nháp chưa có nội dung</h3><p>Thử tạo lại bài học để tải đủ phần kiến thức và luyện tập.</p></div>;
  return <div className="draft-review-content">
    {review.knowledgeSections.length > 0 && <section id="session-1-knowledge" className="draft-review-section"><header><div><span>Session 1</span><h2>Nội dung kiến thức</h2></div><small>{review.knowledgeSections.length} phần</small></header><div className="draft-knowledge-list">{review.knowledgeSections.map((section, index) => <article key={section.id}><span>Phần {String(index + 1).padStart(2, "0")}</span><h3>{section.title}</h3><MathContent>{section.content}</MathContent></article>)}</div></section>}
    {review.knowledgeProblems.length > 0 && <section id="session-1-checkpoints" className="draft-review-section"><header><div><span>Session 1</span><h2>Câu kiểm tra kiến thức</h2></div><small>{review.knowledgeProblems.length} câu</small></header><DraftProblemList problems={review.knowledgeProblems} rejected={rejected} onToggle={onToggle} /></section>}
    {review.masteryProblems.length > 0 && <section id="session-2-mastery" className="draft-review-section"><header><div><span>Session 2</span><h2>Bài luyện tập mastery</h2></div><small>{review.masteryProblems.length} bài</small></header><DraftProblemList problems={review.masteryProblems} rejected={rejected} onToggle={onToggle} /></section>}
  </div>;
}

function GeneratingLesson({ step }: { step: string }) { return <div className="generating-lesson"><span><Sparkle size={25} weight="fill" /></span><h1>Copilot đang dựng bài học</h1><p>{step}</p><div className="generation-track"><i /></div><small>Có thể mất vài phút. Đừng đóng tab này.</small></div>; }
function MissingSkills({ data }: { data: Record<string, unknown> }) { const skills = Array.isArray(data.skills) ? data.skills : Array.isArray(data.missing_skills) ? data.missing_skills : []; if (!skills.length) return null; return <div className="missing-skills">{skills.map((item, index) => <span key={index}>{typeof item === "string" ? item : isRecord(item) ? String(item.evidence_span || item.skill_name || item.skill_id || "Kỹ năng chưa có bài") : "Kỹ năng chưa có bài"}</span>)}</div>; }
function DataSummary({ data, empty }: { data: Record<string, unknown> | null; empty: string }) { if (!data) return <p>{empty}</p>; const entries = Object.entries(data).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 6); return entries.length ? <dl className="data-summary">{entries.map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{String(value)}</dd></div>)}</dl> : <p>{empty}</p>; }
export function normalizeProblems(value: unknown, namespace = "problem"): ProblemView[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item, index) => {
    const rawChoices = Array.isArray(item.choices)
      ? item.choices
      : Array.isArray(item.options)
        ? item.options
        : undefined;
    return {
      id: `${namespace}:${String(item.id || item.problem_id || index)}`,
      prompt: String(item.prompt || item.question || item.question_text || item.content || "Bài tập chưa có nội dung hiển thị."),
      role: stringOrUndefined(item.role || item.problem_role || item.type),
      skill: stringOrUndefined(item.skill_name || item.skill_id || item.skill_code),
      choices: rawChoices?.map(normalizeChoice),
      answer: displayStringOrUndefined(item.answer ?? item.final_answer ?? item.correctAnswer ?? item.correct_answer),
      solution: stringOrUndefined(item.solution || item.explanation || item.solution_text),
      source: item,
    };
  });
}
export function normalizeDraftReview(value: unknown): DraftReviewModel {
  const draft = asRecord(value);
  if (!draft) return emptyDraftReview;
  const knowledge = draft.knowledge;
  const knowledgeRecord = asRecord(knowledge);
  const masteryRecord = asRecord(draft.mastery);
  const nestedKnowledgeProblems = firstArray(knowledgeRecord?.problems, knowledgeRecord?.problem, knowledgeRecord?.questions, knowledgeRecord?.checkpoint_questions, knowledgeRecord?.checkpoints);
  const nestedMasteryProblems = firstArray(masteryRecord?.problems, masteryRecord?.problem, masteryRecord?.questions);
  const topLevelProblems = firstArray(draft.problems, draft.problem_list);
  return {
    knowledgeSections: normalizeKnowledgeSections(knowledge),
    knowledgeProblems: normalizeProblems(nestedKnowledgeProblems.length ? nestedKnowledgeProblems : nestedMasteryProblems.length ? topLevelProblems : [], "knowledge"),
    masteryProblems: normalizeProblems(nestedMasteryProblems.length ? nestedMasteryProblems : topLevelProblems, "mastery"),
  };
}
export function buildRegenerationTargets(review: DraftReviewModel, rejected: Set<string>) {
  const targets: Array<{ kind: "mastery" | "knowledge_checkpoint"; id?: string; index?: number }> = [];
  review.knowledgeProblems.forEach((problem, index) => {
    if (rejected.has(problem.id)) targets.push({ kind: "knowledge_checkpoint", index });
  });
  review.masteryProblems.forEach((problem) => {
    if (!rejected.has(problem.id)) return;
    const bankId = problem.source?.bank_problem_id;
    if (typeof bankId === "string" && bankId) targets.push({ kind: "mastery", id: bankId });
  });
  return targets;
}
function normalizeKnowledgeSections(value: unknown): KnowledgeSectionView[] {
  if (typeof value === "string" && value.trim()) return [{ id: "knowledge:content", title: "Nội dung bài học", content: value }];
  const wrapper = asRecord(value);
  if (!wrapper) return [];
  const nested = wrapper.knowledge;
  if (typeof nested === "string" && nested.trim()) return [{ id: "knowledge:content", title: "Nội dung bài học", content: nested }];
  const knowledge = asRecord(nested) || wrapper;
  const sections: KnowledgeSectionView[] = [];
  if (typeof knowledge.hook === "string" && knowledge.hook.trim()) sections.push({ id: "knowledge:hook", title: "Đặt vấn đề", content: knowledge.hook });
  const items = Array.isArray(knowledge.items) ? knowledge.items : Array.isArray(knowledge.content) ? knowledge.content : [];
  items.filter(isRecord).forEach((item, index) => {
    const content = stringOrUndefined(item.content || item.material || item.body || item.text);
    if (content) sections.push({ id: `knowledge:item:${index}`, title: String(item.title || item.name || `Phần ${index + 1}`), content });
  });
  const content = stringOrUndefined(knowledge.content || knowledge.material || knowledge.body || knowledge.text);
  if (content) sections.push({ id: "knowledge:content", title: String(knowledge.title || knowledge.concept_name || "Nội dung bài học"), content });
  return sections;
}
function firstArray(...values: unknown[]) { return values.find(Array.isArray) as unknown[] | undefined || []; }
function normalizeChoice(value: unknown) {
  if (!isRecord(value)) return String(value);
  return String(value.text ?? value.content ?? value.value ?? value.label ?? "");
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function asRecord(value: unknown) { return isRecord(value) ? value : null; }
function stringOrUndefined(value: unknown) { return typeof value === "string" && value ? value : undefined; }
function displayStringOrUndefined(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }
function humanize(value: string) { return value.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase()); }
function uniqueStrings(values: string[]) { return Array.from(new Set(values.filter(Boolean))); }
function readableSkill(value: string) {
  const leaf = value.split("#").pop()?.split(":").pop() || value;
  return leaf.replace(/[-_]+/g, " ").trim();
}
function defaultDeadline() { const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); date.setMinutes(0, 0, 0); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
