"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Flag,
  House,
  Lightbulb,
  Path,
  Sparkle,
  Target,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { studentApi, studentKeys } from "@/lib/student-api";
import type { StudySessionSummary } from "@/types/contracts";

export function FeedbackWorkspace({ lessonId }: { lessonId: string }) {
  const reduceMotion = useReducedMotion();
  const [cachedSummary, setCachedSummary] = useState<StudySessionSummary | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const value = sessionStorage.getItem(`dfriend:feedback:${lessonId}`); if (value) setCachedSummary(JSON.parse(value)); } catch { setCachedSummary(null); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [lessonId]);
  const reportQuery = useQuery({ queryKey: studentKeys.report(lessonId), queryFn: () => studentApi.report(lessonId), retry: 1 });
  const metricsQuery = useQuery({ queryKey: studentKeys.metrics, queryFn: studentApi.metrics });
  const extrasQuery = useQuery({ queryKey: ["student", "extra", lessonId], queryFn: () => studentApi.extraExercises(lessonId), retry: 0 });
  const summary = cachedSummary || reportQuery.data?.sessionSummary || null;
  const strengths = unique([...(summary?.strengths || []), ...(summary?.mastering_at || [])]).slice(0, 3);
  const gaps = unique([...(summary?.weaknesses || []), ...(summary?.struggling_at || [])]).slice(0, 2);
  const finishedScores = Object.values(summary?.finished_exercise || {}).map((item) => item.score).filter((score): score is number => typeof score === "number");
  const completedCount = Object.keys(summary?.finished_exercise || {}).length || reportQuery.data?.sessionProgress || 0;
  const totalCount = Math.max(completedCount, finishedScores.length, 4);
  const average = finishedScores.length ? finishedScores.reduce((sum, score) => sum + score, 0) / finishedScores.length : normalizeScore(reportQuery.data?.score || metricsQuery.data?.result_score || 0);
  const lessonTitle = reportQuery.data?.lessonTitle || "Bài học vừa hoàn thành";
  const hasExtra = Boolean(extrasQuery.data?.extra_exercises?.some((group) => group.exercises.length));

  if (reportQuery.isLoading && !cachedSummary) return <div className="feedback-shell"><div className="student-skeleton feedback-skeleton" /></div>;
  if (reportQuery.isError && !cachedSummary) return <div className="learning-error"><Flag size={38} /><h1>Chưa tải được feedback</h1><p>Kết quả của bạn vẫn được lưu. Thử tải lại để xem phần tổng hợp.</p><div><Link className="student-secondary-button" href="/student/dashboard">Về Hôm nay</Link><button className="student-primary-button" onClick={() => reportQuery.refetch()}>Thử lại</button></div></div>;

  return (
    <main className="feedback-shell">
      <motion.div className="feedback-summit" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
        <div className="summit-symbol"><Path size={32} /><Flag size={23} weight="fill" /></div>
        <span>{lessonTitle}</span>
        <h1>Bạn đã hoàn thành bài học</h1>
        <p>{completedCount}/{totalCount} bài đã đi qua <i /> Điểm phiên học {formatScore(average)}/10</p>
      </motion.div>

      <div className="feedback-content">
        <section className="feedback-columns">
          <div className="feedback-list strengths"><div><span><Sparkle size={19} weight="fill" /></span><h2>Bạn làm tốt</h2></div>{strengths.length ? strengths.map((item) => <p key={item}><Check size={17} weight="bold" /> {humanize(item)}</p>) : <p><Check size={17} weight="bold" /> Bạn đã kiên trì đi hết phiên học.</p>}</div>
          <div className="feedback-list gaps"><div><span><Target size={19} /></span><h2>Cần luyện thêm</h2></div>{gaps.length ? gaps.map((item) => <p key={item}><ArrowRight size={17} /> {humanize(item)}</p>) : <p><ArrowRight size={17} /> Xem lại cách trình bày từng bước để câu trả lời rõ hơn.</p>}</div>
        </section>

        <section className="feedback-scores" aria-label="Năng lực sau bài học"><Score label="Tư duy" value={metricsQuery.data?.thinking_score || average} /><Score label="Kỹ năng" value={metricsQuery.data?.skill_score || average} /><Score label="Kết quả" value={metricsQuery.data?.result_score || average} /></section>

        <section className="buddy-observation"><span><Lightbulb size={21} weight="fill" /></span><div><h2>Study Buddy nhận thấy</h2><p>{summary?.summary || "Bạn đã hoàn thành phiên học. Hãy xem lại phần cần luyện và thử giải thích mỗi bước bằng lời của mình."}</p></div></section>

        <div className="feedback-actions"><Link className="student-primary-button" href="/student/dashboard"><House size={18} weight="fill" /> Về Hôm nay</Link>{hasExtra && <Link className="student-secondary-button" href={`/student/lesson/extra_${lessonId}/part2`}>Luyện thêm <ArrowRight size={17} /></Link>}</div>
      </div>
    </main>
  );
}

function Score({ label, value }: { label: string; value: number }) { const score = normalizeScore(value); return <div><span>{label}</span><strong>{formatScore(score)}</strong><small>/10</small></div>; }
function normalizeScore(value: number) { return value > 10 ? value / 10 : value; }
function formatScore(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function unique(values: string[]) { return Array.from(new Set(values.filter(Boolean))); }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/^./, (character) => character.toLocaleUpperCase("vi")); }
