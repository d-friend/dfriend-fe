import { API_BASE_URL } from "@/lib/api-client";
import type { CopilotDraft, CopilotStep } from "@/types/contracts";

export type CopilotStreamEvent =
  | { type: "conversation"; conversation_id: string }
  | { type: "step"; step: CopilotStep }
  | { type: "delta"; delta: string }
  | { type: "draft"; draft: CopilotDraft }
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
      if (!data) continue;
      onEvent(JSON.parse(data) as CopilotStreamEvent);
    }
  }
}
