import { API_BASE_URL } from "@/lib/api-client";

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
      state_updated?: boolean;
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

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as StudyStreamEvent);
    }
  }
}
