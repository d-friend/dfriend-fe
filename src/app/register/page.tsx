"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle,
  EnvelopeSimple,
  IdentificationCard,
  LockKey,
  User,
} from "@phosphor-icons/react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

interface RegisterForm {
  fullName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const emptyForm: RegisterForm = {
  fullName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);

  function update(field: keyof RegisterForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const username = form.username.trim();
    if (username.length < 3) {
      setError("Tên đăng nhập cần ít nhất 3 ký tự.");
      return;
    }
    if (form.password.length < 6) {
      setError("Mật khẩu cần ít nhất 6 ký tự.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Hai mật khẩu chưa trùng nhau.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/auth/register", {
        username,
        email: form.email.trim(),
        full_name: form.fullName.trim(),
        password: form.password,
        role: "STUDENT",
      });
      setCreated(true);
      setForm(emptyForm);
    } catch (registerError) {
      setError(getApiErrorMessage(registerError, "Không thể tạo tài khoản."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand register-brand">
        <Image src="/dfriend-logo.png" alt="Logo D-Friend" width={96} height={96} priority />
        <div>
          <p className="workspace-kicker">D-Friend Student</p>
          <h1>Học theo cách bạn thực sự hiểu.</h1>
          <p>Mỗi bài làm giúp D-Friend tìm đúng kỹ năng cần luyện tiếp theo, không biến việc học thành một bảng xếp hạng.</p>
        </div>
      </section>

      <section className="login-form-wrap">
        {created ? (
          <div className="registration-success" role="status">
            <span><CheckCircle size={30} weight="fill" /></span>
            <p className="workspace-kicker">Tài khoản đã sẵn sàng</p>
            <h2>Đăng ký thành công</h2>
            <p>Đăng nhập để bắt đầu không gian học tập của bạn.</p>
            <Link className="primary-button" href="/login">Đi tới đăng nhập <ArrowRight size={16} /></Link>
          </div>
        ) : (
          <form className="login-form register-form" onSubmit={submit}>
            <div>
              <h2>Tạo tài khoản</h2>
              <p>Đăng ký tài khoản học sinh trong chương trình pilot.</p>
            </div>

            {error && <p className="inline-error" role="alert">{error}</p>}

            <div className="auth-field-grid">
              <div className="form-field">
                <label htmlFor="full-name">Họ và tên</label>
                <div className="input-with-icon"><IdentificationCard size={17} /><input id="full-name" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" maxLength={100} required /></div>
              </div>
              <div className="form-field">
                <label htmlFor="register-username">Tên đăng nhập</label>
                <div className="input-with-icon"><User size={17} /><input id="register-username" value={form.username} onChange={(event) => update("username", event.target.value)} autoComplete="username" minLength={3} maxLength={50} required /></div>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="email">Email</label>
              <div className="input-with-icon"><EnvelopeSimple size={17} /><input id="email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required /></div>
            </div>

            <div className="auth-field-grid">
              <div className="form-field">
                <label htmlFor="register-password">Mật khẩu</label>
                <div className="input-with-icon"><LockKey size={17} /><input id="register-password" type="password" value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" minLength={6} maxLength={100} required /></div>
              </div>
              <div className="form-field">
                <label htmlFor="confirm-password">Nhập lại mật khẩu</label>
                <div className="input-with-icon"><LockKey size={17} /><input id="confirm-password" type="password" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} autoComplete="new-password" minLength={6} maxLength={100} required /></div>
              </div>
            </div>

            <p className="pilot-account-note">Tài khoản giáo viên được cấp riêng để bảo vệ dữ liệu lớp trong giai đoạn pilot.</p>
            <button className="primary-button" disabled={loading}>{loading ? "Đang tạo tài khoản" : "Tạo tài khoản"}<ArrowRight size={16} /></button>
            <p className="auth-switch">Đã có tài khoản? <Link href="/login">Đăng nhập</Link></p>
          </form>
        )}
      </section>
    </main>
  );
}
