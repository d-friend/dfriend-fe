import { Sparkle } from "@phosphor-icons/react";
import type { CSSProperties } from "react";

const generationSteps = [
  "Phân tích mục tiêu",
  "Tìm bài trong kho",
  "Trích xuất tài liệu",
  "Soạn phần thiếu",
  "Tạo bản review",
];

export function LessonGenerationLoading({
  origin,
  detail,
}: {
  origin: "copilot" | "wizard";
  detail?: string;
}) {
  return (
    <section className="lesson-generation-screen" aria-live="polite" aria-busy="true">
      <div className="lesson-generation-panel">
        <div className="generation-orbit" aria-hidden="true">
          <span><Sparkle size={24} weight="fill" /></span>
        </div>
        <p className="workspace-kicker">{origin === "copilot" ? "Teacher Copilot" : "Bài học mới"}</p>
        <h1>Đang tạo bài học</h1>
        <p className="lesson-generation-lead">
          {detail || "Copilot đang dựng bản nháp từ mục tiêu, kho bài và tài liệu của bạn."}
        </p>
        <ol className="lesson-generation-steps">
          {generationSteps.map((step, index) => (
            <li key={step} style={{ "--step-index": index } as CSSProperties}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
        <div className="generation-track"><i /></div>
        <small>Quá trình này có thể mất vài phút. Đừng đóng tab này.</small>
      </div>
    </section>
  );
}
