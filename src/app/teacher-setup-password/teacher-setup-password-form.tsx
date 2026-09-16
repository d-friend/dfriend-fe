"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle, LockKey, User } from "@phosphor-icons/react";
import { authApi, getApiErrorMessage } from "@/lib/api-client";

export function TeacherSetupPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void authApi.teacherPasswordSetupPreview(token)
      .then((preview) => {
        if (!cancelled) setUsername(preview.username);
      })
      .catch((previewError) => {
        if (!cancelled) {
          setError(getApiErrorMessage(previewError, "Không đọc được thông tin tài khoản. Link có thể đã hết hạn."));
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Link đăng ký thiếu token.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Hai mật khẩu chưa khớp.");
      return;
    }

    setLoading(true);
    try {
      await authApi.setupTeacherPassword({ token, username: username.trim(), password });
      setSuccess(true);
      window.setTimeout(() => router.replace("/login"), 1200);
    } catch (setupError) {
      setError(getApiErrorMessage(setupError, "Không đặt được mật khẩu. Link có thể đã hết hạn."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page teacher-setup-page">
      <section className="login-brand">
        <Image src="/dfriend-logo.png" alt="Logo D-Friend" width={96} height={96} priority />
        <div>
          <p className="workspace-kicker">Teacher onboarding</p>
          <h1>Kích hoạt tài khoản giáo viên</h1>
          <p>Đặt mật khẩu cho tài khoản đã được admin tạo sẵn, rồi đăng nhập vào workspace giáo viên.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div>
            <h2>Đặt mật khẩu</h2>
            <p>Link này dùng một lần. Nếu hết hạn, admin có thể tạo link mới.</p>
          </div>
          {!token && <p className="inline-error" role="alert">Link đăng ký không hợp lệ.</p>}
          {error && <p className="inline-error" role="alert">{error}</p>}
          {success && (
            <p className="admin-success" role="status">
              <CheckCircle size={17} /> Đã đặt mật khẩu. Đang chuyển về đăng nhập.
            </p>
          )}
          <div className="form-field">
            <label htmlFor="username">Tên đăng nhập</label>
            <div className="input-with-icon">
              <User size={17} />
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                minLength={3}
                maxLength={50}
                disabled={previewLoading || success || !token}
                required
              />
            </div>
            <small>Có thể đổi tên mặc định được tạo từ phần đứng trước @ trong email.</small>
          </div>
          <div className="form-field">
            <label htmlFor="password">Mật khẩu mới</label>
            <div className="input-with-icon">
              <LockKey size={17} />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="confirm-password">Nhập lại mật khẩu</label>
            <div className="input-with-icon">
              <LockKey size={17} />
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
          </div>
          <button className="primary-button" disabled={loading || previewLoading || success || !token || !username.trim()}>
            {previewLoading ? "Đang tải tài khoản" : loading ? "Đang kích hoạt" : "Kích hoạt tài khoản"} <ArrowRight size={16} />
          </button>
          <p className="auth-switch">Đã có mật khẩu? <Link href="/login">Đăng nhập</Link></p>
        </form>
      </section>
    </main>
  );
}
