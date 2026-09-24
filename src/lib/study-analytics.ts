"use client";

import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = "/dfr-collect";
const debug = process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "true";
const attemptWindowMinutes = 60;
let initialised = false;

type StudyEventName =
  | "study_session_started"
  | "study_session_completed"
  | "study_session_ended_early"
  | "study_session_expired"
  | "study_session_progressed"
  | "study_session_left";

function debugLog(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console[level](`[D-Friend/PostHog] ${message}`, data || {});

  if (process.env.NODE_ENV !== "development") return;
  void fetch("/api/dev/posthog-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ level, message, data }),
  }).catch(() => {
    // Dev logging must never affect the learning flow or analytics capture.
  });
}

function readLocal(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Analytics must not interrupt learning. */ }
}

function removeLocal(key: string) {
  try { localStorage.removeItem(key); } catch { /* Analytics must not interrupt learning. */ }
}

export type StudyEventProperties = {
  lesson_id: string;
  session_id: string;
  lesson_kind: "main" | "remedial" | "advanced";
  problem_count: number;
  started_at: string;
};

function client() {
  if (!key || !host || typeof window === "undefined") {
    debugLog("warn", "capture disabled: missing public key or ingestion host");
    return null;
  }
  if (!initialised) {
    try {
      posthog.init(key, {
        api_host: host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        persistence: "localStorage",
      });
      posthog.debug(debug);
      initialised = true;
      debugLog("info", "SDK initialized", { host });
    } catch {
      debugLog("error", "SDK initialization failed");
      return null;
    }
  }
  return posthog;
}

function captureQueuedStudyEvent(
  event: StudyEventName,
  properties: StudyEventProperties & Record<string, string | number | boolean>,
): boolean {
  const analytics = client();
  if (!analytics) return false;
  if (!analytics.is_capturing()) {
    debugLog("warn", "event was not queued: capturing is disabled", { event, session_id: properties.session_id });
    return false;
  }
  try {
    analytics.capture(event, properties);
    debugLog("info", "event queued for ingestion", {
      event,
      session_id: properties.session_id,
      lesson_id: properties.lesson_id,
      completed_problem_count: properties.completed_problem_count,
    });
    return true;
  } catch (error) {
    debugLog("error", "event capture threw before it could be queued", {
      event,
      session_id: properties.session_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export function identifyStudyStudent(studentId: string) {
  const analytics = client();
  if (!analytics) return;
  try {
    const previousStudent = readLocal("dfriend:posthog:student-id");
    if (previousStudent && previousStudent !== studentId) analytics.reset();
    analytics.identify(studentId);
    writeLocal("dfriend:posthog:student-id", studentId);
  } catch { /* Analytics must not interrupt learning. */ }
}

export function resetStudyAnalytics() {
  if (!initialised) return;
  try { posthog.reset(); } catch { /* Logout must continue. */ }
  removeLocal("dfriend:posthog:student-id");
}

export function captureStudyEvent(
  event: Exclude<StudyEventName, "study_session_started">,
  properties: StudyEventProperties & Record<string, string | number | boolean>,
) {
  captureQueuedStudyEvent(event, properties);
}

export function captureStudyEventOnce(
  event: "study_session_completed" | "study_session_ended_early" | "study_session_expired",
  properties: StudyEventProperties & Record<string, string | number | boolean>,
) {
  const storageKey = `dfriend:posthog:${event}:${properties.session_id}`;
  if (readLocal(storageKey)) return;
  if (captureQueuedStudyEvent(event, properties)) writeLocal(storageKey, "1");
}

export function beginStudyAttempt(
  studentId: string,
  sessionId: string,
  lessonId: string,
  lessonKind: StudyEventProperties["lesson_kind"],
  problemCount: number,
  serverStartedAt?: string,
): StudyEventProperties {
  const storageKey = `dfriend:posthog:study-start:${studentId}:${sessionId}`;
  const stored = readLocal(storageKey);
  const startedAt = serverStartedAt || stored || new Date().toISOString();
  const properties = {
    lesson_id: lessonId,
    session_id: sessionId,
    lesson_kind: lessonKind,
    problem_count: problemCount,
    started_at: startedAt,
  };
  if (!stored && captureQueuedStudyEvent("study_session_started", {
    ...properties,
    attempt_window_minutes: attemptWindowMinutes,
  })) writeLocal(storageKey, startedAt);
  return properties;
}
