"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  Copy,
  Files,
  GraduationCap,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Student,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type FormEvent } from "react";
import { MathContent } from "@/components/shared/math-content";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";
import { skillDisplayName, skillLabelMap } from "@/lib/skill-labels";
import type { ClassTab, CopilotReportDetail, CopilotReportSummary, TeacherRoadmapItem, TeacherSubmission } from "@/types/contracts";

export function ClassWorkspace({ classId }: { classId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const [query, setQuery] = useState("");
  const [addStudentsOpen, setAddStudentsOpen] = useState(false);
  const tab = normalizeTab(search.get("tab"));
  const selectedStudent = search.get("student");
  const selectedLesson = search.get("lesson");
  const selectedReport = search.get("report");
  const hasSelection = Boolean(selectedStudent || selectedLesson || selectedReport);

  const classesQuery = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  const studentsQuery = useQuery({ queryKey: ["teacher", "classes", classId, "students"], queryFn: () => teacherApi.students(classId) });
  const roadmapQuery = useQuery({ queryKey: ["teacher", "classes", classId, "roadmap"], queryFn: () => teacherApi.roadmap(classId) });
  const reportsQuery = useQuery({
    queryKey: ["teacher", "copilot", "reports"],
    queryFn: teacherApi.reports,
    refetchInterval: (query) =>
      (query.state.data || []).some((report) =>
        ["PENDING", "ANALYSING"].includes(report.status),
      )
        ? 8_000
        : false,
  });

  const currentClass = classesQuery.data?.find((item) => item.class_id === classId);
  const classReports = useMemo(() => {
    const reports = reportsQuery.data || [];
    if (!currentClass) return [];
    return reports.filter((report) =>
      report.classIds?.includes(classId) || report.classNames.split(",").map((name) => name.trim()).includes(currentClass.class_name),
    );
  }, [reportsQuery.data, currentClass, classId]);
  const selectedReportSummary = classReports.find(
    (report) =>
      selectedReport !== null && reportSelectionIds(report).includes(selectedReport),
  );
  const selectedReportLesson = roadmapQuery.data?.find(
    (lesson) =>
      lesson.id === selectedReportSummary?.publicationId ||
      lesson.lessonId === selectedReportSummary?.lessonId,
  );

  const filteredStudents = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    if (!needle) return studentsQuery.data || [];
    return (studentsQuery.data || []).filter((student) => student.full_name.toLocaleLowerCase("vi").includes(needle) || student.username?.toLocaleLowerCase("vi").includes(needle));
  }, [query, studentsQuery.data]);

  function navigate(nextTab: ClassTab, selection?: { type: "student" | "lesson" | "report"; id: string }) {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    if (selection) params.set(selection.type, selection.id);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearSelection() {
    router.push(`${pathname}?tab=${tab}`);
  }

  if (classesQuery.isLoading) return <ClassSkeleton />;
  if (!currentClass) {
    return <div className="center-state"><WarningCircle size={30} /><h1>Không tìm thấy lớp học</h1><p>Lớp đã bị xóa hoặc bạn không có quyền truy cập.</p></div>;
  }

  return (
    <section className="class-workspace" data-detail-open={hasSelection}>
      <div className="class-master">
        <header className="class-header">
          <div className="class-heading-copy">
            <div className="class-icon"><GraduationCap size={23} weight="fill" /></div>
            <div><p className="workspace-kicker">Lớp học</p><h1>{currentClass.class_name}</h1><p>{currentClass.description || "Chưa có mô tả cho lớp này."}</p></div>
          </div>
          <div className="class-facts">
            <div><span>Mã lớp</span><strong className="font-mono">{currentClass.class_code}</strong><button className="text-button" onClick={() => navigator.clipboard.writeText(currentClass.class_code)}><Copy size={15} /> Copy</button></div>
            <div><span>Sĩ số</span><strong>{currentClass.student_count}</strong><small>học sinh</small></div>
            <button className="secondary-button" onClick={() => setAddStudentsOpen(true)}><Plus size={16} /> Thêm học sinh</button>
          </div>
        </header>

        <nav className="class-tabs" aria-label="Nội dung lớp học">
          <button data-active={tab === "students"} onClick={() => navigate("students")}><UsersThree size={17} /> Học sinh <span>{studentsQuery.data?.length || 0}</span></button>
          <button data-active={tab === "learning-path"} onClick={() => navigate("learning-path")}><BookOpenText size={17} /> Lộ trình <span>{roadmapQuery.data?.length || 0}</span></button>
          <button data-active={tab === "reports"} onClick={() => navigate("reports")}><ClipboardText size={17} /> Báo cáo <span>{classReports.length}</span></button>
        </nav>

        <div className="class-list-area">
          {tab === "students" && (
            <StudentList query={query} setQuery={setQuery} loading={studentsQuery.isLoading} error={studentsQuery.error} students={filteredStudents} selected={selectedStudent} onSelect={(id) => navigate("students", { type: "student", id })} />
          )}
          {tab === "learning-path" && (
            <LessonList loading={roadmapQuery.isLoading} error={roadmapQuery.error} lessons={roadmapQuery.data || []} selected={selectedLesson} studentCount={currentClass.student_count} onSelect={(id) => navigate("learning-path", { type: "lesson", id })} />
          )}
          {tab === "reports" && (
            <ReportList loading={reportsQuery.isLoading} error={reportsQuery.error} reports={classReports} selected={selectedReport} onSelect={(id) => navigate("reports", { type: "report", id })} />
          )}
        </div>
      </div>

      <aside className="class-detail" aria-label="Chi tiết">
        {hasSelection && <button className="detail-back" onClick={clearSelection}><ArrowLeft size={17} /> Quay lại danh sách</button>}
        {selectedStudent ? <StudentDetail classId={classId} studentId={selectedStudent} studentName={studentsQuery.data?.find((student) => student.student_id === selectedStudent)?.full_name || "Học sinh"} /> : selectedLesson ? <LessonDetail lesson={roadmapQuery.data?.find((lesson) => lesson.id === selectedLesson || lesson.lessonId === selectedLesson)} studentCount={currentClass.student_count} /> : selectedReport ? <ReportDetail summary={selectedReportSummary} classId={classId} completedCount={selectedReportSummary?.completedStudents ?? selectedReportLesson?.completedCount ?? 0} studentCount={selectedReportSummary?.totalStudents ?? currentClass.student_count} /> : <DetailEmpty tab={tab} />}
      </aside>

      <AnimatePresence>{addStudentsOpen && <AddStudentsSheet classId={classId} onClose={() => setAddStudentsOpen(false)} />}</AnimatePresence>
    </section>
  );
}

function StudentList({ query, setQuery, loading, error, students, selected, onSelect }: { query: string; setQuery: (value: string) => void; loading: boolean; error: unknown; students: Array<{ student_id: string; full_name: string; username?: string }>; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="list-toolbar"><label className="search-field"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm học sinh" /></label><span>{students.length} học sinh</span></div>
      {loading ? <ListSkeleton /> : error ? <ListError error={error} /> : students.length ? <div className="entity-list">{students.map((student, index) => <button key={student.student_id} data-selected={selected === student.student_id} onClick={() => onSelect(student.student_id)}><span className="student-index">{String(index + 1).padStart(2, "0")}</span><span className="student-avatar">{initials(student.full_name)}</span><span className="entity-main"><strong>{student.full_name}</strong><small>{student.username || "Học sinh"}</small></span><span className="entity-action">Xem hồ sơ</span></button>)}</div> : <ListEmpty icon={<Student size={26} />} title="Chưa có học sinh" body="Dùng nút Thêm học sinh ở phía trên để xây danh sách lớp." />}
    </>
  );
}

function LessonList({ loading, error, lessons, selected, studentCount, onSelect }: { loading: boolean; error: unknown; lessons: TeacherRoadmapItem[]; selected: string | null; studentCount: number; onSelect: (id: string) => void }) {
  if (loading) return <ListSkeleton />;
  if (error) return <ListError error={error} />;
  if (!lessons.length) return <ListEmpty icon={<BookOpenText size={26} />} title="Chưa có bài học" body="Tạo bài học đầu tiên để bắt đầu lộ trình của lớp." action={<Link className="primary-button" href="/teacher/lessons/new">Tạo bài học</Link>} />;
  return <div className="lesson-path">{lessons.map((lesson, index) => { const progress = studentCount ? Math.round((lesson.completedCount / studentCount) * 100) : 0; return <button key={lesson.id} data-selected={selected === lesson.id || selected === lesson.lessonId} onClick={() => onSelect(lesson.id)}><span className="path-node">{index + 1}</span><span className="entity-main"><small>{index === 0 ? "Bài học hiện tại" : `Bài học ${index + 1}`}</small><strong>{lesson.title}</strong><span>{lesson.questionsCount} câu hỏi</span></span><span className="lesson-progress"><strong>{progress}%</strong><small>{lesson.completedCount}/{studentCount} hoàn thành</small></span></button>; })}</div>;
}

function ReportList({ loading, error, reports, selected, onSelect }: { loading: boolean; error: unknown; reports: CopilotReportSummary[]; selected: string | null; onSelect: (id: string) => void }) {
  if (loading) return <ListSkeleton />;
  if (error) return <ListError error={error} />;
  if (!reports.length) return <ListEmpty icon={<ClipboardText size={26} />} title="Chưa có báo cáo" body="Báo cáo xuất hiện sau deadline khi lớp đã có dữ liệu làm bài." />;
  return <div className="entity-list report-list">{reports.map((report) => { const id = reportSelectionId(report); return <button key={`${report.classId || report.classIds[0]}:${id}`} data-selected={selected !== null && reportSelectionIds(report).includes(selected)} onClick={() => onSelect(id)}><span className="report-status" data-status={report.status}>{report.status === "REPORT_READY" ? <CheckCircle size={18} weight="fill" /> : report.status === "FAILED" ? <WarningCircle size={18} /> : <ClockCounterClockwise size={18} />}</span><span className="entity-main"><strong>{report.title}</strong><small>{report.subject} / {report.topic}</small></span><span className="entity-action">{report.status === "REPORT_READY" ? "Xem báo cáo" : statusLabel(report.status)}</span></button>; })}</div>;
}

function reportSelectionId(report: CopilotReportSummary) {
  return report.publicationId || report.reportId || report.lessonId;
}

function reportSelectionIds(report: CopilotReportSummary) {
  return [report.publicationId, report.reportId, report.lessonId].filter(
    (value): value is string => Boolean(value),
  );
}

function StudentDetail({ classId, studentId, studentName }: { classId: string; studentId: string; studentName: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"overview" | "submissions" | "activity">("overview");
  const metrics = useQuery({ queryKey: ["teacher", "classes", classId, "students", studentId, "metrics"], queryFn: () => teacherApi.metrics(classId, studentId) });
  const submissions = useQuery({ queryKey: ["teacher", "classes", classId, "students", studentId, "submissions"], queryFn: () => teacherApi.studentSubmissions(classId, studentId), enabled: tab === "submissions" });
  const activity = useQuery({ queryKey: ["teacher", "classes", classId, "students", studentId, "activity"], queryFn: () => teacherApi.studentActivity(classId, studentId), enabled: tab === "activity" });
  const grade = useMutation({ mutationFn: ({ id, grade, feedback }: { id: string; grade: number; feedback: string }) => teacherApi.grade(id, { grade, feedback }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["teacher", "classes", classId, "students", studentId] }); } });

  return (
    <div className="detail-content">
      <div className="student-profile-heading"><span className="student-avatar large">{initials(studentName)}</span><div><p className="workspace-kicker">Hồ sơ học sinh</p><h2>{studentName}</h2></div></div>
      <div className="detail-tabs"><button data-active={tab === "overview"} onClick={() => setTab("overview")}>Tổng quan</button><button data-active={tab === "submissions"} onClick={() => setTab("submissions")}>Bài nộp</button><button data-active={tab === "activity"} onClick={() => setTab("activity")}>Hoạt động</button></div>
      {tab === "overview" && (metrics.isLoading ? <ListSkeleton /> : metrics.isError ? <ListError error={metrics.error} /> : <MetricsOverview data={metrics.data} />)}
      {tab === "submissions" && (submissions.isLoading ? <ListSkeleton /> : submissions.isError ? <ListError error={submissions.error} /> : <SubmissionList items={submissions.data || []} onGrade={(id, value, feedback) => grade.mutate({ id, grade: value, feedback })} saving={grade.isPending} />)}
      {tab === "activity" && (activity.isLoading ? <ListSkeleton /> : activity.isError ? <ListError error={activity.error} /> : <ActivityList items={activity.data || []} />)}
    </div>
  );
}

function MetricsOverview({ data }: { data: Awaited<ReturnType<typeof teacherApi.metrics>> | undefined }) {
  if (!data) return null;
  const metrics = [
    { label: "Độ đúng", value: data.correctnessScore },
    { label: "Tự lực", value: data.independenceScore },
    { label: "Lập luận", value: data.reasoningScore },
    { label: "Vận dụng", value: data.transferScore },
  ].filter((item): item is { label: string; value: number } => item.value != null);
  if (!metrics.length) return <div className="detail-section-stack"><div className="student-empty-inline">Chưa đủ dữ liệu năng lực.</div></div>;
  return <div className="detail-section-stack"><div className="metric-grid">{metrics.map((item) => <div key={item.label}><span>{item.label}</span><strong>{normalizeScore10(item.value).toFixed(1)}</strong><small>/10</small></div>)}</div><section className="detail-section"><h3>Kỹ năng gần đây</h3>{data.mastery?.length ? <div className="mastery-list">{data.mastery.map((item) => <div key={item.skill}><span><strong>{item.skill}</strong><small>{item.status || "Đang học"}</small></span><b>{normalizeScore10(item.score).toFixed(1)}</b></div>)}</div> : <p className="muted-copy">Chưa đủ dữ liệu kỹ năng để phân tích.</p>}</section></div>;
}

function SubmissionList({ items, onGrade, saving }: { items: TeacherSubmission[]; onGrade: (id: string, value: number, feedback: string) => void; saving: boolean }) {
  if (!items.length) return <ListEmpty icon={<Files size={25} />} title="Chưa có bài nộp" body="Các bài đã nộp sẽ xuất hiện theo thứ tự gần nhất." />;
  return <div className="submission-list">{items.map((item, index) => <SubmissionEditor key={item.submission_id || item.id || index} item={item} onGrade={onGrade} saving={saving} />)}</div>;
}

function SubmissionEditor({ item, onGrade, saving }: { item: TeacherSubmission; onGrade: (id: string, value: number, feedback: string) => void; saving: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [score, setScore] = useState(String(item.grade ?? ""));
  const [feedback, setFeedback] = useState(item.feedback || "");
  const id = item.submission_id || item.id || "";
  return <article className="submission-card"><button className="submission-summary" onClick={() => setExpanded((value) => !value)}><span><strong>{item.lessonTitle || "Bài nộp"}</strong><small>{formatDate(item.submitted_at || item.submittedAt)} / {item.status || "Đã nộp"}</small></span><b>{item.grade == null ? "Chưa chấm" : `${item.grade}/10`}</b></button>{expanded && <div className="submission-editor"><div className="submission-content"><span>Nội dung nộp</span><pre>{renderContent(item.content)}</pre></div><div className="grading-grid"><div className="form-field"><label htmlFor={`score-${id}`}>Điểm 0-10</label><input id={`score-${id}`} className="input" type="number" min="0" max="10" step="0.1" value={score} onChange={(event) => setScore(event.target.value)} /></div><div className="form-field"><label htmlFor={`feedback-${id}`}>Feedback</label><textarea id={`feedback-${id}`} className="textarea !min-h-20" value={feedback} onChange={(event) => setFeedback(event.target.value)} /></div></div><button className="primary-button" disabled={saving || !id || Number(score) < 0 || Number(score) > 10} onClick={() => onGrade(id, Number(score), feedback)}>Lưu đánh giá</button></div>}</article>;
}

function ActivityList({ items }: { items: Array<{ id?: string; eventType?: string; event_type?: string; createdAt?: string; created_at?: string }> }) {
  if (!items.length) return <ListEmpty icon={<ClockCounterClockwise size={25} />} title="Chưa có hoạt động" body="Timeline sẽ đầy hơn khi học sinh mở bài và làm AI session." />;
  return <div className="activity-list">{items.map((item, index) => <div key={item.id || index}><span className="activity-node" /><span><strong>{activityLabel(item.eventType || item.event_type)}</strong><small>{formatDate(item.createdAt || item.created_at, true)}</small></span></div>)}</div>;
}

function LessonDetail({ lesson, studentCount }: { lesson: TeacherRoadmapItem | undefined; studentCount: number }) {
  if (!lesson) return <DetailEmpty tab="learning-path" />;
  const incomplete = Math.max(studentCount - lesson.completedCount, 0);
  const hook = lessonHook(lesson);
  return <div className="detail-content"><p className="workspace-kicker">Chi tiết bài học</p><h2>{lesson.title}</h2><div className="metric-grid two"><div><span>Đã hoàn thành</span><strong>{lesson.completedCount}</strong><small>/{studentCount}</small></div><div><span>Chưa hoàn thành</span><strong>{incomplete}</strong><small>học sinh</small></div></div><section className="detail-section"><h3>Nội dung</h3>{hook?.trim() && <div className="knowledge-hook"><strong>Hook bài học</strong><MathContent>{hook}</MathContent></div>}<div className="lesson-facts"><div><span>Số câu hỏi</span><strong>{lesson.questionsCount}</strong></div><div><span>Trạng thái</span><strong>Đang mở</strong></div><div><span>Deadline</span><strong>{formatDate(lesson.deadline)}</strong></div></div></section></div>;
}

function lessonHook(lesson: TeacherRoadmapItem) {
  const directHook = firstText(lesson.lesson1Knowledge?.hook, lesson.knowledge?.hook, lesson.hook);
  if (directHook) return directHook;
  const source = firstText(
    lesson.lesson1Knowledge?.items?.map((item) => item.content).join("\n\n"),
    lesson.knowledge?.content,
    lesson.knowledge?.material,
    lesson.material,
    lesson.content,
    lesson.description,
  );
  return source ? extractMarkdownSection(source, "Đặt vấn đề") : "";
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function extractMarkdownSection(value: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`(^|\\s)#{1,6}\\s+${escapedHeading}\\s*`, "i");
  const start = value.search(headingPattern);
  if (start < 0) return "";
  const afterHeading = value.slice(start).replace(headingPattern, "");
  const nextHeading = afterHeading.search(/\s#{1,6}\s+\S/);
  return (nextHeading >= 0 ? afterHeading.slice(0, nextHeading) : afterHeading).trim();
}

function ReportDetail({ summary, classId, completedCount, studentCount }: { summary?: CopilotReportSummary; classId: string; completedCount: number; studentCount: number }) {
  const queryClient = useQueryClient();
  const reportId = summary?.reportId || "";
  const report = useQuery({ queryKey: ["teacher", "copilot", reportId, "report"], queryFn: () => teacherApi.report(reportId), enabled: Boolean(reportId) });
  const skillLabels = useQuery({ queryKey: ["curriculum", "skills", report.data?.subject, report.data?.topic, report.data?.concept], queryFn: () => teacherApi.curriculumSkills(report.data?.subject || "", report.data?.topic || "", report.data?.concept || ""), enabled: Boolean(report.data?.subject && report.data?.topic && report.data?.concept), staleTime: Infinity });
  const runReport = useMutation({
    mutationFn: async () => {
      if (!summary?.publicationId) throw new Error("Báo cáo chưa gắn với publication.");
      return teacherApi.runClassReport(summary.publicationId, classId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teacher", "copilot", "reports"] });
    },
  });

  if (!summary) return <div className="detail-content"><ListEmpty icon={<WarningCircle size={25} />} title="Không tìm thấy bài học" body="Danh sách báo cáo vừa thay đổi. Hãy chọn lại bài học." /></div>;
  const cannotRun = completedCount === 0 || summary.status === "ANALYSING" || runReport.isPending || !summary.publicationId;
  const runLabel = summary.status === "REPORT_READY" ? "Tạo phiên bản báo cáo mới" : summary.status === "FAILED" ? "Chạy lại báo cáo" : "Chạy báo cáo";
  const runAction = <div className="report-manual-run"><p>{completedCount}/{studentCount} học sinh đã hoàn thành.</p><button className="secondary-button" disabled={cannotRun} onClick={() => runReport.mutate()}><Sparkle size={16} weight="fill" />{runReport.isPending ? "Đang gửi yêu cầu" : summary.status === "ANALYSING" ? "Đang phân tích" : runLabel}</button>{completedCount === 0 ? <small>Cần ít nhất một học sinh hoàn thành trước khi chạy báo cáo.</small> : null}{runReport.isError ? <small className="student-form-error">{getApiErrorMessage(runReport.error, "Không thể chạy báo cáo.")}</small> : null}</div>;

  if (summary.status !== "REPORT_READY") return <div className="detail-content"><p className="workspace-kicker">Báo cáo bài học</p><h2>{summary.title}</h2><div className="report-processing"><ClockCounterClockwise size={28} /><h3>{statusLabel(summary.status)}</h3><p>{summary.status === "ANALYSING" ? "Copilot đang tạo một immutable report version cho lớp này." : "Bạn có thể chạy báo cáo từ dữ liệu hiện có mà không cần chờ deadline."}</p></div>{runAction}</div>;
  if (report.isLoading) return <div className="detail-content"><ListSkeleton /></div>;
  if (report.isError) return <div className="detail-content"><ListError error={report.error} /></div>;
  const data = report.data;
  if (!data?.report) return <div className="detail-content"><p className="workspace-kicker">Báo cáo bài học</p><h2>{summary.title}</h2><ListEmpty icon={<WarningCircle size={25} />} title="Báo cáo chưa có nội dung" body="Trạng thái đã hoàn tất nhưng dữ liệu phân tích đang trống. Thử tải lại sau." />{runAction}</div>;
  const skill = data.report;
  const labels = skillLabelMap(skillLabels.data);
  return <div className="detail-content report-detail"><p className="workspace-kicker">Báo cáo bài học</p><h2>{data.title}</h2><p className="detail-lead">Phiên bản {data.reportVersion || 1}, phân tích từ {data.totalStudents} học sinh, thang điểm {skill.score_scale}.</p><SkillPerformanceTable metrics={skill.skill_metrics} labels={labels} /><section className="detail-section"><h3>Kỹ năng lớp làm tốt</h3><SkillChips items={skill.strengths} labels={labels} empty="Chưa có kỹ năng nổi bật." /></section><section className="detail-section"><h3>Cần củng cố</h3><SkillChips items={skill.top_weak_skill_ids.length ? skill.top_weak_skill_ids : skill.gaps} labels={labels} empty="Không có khoảng trống kỹ năng đáng kể." warning /></section>{skill.not_assessed_skill_ids?.length ? <section className="detail-section"><h3>Chưa được đánh giá</h3><SkillChips items={skill.not_assessed_skill_ids} labels={labels} empty="" /></section> : null}<GroupList title="Cần phụ đạo" ids={skill.remedial_student_ids} names={skill.student_names} /><GroupList title="Đang theo kịp" ids={skill.on_track_student_ids || []} names={skill.student_names} /><GroupList title="Có thể nâng cao" ids={skill.advanced_student_ids} names={skill.student_names} /><GroupList title="Chưa hoàn thành" ids={skill.not_finished_student_ids} names={skill.student_names} />{skill.not_assessed_student_ids?.length ? <GroupList title="Đã hoàn thành nhưng chưa có evidence" ids={skill.not_assessed_student_ids} names={skill.student_names} /> : null}{runAction}<section className="report-actions"><Link className="primary-button" href={`/teacher/copilot/${reportId}/extra`}><Sparkle size={16} weight="fill" /> Tạo bài follow-up</Link><Link className="secondary-button" href={`/teacher/lessons/new?fromReport=${reportId}`}>Tạo bài tiếp theo</Link></section></div>;
}

type SkillMetric = NonNullable<NonNullable<CopilotReportDetail["report"]>["skill_metrics"]>[string];

function SkillPerformanceTable({ metrics, labels }: { metrics?: Record<string, SkillMetric>; labels: Record<string, string> }) {
  const rows = Object.values(metrics || {}).sort((left, right) => left.lesson_average - right.lesson_average);
  if (!rows.length) return null;
  return <section className="detail-section"><h3>Hiệu suất theo kỹ năng</h3><div className="skill-performance-list">{rows.map((metric) => <div key={metric.skill_id}><div className="skill-performance-heading"><span title={metric.skill_id}>{skillDisplayName(metric.skill_id, labels)}</span><strong>{metric.lesson_average.toFixed(1)}<small>/10</small></strong></div><div className="skill-performance-context"><span>{metric.assessed_student_count} học sinh</span>{metric.cumulative_average != null && <span>Tích lũy {metric.cumulative_average.toFixed(1)}</span>}</div><div className="skill-performance-axes"><span>Độ đúng {formatPercent(metric.correctness)}</span><span>Độc lập {formatPercent(metric.independence)}</span><span>Lập luận {formatPercent(metric.reasoning)}</span>{metric.transfer != null && <span>Vận dụng {formatPercent(metric.transfer)}</span>}</div></div>)}</div></section>;
}

function SkillChips({ items, empty, labels, warning = false }: { items: string[]; empty: string; labels: Record<string, string>; warning?: boolean }) { return items.length ? <div className="skill-chips" data-warning={warning}>{items.map((item) => <span key={item} title={item}>{skillDisplayName(item, labels)}</span>)}</div> : <p className="muted-copy">{empty}</p>; }
function GroupList({ title, ids, names }: { title: string; ids: string[]; names: Record<string, string> }) { if (!ids.length) return null; return <section className="detail-section"><h3>{title} <span>{ids.length}</span></h3><div className="name-grid">{ids.map((id) => <span key={id}>{names[id] || id}</span>)}</div></section>; }

function DetailEmpty({ tab }: { tab: ClassTab }) {
  const content = tab === "students" ? { icon: <Student size={28} />, title: "Chọn một học sinh", body: "Hồ sơ, bài nộp và hoạt động sẽ xuất hiện ở đây." } : tab === "learning-path" ? { icon: <BookOpenText size={28} />, title: "Chọn một bài học", body: "Xem tiến độ, deadline và nhóm chưa hoàn thành." } : { icon: <ClipboardText size={28} />, title: "Chọn một báo cáo", body: "Xem kỹ năng yếu và tạo bài học tiếp theo." };
  return <div className="detail-empty">{content.icon}<h2>{content.title}</h2><p>{content.body}</p></div>;
}

function AddStudentsSheet({ classId, onClose }: { classId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ added: string[]; skipped: string[]; notFound: string[] } | null>(null);
  const [error, setError] = useState("");
  const add = useMutation({ mutationFn: teacherApi.addStudents, onSuccess: async (data) => { setResult(data); await queryClient.invalidateQueries({ queryKey: ["teacher", "classes", classId] }); }, onError: (addError) => setError(getApiErrorMessage(addError)) });
  function submit(event: FormEvent) { event.preventDefault(); const usernames = value.split(/[\n,\s]+/).map((item) => item.trim()).filter(Boolean); if (!usernames.length) { setError("Nhập ít nhất một username."); return; } setError(""); add.mutate({ classId, usernames }); }
  return <><motion.button className="sheet-backdrop" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-label="Đóng" /><motion.aside className="side-sheet" initial={reduceMotion ? false : { x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 260, damping: 30 }}><div className="sheet-header"><div><p className="sidebar-label">Danh sách lớp</p><h2 className="text-xl font-semibold tracking-[-0.03em]">Thêm học sinh</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="sheet-body"><form className="form-stack" onSubmit={submit}>{error && <p className="inline-error">{error}</p>}<div className="form-field"><label htmlFor="student-usernames">Username học sinh</label><textarea id="student-usernames" className="textarea" value={value} onChange={(event) => setValue(event.target.value)} placeholder={"nguyenan\ntranminh\nlethao"} /><small>Mỗi username một dòng, hoặc phân cách bằng dấu phẩy.</small></div><button className="primary-button" disabled={add.isPending}>{add.isPending ? "Đang thêm" : "Thêm vào lớp"}</button>{result && <div className="import-result">{result.added.length > 0 && <div data-kind="success"><Check size={16} /><span><strong>Đã thêm {result.added.length}</strong><small>{result.added.join(", ")}</small></span></div>}{result.skipped.length > 0 && <div><span><strong>Đã có trong lớp {result.skipped.length}</strong><small>{result.skipped.join(", ")}</small></span></div>}{result.notFound.length > 0 && <div data-kind="error"><WarningCircle size={16} /><span><strong>Không tìm thấy {result.notFound.length}</strong><small>{result.notFound.join(", ")}</small></span></div>}</div>}</form></div></motion.aside></>;
}

function ListSkeleton() { return <div className="grid gap-2 p-4"><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>; }
function ListError({ error }: { error: unknown }) { return <div className="list-error"><WarningCircle size={24} /><strong>Không tải được dữ liệu</strong><span>{getApiErrorMessage(error)}</span></div>; }
function ListEmpty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) { return <div className="list-empty">{icon}<h3>{title}</h3><p>{body}</p>{action}</div>; }
function ClassSkeleton() { return <section className="class-workspace" data-detail-open="false"><div className="class-master p-6"><div className="skeleton h-32" /><div className="skeleton h-12 mt-4" /><ListSkeleton /></div><aside className="class-detail" aria-label="Chi tiết"><ListSkeleton /></aside></section>; }
function normalizeTab(value: string | null): ClassTab { return value === "learning-path" || value === "reports" ? value : "students"; }
function normalizeScore10(value: number | null | undefined) { const numeric = Number(value || 0); return numeric > 10 && numeric <= 100 ? numeric / 10 : numeric; }
function formatPercent(value: number) { return `${Math.round(value * 100)}%`; }
function initials(value: string) { return value.split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase(); }
function statusLabel(value: string) { return value === "PENDING" ? "Chờ deadline" : value === "ANALYSING" ? "Đang phân tích" : value === "FAILED" ? "Phân tích thất bại" : "Sẵn sàng"; }
function formatDate(value?: string, includeTime = false) { if (!value) return "Chưa đặt"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "Chưa rõ"; return new Intl.DateTimeFormat("vi-VN", includeTime ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function renderContent(value: unknown) { if (value == null) return "Không có nội dung văn bản."; if (typeof value === "string") return value; return JSON.stringify(value, null, 2); }
function activityLabel(value?: string) { const labels: Record<string, string> = { LESSON_OPENED: "Mở bài học", EXTRA_LESSON_OPENED: "Mở bài bổ sung", AI_SESSION_STARTED: "Bắt đầu AI session", AI_SESSION_CLOSED: "Kết thúc AI session" }; return labels[value || ""] || value || "Hoạt động học tập"; }
