"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenText,
  Books,
  ChalkboardTeacher,
  Check,
  MagnifyingGlass,
  Plus,
  UserCircle,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "@/lib/api-client";
import { studentApi, studentKeys } from "@/lib/student-api";

export function ClassWorkspace({ classId, joinInitially = false }: { classId?: string; joinInitially?: boolean }) {
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [joinOpen, setJoinOpen] = useState(joinInitially);
  const [classCode, setClassCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinMessage, setJoinMessage] = useState("");

  const metricsQuery = useQuery({ queryKey: studentKeys.metrics, queryFn: studentApi.metrics });
  const classesQuery = useQuery({ queryKey: studentKeys.classes, queryFn: studentApi.classes });
  const selected = classesQuery.data?.find((item) => item.class_id === classId);
  const roadmapQuery = useQuery({
    queryKey: studentKeys.roadmap(classId || ""),
    queryFn: () => studentApi.roadmap(classId || ""),
    enabled: Boolean(classId),
  });
  const classmatesQuery = useQuery({
    queryKey: studentKeys.classmates(metricsQuery.data?.student_id || "", classId || ""),
    queryFn: () => studentApi.classmates(metricsQuery.data?.student_id || "", classId || ""),
    enabled: Boolean(classId && metricsQuery.data?.student_id),
  });
  const joinClass = useMutation({
    mutationFn: () => studentApi.joinClass(classCode.trim()),
    onSuccess: async (result) => {
      setJoinMessage(result.message || "Đã tham gia lớp học.");
      setClassCode("");
      await queryClient.invalidateQueries({ queryKey: studentKeys.classes });
      await queryClient.invalidateQueries({ queryKey: studentKeys.assignments });
    },
    onError: (error) => setJoinError(getApiErrorMessage(error, "Không thể tham gia lớp.")),
  });

  const visibleClasses = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("vi");
    return [...(classesQuery.data || [])]
      .filter(
        (item) =>
          !needle ||
          item.class_name.toLocaleLowerCase("vi").includes(needle) ||
          item.teacher_name.toLocaleLowerCase("vi").includes(needle),
      )
      .sort((a, b) => a.class_name.localeCompare(b.class_name, "vi"));
  }, [classesQuery.data, search]);

  function submitJoin(event: FormEvent) {
    event.preventDefault();
    setJoinError("");
    setJoinMessage("");
    if (!classCode.trim()) {
      setJoinError("Nhập mã lớp trước khi tiếp tục.");
      return;
    }
    joinClass.mutate();
  }

  return (
    <div className="student-page">
      {classId ? (
        <ClassDetail
          classId={classId}
          selected={selected}
          loading={classesQuery.isLoading}
          roadmap={roadmapQuery.data || []}
          classmates={classmatesQuery.data || []}
          loadingRoadmap={roadmapQuery.isLoading}
          loadingClassmates={classmatesQuery.isLoading}
          hasError={classesQuery.isError || roadmapQuery.isError || classmatesQuery.isError}
        />
      ) : (
        <>
          <section className="student-page-header">
            <div><p className="student-kicker">Lớp học</p><h1>Không gian của các lớp</h1><p>Xem bài đang mở và danh sách bạn cùng lớp, không có điểm hay xếp hạng.</p></div>
            <button className="student-primary-button" onClick={() => setJoinOpen(true)}><Plus size={17} /> Tham gia lớp</button>
          </section>
          <div className="class-toolbar">
            <MagnifyingGlass size={19} />
            <label htmlFor="class-search">Tìm lớp hoặc giáo viên</label>
            <input id="class-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ví dụ: Toán 8A1" />
          </div>
          {classesQuery.isLoading ? (
            <div className="class-grid"><div className="student-skeleton class-skeleton" /><div className="student-skeleton class-skeleton" /></div>
          ) : classesQuery.isError ? (
            <div className="student-error-state"><h2>Chưa tải được danh sách lớp</h2><p>Kiểm tra kết nối rồi thử lại.</p><button className="student-secondary-button" onClick={() => classesQuery.refetch()}>Thử lại</button></div>
          ) : visibleClasses.length ? (
            <div className="class-grid">
              {visibleClasses.map((item, index) => (
                <motion.article key={item.class_id} className="class-card" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                  <div className="class-card-icon"><ChalkboardTeacher size={24} /></div>
                  <div><h2>{item.class_name}</h2><p>{item.teacher_name || "Giáo viên phụ trách"}</p></div>
                  <div className="class-card-progress"><span>Tiến độ của bạn</span><strong>{item.completed_lessons}/{item.total_lessons} bài</strong></div>
                  <Link href={`/student/classes/${item.class_id}`}>Mở lớp <ArrowRight size={16} /></Link>
                </motion.article>
              ))}
            </div>
          ) : (
            <div className="student-empty-state"><UsersThree size={36} /><h2>{search ? "Không tìm thấy lớp phù hợp" : "Bạn chưa tham gia lớp nào"}</h2><p>{search ? "Thử tên lớp hoặc tên giáo viên khác." : "Nhập mã lớp để bắt đầu nhận bài học."}</p>{!search && <button className="student-primary-button" onClick={() => setJoinOpen(true)}>Nhập mã lớp</button>}</div>
          )}
        </>
      )}

      <AnimatePresence>
        {joinOpen && (
          <>
            <motion.button className="student-sheet-backdrop" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setJoinOpen(false)} aria-label="Đóng" />
            <motion.aside className="student-side-sheet" initial={reduceMotion ? false : { x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 270, damping: 31 }} aria-labelledby="join-class-title">
              <div className="student-sheet-header"><div><p className="student-kicker">Tham gia lớp</p><h2 id="join-class-title">Nhập mã giáo viên đã gửi</h2></div><button className="student-icon-button" onClick={() => setJoinOpen(false)} aria-label="Đóng"><X size={19} /></button></div>
              <form onSubmit={submitJoin} className="student-sheet-form">
                {joinError && <p className="student-form-error" role="alert">{joinError}</p>}
                {joinMessage && <p className="student-form-success" role="status"><Check size={18} /> {joinMessage}</p>}
                <div className="student-field"><label htmlFor="class-code">Mã lớp</label><input id="class-code" value={classCode} onChange={(event) => setClassCode(event.target.value.toUpperCase())} placeholder="DF-8A1" autoFocus /><small>Mã lớp không chứa thông tin điểm hay dữ liệu cá nhân.</small></div>
                <button className="student-primary-button" disabled={joinClass.isPending}>{joinClass.isPending ? "Đang tham gia" : "Tham gia lớp"}</button>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClassDetail({ classId, selected, loading, roadmap, classmates, loadingRoadmap, loadingClassmates, hasError }: { classId: string; selected?: { class_name: string; teacher_name: string; completed_lessons: number; total_lessons: number }; loading: boolean; roadmap: Array<{ id: string; title: string; status: string }>; classmates: string[]; loadingRoadmap: boolean; loadingClassmates: boolean; hasError: boolean }) {
  if (loading) return <div className="student-skeleton detail-skeleton" />;
  if (!selected) return <div className="student-error-state"><h1>Không tìm thấy lớp học</h1><p>Lớp có thể đã bị gỡ hoặc tài khoản này chưa tham gia.</p><Link className="student-secondary-button" href="/student/classes">Về danh sách lớp</Link></div>;
  const openLessons = roadmap.filter((item) => item.status === "active");
  return (
    <>
      <section className="class-detail-header">
        <div className="class-detail-icon"><Books size={27} /></div>
        <div><p>{selected.teacher_name || "Giáo viên phụ trách"}</p><h1>{selected.class_name}</h1><span>Tiến độ của bạn: {selected.completed_lessons}/{selected.total_lessons} bài</span></div>
        <Link className="student-secondary-button" href={`/student/roadmap?class=${classId}`}>Mở lộ trình <ArrowRight size={16} /></Link>
      </section>
      {hasError && <div className="student-inline-banner"><span>Một phần thông tin lớp chưa tải được. Các phần còn lại vẫn dùng được.</span></div>}
      <div className="class-detail-grid">
        <section className="class-open-lessons"><div className="student-section-heading"><div><h2>Bài đang mở</h2><p>Chọn bài để bắt đầu từ Session 1.</p></div></div>{loadingRoadmap ? <div className="student-skeleton h-48" /> : openLessons.length ? openLessons.map((item) => <Link key={item.id} href={`/student/lesson/${item.id}/part1`}><span><strong>{item.title}</strong><small>Sẵn sàng học</small></span><ArrowRight size={17} /></Link>) : <div className="student-empty-inline"><BookOpenText size={24} /><span>Chưa có bài mới trong lớp.</span></div>}</section>
        <section className="classmates-panel"><div className="student-section-heading"><div><h2>Bạn cùng lớp</h2><p>Chỉ hiển thị tên, không có điểm hay tiến độ.</p></div><span>{classmates.length} bạn</span></div>{loadingClassmates ? <div className="student-skeleton h-48" /> : classmates.length ? <div className="classmate-grid">{classmates.map((name) => <div key={name}><span className="classmate-avatar">{initials(name)}</span><strong>{name}</strong></div>)}</div> : <div className="student-empty-inline"><UserCircle size={25} /><span>Chưa có bạn cùng lớp để hiển thị.</span></div>}</section>
      </div>
    </>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase();
}
