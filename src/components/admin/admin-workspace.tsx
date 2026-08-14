"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowClockwise,
  ChalkboardTeacher,
  ChartLineUp,
  FileText,
  GraduationCap,
  Key,
  LockKey,
  MagnifyingGlass,
  SignOut,
  Student,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { adminApi, apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { AdminUser } from "@/types/contracts";

const emptyCreateForm = {
  username: "",
  email: "",
  fullName: "",
  password: "",
  role: "STUDENT" as "STUDENT" | "TEACHER",
};

export function AdminWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState("");
  const [createdPassword, setCreatedPassword] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<AdminUser["role"] | "">("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const me = useQuery({ queryKey: ["admin", "me"], queryFn: adminApi.me });
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: adminApi.overview, enabled: me.data?.role === "ADMIN" });
  const operations = useQuery({
    queryKey: ["admin", "operations"],
    queryFn: adminApi.operations,
    enabled: me.data?.role === "ADMIN",
    refetchInterval: 30_000,
  });
  const users = useQuery({
    queryKey: ["admin", "users", query, role],
    queryFn: () => adminApi.users({ query: query.trim() || undefined, role }),
    enabled: me.data?.role === "ADMIN",
  });

  const selectedUser = useMemo(
    () => (users.data || []).find((item) => item.id === selectedUserId) || null,
    [selectedUserId, users.data],
  );

  const createUser = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: async (_created, variables) => {
      setCreatedPassword(variables.password);
      setCreateForm(emptyCreateForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      ]);
    },
    onError: (error) => setCreateError(getApiErrorMessage(error, "Không tạo được tài khoản.")),
  });

  const resetPassword = useMutation({
    mutationFn: () => adminApi.resetPassword(selectedUserId, newPassword),
    onSuccess: async () => {
      setNewPassword("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error) => setResetError(getApiErrorMessage(error, "Không đổi được mật khẩu.")),
  });

  const logout = useMutation({
    mutationFn: () => apiClient.post("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    setCreateError("");
    setCreatedPassword("");
    createUser.mutate({
      ...createForm,
      username: createForm.username.trim(),
      email: createForm.email.trim(),
      fullName: createForm.fullName.trim(),
    });
  }

  function submitReset(event: FormEvent) {
    event.preventDefault();
    setResetError("");
    if (!selectedUserId) {
      setResetError("Chọn tài khoản cần đổi mật khẩu.");
      return;
    }
    resetPassword.mutate();
  }

  if (me.isLoading) return <main className="admin-shell"><div className="admin-loading" /></main>;
  if (me.data && me.data.role !== "ADMIN") {
    return (
      <main className="admin-shell">
        <section className="admin-denied">
          <LockKey size={36} />
          <h1>Không có quyền admin</h1>
          <p>Tài khoản hiện tại không được phép truy cập khu vận hành.</p>
        </section>
      </main>
    );
  }

  const stats = overview.data?.stats;
  const dauMax = Math.max(1, ...(overview.data?.dau.data || []).map((item) => item.activeUsers));

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p>D-Friend Admin</p>
          <h1>Vận hành pilot</h1>
        </div>
        <div>
          <button className="secondary-button" onClick={() => { void overview.refetch(); void operations.refetch(); void users.refetch(); }}>
            <ArrowClockwise size={16} /> Làm mới
          </button>
          <button className="icon-button" onClick={() => logout.mutate()} aria-label="Đăng xuất">
            <SignOut size={18} />
          </button>
        </div>
      </header>

      <section className="admin-metrics">
        <Metric icon={<UsersThree size={21} />} label="Người dùng" value={(stats?.users.ADMIN || 0) + (stats?.users.TEACHER || 0) + (stats?.users.STUDENT || 0)} detail={`${stats?.users.STUDENT || 0} HS / ${stats?.users.TEACHER || 0} GV`} />
        <Metric icon={<ChalkboardTeacher size={21} />} label="Lớp học" value={stats?.classes || 0} detail={`${stats?.enrollments || 0} lượt tham gia`} />
        <Metric icon={<GraduationCap size={21} />} label="Bài học" value={stats?.lessons || 0} detail={`${stats?.submissions || 0} submission`} />
        <Metric icon={<FileText size={21} />} label="Docs" value={stats?.documentEvents || 0} detail="Theo activity event" />
        <Metric icon={<ChartLineUp size={21} />} label="Đang hoạt động" value={stats?.activeUsersNow || 0} detail={`${overview.data?.dau.data.at(-1)?.activeUsers || 0} DAU hôm nay`} />
      </section>

      <section className="admin-operations" aria-labelledby="operations-heading">
        <div className="admin-operations-heading">
          <div>
            <p>Quan sát trực tiếp, tự làm mới mỗi 30 giây</p>
            <h2 id="operations-heading">Vận hành hệ thống</h2>
          </div>
          <StatusBadge status={operations.data?.ai.status || "unavailable"} label={operations.data?.ai.status === "healthy" ? "AI service online" : operations.data?.ai.status === "degraded" ? "AI online, metrics lỗi" : "AI service chưa phản hồi"} />
        </div>
        {operations.isLoading ? <div className="admin-loading operations-loading" /> : operations.data ? <>
          <div className="admin-operation-summary">
            <Metric icon={<ChartLineUp size={21} />} label="Queue đang chờ" value={operations.data.queues.reduce((total, queue) => total + queue.waiting + queue.delayed, 0)} detail={`${operations.data.queues.reduce((total, queue) => total + queue.active, 0)} job đang chạy`} />
            <Metric icon={<ChartLineUp size={21} />} label="Queue lỗi lưu lại" value={operations.data.queues.reduce((total, queue) => total + queue.failed, 0)} detail="Cần kiểm tra retry hoặc nguyên nhân lỗi" />
            <Metric icon={<FileText size={21} />} label="Report chưa đọc" value={operations.data.reports.unread} detail={`${operations.data.reports.analysing} report đang phân tích`} />
            <Metric icon={<ChartLineUp size={21} />} label="Chi phí AI" value={`$${operations.data.ai.costSinceStartUsd.toFixed(3)}`} detail="Tích lũy từ lúc AI-service khởi động" />
          </div>
          {operations.data.ai.reason && <p className="admin-operation-warning">{operations.data.ai.reason}</p>}
          <div className="admin-operation-grid">
            <section className="admin-operation-panel">
              <div className="admin-panel-heading"><span><ChartLineUp size={19} /></span><div><h2>Queue</h2><p>Backlog hiện tại của worker.</p></div></div>
              <div className="admin-queue-list">
                {operations.data.queues.map((queue) => <article key={queue.name}>
                  <div><strong>{queue.name}</strong><StatusBadge status={queue.status} /></div>
                  <span>Chờ {queue.waiting} / chạy {queue.active} / hẹn giờ {queue.delayed}</span>
                  <b data-alert={queue.failed > 0}>{queue.failed} failed</b>
                </article>)}
              </div>
            </section>
            <section className="admin-operation-panel">
              <div className="admin-panel-heading"><span><FileText size={19} /></span><div><h2>Lesson report</h2><p>Trạng thái sau khi lesson được publish.</p></div></div>
              <div className="admin-report-state">
                <ReportState label="Chờ điều kiện" value={operations.data.reports.pending} />
                <ReportState label="Đang phân tích" value={operations.data.reports.analysing} />
                <ReportState label="Sẵn sàng" value={operations.data.reports.ready} />
                <ReportState label="Thất bại" value={operations.data.reports.failed} alert />
              </div>
              {operations.data.reports.oldestAnalysingAt && <p className="admin-operation-note">Job phân tích lâu nhất: {formatTime(operations.data.reports.oldestAnalysingAt)}</p>}
            </section>
            <section className="admin-operation-panel">
              <div className="admin-panel-heading"><span><ChartLineUp size={19} /></span><div><h2>AI theo pipeline</h2><p>Cost và kết quả tích lũy của process hiện tại.</p></div></div>
              <div className="admin-pipeline-list">
                {operations.data.ai.pipelines.length ? operations.data.ai.pipelines.map((pipeline) => <article key={pipeline.pipeline}>
                  <strong>{pipeline.pipeline}</strong><span>${pipeline.costUsd.toFixed(3)} / {pipeline.succeeded} ok / {pipeline.failed} lỗi</span>
                </article>) : <p className="admin-empty">Chưa có pipeline AI nào được ghi nhận.</p>}
              </div>
            </section>
            <section className="admin-operation-panel">
              <div className="admin-panel-heading"><span><ChartLineUp size={19} /></span><div><h2>LLM latency</h2><p>P50/P95 theo model, từ histogram hiện tại.</p></div></div>
              <div className="admin-pipeline-list">
                {operations.data.ai.latencyByModel.length ? operations.data.ai.latencyByModel.map((latency) => <article key={latency.model}>
                  <strong>{latency.model}</strong><span>P50 {formatSeconds(latency.p50Seconds)} / P95 {formatSeconds(latency.p95Seconds)}</span>
                </article>) : <p className="admin-empty">Chưa có lời gọi LLM nào để tính latency.</p>}
              </div>
            </section>
          </div>
        </> : <p className="inline-error">Không tải được số liệu vận hành.</p>}
      </section>

      <section className="admin-grid">
        <form className="admin-panel admin-form" onSubmit={submitCreate}>
          <div className="admin-panel-heading">
            <span><UserPlus size={19} /></span>
            <div><h2>Tạo tài khoản</h2><p>Admin tạo trực tiếp học sinh hoặc giáo viên.</p></div>
          </div>
          {createError && <p className="inline-error" role="alert">{createError}</p>}
          {createdPassword && <p className="admin-success" role="status">Đã tạo tài khoản. Mật khẩu ban đầu: <strong>{createdPassword}</strong></p>}
          <div className="admin-role-toggle">
            <button type="button" data-active={createForm.role === "STUDENT"} onClick={() => setCreateForm((current) => ({ ...current, role: "STUDENT" }))}><Student size={16} /> Học sinh</button>
            <button type="button" data-active={createForm.role === "TEACHER"} onClick={() => setCreateForm((current) => ({ ...current, role: "TEACHER" }))}><ChalkboardTeacher size={16} /> Giáo viên</button>
          </div>
          <AdminField label="Tên đăng nhập" value={createForm.username} onChange={(value) => setCreateForm((current) => ({ ...current, username: value }))} autoComplete="off" />
          <AdminField label="Email" type="email" value={createForm.email} onChange={(value) => setCreateForm((current) => ({ ...current, email: value }))} autoComplete="off" />
          <AdminField label="Họ tên" value={createForm.fullName} onChange={(value) => setCreateForm((current) => ({ ...current, fullName: value }))} autoComplete="off" />
          <AdminField label="Mật khẩu ban đầu" type="text" value={createForm.password} onChange={(value) => setCreateForm((current) => ({ ...current, password: value }))} autoComplete="off" />
          <button className="primary-button" disabled={createUser.isPending}>{createUser.isPending ? "Đang tạo" : "Tạo tài khoản"}</button>
        </form>

        <section className="admin-panel admin-users-panel">
          <div className="admin-panel-heading">
            <span><Key size={19} /></span>
            <div><h2>Đổi mật khẩu</h2><p>Tìm tài khoản rồi đặt mật khẩu mới.</p></div>
          </div>
          <div className="admin-user-filters">
            <label><MagnifyingGlass size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm username, email, họ tên" /></label>
            <select value={role} onChange={(event) => setRole(event.target.value as AdminUser["role"] | "")}>
              <option value="">Tất cả role</option>
              <option value="STUDENT">Học sinh</option>
              <option value="TEACHER">Giáo viên</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="admin-user-list">
            {users.isLoading ? <div className="admin-loading small" /> : (users.data || []).map((user) => (
              <button key={user.id} data-selected={selectedUserId === user.id} onClick={() => setSelectedUserId(user.id)}>
                <span><strong>{user.fullName || user.username}</strong><small>{user.username} / {user.role}</small></span>
              </button>
            ))}
          </div>
          <form className="admin-reset-form" onSubmit={submitReset}>
            <strong>{selectedUser ? `Đổi mật khẩu cho ${selectedUser.username}` : "Chưa chọn tài khoản"}</strong>
            {resetError && <p className="inline-error" role="alert">{resetError}</p>}
            {resetPassword.isSuccess && !resetError && <p className="admin-success" role="status">Đã cập nhật mật khẩu.</p>}
            <AdminField label="Mật khẩu mới" type="text" value={newPassword} onChange={setNewPassword} autoComplete="off" />
            <button className="secondary-button" disabled={resetPassword.isPending || !selectedUserId}>{resetPassword.isPending ? "Đang đổi" : "Đổi mật khẩu"}</button>
          </form>
        </section>
      </section>

      <section className="admin-grid lower">
        <section className="admin-panel">
          <div className="admin-panel-heading"><span><ChartLineUp size={19} /></span><div><h2>DAU 14 ngày</h2><p>Unique user có activity event.</p></div></div>
          <div className="admin-dau-bars">
            {(overview.data?.dau.data || []).map((item) => (
              <div key={item.date}><span style={{ height: `${Math.max(8, (item.activeUsers / dauMax) * 100)}%` }} /><small>{item.date.slice(5)}</small><b>{item.activeUsers}</b></div>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading"><span><ChalkboardTeacher size={19} /></span><div><h2>Lớp mới</h2><p>Lớp được tạo gần nhất.</p></div></div>
          <div className="admin-feed-list">
            {(overview.data?.recentClasses || []).map((item) => (
              <article key={item.classId}><strong>{item.className}</strong><span>{item.studentCount} học sinh / {item.lessonCount} bài</span><time>{item.createdAt ? formatTime(item.createdAt) : "Chưa rõ"}</time></article>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading"><span><GraduationCap size={19} /></span><div><h2>Submission mới</h2><p>Hoạt động làm bài gần nhất.</p></div></div>
          <div className="admin-feed-list">
            {(overview.data?.recentSubmissions || []).map((item) => (
              <article key={item.id}><strong>{item.studentName}</strong><span>{item.status} / {item.grade ?? "chưa chấm"}</span><time>{formatTime(item.submittedAt)}</time></article>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading"><span><ChartLineUp size={19} /></span><div><h2>Activity stream</h2><p>Event mới nhất toàn hệ thống.</p></div></div>
          <div className="admin-feed-list">
            {(overview.data?.recentActivities || []).map((item) => (
              <article key={item.id}><strong>{item.eventType}</strong><span>{item.source}{item.classId ? ` / class ${item.classId.slice(0, 8)}` : ""}</span><time>{formatTime(item.createdAt)}</time></article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: number | string; detail: string }) {
  return <article className="admin-metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function StatusBadge({ status, label }: { status: "healthy" | "degraded" | "unavailable"; label?: string }) {
  const text = label || (status === "healthy" ? "Ổn" : status === "degraded" ? "Cần chú ý" : "Không truy cập được");
  return <span className="admin-status-badge" data-status={status}>{text}</span>;
}

function ReportState({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return <div><span>{label}</span><strong data-alert={alert && value > 0}>{value}</strong></div>;
}

function AdminField({ label, value, onChange, type = "text", autoComplete }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) {
  return <label className="admin-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required /></label>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Vừa xong";
  return date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function formatSeconds(value: number | null) {
  return value === null ? "-" : `${value.toFixed(value < 10 ? 1 : 0)}s`;
}
