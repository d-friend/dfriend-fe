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
      const aProgress = hydrated
        ? readLessonProgress(meQuery.data?.id, a.assignment_id).completedItems?.length || 0
        : 0;
      const bProgress = hydrated
        ? readLessonProgress(meQuery.data?.id, b.assignment_id).completedItems?.length || 0
        : 0;
      const aOverdue = new Date(a.due_date).getTime() < now || a.status === "OVERDUE";
      const bOverdue = new Date(b.due_date).getTime() < now || b.status === "OVERDUE";
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (Boolean(aProgress) !== Boolean(bProgress)) return aProgress ? -1 : 1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [assignmentsQuery.data, hydrated, meQuery.data?.id, now]);

  const isLoading = meQuery.isLoading || classesQuery.isLoading || assignmentsQuery.isLoading;
  const hasPartialError =
    meQuery.isError || classesQuery.isError || assignmentsQuery.isError || metricsQuery.isError;
  const name = (meQuery.data?.full_name || meQuery.data?.username || "bạn").split(/\s+/).at(-1);
  const metrics = metricsQuery.data;
  const allMetricsZero =
    !metrics || (!metrics.thinking_score && !metrics.skill_score && !metrics.result_score);

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
          <strong>{assignments.length}</strong>
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
                <Metric label="Tư duy" value={metrics?.thinking_score || 0} />
                <Metric label="Kỹ năng" value={metrics?.skill_score || 0} />
                <Metric label="Kết quả" value={metrics?.result_score || 0} />
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
        ) : assignments.length ? (
          <div className="lesson-grid">
            {assignments.map((assignment, index) => (
              <LessonCard
                key={assignment.assignment_id}
                assignment={assignment}
                className={classMap.get(assignment.class_id)?.class_name || "Lớp học"}
                progress={hydrated ? readLessonProgress(meQuery.data?.id, assignment.assignment_id) : {}}
                roadmap={roadmapMap.get(assignment.assignment_id)}
                index={index}
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
        <p>{assignment.description || "Nắm nền tảng, luyện từng bước và nhận phản hồi sau bài học."}</p>
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

function deadlineCopy(date: string, overdue: boolean, now: number) {
  const target = new Date(date).getTime();
  if (!Number.isFinite(target)) return "Không có hạn";
  const days = Math.ceil(Math.abs(target - now) / 86_400_000);
  if (overdue) return `Quá hạn ${Math.max(1, days)} ngày`;
  if (days <= 1) return "Hạn hôm nay";
  return `Còn ${days} ngày`;
}
