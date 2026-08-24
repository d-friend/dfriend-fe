import { API_BASE_URL } from "@/lib/api-client";
import { consumeJsonSse } from "@/lib/sse";

export type StudyStreamEvent =
  | { type: "token"; content: string }
  | {
      type: "done";
      current_progress?: number;
      current_process?: number;
      current_problem_id?: number | null;
      unlocked_problem_id?: number | null;
      awaiting_reasoning?: boolean;
      spam?: boolean;
      is_correct?: boolean | null;
      answer_verdict?: "CORRECT" | "INCORRECT" | "NOT_AN_ANSWER" | "UNDETERMINED" | null;
      approach_verdict?: "CORRECT" | "WEAK" | "INCORRECT" | "NOT_AN_ANSWER" | "INSUFFICIENT_EVIDENCE" | null;
      approach_quality?: "SOUND" | "FRAGILE" | "INCORRECT" | "NOT_ASSESSED" | "UNDETERMINED" | null;
      reasoning_evidence_verdict?: "SUFFICIENT" | "INSUFFICIENT" | "CONTRADICTORY" | "NOT_REQUIRED" | null;
      reasoning_evidence_confidence?: number | null;
      answer_confidence?: number | null;
      approach_confidence?: number | null;
      needs_clarification?: boolean;
      advanced?: boolean;
      terminal_resolution?: "MASTERED" | "ANSWER_ACCEPTED" | "UNRESOLVED_AFTER_REPAIR" | "INCORRECT_TERMINAL" | null;
      state_updated?: boolean;
      session_completed?: boolean;
      completed_problem_count?: number;
      total_problem_count?: number;
    }
  | { type: "error"; message?: string };

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const item = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

export async function streamStudyBuddy(
  payload: {
    session_id: string;
    message: string;
    is_submission: boolean;
    problem_id: number;
  },
  onEvent: (event: StudyStreamEvent) => void,
  signal: AbortSignal,
) {
  const csrf = readCookie("csrf_token");
  const response = await fetch(`${API_BASE_URL}/ai-session/chat/stream`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Study Buddy chưa thể phản hồi.");
  }

  let terminal = false;
  await consumeJsonSse<StudyStreamEvent>(response, (event) => {
    if (event.type === "done" || event.type === "error") terminal = true;
    onEvent(event);
  });
  if (!terminal) throw new Error("Kết nối Study Buddy kết thúc trước khi lưu tiến độ.");
}
