"use client";

import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenText,
  CalendarBlank,
  ChalkboardTeacher,
  Compass,
  Lightning,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { studentApi, studentKeys } from "@/lib/student-api";
import type { StudentAssignment, StudentRoadmapItem } from "@/types/contracts";

type StoredProgress = { completedItems?: number[]; lastOpenedAt?: string };

function readLessonProgress(userId: string | undefined, exerciseId: string): StoredProgress {
  if (typeof window === "undefined" || !userId) return {};
  try {
    return JSON.parse(localStorage.getItem(`dfriend:s1:${userId}:${exerciseId}`) || "{}");
  } catch {
    return {};
  }
}

function assignmentProgress(
  assignment: StudentAssignment,
  userId: string | undefined,
  hydrated: boolean,
): StoredProgress {
  const local = hydrated
    ? readLessonProgress(userId, assignment.assignment_id)
    : {};
  return {
    ...local,
    completedItems: Array.from(
      new Set([
        ...(assignment.session1_completed_items || []),
        ...(local.completedItems || []),
      ]),
    ),
  };
}

export function TodayDashboard() {
  const reduceMotion = useReducedMotion();
  const hydrated = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const [now] = useState(() => Date.now());
  const meQuery = useQuery({ queryKey: studentKeys.me, queryFn: studentApi.me });
  const classesQuery = useQuery({ queryKey: studentKeys.classes, queryFn: studentApi.classes });
  const assignmentsQuery = useQuery({
    queryKey: studentKeys.assignments,
    queryFn: studentApi.assignments,
  });
  const metricsQuery = useQuery({ queryKey: studentKeys.metrics, queryFn: studentApi.metrics });
  const roadmaps = useQueries({
    queries: (classesQuery.data || []).map((item) => ({
      queryKey: studentKeys.roadmap(item.class_id),
      queryFn: () => studentApi.roadmap(item.class_id),
      enabled: Boolean(item.class_id),
    })),
  });

  const classMap = useMemo(
    () => new Map((classesQuery.data || []).map((item) => [item.class_id, item])),
    [classesQuery.data],
  );
  const roadmapMap = useMemo(() => {
    const map = new Map<string, StudentRoadmapItem>();
    roadmaps.forEach((query) => query.data?.forEach((item) => map.set(item.id, item)));
    return map;
  }, [roadmaps]);
  const assignments = useMemo(() => {
    return [...(assignmentsQuery.data || [])].sort((a, b) => {
      const aProgress = assignmentProgress(a, meQuery.data?.id, hydrated).completedItems?.length || 0;
      const bProgress = assignmentProgress(b, meQuery.data?.id, hydrated).completedItems?.length || 0;
      const aOverdue = new Date(a.due_date).getTime() < now || a.status === "OVERDUE";
      const bOverdue = new Date(b.due_date).getTime() < now || b.status === "OVERDUE";
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (Boolean(aProgress) !== Boolean(bProgress)) return aProgress ? -1 : 1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [assignmentsQuery.data, hydrated, meQuery.data?.id, now]);
  const followUps = useMemo(
    () =>
      roadmaps.flatMap((query, classIndex) =>
        (query.data || [])
          .filter(
            (item) =>
              Boolean(item.extra_exercises?.length) && !item.extra_completed,
          )
          .map((item) => ({
            lessonId: item.lessonId,
            title: item.title,
            className:
              classesQuery.data?.[classIndex]?.class_name || "Lớp học",
            exerciseCount: (item.extra_exercises || []).reduce(
              (count, group) => count + group.exercises.length,
              0,
            ),
          })),
      ),
    [classesQuery.data, roadmaps],
  );

  const isLoading = meQuery.isLoading || classesQuery.isLoading || assignmentsQuery.isLoading;
  const hasPartialError =
    meQuery.isError || classesQuery.isError || assignmentsQuery.isError || metricsQuery.isError;
  const name = (meQuery.data?.full_name || meQuery.data?.username || "bạn").split(/\s+/).at(-1);
  const metrics = metricsQuery.data;
  const metricItems = [
    { label: "Độ đúng", value: metrics?.correctness_score },
    { label: "Tự lực", value: metrics?.independence_score },
    { label: "Lập luận", value: metrics?.reasoning_score },
    { label: "Vận dụng", value: metrics?.transfer_score },
  ];
  const allMetricsZero =
    !metrics || metricItems.every((item) => item.value == null);

  return (
    <div className="student-page student-today-page">
      <motion.section
        className="today-hero"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
        <div>
          <p className="student-kicker">Hôm nay</p>
          <h1>Chào {name}, mình học gì?</h1>
          <p>Mở một bài và bắt đầu lại từ Session 1. Phần đã hoàn thành vẫn được giữ nguyên.</p>
        </div>
        <div className="today-count">
          <strong>{classesQuery.data?.length || 0}</strong>
          <span>lớp đang tham gia</span>
          <i />
          <strong>{assignments.length + followUps.length}</strong>
          <span>bài đang mở</span>
        </div>
      </motion.section>

      {hasPartialError && (
        <div className="student-inline-banner" role="alert">
          <WarningCircle size={20} />
          <div><strong>Một phần dữ liệu chưa tải được.</strong><span>Bạn vẫn có thể dùng các phần đang hiển thị.</span></div>
        </div>
      )}

      {!isLoading && classesQuery.data?.length ? (
        <section className="today-overview" aria-label="Tổng quan học tập">
          <div className="weekly-climb">
            <div>
              <span>Đường học tuần này</span>
              <strong>{classesQuery.data.reduce((sum, item) => sum + item.completed_lessons, 0)} bài đã xong</strong>
            </div>
            <div className="mini-ridge" aria-hidden="true">
              <span data-done="true" /><span data-done="true" /><span data-current="true" /><span /><span />
            </div>
          </div>
          <div className="competence-snapshot">
            {allMetricsZero ? (
              <div className="metrics-empty"><Compass size={24} /><span>Hoàn thành Session 2 đầu tiên để xem năng lực.</span></div>
            ) : (
              <>
                {metricItems
                  .filter((item): item is { label: string; value: number } => item.value != null)
                  .map((item) => <Metric key={item.label} label={item.label} value={item.value} />)}
              </>
            )}
          </div>
        </section>
      ) : null}

      <section className="student-section">
        <div className="student-section-heading">
          <div><h2>Bài học hiện tại</h2><p>Tất cả bài đang mở, sắp theo việc cần chú ý trước.</p></div>
          {classesQuery.data?.length ? <Link href="/student/roadmap">Xem lộ trình <ArrowRight size={16} /></Link> : null}
        </div>

        {isLoading ? (
          <div className="lesson-grid" aria-label="Đang tải bài học">
            <div className="student-skeleton lesson-skeleton" />
            <div className="student-skeleton lesson-skeleton" />
          </div>
        ) : !classesQuery.data?.length ? (
          <div className="student-empty-state">
            <ChalkboardTeacher size={34} />
            <h2>Tham gia lớp đầu tiên</h2>
            <p>Dùng mã lớp giáo viên gửi để nhận bài học và lộ trình của bạn.</p>
            <Link className="student-primary-button" href="/student/classes?join=1">Nhập mã lớp</Link>
          </div>
        ) : assignments.length || followUps.length ? (
          <div className="lesson-grid">
            {followUps.map((followUp, index) => (
              <FollowUpCard key={followUp.lessonId} {...followUp} index={index} />
            ))}
            {assignments.map((assignment, index) => (
              <LessonCard
                key={assignment.assignment_id}
                assignment={assignment}
                className={classMap.get(assignment.class_id)?.class_name || "Lớp học"}
                progress={assignmentProgress(assignment, meQuery.data?.id, hydrated)}
                roadmap={roadmapMap.get(assignment.assignment_id)}
                index={index + followUps.length}
                now={now}
              />
            ))}
          </div>
        ) : (
          <div className="student-empty-state compact">
            <BookOpenText size={32} />
            <h2>Chưa có bài đang mở</h2>
            <p>Bạn có thể xem lại những bài đã hoàn thành trong Lộ trình.</p>
            <Link className="student-secondary-button" href="/student/roadmap">Mở lộ trình</Link>
          </div>
        )}
      </section>
    </div>
  );
}

function FollowUpCard({ lessonId, title, className, exerciseCount, index }: { lessonId: string; title: string; className: string; exerciseCount: number; index: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      className="lesson-card follow-up-card"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <div className="lesson-card-meta"><span>{className}</span><span className="deadline"><Lightning size={15} weight="fill" /> Bài theo feedback</span></div>
      <div className="lesson-card-copy"><h3>Luyện thêm: {title}</h3><p>Giáo viên đã gửi một chặng luyện tập dựa trên kết quả bài vừa rồi.</p></div>
      <div className="lesson-card-progress"><Compass size={18} /><div><strong>{exerciseCount} bài được chọn cho bạn</strong><span>Bắt đầu ngay với Study Buddy, không cần học lại Session 1.</span></div></div>
      <Link className="student-primary-button" href={`/student/lesson/extra_${lessonId}/part2`}>Bắt đầu luyện thêm <ArrowRight size={17} /></Link>
    </motion.article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric-value"><span>{label}</span><strong>{formatScore(value)}</strong><small>/10</small></div>;
}

function LessonCard({
  assignment,
  className,
  progress,
  roadmap,
  index,
  now,
}: {
  assignment: StudentAssignment;
  className: string;
  progress: StoredProgress;
  roadmap?: StudentRoadmapItem;
  index: number;
  now: number;
}) {
  const reduceMotion = useReducedMotion();
  const completedCount = progress.completedItems?.length || 0;
  const overdue = assignment.status === "OVERDUE" || new Date(assignment.due_date).getTime() < now;
  const started = completedCount > 0;
  return (
    <motion.article
      className="lesson-card"
      data-overdue={overdue}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <div className="lesson-card-meta">
        <span>{className}</span>
        <span className={overdue ? "deadline overdue" : "deadline"}>
          <CalendarBlank size={15} /> {deadlineCopy(assignment.due_date, overdue, now)}
        </span>
      </div>
      <div className="lesson-card-copy">
        <h3>{assignment.title}</h3>
        <p>{lessonTeaser(assignment.description)}</p>
      </div>
      <div className="lesson-card-progress">
        <Lightning size={18} weight={started ? "fill" : "regular"} />
        <div>
          <strong>{started ? `Session 1, ${completedCount} phần đã xong` : roadmap?.status === "active" ? "Sẵn sàng học" : "Bắt đầu từ nền tảng"}</strong>
          <span>{started ? "Bạn có thể xem lại phần đã hoàn thành." : "Session 1 mở trước Session 2."}</span>
        </div>
      </div>
      <Link className="student-primary-button" href={`/student/lesson/${assignment.assignment_id}/part1`}>
        {started ? "Mở lại Session 1" : "Học từ Session 1"} <ArrowRight size={17} />
      </Link>
    </motion.article>
  );
}

function formatScore(value: number) {
  const normalized = value > 10 ? value / 10 : value;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

function lessonTeaser(value: string | null | undefined) {
  const fallback = "Nắm nền tảng, luyện từng bước và nhận phản hồi sau bài học.";
  if (!value?.trim()) return fallback;

  // Lesson descriptions can contain the complete generated Markdown document.
  // A dashboard card needs a preview, not the entire lesson dumped into one <p>.
  // Prefer the hook, then strip presentation syntax and cap at two short sentences.
  const hook = value.match(
    /##\s*(?:Đặt vấn đề|Mở đầu)\s*([\s\S]*?)(?=\n#{1,3}\s|$)/i,
  )?.[1];
  const plain = (hook || value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[>*_`~|]/g, " ")
    .replace(/\\(?:left|right|quad|,|;|!)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) return fallback;
  const sentencePreview = plain.match(/^.*?[.!?](?:\s+.*?[.!?])?/u)?.[0] || plain;
  if (sentencePreview.length <= 210) return sentencePreview;
  const clipped = sentencePreview.slice(0, 210).replace(/\s+\S*$/, "").trim();
  return `${clipped}…`;
}

function deadlineCopy(date: string, overdue: boolean, now: number) {
  const target = new Date(date).getTime();
  if (!Number.isFinite(target)) return "Không có hạn";
  const days = Math.ceil(Math.abs(target - now) / 86_400_000);
  if (overdue) return `Quá hạn ${Math.max(1, days)} ngày`;
  if (days <= 1) return "Hạn hôm nay";
  return `Còn ${days} ngày`;
}
