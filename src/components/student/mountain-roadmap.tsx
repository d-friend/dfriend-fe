"use client";

import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Flag, LockKey, MapTrifold, Path } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { studentApi, studentKeys } from "@/lib/student-api";

export function MountainRoadmap({ initialClassId = "" }: { initialClassId?: string }) {
  const reduceMotion = useReducedMotion();
  const classesQuery = useQuery({ queryKey: studentKeys.classes, queryFn: studentApi.classes });
  const [classChoice, setClassChoice] = useState(initialClassId);
  const selectedClassId = classChoice || classesQuery.data?.[0]?.class_id || "";

  const roadmapQuery = useQuery({
    queryKey: studentKeys.roadmap(selectedClassId),
    queryFn: () => studentApi.roadmap(selectedClassId),
    enabled: Boolean(selectedClassId),
  });
  const selectedClass = classesQuery.data?.find((item) => item.class_id === selectedClassId);

  if (classesQuery.isLoading) return <div className="student-page"><div className="student-skeleton roadmap-skeleton" /></div>;
  if (!classesQuery.data?.length) return <div className="student-page"><section className="student-page-header"><div><p className="student-kicker">Lộ trình</p><h1>Đường học của bạn</h1></div></section><div className="student-empty-state"><MapTrifold size={38} /><h2>Chưa có lộ trình</h2><p>Tham gia một lớp để giáo viên mở các bài học theo thứ tự.</p><Link className="student-primary-button" href="/student/classes?join=1">Tham gia lớp</Link></div></div>;

  return (
    <div className="student-page roadmap-page">
      <section className="student-page-header">
        <div><p className="student-kicker">Lộ trình</p><h1>Đường lên đỉnh</h1><p>Mỗi chặng là một bài học. Bài khóa sẽ mở khi bạn hoàn thành chặng trước.</p></div>
        <label className="class-switcher">Lớp đang xem<select value={selectedClassId} onChange={(event) => setClassChoice(event.target.value)}>{classesQuery.data.map((item) => <option key={item.class_id} value={item.class_id}>{item.class_name}</option>)}</select></label>
      </section>
      <section className="roadmap-intro"><div className="roadmap-class-mark"><Path size={26} /></div><div><span>{selectedClass?.teacher_name || "Giáo viên phụ trách"}</span><h2>{selectedClass?.class_name}</h2></div><strong>{selectedClass?.completed_lessons || 0}/{selectedClass?.total_lessons || 0} bài đã xong</strong></section>
      {roadmapQuery.isLoading ? <div className="student-skeleton roadmap-skeleton" /> : roadmapQuery.isError ? <div className="student-error-state"><h2>Chưa tải được lộ trình</h2><p>Kiểm tra kết nối rồi thử lại.</p><button className="student-secondary-button" onClick={() => roadmapQuery.refetch()}>Thử lại</button></div> : roadmapQuery.data?.length ? (
        <div className="mountain-trail" aria-label={`Lộ trình ${selectedClass?.class_name || "lớp học"}`}>
          {roadmapQuery.data.map((item, index) => {
            const completed = item.status === "completed";
            const active = item.status === "active";
            const content = <><span className="trail-marker">{completed ? <Check size={19} weight="bold" /> : active ? <span className="dfriend-glyph">D</span> : <LockKey size={17} />}</span><span className="trail-copy"><small>{completed ? "Đã hoàn thành" : active ? "Đang mở" : "Chưa mở"}</small><strong>{item.title}</strong><em>{completed ? "Xem lại từ Session 1" : active ? "Tiếp tục hành trình" : "Hoàn thành chặng trước để mở"}</em></span>{(completed || active) && <ArrowRight size={18} />}</>;
            return (
              <motion.div key={item.id} className="trail-stage" data-status={item.status} data-side={index % 2 ? "right" : "left"} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                {completed || active ? <Link href={`/student/lesson/${item.id}/part1`}>{content}</Link> : <div aria-disabled="true">{content}</div>}
                {item.extra_exercises?.length ? <Link className="trail-branch" href={item.extra_completed ? `/student/report/extra_${item.lessonId}` : `/student/lesson/extra_${item.lessonId}/part2`}><Flag size={16} /> {item.extra_completed ? "Feedback luyện thêm" : "Luyện thêm"}</Link> : null}
              </motion.div>
            );
          })}
          <div className="trail-summit"><Flag size={24} weight="fill" /><span>Đỉnh tiếp theo đang chờ bạn</span></div>
        </div>
      ) : <div className="student-empty-state compact"><Path size={34} /><h2>Lộ trình đang được chuẩn bị</h2><p>Giáo viên chưa xuất bản bài học nào cho lớp này.</p></div>}
    </div>
  );
}

export function ProfileWorkspace() {
  const meQuery = useQuery({ queryKey: studentKeys.me, queryFn: studentApi.me });
  const metricsQuery = useQuery({ queryKey: studentKeys.metrics, queryFn: studentApi.metrics });
  const classesQuery = useQuery({ queryKey: studentKeys.classes, queryFn: studentApi.classes });
  const roadmaps = useQueries({ queries: (classesQuery.data || []).map((item) => ({ queryKey: studentKeys.roadmap(item.class_id), queryFn: () => studentApi.roadmap(item.class_id) })) });
  const completed = useMemo(() => roadmaps.flatMap((query, index) => (query.data || []).filter((item) => item.status === "completed").map((item) => ({ ...item, className: classesQuery.data?.[index]?.class_name || "Lớp học" }))), [roadmaps, classesQuery.data]);
  const metrics = metricsQuery.data;
  const metricItems = [
    { label: "Độ đúng", value: metrics?.correctness_score },
    { label: "Tự lực", value: metrics?.independence_score },
    { label: "Lập luận", value: metrics?.reasoning_score },
    { label: "Vận dụng", value: metrics?.transfer_score },
  ];
  const visibleMetrics = metricItems.filter((item): item is { label: string; value: number } => item.value != null);
  const emptyMetrics = !metrics || visibleMetrics.length === 0;
  const fullName = meQuery.data?.full_name || meQuery.data?.username || "Học sinh";
  if (meQuery.isLoading) return <div className="student-page"><div className="student-skeleton detail-skeleton" /></div>;
  return <div className="student-page profile-page"><section className="profile-identity"><span className="profile-avatar">{fullName.split(/\s+/).slice(-2).map((p) => p[0]).join("").toUpperCase()}</span><div><p>Hồ sơ học tập</p><h1>{fullName}</h1><span>{classesQuery.data?.length || 0} lớp đang tham gia</span></div></section><section className="profile-grid"><div className="profile-competence"><div className="student-section-heading"><div><h2>Năng lực của bạn</h2><p>Thang 0-10, cập nhật sau mỗi Session 2.</p></div></div>{metricsQuery.isError ? <div className="student-empty-inline">Chưa tải được dữ liệu năng lực.</div> : emptyMetrics ? <div className="competence-empty-large"><MapTrifold size={34} /><strong>Chưa đủ dữ liệu để vẽ năng lực</strong><span>Hoàn thành Session 2 đầu tiên để nhận phản hồi.</span></div> : <div className="competence-numbers">{visibleMetrics.map((item) => <Score key={item.label} label={item.label} value={item.value} />)}</div>}</div><div className="profile-history"><div className="student-section-heading"><div><h2>Bài đã hoàn thành</h2><p>Mở lại feedback theo từng bài học.</p></div><span>{completed.length} bài</span></div>{completed.length ? completed.map((item) => { const reportLessonId = roadmapLessonId(item); return <Link key={`${item.className}-${item.id}`} href={`/student/report/${reportLessonId}`}><span><strong>{item.title}</strong><small>{item.className} · Xem feedback Session 2</small></span><ArrowRight size={17} /></Link>; }) : <div className="student-empty-inline">Các bài hoàn thành sẽ xuất hiện ở đây.</div>}</div></section></div>;
}

function Score({ label, value }: { label: string; value: number }) { const score = value > 10 ? value / 10 : value; return <div><span>{label}</span><strong>{Number.isInteger(score) ? score : score.toFixed(1)}</strong><small>/10</small></div>; }
function roadmapLessonId(item: { id: string; lessonId?: string; lesson_id?: string }) { return item.lessonId || item.lesson_id || item.id; }
