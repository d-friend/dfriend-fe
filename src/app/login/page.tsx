"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LockKey, User } from "@phosphor-icons/react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await apiClient.post<{ user?: { role?: string }; role?: string }>("/auth/login", { username, password });
      await apiClient.get("/auth/csrf-token").catch(() => null);
      const role = response.data.user?.role || response.data.role;
      router.replace(role === "STUDENT" ? "/student/dashboard" : "/teacher/copilot/new");
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, "Tên đăng nhập hoặc mật khẩu không đúng."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <Image src="/dfriend-logo.png" alt="Logo D-Friend" width={96} height={96} priority />
        <div><p className="workspace-kicker">D-Friend</p><h1>Dạy đúng. Học sâu. Tiến bộ thật.</h1><p>Một không gian chung để giáo viên dẫn đường và học sinh làm chủ việc học.</p></div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div><h2>Đăng nhập</h2><p>Tiếp tục vào không gian của bạn.</p></div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="form-field"><label htmlFor="username">Tên đăng nhập</label><div className="input-with-icon"><User size={17} /><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></div></div>
          <div className="form-field"><label htmlFor="password">Mật khẩu</label><div className="input-with-icon"><LockKey size={17} /><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div></div>
          <button className="primary-button" disabled={loading}>{loading ? "Đang đăng nhập" : "Đăng nhập"}<ArrowRight size={16} /></button>
          <p className="auth-switch">Chưa có tài khoản? <Link href="/register">Đăng ký học sinh</Link></p>
        </form>
      </section>
    </main>
  );
}
