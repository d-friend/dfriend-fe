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
  Sparkle,
  Target,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
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
  const scoreTone = average >= 8 ? "strong" : average >= 6 ? "steady" : "focus";
  const scoreCopy = scoreTone === "strong" ? "Nắm khá chắc" : scoreTone === "steady" ? "Đang lên nhịp" : "Cần củng cố";
  const lessonTitle = reportQuery.data?.lessonTitle || "Bài học vừa hoàn thành";
  const hasExtra = !followUp && Boolean(extrasQuery.data?.extra_exercises?.some((group) => group.exercises.length));

  if (reportQuery.isLoading && !cachedSummary) return <div className="feedback-shell"><div className="student-skeleton feedback-skeleton" /></div>;
  if (reportQuery.isError && !cachedSummary) return <div className="learning-error"><Flag size={38} /><h1>Chưa tải được feedback</h1><p>Kết quả của bạn vẫn được lưu. Thử tải lại để xem phần tổng hợp.</p><div><Link className="student-secondary-button" href="/student/dashboard">Về Hôm nay</Link><button className="student-primary-button" onClick={() => reportQuery.refetch()}>Thử lại</button></div></div>;
  if (!cachedSummary && reportQuery.data?.status === "FEEDBACK_PENDING") return <div className="learning-error"><ClockCounterClockwise size={38} /><h1>Đang tổng hợp feedback</h1><p>Kết quả đã được lưu. Trang này sẽ tự cập nhật khi phản hồi từ Session 2 sẵn sàng.</p><div><Link className="student-secondary-button" href="/student/dashboard">Về Hôm nay</Link><button className="student-primary-button" onClick={() => reportQuery.refetch()}>Kiểm tra lại</button></div></div>;
  if (!cachedSummary && reportQuery.data?.status === "NOT_STARTED") return <div className="learning-error"><Flag size={38} /><h1>Chưa có feedback</h1><p>Bạn cần hoàn thành Session 1 và Session 2 trước khi xem phần tổng hợp.</p><div><Link className="student-secondary-button" href="/student/dashboard">Về Hôm nay</Link><Link className="student-primary-button" href={`/student/lesson/${lessonId}/part1`}>Bắt đầu từ Session 1</Link></div></div>;

  return (
    <main className="feedback-shell">
      <motion.section className="feedback-hero" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }} aria-labelledby="feedback-title">
        <div className="feedback-score-card" data-tone={scoreTone}>
          <span>Điểm phiên học</span>
          <strong>{formatScore(average)}</strong>
          <small>/10</small>
          <b>{scoreCopy}</b>
        </div>
        <div className="feedback-hero-copy">
          <span>{lessonTitle}</span>
          <h1 id="feedback-title">Feedback sau phiên học</h1>
          <MathContent>{summary?.summary || "Bạn đã hoàn thành phiên học. Hãy xem lại phần cần luyện và thử giải thích mỗi bước bằng lời của mình."}</MathContent>
        </div>
        <div className="feedback-progress-card">
          <span>Bài đã đi qua</span>
          <strong>{completedCount}/{expectedCount}</strong>
          <small>{Math.round(progressPercent)}% tiến độ</small>
        </div>
      </motion.section>

      <div className="feedback-content">
        <section className="feedback-columns">
          <FeedbackList
            kind="strengths"
            icon={<Sparkle size={19} weight="fill" />}
            title="Điểm mạnh"
            empty="Bạn đã kiên trì đi hết phiên học."
            items={strengths}
          />
          <FeedbackList
            kind="gaps"
            icon={<Target size={19} />}
            title="Cần luyện thêm"
            empty="Xem lại cách trình bày từng bước để câu trả lời rõ hơn."
            items={gaps}
          />
        </section>

        <section className="buddy-observation"><span><Lightbulb size={21} weight="fill" /></span><div><h2>Việc nên làm tiếp theo</h2><p>{gaps.length ? "Chọn một điểm cần luyện, giải lại chậm hơn và nói rõ lý do của từng bước." : "Giữ nhịp này: tiếp tục giải thích cách làm trước khi chốt đáp án."}</p></div></section>

        <div className="feedback-actions"><Link className="student-primary-button" href="/student/dashboard"><House size={18} weight="fill" /> Về Hôm nay</Link>{hasExtra && <Link className="student-secondary-button" href={`/student/lesson/extra_${lessonId}/part2`}>Luyện thêm <ArrowRight size={17} /></Link>}</div>
      </div>
    </main>
  );
}

function FeedbackList({ kind, icon, title, empty, items }: { kind: "strengths" | "gaps"; icon: ReactNode; title: string; empty: string; items: string[] }) {
  const Icon = kind === "strengths" ? Check : ArrowRight;
  return (
    <section className={`feedback-list ${kind}`}>
      <header><span>{icon}</span><h2>{title}</h2></header>
      <div className="feedback-list-body">
        {items.length ? items.map((item) => <div className="feedback-math-row" key={item}><Icon size={17} weight={kind === "strengths" ? "bold" : "regular"} /><MathContent>{humanize(item)}</MathContent></div>) : <p><Icon size={17} weight={kind === "strengths" ? "bold" : "regular"} /> {empty}</p>}
      </div>
    </section>
  );
}
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
