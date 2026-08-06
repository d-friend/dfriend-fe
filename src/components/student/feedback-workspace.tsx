"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ClockCounterClockwise,
  Flag,
  House,
  Lightbulb,
  Path,
  Sparkle,
  Target,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { MathContent } from "@/components/shared/math-content";
import { studentApi, studentKeys } from "@/lib/student-api";
import type { StudySessionSummary } from "@/types/contracts";

export function FeedbackWorkspace({ lessonId }: { lessonId: string }) {
  const reduceMotion = useReducedMotion();
  const followUp = lessonId.startsWith("extra_");
  const [cachedSummary, setCachedSummary] = useState<StudySessionSummary | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const value = sessionStorage.getItem(`dfriend:feedback:${lessonId}`); if (value) setCachedSummary(JSON.parse(value)); } catch { setCachedSummary(null); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [lessonId]);
  const reportQuery = useQuery({
    queryKey: studentKeys.report(lessonId),
    queryFn: () => studentApi.report(lessonId),
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.status === "FEEDBACK_PENDING" ? 3_000 : false,
  });
  const extrasQuery = useQuery({ queryKey: ["student", "extra", lessonId], queryFn: () => studentApi.extraExercises(lessonId), retry: 0 });
  const summary = cachedSummary || reportQuery.data?.sessionSummary || null;
  const strengths = unique([...(summary?.strengths || []), ...(summary?.mastering_at || [])]).slice(0, 3);
  const gaps = unique([...(summary?.weaknesses || []), ...(summary?.struggling_at || [])]).slice(0, 2);
  const finishedScores = Object.values(summary?.finished_exercise || {}).map((item) => item.score).filter((score): score is number => typeof score === "number");
  const finishedCount = Object.keys(summary?.finished_exercise || {}).length;
  const progressPercent = clamp(reportQuery.data?.sessionProgress || 0, 0, 100);
  const totalCount = followUp ? finishedCount : Math.max(finishedCount, 4);
  const assignedExtraCount = (extrasQuery.data?.extra_exercises || []).reduce(
    (count, group) => count + group.exercises.length,
    0,
  );
  const expectedCount = followUp
    ? Math.max(finishedCount, assignedExtraCount)
    : totalCount;
  const completedCount = finishedCount || Math.round((progressPercent / 100) * expectedCount);
  const average = finishedScores.length ? finishedScores.reduce((sum, score) => sum + score, 0) / finishedScores.length : normalizeScore(reportQuery.data?.score ?? 0);
  const lessonTitle = reportQuery.data?.lessonTitle || "Bài học vừa hoàn thành";
  const hasExtra = !followUp && Boolean(extrasQuery.data?.extra_exercises?.some((group) => group.exercises.length));

  if (reportQuery.isLoading && !cachedSummary) return <div className="feedback-shell"><div className="student-skeleton feedback-skeleton" /></div>;
  if (reportQuery.isError && !cachedSummary) return <div className="learning-error"><Flag size={38} /><h1>Chưa tải được feedback</h1><p>Kết quả của bạn vẫn được lưu. Thử tải lại để xem phần tổng hợp.</p><div><Link className="student-secondary-button" href="/student/dashboard">Về Hôm nay</Link><button className="student-primary-button" onClick={() => reportQuery.refetch()}>Thử lại</button></div></div>;
  if (!cachedSummary && reportQuery.data?.status === "FEEDBACK_PENDING") return <div className="learning-error"><ClockCounterClockwise size={38} /><h1>Đang tổng hợp feedback</h1><p>Kết quả đã được lưu. Trang này sẽ tự cập nhật khi phản hồi từ Session 2 sẵn sàng.</p><div><Link className="student-secondary-button" href="/student/dashboard">Về Hôm nay</Link><button className="student-primary-button" onClick={() => reportQuery.refetch()}>Kiểm tra lại</button></div></div>;
  if (!cachedSummary && reportQuery.data?.status === "NOT_STARTED") return <div className="learning-error"><Flag size={38} /><h1>Chưa có feedback</h1><p>Bạn cần hoàn thành Session 1 và Session 2 trước khi xem phần tổng hợp.</p><div><Link className="student-secondary-button" href="/student/dashboard">Về Hôm nay</Link><Link className="student-primary-button" href={`/student/lesson/${lessonId}/part1`}>Bắt đầu từ Session 1</Link></div></div>;

  return (
    <main className="feedback-shell">
      <motion.div className="feedback-summit" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
        <div className="summit-symbol"><Path size={32} /><Flag size={23} weight="fill" /></div>
        <span>{lessonTitle}</span>
        <h1>Bạn đã hoàn thành bài học</h1>
        <p>{completedCount}/{expectedCount} bài đã đi qua <i /> Điểm phiên học {formatScore(average)}/10</p>
      </motion.div>

      <div className="feedback-content">
        <section className="feedback-columns">
          <div className="feedback-list strengths"><div><span><Sparkle size={19} weight="fill" /></span><h2>Bạn làm tốt</h2></div>{strengths.length ? strengths.map((item) => <div className="feedback-math-row" key={item}><Check size={17} weight="bold" /><MathContent>{humanize(item)}</MathContent></div>) : <p><Check size={17} weight="bold" /> Bạn đã kiên trì đi hết phiên học.</p>}</div>
          <div className="feedback-list gaps"><div><span><Target size={19} /></span><h2>Cần luyện thêm</h2></div>{gaps.length ? gaps.map((item) => <div className="feedback-math-row" key={item}><ArrowRight size={17} /><MathContent>{humanize(item)}</MathContent></div>) : <p><ArrowRight size={17} /> Xem lại cách trình bày từng bước để câu trả lời rõ hơn.</p>}</div>
        </section>

        <section className="feedback-scores" aria-label="Kết quả phiên học"><ResultFact label="Điểm phiên học" value={formatScore(average)} unit="/10" /><ResultFact label="Bài đã hoàn thành" value={`${completedCount}/${expectedCount}`} unit="bài" /><ResultFact label="Tiến độ" value={`${Math.round(progressPercent)}%`} /></section>

        <section className="buddy-observation"><span><Lightbulb size={21} weight="fill" /></span><div><h2>Bạn học AI nhận thấy</h2><MathContent>{summary?.summary || "Bạn đã hoàn thành phiên học. Hãy xem lại phần cần luyện và thử giải thích mỗi bước bằng lời của mình."}</MathContent></div></section>

        <div className="feedback-actions"><Link className="student-primary-button" href="/student/dashboard"><House size={18} weight="fill" /> Về Hôm nay</Link>{hasExtra && <Link className="student-secondary-button" href={`/student/lesson/extra_${lessonId}/part2`}>Luyện thêm <ArrowRight size={17} /></Link>}</div>
      </div>
    </main>
  );
}

function ResultFact({ label, value, unit }: { label: string; value: string; unit?: string }) { return <div><span>{label}</span><strong>{value}</strong>{unit && <small>{unit}</small>}</div>; }
function normalizeScore(value: number) { return value > 10 ? value / 10 : value; }
function formatScore(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
function unique(values: string[]) { return Array.from(new Set(values.filter(Boolean))); }
const FEEDBACK_LABELS: Record<string, string> = {
  good_logic: "Lập luận logic",
  careful: "Kiểm tra cẩn thận",
  definition: "Nắm chắc định nghĩa",
  method: "Chọn đúng phương pháp",
  exact_result: "Tính toán chính xác",
  generalizable: "Biết khái quát cách làm",
  handles_edge_cases: "Chú ý các trường hợp đặc biệt",
};

function humanize(value: string) {
  const key = value.trim().toLocaleLowerCase("en").replaceAll(" ", "_");
  return FEEDBACK_LABELS[key] || value.replaceAll("_", " ").replace(/^./, (character) => character.toLocaleUpperCase("vi"));
}
