"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowClockwise,
  ArrowLeft,
  ClockCounterClockwise,
  Database,
  FileText,
  FunnelSimple,
  LockKey,
  SignOut,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApi, apiClient } from "@/lib/api-client";
import type { ProductEvent } from "@/types/contracts";

const PAGE_SIZE = 50;

export function ProductEventsWorkspace() {
  const router = useRouter();
  const [cursor, setCursor] = useState<string | null>(null);
  const [eventType, setEventType] = useState("");
  const [classId, setClassId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");

  const me = useQuery({ queryKey: ["admin", "me"], queryFn: adminApi.me });
  const events = useQuery({
    queryKey: ["admin", "product-events", cursor, eventType, classId, lessonId],
    queryFn: () =>
      adminApi.productEvents({
        limit: PAGE_SIZE,
        cursor,
        eventType: eventType.trim() || undefined,
        classId: classId.trim() || undefined,
        lessonId: lessonId.trim() || undefined,
      }),
    enabled: me.data?.role === "ADMIN",
    refetchInterval: 30_000,
  });

  const selectedEvent = useMemo(() => {
    const rows = events.data?.data || [];
    return rows.find((item) => item.id === selectedEventId) || rows[0] || null;
  }, [events.data?.data, selectedEventId]);

  async function logout() {
    await apiClient.post("/auth/logout");
    router.replace("/login");
  }

  function applyFilters() {
    setCursor(null);
    setSelectedEventId("");
    void events.refetch();
  }

  if (me.isLoading) return <main className="admin-shell"><div className="admin-loading" /></main>;
  if (me.data && me.data.role !== "ADMIN") {
    return (
      <main className="admin-shell">
        <section className="admin-denied">
          <LockKey size={36} />
          <h1>Không có quyền admin</h1>
          <p>Tài khoản hiện tại không được phép truy cập timeline vận hành.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p>D-Friend Admin</p>
          <h1>Product event timeline</h1>
        </div>
        <div>
          <Link className="secondary-button" href="/admin">
            <ArrowLeft size={16} /> Tổng quan
          </Link>
          <button className="secondary-button" onClick={() => events.refetch()}>
            <ArrowClockwise size={16} /> Làm mới
          </button>
          <button className="icon-button" onClick={() => { void logout(); }} aria-label="Đăng xuất">
            <SignOut size={18} />
          </button>
        </div>
      </header>

      <section className="admin-panel product-event-filters">
        <div className="admin-panel-heading">
          <span><FunnelSimple size={19} /></span>
          <div><h2>Bộ lọc log</h2><p>Lọc theo event hoặc entity chính để debug pilot flow.</p></div>
        </div>
        <div className="product-event-filter-row">
          <label><span>Event type</span><input value={eventType} onChange={(event) => setEventType(event.target.value)} placeholder="DOCUMENT_UPLOADED" /></label>
          <label><span>Class ID</span><input value={classId} onChange={(event) => setClassId(event.target.value)} placeholder="uuid lớp" /></label>
          <label><span>Lesson ID</span><input value={lessonId} onChange={(event) => setLessonId(event.target.value)} placeholder="lesson id" /></label>
          <button className="primary-button" onClick={applyFilters}><FunnelSimple size={16} /> Lọc</button>
        </div>
      </section>

      <section className="product-event-layout">
        <section className="admin-panel product-event-log">
          <div className="admin-panel-heading">
            <span><ClockCounterClockwise size={19} /></span>
            <div><h2>Event log</h2><p>{events.data?.data.length || 0} event mới nhất trong trang này.</p></div>
          </div>
          {events.isLoading ? <div className="admin-loading small" /> : (
            <div className="product-event-list">
              {(events.data?.data || []).map((event) => (
                <button
                  key={event.id}
                  data-selected={selectedEvent?.id === event.id}
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <span className="product-event-dot" />
                  <span>
                    <strong>{event.eventType}</strong>
                    <small>{formatEventLine(event)}</small>
                  </span>
                  <time>{formatTime(event.createdAt)}</time>
                </button>
              ))}
              {!events.data?.data.length && <p className="admin-empty">Chưa có product event phù hợp.</p>}
            </div>
          )}
          <div className="product-event-pagination">
            <button className="secondary-button" disabled={!cursor} onClick={() => { setCursor(null); setSelectedEventId(""); }}>Trang đầu</button>
            <button className="secondary-button" disabled={!events.data?.nextCursor} onClick={() => { setCursor(events.data?.nextCursor || null); setSelectedEventId(""); }}>Trang sau</button>
          </div>
        </section>

        <EventDetail event={selectedEvent} />
      </section>
    </main>
  );
}

function EventDetail({ event }: { event: ProductEvent | null }) {
  if (!event) {
    return (
      <section className="admin-panel product-event-detail">
        <div className="admin-panel-heading"><span><Database size={19} /></span><div><h2>Chi tiết</h2><p>Chọn một event để xem payload.</p></div></div>
      </section>
    );
  }

  const metadata = JSON.stringify(event.metadata || {}, null, 2);
  return (
    <section className="admin-panel product-event-detail">
      <div className="admin-panel-heading">
        <span><Database size={19} /></span>
        <div><h2>{event.eventType}</h2><p>{event.source} / {formatTime(event.createdAt)}</p></div>
      </div>
      <div className="product-event-kv">
        <DetailRow label="Event ID" value={event.id} />
        <DetailRow label="Actor" value={[event.actorRole, event.actorUserId].filter(Boolean).join(" / ")} />
        <DetailRow label="Student" value={event.studentId || ""} />
        <DetailRow label="Class" value={event.classId || ""} />
        <DetailRow label="Lesson" value={event.lessonId || ""} />
        <DetailRow label="Session" value={event.sessionId || ""} />
        <DetailRow label="Concept" value={[event.subject, event.topic, event.conceptKey].filter(Boolean).join(" / ")} />
        <DetailRow label="Client" value={[event.ip, event.userAgent].filter(Boolean).join(" / ")} />
      </div>
      <div className="product-event-json">
        <div><FileText size={16} /><strong>Metadata</strong></div>
        <pre>{metadata}</pre>
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value || "-"}</strong></div>;
}

function formatEventLine(event: ProductEvent) {
  const parts = [
    event.actorRole,
    event.classId ? `class ${event.classId.slice(0, 8)}` : "",
    event.lessonId ? `lesson ${event.lessonId.slice(0, 8)}` : "",
    event.conceptKey || event.topic || event.subject || "",
  ].filter(Boolean);
  return parts.join(" / ") || event.source;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Vừa xong";
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}
