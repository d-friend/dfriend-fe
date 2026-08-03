"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Books,
  CaretDown,
  ChalkboardTeacher,
  ChatCircleDots,
  Plus,
  SidebarSimple,
  SignOut,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { apiClient, getApiErrorMessage, teacherApi } from "@/lib/api-client";

export function TeacherShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [createClassOpen, setCreateClassOpen] = useState(false);
  const [className, setClassName] = useState("");
  const [description, setDescription] = useState("");
  const [classError, setClassError] = useState("");

  const copilotMode = pathname.startsWith("/teacher/copilot") || pathname.startsWith("/teacher/documents");
  const fixedMain = pathname.startsWith("/teacher/copilot");
  const immersiveLesson = pathname.startsWith("/teacher/lessons/");

  const classesQuery = useQuery({
    queryKey: ["teacher", "classes"],
    queryFn: teacherApi.classes,
  });
  const conversationsQuery = useQuery({
    queryKey: ["teacher", "copilot", "conversations"],
    queryFn: teacherApi.conversations,
    enabled: copilotMode,
  });
  const meQuery = useQuery({ queryKey: ["auth", "me"], queryFn: teacherApi.me });

  const createClass = useMutation({
    mutationFn: teacherApi.createClass,
    onSuccess: async (created) => {
      const classes = await queryClient.fetchQuery({
        queryKey: ["teacher", "classes"],
        queryFn: teacherApi.classes,
        staleTime: 0,
      });
      const target =
        created.class_id ||
        classes.find((item) => item.class_name === className.trim())?.class_id;
      setCreateClassOpen(false);
      setClassName("");
      setDescription("");
      if (target) router.push(`/teacher/classes/${target}?tab=students`);
    },
    onError: (error) => setClassError(getApiErrorMessage(error, "Không thể tạo lớp học.")),
  });

  const logout = useMutation({
    mutationFn: () => apiClient.post("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
    onError: (error) => setLogoutError(getApiErrorMessage(error, "Không thể đăng xuất. Thử lại sau.")),
  });

  const initials = useMemo(() => {
    const value = meQuery.data?.full_name || meQuery.data?.username || "GV";
    return value
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }, [meQuery.data]);

  function submitClass(event: FormEvent) {
    event.preventDefault();
    setClassError("");
    if (!className.trim()) {
      setClassError("Nhập tên lớp trước khi tạo.");
      return;
    }
    createClass.mutate({ className: className.trim(), description: description.trim() });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/teacher/copilot/new" className="brand-block" aria-label="D-Friend Teacher">
          <Image src="/dfriend-logo.png" alt="Logo D-Friend" width={48} height={48} priority />
          <span className="brand-copy">
            <span className="brand-name">D-Friend</span>
            <span className="brand-role">Không gian giáo viên</span>
          </span>
        </Link>

        <nav className="workspace-switcher" aria-label="Không gian làm việc">
          <Link href="/teacher/copilot/new" data-active={copilotMode}>
            <ChatCircleDots size={17} weight={copilotMode ? "fill" : "regular"} />
            Copilot
          </Link>
          <Link href={classesQuery.data?.[0] ? `/teacher/classes/${classesQuery.data[0].class_id}?tab=students` : "/teacher/classes"} data-active={!copilotMode}>
            <ChalkboardTeacher size={17} weight={!copilotMode ? "fill" : "regular"} />
            Lớp học
          </Link>
        </nav>

        <div className="topbar-actions">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileOpen((value) => !value)} aria-label="Mở thanh điều hướng" aria-expanded={mobileOpen}>
            <SidebarSimple size={19} />
          </button>
          <button className="icon-button" aria-label="Thông báo">
            <Bell size={18} />
          </button>
          <div className="account-menu-wrap">
            <button className="avatar-button" aria-label="Tài khoản giáo viên" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => { setAccountOpen((value) => !value); setLogoutError(""); }}>
              <span className="avatar">{initials}</span>
              <span>{meQuery.data?.full_name || meQuery.data?.username || "Giáo viên"}</span>
              <CaretDown size={13} data-open={accountOpen} />
            </button>
            <AnimatePresence>
              {accountOpen && (
                <motion.div className="account-menu" role="menu" initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
                  <div className="account-menu-identity">
                    <strong>{meQuery.data?.full_name || "Giáo viên"}</strong>
                    <span>{meQuery.data?.email || meQuery.data?.username}</span>
                  </div>
                  {logoutError && <p role="alert">{logoutError}</p>}
                  <button role="menuitem" onClick={() => logout.mutate()} disabled={logout.isPending}>
                    <SignOut size={17} />
                    {logout.isPending ? "Đang đăng xuất" : "Đăng xuất"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {!immersiveLesson && (
        <aside className="sidebar" data-open={mobileOpen} aria-label={copilotMode ? "Copilot" : "Lớp học"}>
          <div className="sidebar-inner">
            {copilotMode ? (
              <CopilotSidebar
                pathname={pathname}
                conversations={conversationsQuery.data || []}
                loading={conversationsQuery.isLoading}
              />
            ) : (
              <ClassSidebar
                pathname={pathname}
                classes={classesQuery.data || []}
                loading={classesQuery.isLoading}
                onCreateClass={() => setCreateClassOpen(true)}
              />
            )}
          </div>
          <div className="sidebar-footer">
            <span className="sidebar-link-meta">Pilot workspace</span>
          </div>
        </aside>
      )}

      {mobileOpen && !immersiveLesson && (
        <button className="sheet-backdrop" style={{ zIndex: 40 }} onClick={() => setMobileOpen(false)} aria-label="Đóng thanh điều hướng" />
      )}

      <main id="main-content" className={`app-main ${fixedMain ? "app-main-fixed" : ""}`} style={immersiveLesson ? { gridColumn: "1 / -1" } : undefined}>
        {children}
      </main>

      <AnimatePresence>
        {createClassOpen && (
          <>
            <motion.button
              className="sheet-backdrop"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateClassOpen(false)}
              aria-label="Đóng form tạo lớp"
            />
            <motion.aside
              className="side-sheet"
              initial={reduceMotion ? false : { x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              aria-labelledby="create-class-title"
            >
              <div className="sheet-header">
                <div>
                  <p className="sidebar-label">Lớp học mới</p>
                  <h2 id="create-class-title" className="text-xl font-semibold tracking-[-0.03em]">Tạo lớp trong vài giây</h2>
                </div>
                <button className="icon-button" onClick={() => setCreateClassOpen(false)} aria-label="Đóng">
                  <X size={18} />
                </button>
              </div>
              <div className="sheet-body">
                <form className="form-stack" onSubmit={submitClass}>
                  {classError && <p className="inline-error" role="alert">{classError}</p>}
                  <div className="form-field">
                    <label htmlFor="class-name">Tên lớp</label>
                    <input id="class-name" className="input" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Ví dụ: Toán 8A1" autoFocus />
                  </div>
                  <div className="form-field">
                    <label htmlFor="class-description">Mô tả</label>
                    <textarea id="class-description" className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mục tiêu hoặc ghi chú ngắn về lớp" />
                    <small>Hệ thống sẽ tạo class code để học sinh tham gia.</small>
                  </div>
                  <button className="primary-button" type="submit" disabled={createClass.isPending}>
                    {createClass.isPending ? "Đang tạo lớp" : "Tạo lớp"}
                  </button>
                </form>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function CopilotSidebar({ pathname, conversations, loading }: { pathname: string; conversations: Array<{ conversation_id: string; title: string; updated_at: string }>; loading: boolean }) {
  return (
    <>
      <Link href="/teacher/copilot/new" className="primary-button sidebar-primary">
        <Plus size={17} weight="bold" />
        Cuộc trò chuyện mới
      </Link>
      <div className="sidebar-section">
        <Link href="/teacher/documents" className="sidebar-link" data-active={pathname.startsWith("/teacher/documents")}>
          <Books size={18} />
          <span className="sidebar-link-copy"><span className="sidebar-link-title">Tài liệu</span><span className="sidebar-link-meta">Kho bài tập dùng chung</span></span>
        </Link>
      </div>
      <section className="sidebar-section" aria-labelledby="recent-heading">
        <div className="sidebar-label-row"><h2 id="recent-heading" className="sidebar-label">Gần đây</h2></div>
        {loading ? (
          <div className="grid gap-2 px-1"><div className="skeleton h-10" /><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
        ) : conversations.length ? (
          conversations.map((conversation) => (
            <Link key={conversation.conversation_id} href={`/teacher/copilot/${conversation.conversation_id}`} className="sidebar-link" data-active={pathname.endsWith(conversation.conversation_id)}>
              <ChatCircleDots size={17} />
              <span className="sidebar-link-copy"><span className="sidebar-link-title">{conversation.title}</span><span className="sidebar-link-meta">{relativeDate(conversation.updated_at)}</span></span>
            </Link>
          ))
        ) : (
          <p className="sidebar-empty">Các cuộc trò chuyện của bạn sẽ xuất hiện ở đây.</p>
        )}
      </section>
    </>
  );
}

function ClassSidebar({ pathname, classes, loading, onCreateClass }: { pathname: string; classes: Array<{ class_id: string; class_name: string; student_count: number }>; loading: boolean; onCreateClass: () => void }) {
  return (
    <>
      <Link href="/teacher/lessons/new" className="primary-button sidebar-primary">
        <Sparkle size={17} weight="fill" />
        Bài học mới
      </Link>
      <section className="sidebar-section" aria-labelledby="classes-heading">
        <div className="sidebar-label-row">
          <h2 id="classes-heading" className="sidebar-label">Lớp hiện tại</h2>
          <button className="text-button" onClick={onCreateClass} aria-label="Tạo lớp mới"><Plus size={16} /></button>
        </div>
        {loading ? (
          <div className="grid gap-2 px-1"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
        ) : classes.length ? (
          classes.map((item) => (
            <Link key={item.class_id} href={`/teacher/classes/${item.class_id}?tab=students`} className="sidebar-link" data-active={pathname.includes(item.class_id)}>
              <ChalkboardTeacher size={18} />
              <span className="sidebar-link-copy"><span className="sidebar-link-title">{item.class_name}</span><span className="sidebar-link-meta">{item.student_count} học sinh</span></span>
            </Link>
          ))
        ) : (
          <div className="sidebar-empty"><p>Chưa có lớp học.</p><button className="text-button mt-2" onClick={onCreateClass}><Plus size={15} /> Tạo lớp đầu tiên</button></div>
        )}
      </section>
    </>
  );
}

function relativeDate(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "Gần đây";
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Hôm qua" : `${days} ngày trước`;
}
