/** Consume JSON Server-Sent Events without dropping the final frame.
 *
 * A proxy is allowed to close immediately after the last `data:` line. The old
 * readers only processed frames followed by a blank line, so that legal ending
 * discarded `done` and left both chat interfaces stuck in a streaming state.
 */
export async function consumeJsonSse<T>(
  response: Response,
  onEvent: (event: T) => void,
) {
  if (!response.body) throw new Error("Phản hồi không có luồng dữ liệu.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeFrame = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return;
    onEvent(JSON.parse(data) as T);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    frames.forEach(consumeFrame);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeFrame(buffer);
}
