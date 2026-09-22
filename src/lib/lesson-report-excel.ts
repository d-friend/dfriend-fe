import ExcelJS from "exceljs";
import type { LessonReportExport, TeacherProblemEvidence } from "@/types/contracts";

function textLines(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).join("\n");
}

function problemById(problems: TeacherProblemEvidence[], problemId: number) {
  return problems.find((problem) => problem.problem_id === problemId);
}

function answers(problem?: TeacherProblemEvidence) {
  return textLines(
    problem?.submissions.map((submission) => submission.content) || [],
  );
}

function reasoning(problem?: TeacherProblemEvidence) {
  return textLines(problem?.reasoning.map((entry) => entry.content) || []);
}

function completionLabel(status: LessonReportExport["students"][number]["completionStatus"]) {
  switch (status) {
    case "completed":
      return "Đã hoàn thành";
    case "expired_partial":
      return "Chưa hoàn thành (phiên hết hạn)";
    case "feedback_pending":
      return "Đã nộp, chờ phản hồi";
    default:
      return "Chưa bắt đầu";
  }
}

function metricsText(metrics: LessonReportExport["students"][number]["postMasteryMetrics"]) {
  if (!metrics) return "";
  const values = [
    ["Đúng", metrics.correctness],
    ["Tự lực", metrics.independence],
    ["Lập luận", metrics.reasoning],
    ["Vận dụng", metrics.transfer],
  ].filter(([, value]) => typeof value === "number");
  return values.map(([label, value]) => `${label}: ${value}/10`).join(" · ");
}

export async function downloadLessonReportExcel(report: LessonReportExport) {
  const rows = report.students.map((student) => {
    const p1 = problemById(student.problems, 1);
    const p2 = problemById(student.problems, 2);
    const p3 = problemById(student.problems, 3);
    const p4 = problemById(student.problems, 4);
    return {
      "Mã học sinh": student.studentId,
      "Học sinh": student.studentName,
      "Trạng thái hoàn thành": completionLabel(student.completionStatus),
      "Hoàn thành lúc": student.completedAt ? new Date(student.completedAt).toLocaleString("vi-VN") : "",
      "P1 - Bài nộp": answers(p1),
      "P1 - Lập luận": reasoning(p1),
      "P2 - Bài nộp": answers(p2),
      "P2 - Lập luận": reasoning(p2),
      "P3 - Bài nộp": answers(p3),
      "P3 - Lập luận": reasoning(p3),
      "P4 - Bài nộp": answers(p4),
      "P4 - Lập luận": reasoning(p4),
      "Điểm post-mastery": typeof student.postMasteryScore === "number" ? student.postMasteryScore : "",
      "Chỉ số post-mastery": metricsText(student.postMasteryMetrics),
      "Phản hồi post-mastery": student.postMasteryFeedback || "",
    };
  });
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Lesson Report", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = Object.keys(rows[0] || {
    "Mã học sinh": "", "Học sinh": "", "Trạng thái hoàn thành": "", "Hoàn thành lúc": "",
    "P1 - Bài nộp": "", "P1 - Lập luận": "", "P2 - Bài nộp": "", "P2 - Lập luận": "",
    "P3 - Bài nộp": "", "P3 - Lập luận": "", "P4 - Bài nộp": "", "P4 - Lập luận": "",
    "Điểm post-mastery": "", "Chỉ số post-mastery": "", "Phản hồi post-mastery": "",
  });
  worksheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: index === 1 ? 24 : index >= 4 && index <= 11 ? 38 : index === 14 ? 56 : 20,
  }));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.autoFilter = { from: "A1", to: `${String.fromCharCode(65 + headers.length - 1)}1` };
  worksheet.getRow(1).font = { bold: true };
  worksheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  const safeTitle = report.lessonTitle.replace(/[\\/:*?"<>|]/g, "-").trim() || "lesson-report";
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeTitle}-report.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
