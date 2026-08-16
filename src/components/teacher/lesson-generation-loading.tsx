import { Sparkle } from "@phosphor-icons/react";
import type { CSSProperties } from "react";

const generationSteps = [
  "Chốt kỹ năng và mục tiêu",
  "Soạn Session 1",
  "Dựng 3 mạch luyện tập",
  "Kiểm tra 12 slot độc lập",
  "Lưu bản review",
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
        <small>Tiến trình đã được lưu. Bạn có thể rời trang và quay lại sau.</small>
      </div>
    </section>
  );
}
