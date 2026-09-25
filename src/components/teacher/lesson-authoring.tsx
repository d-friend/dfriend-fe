"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileArrowUp,
  Lightbulb,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { MathContent } from "@/components/shared/math-content";
import { LessonGenerationLoading } from "@/components/teacher/lesson-generation-loading";
import { getApiErrorMessage, isApiErrorStatus, teacherApi } from "@/lib/api-client";
import { waitForLessonGeneration } from "@/lib/lesson-generation";
import type { LessonGenerationResult } from "@/lib/lesson-generation";

export interface ProblemView {
  id: string;
  prompt: string;
  role?: string;
  skill?: string;
  choices?: string[];
  choiceIds?: string[];
  assets?: TeacherProblemAsset[];
  answer?: string;
  solution?: string;
  source?: Record<string, unknown>;
  origin?: string;
  sourceMode?: string;
  qualityContractVersion?: number;
}

interface TeacherProblemAsset {
  asset_id: string;
  content_hash: string;
  target: "stem" | "part" | "choice" | "solution";
  target_id?: string | null;
  order: number;
  audience: "public_problem" | "private_solution";
  width: number;
  height: number;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  alt_text?: string | null;
  access_url?: string | null;
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

export interface RegenerationGuidance {
  reason: string;
  requestedChange: string;
}

type RegenerationGuidanceByProblem = Record<string, RegenerationGuidance>;

const emptyDraftReview: DraftReviewModel = { knowledgeSections: [], knowledgeProblems: [], masteryProblems: [] };
const masteryRoleLabels: Record<string, string> = {
  reinforcement: "The Warm-Up · Chứng minh điều vừa học",
  challenge: "The Push · Nặng hơn nhưng quen thuộc",
  exploration: "The Break · Phá cách làm cũ",
  extension: "The Build · Áp dụng pattern mới",
};

type AuthoringPhase = "goal" | "precheck" | "generating";

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
  const [lessonKind, setLessonKind] = useState<"normal" | "targeted_review">("normal");
  const [reviewSkills, setReviewSkills] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [draftExerciseId, setDraftExerciseId] = useState("");
  const [activeJobId, setActiveJobId] = useState("");
  const [activeJobIdentity, setActiveJobIdentity] = useState("");
  const [partialGeneration, setPartialGeneration] = useState<LessonGenerationResult | null>(null);
  const [precheckData, setPrecheckData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const reportId = search.get("fromReport");
  const appliedReportId = useRef<string | null>(null);

  const classes = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: teacherApi.me, staleTime: Infinity });
  const curriculum = useQuery({ queryKey: ["curriculum"], queryFn: teacherApi.curriculum, staleTime: 5 * 60 * 1000 });
  const reportPrefill = useQuery({
    queryKey: ["teacher", "copilot", reportId, "report"],
    queryFn: () => teacherApi.report(reportId as string),
    enabled: Boolean(reportId),
  });
  const followUpPrefill = useQuery({
    queryKey: ["teacher", "copilot", reportId, "follow-up-plan"],
    queryFn: () => teacherApi.followUpPlan(reportId as string),
    enabled: Boolean(reportId),
  });
  const topics = useMemo(() => curriculum.data?.find((item) => item.value === subject)?.topics || [], [curriculum.data, subject]);
  const concepts = useMemo(() => topics.find((item) => item.value === topic)?.concepts || [], [topics, topic]);
  const taxonomyVersion = curriculum.data?.find((item) => item.value === subject)?.taxonomy_version;
  const availableSkills = useQuery({ queryKey: ["curriculum", "skills", subject, topic, concept, taxonomyVersion], queryFn: () => teacherApi.curriculumSkills(subject, topic, concept, taxonomyVersion as number), enabled: Boolean(subject && topic && concept && taxonomyVersion), staleTime: Infinity });
  const studioReadyCount = [
    title.trim(),
    subject && topic && concept,
    selectedSkills.length,
    classIds.length,
  ].filter(Boolean).length;
  const storageKey = me.data?.id
    ? `teacher:lesson-draft-form:v2:${me.data.id}${reportId ? `:report:${reportId}` : ""}`
    : "";
  const generationIdentity = useMemo(
    () => JSON.stringify({
      title: title.trim(),
      description: description.trim(),
      lessonGoal: lessonGoal.trim(),
      subject,
      topic,
      concept,
      taxonomyVersion: taxonomyVersion || null,
      lessonKind,
      skillIds: [...selectedSkills].sort(),
      classIds: [...classIds].sort(),
      draftExerciseId,
    }),
    [classIds, concept, description, draftExerciseId, lessonGoal, lessonKind, selectedSkills, subject, taxonomyVersion, title, topic],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // A report-driven follow-up is always a new lesson. Restoring the last
      // wizard draft here could silently update or publish an unrelated lesson.
      if (reportId) {
        setDeadline(defaultDeadline());
        setStorageReady(true);
        return;
      }
      if (!storageKey) return;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as Record<string, unknown>;
          setTitle(String(saved.title || ""));
          setDescription(String(saved.description || ""));
          setLessonGoal(String(saved.lessonGoal || ""));
          setSubject(String(saved.subject || ""));
          setTopic(String(saved.topic || ""));
          setConcept(String(saved.concept || ""));
          setClassIds(Array.isArray(saved.classIds) ? saved.classIds.map(String) : []);
          setSelectedSkills(Array.isArray(saved.selectedSkills) ? saved.selectedSkills.map(String).slice(0, 4) : []);
          setLessonKind(saved.lessonKind === "targeted_review" ? "targeted_review" : "normal");
          setDeadline(saved.deadline ? String(saved.deadline) : defaultDeadline());
          if (saved.draftExerciseId) setDraftExerciseId(String(saved.draftExerciseId));
          // Legacy autosaves only stored a job id, so they cannot prove that the
          // job belongs to the currently restored taxonomy/request.
          if (saved.activeJobId && saved.activeJobIdentity) {
            setActiveJobId(String(saved.activeJobId));
            setActiveJobIdentity(String(saved.activeJobIdentity));
          }
        } else {
          setDeadline(defaultDeadline());
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reportId, storageKey]);

  useEffect(() => {
    if (!reportPrefill.data || !reportId || appliedReportId.current === reportId) return;
    if (!followUpPrefill.data && followUpPrefill.isLoading) return;
    const data = reportPrefill.data;
    const mainPlan = followUpPrefill.data?.main;
    const plannedConcept = parseConceptKey(mainPlan?.concept_key || "");
    const plannedSkills = uniqueStrings(mainPlan?.target_skill_ids || []).slice(0, 4);
    const skillText = plannedSkills.length
      ? plannedSkills.map(readableSkill).join(", ")
      : "các kỹ năng quan trọng của bài tiếp theo";
    const timer = window.setTimeout(() => {
      appliedReportId.current = reportId;
      setPhase("goal");
      setDescription("");
      setFile(null);
      setDraftExerciseId("");
      setActiveJobId("");
      setActiveJobIdentity("");
      setPrecheckData(null);
      setError("");
      setSubject(plannedConcept?.subject || data.subject || "");
      setTopic(plannedConcept?.topic || data.topic || "");
      setConcept(plannedConcept?.concept || data.concept || "");
      setClassIds(data.classIds || []);
      setSelectedSkills(plannedSkills);
      setTitle(`Bài tiếp theo: ${data.title || "báo cáo gần nhất"}`);
      setLessonGoal(
        `Sau bài này, học sinh làm được ${skillText}. ` +
          `Ưu tiên sửa đúng các lỗi được phát hiện sau bài “${data.title || "gần nhất"}”.`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reportId, reportPrefill.data, followUpPrefill.data, followUpPrefill.isLoading]);

  useEffect(() => {
    if (!storageReady || !storageKey) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ title, description, lessonGoal, subject, topic, concept, selectedSkills, lessonKind, classIds, deadline, draftExerciseId, activeJobId, activeJobIdentity }),
    );
  }, [storageReady, storageKey, title, description, lessonGoal, subject, topic, concept, selectedSkills, lessonKind, classIds, deadline, draftExerciseId, activeJobId, activeJobIdentity]);

  async function begin(event: FormEvent) {
    event.preventDefault();
    setError("");
    const resumableJobId = activeJobIdentity === generationIdentity ? activeJobId : "";
    if (activeJobId && !resumableJobId) {
      setActiveJobId("");
      setActiveJobIdentity("");
    }
    if (resumableJobId) {
      setPhase("generating");
      try {
        const lesson1 = await waitForLessonGeneration(resumableJobId, setGenerationStep);
        if (lesson1.generationStatus === "partial_blocked" || lesson1.generationStatus === "partial") {
          setPartialGeneration(lesson1);
          setPhase("goal");
          return;
        }
        await finishGeneratedLesson(lesson1);
        return;
      } catch (generationError) {
        if (
          isApiErrorStatus(generationError, 404) ||
          (generationError instanceof Error && generationError.name === "LessonGenerationFailed")
        ) {
          // Completed BullMQ jobs expire, and an old unscoped autosave could belong
          // to another request. Terminal jobs are not resumable; continue this
          // explicitly submitted action as a fresh generation.
          setActiveJobId("");
          setActiveJobIdentity("");
        } else {
          setError(getApiErrorMessage(generationError, "Chưa thể tiếp tục tiến trình tạo bài."));
          setPhase("goal");
          return;
        }
      }
    }
    if (!title.trim() || !subject || !topic || !concept || !taxonomyVersion || !classIds.length || !selectedSkills.length) {
      setError("Điền tên bài, taxonomy, ít nhất một kỹ năng và một lớp.");
      return;
    }
    setPhase("precheck");
    try {
      if (file) {
        const upload = new FormData();
        upload.append("file", file);
        upload.append("title", title.trim());
        upload.append("description", description.trim());
        upload.append("subject", subject);
        upload.append("topic", topic);
        upload.append("concept", concept);
        upload.append("taxonomyVersion", String(taxonomyVersion));
        upload.append("shared", "true");
        const registered = await teacherApi.uploadDocument(upload);
        setFile(null);
        if (registered.extractionJobId) {
          throw new Error("Tài liệu đã được lưu để Marker trích xuất. Chức năng tạo bài từ tài liệu Marker chưa sẵn sàng; hãy kiểm tra trạng thái trong Kho tài liệu.");
        }
        await waitForDocumentIndex(registered.documentId, taxonomyVersion);
      }
      const result = await teacherApi.precheckLesson({ title: title.trim(), lessonGoal: lessonGoal.trim(), subject, topic, concept, taxonomyVersion, explicitSkillIds: selectedSkills });
      if (lessonKind === "targeted_review") {
        if (selectedSkills.length < 2) {
          setError("Mục tiêu ôn tập cần nhận diện ít nhất hai kỹ năng trong cùng khái niệm.");
          setPhase("goal");
          return;
        }
        setReviewSkills(selectedSkills);
        setPrecheckData({ ...result, targetedReviewSelection: true });
        return;
      }
      // Creating the draft is the teacher's deliberate action. Mastery v2 fills only
      // concrete `(skill, role)` deficits and discloses the generated count in review,
      // so a separate shortage confirmation is no longer needed.
      await generate(true);
    } catch (precheckError) {
      // Precheck is the hard spending/quality gate. A network or auth failure is not
      // evidence that material exists, so do not fall through into two LLM calls.
      setError(
        precheckError instanceof Error && precheckError.message
          ? precheckError.message
          : getApiErrorMessage(
              precheckError,
              "Chưa kiểm tra được nguồn bài. Vui lòng thử lại trước khi tạo.",
            ),
      );
      setPhase("goal");
    }
  }

  async function generate(allowGenerated: boolean) {
    setPrecheckData(null);
    setPartialGeneration(null);
    setPhase("generating");
    setError("");
    try {
      setGenerationStep("Đang phân tích mục tiêu và tìm tài liệu phù hợp");
      const form1 = new FormData();
      const requestId = crypto.randomUUID();
      form1.append("requestId", requestId);
      form1.append("title", title.trim());
      form1.append("description", description.trim());
      form1.append("lessonGoal", lessonGoal.trim());
      form1.append("subject", subject);
      form1.append("topic", topic);
      form1.append("concept", concept);
      form1.append("taxonomyVersion", String(taxonomyVersion));
      form1.append("lessonKind", lessonKind);
      form1.append("explicitSkillIds", JSON.stringify(lessonKind === "targeted_review" ? reviewSkills : selectedSkills));
      form1.append("classIds", JSON.stringify(classIds));
      if (draftExerciseId) form1.append("lessonId", draftExerciseId);
      if (allowGenerated) form1.append("allowGenerated", "true");
      const queued = await teacherApi.generateLesson1(form1);
      if (queued.jobId) {
        const nextJobId = String(queued.jobId);
        setActiveJobId(nextJobId);
        setActiveJobIdentity(generationIdentity);
        // Persist before navigating: the component may unmount before React runs
        // the autosave effect, but this job must remain recoverable by exact input.
        if (storageKey) {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({ title, description, lessonGoal, subject, topic, concept, selectedSkills, lessonKind, classIds, deadline, draftExerciseId, activeJobId: nextJobId, activeJobIdentity: generationIdentity }),
          );
        }
        router.push(
          `/teacher/lessons/generating/${encodeURIComponent(nextJobId)}?origin=wizard`,
        );
        return;
      }
      const lesson1 = queued.jobId
        ? await waitForLessonGeneration(String(queued.jobId), setGenerationStep)
        : queued;
      if (lesson1.generationStatus === "partial_blocked" || lesson1.generationStatus === "partial") {
        setPartialGeneration(lesson1);
        setPhase("goal");
        return;
      }
      await finishGeneratedLesson(lesson1);
    } catch (generationError) {
      if (generationError instanceof Error && generationError.name === "LessonGenerationFailed") {
        setActiveJobId("");
        setActiveJobIdentity("");
      }
      setError(getApiErrorMessage(generationError, "Không thể tạo bài học. Bản nháp đã được giữ lại để thử tiếp."));
      setPhase("goal");
    }
  }

  async function retryMissingSlots() {
    if (!activeJobId) return;
    if (activeJobIdentity !== generationIdentity) {
      setActiveJobId("");
      setActiveJobIdentity("");
      setPartialGeneration(null);
      setError("Taxonomy hoặc nội dung bài đã thay đổi. Hãy tạo một tiến trình mới thay vì retry job cũ.");
      return;
    }
    setPhase("generating");
    setGenerationStep("Đang tạo tiếp các slot còn thiếu");
    setError("");
    try {
      const queued = await teacherApi.retryMissingLessonSlots(activeJobId);
      setActiveJobId(queued.jobId);
      setActiveJobIdentity(generationIdentity);
      const result = await waitForLessonGeneration(queued.jobId, setGenerationStep);
      if (result.generationStatus === "partial_blocked" || result.generationStatus === "partial") {
        setPartialGeneration(result);
        setPhase("goal");
        return;
      }
      setPartialGeneration(null);
      await finishGeneratedLesson(result);
    } catch (retryError) {
      setError(getApiErrorMessage(retryError, "Chưa thể tạo tiếp các bài còn thiếu."));
      setPhase("goal");
    }
  }

  async function finishGeneratedLesson(lesson1: Record<string, unknown>) {
    const nextDraftId = String(lesson1.draftExerciseId || "");
    const nextLessonId = String(lesson1.lessonId || "");
    const resultTaxonomyVersion = Number(lesson1.taxonomyVersion);
    if (!nextLessonId || !nextDraftId || !Number.isInteger(resultTaxonomyVersion) || resultTaxonomyVersion < 1) {
      throw new Error("Backend chưa trả đủ lesson ID, bản nháp và taxonomy version để mở review.");
    }
    setDraftExerciseId(nextDraftId);
    setGenerationStep("Đang hoàn thiện bộ bài tập và gắn vào lớp");
    const form2 = new FormData();
    form2.append("draftExerciseId", nextDraftId);
    form2.append("classIds", JSON.stringify(classIds));
    await teacherApi.generateLesson2(form2);
    setActiveJobId("");
    setActiveJobIdentity("");
    if (storageKey) window.localStorage.removeItem(storageKey);
    router.push(`/teacher/lessons/${nextLessonId}/review?taxonomyVersion=${resultTaxonomyVersion}`);
  }

  return (
    <section className="lesson-immersive">
      <header className="lesson-immersive-header">
        <button className="text-button" onClick={() => router.back()}><ArrowLeft size={16} /> Quay lại</button>
        <div className="authoring-steps"><span data-active={phase === "goal" || phase === "precheck"}>Mục tiêu</span><span data-active={phase === "generating"}>Tạo bài</span><span>Review</span></div>
        <span className="autosave-status"><Check size={14} /> Đã tự lưu</span>
      </header>

      {(phase === "goal" || phase === "precheck") && (
        <form className="authoring-layout" onSubmit={begin}>
          <div className="authoring-copy lesson-studio-brief">
            <p className="workspace-kicker">{reportId ? "Bài tiếp theo từ báo cáo" : "Lesson Studio"}</p>
            <h1>{reportId ? "Biến khoảng trống vừa thấy thành bài học tiếp theo." : "Soạn một bài học đủ rõ để Copilot chọn đúng bài."}</h1>
            <p>{reportId ? "Dữ liệu báo cáo đã gợi ý lớp và taxonomy. Bạn chỉnh lại kỹ năng, deadline và mục tiêu trước khi tạo bản nháp." : "Giáo viên chọn khung bài. Copilot chỉ dựng bản nháp; học sinh chưa thấy gì cho tới khi bạn review và xuất bản."}</p>
            <div className="studio-readiness" aria-label="Mức sẵn sàng">
              <span style={{ "--ready-count": studioReadyCount } as CSSProperties} />
              <strong>{studioReadyCount}/4 phần bắt buộc</strong>
              <small>Tên bài, taxonomy, kỹ năng và lớp nhận bài.</small>
            </div>
            <div className="authoring-principle"><ShieldCheck size={20} /><span><strong>Giữ quyền duyệt</strong><small>Copilot tạo bản review. Chỉ giáo viên mới xuất bản cho học sinh.</small></span></div>
          </div>

          <div className="lesson-studio-main">
            {error && <p className="inline-error" role="alert">{error}</p>}

            <section className="studio-card studio-card-primary">
              <div className="studio-card-heading">
                <span>01</span>
                <div><h2>Khung bài học</h2><p>Đặt tên, chọn loại bài và deadline trước. Mục tiêu có thể để trống nếu kỹ năng đã rõ.</p></div>
              </div>
              <div className="studio-fields two">
                <div className="form-field"><label htmlFor="lesson-title">Tên bài học</label><input id="lesson-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Thu gọn đơn thức" required /></div>
                <div className="form-field"><label htmlFor="lesson-kind">Loại bài</label><select id="lesson-kind" className="select" value={lessonKind} onChange={(event) => { setLessonKind(event.target.value as "normal" | "targeted_review"); setReviewSkills([]); }}><option value="normal">Bài học mới</option><option value="targeted_review">Ôn tập theo kỹ năng</option></select></div>
              </div>
              <div className="studio-fields two">
                <div className="form-field"><label htmlFor="lesson-deadline">Deadline</label><input id="lesson-deadline" className="input" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></div>
                <div className="form-field"><label htmlFor="lesson-file">Thêm vào kho tài liệu</label><label className="file-input"><FileArrowUp size={17} /><span>{file?.name || "Chọn tệp không bắt buộc"}</span><input id="lesson-file" type="file" accept=".pdf,.docx,.md,.txt" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></div>
              </div>
              <div className="form-field"><label htmlFor="lesson-goal">Mục tiêu bài học</label><textarea id="lesson-goal" className="textarea studio-goal" maxLength={1000} value={lessonGoal} onChange={(event) => setLessonGoal(event.target.value)} placeholder="Có thể để trống. Nếu nhập, hãy viết điều học sinh cần làm được hoặc lỗi cần tránh." /><small>{lessonGoal.length}/1000 ký tự. Kỹ năng bạn tick bên dưới vẫn là nguồn dữ liệu chính.</small></div>
            </section>

            <section className="studio-card">
              <div className="studio-card-heading">
                <span>02</span>
                <div><h2>Taxonomy và kỹ năng</h2><p>Chọn đúng khái niệm rồi tick kỹ năng. Đây là phần quyết định Copilot tìm bài có đúng hay không.</p></div>
              </div>
              <div className="taxonomy-grid">
                <div className="form-field"><label htmlFor="lesson-subject">Môn học</label><select id="lesson-subject" className="select" value={subject} onChange={(event) => { setSubject(event.target.value); setTopic(""); setConcept(""); setSelectedSkills([]); }}><option value="">Chọn môn</option>{(curriculum.data || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                <div className="form-field"><label htmlFor="lesson-topic">Chủ đề</label><select id="lesson-topic" className="select" value={topic} disabled={!subject} onChange={(event) => { setTopic(event.target.value); setConcept(""); setSelectedSkills([]); }}><option value="">Chọn chủ đề</option>{topics.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                <div className="form-field"><label htmlFor="lesson-concept">Khái niệm</label><select id="lesson-concept" className="select" value={concept} disabled={!topic} onChange={(event) => { setConcept(event.target.value); setSelectedSkills([]); }}><option value="">Chọn khái niệm</option>{concepts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
              </div>
              <div className="form-field">
                <label>Kỹ năng cần dạy</label>
                <div className="class-picker skill-picker">
                  {availableSkills.isLoading ? (
                    <div className="studio-empty-selection">Đang tải kỹ năng trong khái niệm này.</div>
                  ) : availableSkills.data?.length ? (
                    availableSkills.data.map((skill) => { const checked = selectedSkills.includes(skill.skill_id); return <label key={skill.skill_id}><input type="checkbox" checked={checked} disabled={!checked && selectedSkills.length >= 4} onChange={(event) => setSelectedSkills((current) => event.target.checked ? [...current, skill.skill_id].slice(0, 4) : current.filter((item) => item !== skill.skill_id))} /><span><strong>{skill.label_vi}</strong><small>{skill.skill_id}</small></span></label>; })
                  ) : (
                    <div className="studio-empty-selection">{subject && topic && concept ? "Khái niệm này chưa có kỹ năng khả dụng." : "Chọn môn, chủ đề và khái niệm để hiện kỹ năng."}</div>
                  )}
                </div>
                <small>{lessonKind === "targeted_review" ? "Ôn tập cần 2-4 kỹ năng." : "Chọn tối đa 4 kỹ năng để mỗi học sinh được đánh giá đủ trong 4 bài mastery."}</small>
              </div>
            </section>

            <section className="studio-card">
              <div className="studio-card-heading">
                <span>03</span>
                <div><h2>Lớp nhận bài</h2><p>Chọn lớp sẽ thấy bài sau khi bạn review và xuất bản.</p></div>
              </div>
              <div className="class-picker studio-class-picker">
                {(classes.data || []).map((item) => <label key={item.class_id}><input type="checkbox" checked={classIds.includes(item.class_id)} onChange={(event) => setClassIds((current) => event.target.checked ? [...current, item.class_id] : current.filter((id) => id !== item.class_id))} /><span><strong>{item.class_name}</strong><small>{item.student_count} học sinh</small></span></label>)}
                {!classes.isLoading && !classes.data?.length && <div className="studio-empty-selection">Chưa có lớp học nào để giao bài.</div>}
              </div>
              <div className="form-field"><label htmlFor="lesson-description">Ghi chú cho Copilot</label><textarea id="lesson-description" className="textarea !min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Cách tổ chức lớp, điều cần tránh, hoặc phong cách bài tập mong muốn" /></div>
            </section>

            <div className="studio-submit-bar">
              <span>{lessonKind === "targeted_review" ? "Copilot sẽ tạo bài ôn theo nhóm kỹ năng đã chọn." : "Copilot sẽ kiểm tra kho bài trước khi tự soạn phần thiếu."}</span>
              <button className="primary-button authoring-submit" type="submit" disabled={phase === "precheck"}><Sparkle size={17} weight="fill" /> {phase === "precheck" ? "Đang kiểm tra nguồn bài" : "Kiểm tra và tạo bài"}<ArrowRight size={16} /></button>
            </div>
          </div>
        </form>
      )}

      {precheckData && precheckData.targetedReviewSelection === true && (
        <div className="precheck-gate"><WarningCircle size={27} /><h2>Chọn kỹ năng cần ôn</h2><p>Copilot nhận diện các kỹ năng dưới đây từ mục tiêu. Chọn từ hai đến bốn kỹ năng để tạo bài ôn trong đúng khái niệm này.</p><div className="class-picker">{(Array.isArray(precheckData.skill_ids) ? precheckData.skill_ids : []).filter((skill): skill is string => typeof skill === "string").map((skill) => { const checked = reviewSkills.includes(skill); return <label key={skill}><input type="checkbox" checked={checked} disabled={!checked && reviewSkills.length >= 4} onChange={(event) => setReviewSkills((current) => event.target.checked ? [...current, skill].slice(0, 4) : current.filter((item) => item !== skill))} /><span><strong>{skill}</strong></span></label>; })}</div><div><button className="secondary-button" onClick={() => { setPrecheckData(null); setPhase("goal"); }}>Quay lại</button><button className="primary-button" disabled={reviewSkills.length < 2 || reviewSkills.length > 4} onClick={() => void generate(true)}>Tạo bài ôn</button></div></div>
      )}

      {partialGeneration && phase === "goal" && (
        <div className="precheck-gate" role="status">
          <WarningCircle size={27} />
          <h2>Bản nháp đang có {partialGeneration.generationCompletedSlots || 0}/{partialGeneration.generationTotalSlots || 12} bài đạt chuẩn</h2>
          <p>Phần đã đạt được giữ nguyên. Bạn có thể tạo tiếp đúng các slot còn thiếu hoặc mở bản hiện tại để review blocker.</p>
          <div>
            <button className="secondary-button" onClick={() => void finishGeneratedLesson(partialGeneration)}>Review bản hiện tại</button>
            <button className="primary-button" onClick={() => void retryMissingSlots()}>Tạo tiếp phần thiếu</button>
          </div>
        </div>
      )}

      {phase === "generating" && (
        <LessonGenerationLoading
          origin="wizard"
          detail={generationStep || "Copilot đang dựng bản nháp từ mục tiêu, kho bài và tài liệu của bạn."}
        />
      )}
    </section>
  );
}

export function DraftProblemList({
  problems,
  rejected,
  guidance,
  onToggle,
  onGuidanceChange,
  readOnly = false,
}: {
  problems: ProblemView[];
  rejected: Set<string>;
  guidance: RegenerationGuidanceByProblem;
  onToggle: (id: string) => void;
  onGuidanceChange: (id: string, field: keyof RegenerationGuidance, value: string) => void;
  readOnly?: boolean;
}) {
  const [expandedAsset, setExpandedAsset] = useState<TeacherProblemAsset | null>(null);
  if (!problems.length) return <div className="list-empty"><Lightbulb size={26} /><h3>Chưa tìm thấy danh sách bài</h3><p>Bản nháp có thể cần được tạo lại.</p></div>;
  return <div className="draft-problem-list">{problems.map((problem, index) => {
    const needsReplacement = rejected.has(problem.id);
    const itemGuidance = guidance[problem.id] || { reason: "", requestedChange: "" };
    return <article key={problem.id} data-rejected={needsReplacement}>
      <header><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{problem.role ? masteryRoleLabels[problem.role] || problem.role : "Bài luyện tập"}</strong><small>{problem.skill || "Theo mục tiêu bài học"}</small>{problemSourceLabel(problem) && <small className="problem-origin">{problemSourceLabel(problem)}</small>}</div>{!readOnly && <button className={needsReplacement ? "secondary-button" : "text-button"} onClick={() => onToggle(problem.id)}>{needsReplacement ? "Giữ lại" : "Cần thay"}</button>}</header>
      <MathContent>{problem.prompt}</MathContent>
      <TeacherAssetList assets={(problem.assets || []).filter((asset) => asset.audience === "public_problem" && asset.target === "stem")} onExpand={setExpandedAsset} />
      {problem.choices?.length ? <ol type="A">{problem.choices.map((choice, choiceIndex) => <li key={`${problem.id}:${choiceIndex}`}><MathContent answer>{choice}</MathContent><TeacherAssetList assets={(problem.assets || []).filter((asset) => asset.audience === "public_problem" && asset.target === "choice" && asset.target_id === problem.choiceIds?.[choiceIndex])} onExpand={setExpandedAsset} /></li>)}</ol> : null}
      {(problem.assets || []).some((asset) => asset.target === "choice" && !problem.choiceIds?.includes(asset.target_id || "")) ? <p className="draft-asset-unavailable">Hình của lựa chọn chưa khớp với đáp án hiển thị; bài này cần kiểm tra trước khi xuất bản.</p> : null}
      {(problem.assets || []).some((asset) => asset.target === "part") ? <p className="draft-asset-unavailable">Hình gắn với ý nhỏ chưa có vị trí hiển thị trong bản nháp này.</p> : null}
      {problem.answer ? <div className="draft-answer"><span>Đáp án</span><MathContent answer>{problem.answer}</MathContent></div> : null}
      {problem.solution || (problem.assets || []).some((asset) => asset.audience === "private_solution") ? <details className="draft-solution"><summary>Xem lời giải Copilot sẽ dùng</summary>{problem.solution ? <MathContent>{problem.solution}</MathContent> : null}<TeacherAssetList assets={(problem.assets || []).filter((asset) => asset.audience === "private_solution" && asset.target === "solution")} onExpand={setExpandedAsset} /></details> : null}
      {needsReplacement ? <div className="regeneration-guidance">
        <p>Gợi ý riêng cho câu thay thế</p>
        <label><span>Vì sao cần thay? <small>Không bắt buộc</small></span><textarea value={itemGuidance.reason} onChange={(event) => onGuidanceChange(problem.id, "reason", event.target.value)} maxLength={1000} rows={2} placeholder="Ví dụ: câu hỏi quá giống ví dụ đã học." /></label>
        <label><span>Muốn thay đổi như thế nào? <small>Không bắt buộc</small></span><textarea value={itemGuidance.requestedChange} onChange={(event) => onGuidanceChange(problem.id, "requestedChange", event.target.value)} maxLength={1000} rows={2} placeholder="Ví dụ: đổi ngữ cảnh, giữ nguyên kỹ năng và độ khó." /></label>
      </div> : null}
    </article>;
  })}{expandedAsset && safeTeacherAssetUrl(expandedAsset.access_url) ? (
    <div className="draft-asset-lightbox" role="dialog" aria-label="Hình bài tập phóng to" onClick={() => setExpandedAsset(null)}>
      <button type="button" onClick={() => setExpandedAsset(null)}>Đóng hình</button>
      {/* Private signed URLs must load directly without a Next image proxy. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={safeTeacherAssetUrl(expandedAsset.access_url)!} alt={expandedAsset.alt_text || "Hình bài tập"} />
    </div>
  ) : null}</div>;
}

function TeacherAssetList({ assets, onExpand }: { assets: TeacherProblemAsset[]; onExpand: (asset: TeacherProblemAsset) => void }) {
  if (!assets.length) return null;
  return <div className="draft-problem-assets" aria-label="Hình của bài tập">{[...assets].sort((a, b) => a.order - b.order).map((asset) => {
    const url = safeTeacherAssetUrl(asset.access_url);
    return <div key={`${asset.asset_id}:${asset.content_hash}`} className="draft-problem-asset">{url ? (
      <button type="button" onClick={() => onExpand(asset)} aria-label="Mở hình lớn">
        {/* Private signed URLs must load directly without a Next image proxy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} width={asset.width} height={asset.height} alt={asset.alt_text || "Hình của bài tập"} />
        <span>Phóng to hình</span>
      </button>
    ) : <span className="draft-asset-unavailable">Chưa tải được hình của bài này.</span>}</div>;
  })}</div>;
}

function safeTeacherAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return value;
  } catch { /* Invalid URLs are unavailable. */ }
  return null;
}

export function DraftReviewContent({ review, rejected, guidance, onToggle, onGuidanceChange, readOnly = false }: { review: DraftReviewModel; rejected: Set<string>; guidance: RegenerationGuidanceByProblem; onToggle: (id: string) => void; onGuidanceChange: (id: string, field: keyof RegenerationGuidance, value: string) => void; readOnly?: boolean }) {
  const hasContent = review.knowledgeSections.length || review.knowledgeProblems.length || review.masteryProblems.length;
  if (!hasContent) return <div className="list-empty"><Lightbulb size={26} /><h3>Bản nháp chưa có nội dung</h3><p>Thử tạo lại bài học để tải đủ phần kiến thức và luyện tập.</p></div>;
  return <div className="draft-review-content">
    {review.knowledgeSections.length > 0 && <section id="session-1-knowledge" className="draft-review-section"><header><div><span>Session 1</span><h2>Nội dung kiến thức</h2></div><small>{review.knowledgeSections.length} phần</small></header><div className="draft-knowledge-list">{review.knowledgeSections.map((section, index) => <article key={section.id}><span>Phần {String(index + 1).padStart(2, "0")}</span><h3>{section.title}</h3><MathContent>{section.content}</MathContent></article>)}</div></section>}
    {review.knowledgeProblems.length > 0 && <section id="session-1-checkpoints" className="draft-review-section"><header><div><span>Session 1</span><h2>Câu kiểm tra kiến thức</h2></div><small>{review.knowledgeProblems.length} câu</small></header><DraftProblemList problems={review.knowledgeProblems} rejected={rejected} guidance={guidance} onToggle={onToggle} onGuidanceChange={onGuidanceChange} readOnly={readOnly} /></section>}
    {review.masteryProblems.length > 0 && <section id="session-2-mastery" className="draft-review-section"><header><div><span>Session 2</span><h2>Bài luyện tập mastery</h2></div><small>{review.masteryProblems.length} bài</small></header><DraftProblemList problems={review.masteryProblems} rejected={rejected} guidance={guidance} onToggle={onToggle} onGuidanceChange={onGuidanceChange} readOnly={readOnly} /></section>}
  </div>;
}

async function waitForDocumentIndex(documentId: string, taxonomyVersion: number) {
  const timeoutAt = Date.now() + 120_000;
  while (Date.now() < timeoutAt) {
    const document = (await teacherApi.documents(taxonomyVersion)).find(
      (item) => item.documentId === documentId,
    );
    if (document?.indexStatus === "ready") return;
    if (document?.indexStatus === "failed" || document?.indexStatus === "needs_manual") {
      throw new Error("Tài liệu chưa đủ rõ để tự động dùng cho bài học này.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  throw new Error("Lập chỉ mục tài liệu mất quá nhiều thời gian. Hãy thử lại sau.");
}

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
      role: stringOrUndefined(item.role || item.recommended_problem_role || item.problem_role || item.type),
      skill: stringOrUndefined(item.primary_skill_id || item.skill_name || item.skill_id || item.skill_code),
      choices: rawChoices?.map(normalizeChoice),
      choiceIds: rawChoices?.map((choice, choiceIndex) => String(asRecord(choice)?.choice_id || asRecord(choice)?.id || choiceIndex)),
      assets: normalizeTeacherAssets(item.assets),
      answer: displayStringOrUndefined(item.answer ?? item.final_answer ?? item.correctAnswer ?? item.correct_answer),
      solution: stringOrUndefined(item.solution || item.explanation || item.solution_text),
      source: item,
      origin: stringOrUndefined(item.origin),
      sourceMode: stringOrUndefined(asRecord(item.metadata)?.source_task_mode || asRecord(item.metadata)?.source_mode),
      qualityContractVersion: typeof item.quality_contract_version === "number" ? item.quality_contract_version : undefined,
    };
  });
}

function normalizeTeacherAssets(value: unknown): TeacherProblemAsset[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((asset) => {
    const target = asset.target;
    const audience = asset.audience;
    const mime = asset.mime_type;
    if (typeof asset.asset_id !== "string" || !asset.asset_id ||
        typeof asset.content_hash !== "string" || !/^[0-9a-f]{64}$/.test(asset.content_hash) ||
        !["stem", "part", "choice", "solution"].includes(String(target)) ||
        !["public_problem", "private_solution"].includes(String(audience)) ||
        !["image/png", "image/jpeg", "image/webp"].includes(String(mime)) ||
        !Number.isInteger(asset.order) || Number(asset.order) < 0 ||
        !Number.isInteger(asset.width) || Number(asset.width) <= 0 ||
        !Number.isInteger(asset.height) || Number(asset.height) <= 0 ||
        ((target === "part" || target === "choice") && (typeof asset.target_id !== "string" || !asset.target_id)) ||
        ((target === "stem" || target === "solution") && asset.target_id != null) ||
        (target === "solution" && audience !== "private_solution") ||
        (audience === "private_solution" && target !== "solution")) return [];
    return [{
      asset_id: asset.asset_id,
      content_hash: asset.content_hash,
      target: target as TeacherProblemAsset["target"],
      target_id: typeof asset.target_id === "string" ? asset.target_id : null,
      order: Number(asset.order),
      audience: audience as TeacherProblemAsset["audience"],
      width: Number(asset.width),
      height: Number(asset.height),
      mime_type: mime as TeacherProblemAsset["mime_type"],
      alt_text: typeof asset.alt_text === "string" ? asset.alt_text : null,
      access_url: typeof asset.access_url === "string" ? asset.access_url : null,
    }];
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
export function buildRegenerationTargets(review: DraftReviewModel, rejected: Set<string>, guidance: RegenerationGuidanceByProblem = {}) {
  const targets: Array<{ kind: "mastery" | "knowledge_checkpoint"; id?: string; index?: number; reason?: string; requestedChange?: string }> = [];
  const withGuidance = (problemId: string) => {
    const reason = guidance[problemId]?.reason.trim();
    const requestedChange = guidance[problemId]?.requestedChange.trim();
    return {
      ...(reason ? { reason } : {}),
      ...(requestedChange ? { requestedChange } : {}),
    };
  };
  review.knowledgeProblems.forEach((problem, index) => {
    if (rejected.has(problem.id)) targets.push({ kind: "knowledge_checkpoint", index, ...withGuidance(problem.id) });
  });
  review.masteryProblems.forEach((problem) => {
    if (!rejected.has(problem.id)) return;
    const bankId = problem.source?.bank_problem_id;
    if (typeof bankId === "string" && bankId) targets.push({ kind: "mastery", id: bankId, ...withGuidance(problem.id) });
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
function uniqueStrings(values: string[]) { return Array.from(new Set(values.filter(Boolean))); }
function readableSkill(value: string) {
  const leaf = value.split("#").pop()?.split(":").pop() || value;
  return leaf.replace(/[-_]+/g, " ").trim();
}
function parseConceptKey(value: string) {
  const [subject, topic, concept] = value.split(":");
  if (!subject || !topic || !concept) return null;
  return { subject, topic, concept };
}
function originLabel(value: string) {
  if (value === "extracted") return "Trích nguyên từ tài liệu";
  if (value === "derived_variant") return "Biến thể từ tài liệu";
  if (value === "ai_generated") return "AI tự soạn";
  return value;
}
function problemSourceLabel(problem: ProblemView) {
  if (problem.sourceMode === "exact") return "Nguyên bản từ tài liệu";
  if (problem.sourceMode === "converted") return "Đã chuyển thành trắc nghiệm";
  if (problem.sourceMode === "derived") return "Biến thể từ tài liệu";
  return problem.origin ? originLabel(problem.origin) : "";
}
function defaultDeadline() { const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); date.setMinutes(0, 0, 0); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
