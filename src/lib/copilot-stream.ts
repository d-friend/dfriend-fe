import { API_BASE_URL } from "@/lib/api-client";
import type { CopilotDraft, CopilotLessonPlan, CopilotStep } from "@/types/contracts";
import { consumeJsonSse } from "@/lib/sse";

export type CopilotStreamEvent =
  | { type: "conversation"; conversation_id: string }
  | { type: "step"; step: CopilotStep }
  | { type: "delta"; delta: string }
  | { type: "draft"; draft: CopilotDraft }
  | { type: "plan"; plan: CopilotLessonPlan }
  | { type: "done" }
  | { type: "error"; message: string };

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : null;
}

export async function streamCopilot(
  payload: { message: string; conversation_id?: string | null; class_id?: string | null },
  onEvent: (event: CopilotStreamEvent) => void,
  signal: AbortSignal,
) {
  const csrf = readCookie("csrf_token");
  const response = await fetch(`${API_BASE_URL}/teacher/copilot/chat/stream`, {
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
    throw new Error(body?.message || "Copilot chưa thể phản hồi. Vui lòng thử lại.");
  }

  let terminal = false;
  await consumeJsonSse<CopilotStreamEvent>(response, (event) => {
    if (event.type === "done" || event.type === "error") terminal = true;
    onEvent(event);
  });
  if (!terminal) throw new Error("Kết nối Copilot kết thúc trước khi hoàn tất phản hồi.");
}
