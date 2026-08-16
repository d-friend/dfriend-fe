"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  LockKey,
  ReadCvLogo,
  XCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MathContent } from "@/components/shared/math-content";
import { getApiErrorMessage } from "@/lib/api-client";
import { canonicalAnswer } from "@/lib/answer-normalization";
import { studentApi, studentKeys } from "@/lib/student-api";
import type { LessonOneKnowledgeItem, LessonOneQuestion } from "@/types/contracts";

type ProgressState = {
  completedItems: number[];
  attemptedQuestions: string[];
  answers: Record<string, string>;
  lastOpenedAt: string;
};

const emptyProgress: ProgressState = {
  completedItems: [],
  attemptedQuestions: [],
  answers: {},
  lastOpenedAt: "",
};

export function SessionOneWorkspace({ exerciseId }: { exerciseId: string }) {
  const router = useRouter();
  const exerciseQuery = useQuery({
    queryKey: studentKeys.exercise(exerciseId),
    queryFn: () => studentApi.exercise(exerciseId),
  });
  const meQuery = useQuery({ queryKey: studentKeys.me, queryFn: studentApi.me });
  const progressQuery = useQuery({
    queryKey: studentKeys.sessionOneProgress(exerciseId),
    queryFn: () => studentApi.sessionOneProgress(exerciseId),
    enabled: Boolean(meQuery.data?.id),
    retry: 1,
  });
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const [activeIndex, setActiveIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  const storageKey = meQuery.data?.id ? `dfriend:s1:${meQuery.data.id}:${exerciseId}` : "";
  useEffect(() => {
    if (!storageKey || !progressQuery.isFetched) return;
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "{}") as Partial<ProgressState>;
        const remote = progressQuery.data;
        setProgress({
          completedItems: Array.from(new Set([
            ...(remote?.completedItems || []),
            ...(Array.isArray(stored.completedItems) ? stored.completedItems : []),
          ])),
          attemptedQuestions: Array.from(new Set([
            ...(remote?.attemptedQuestions || []),
            ...(Array.isArray(stored.attemptedQuestions) ? stored.attemptedQuestions : []),
          ])),
          answers: { ...(remote?.answers || {}), ...(stored.answers || {}) },
          lastOpenedAt: new Date().toISOString(),
        });
      } catch {
        setProgress({
          ...emptyProgress,
          completedItems: progressQuery.data?.completedItems || [],
          attemptedQuestions: progressQuery.data?.attemptedQuestions || [],
          answers: progressQuery.data?.answers || {},
          lastOpenedAt: new Date().toISOString(),
        });
      }
      if (progressQuery.isError) {
        setSyncError("Chưa đồng bộ được tiến độ với máy chủ.");
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [progressQuery.data, progressQuery.isError, progressQuery.isFetched, storageKey]);

  useEffect(() => {
    if (!storageKey || !ready) return;
    localStorage.setItem(storageKey, JSON.stringify(progress));
    const timer = window.setTimeout(() => {
      void studentApi
        .saveSessionOneProgress(exerciseId, progress)
        .then(() => setSyncError(""))
        .catch((error) =>
          setSyncError(
            getApiErrorMessage(error, "Chưa lưu được tiến độ lên máy chủ."),
          ),
        );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [exerciseId, progress, ready, storageKey]);

  const items = useMemo<LessonOneKnowledgeItem[]>(() => {
    const source = exerciseQuery.data?.lesson1Knowledge?.items;
    if (source?.length) return source;
    if (!exerciseQuery.data) return [];
    return [{
      title: exerciseQuery.data.lesson1Knowledge?.concept_name || "Nền tảng bài học",
      content: exerciseQuery.data.material || exerciseQuery.data.description || "Đọc kỹ mục tiêu của bài trước khi sang phần luyện tập.",
      is_core: true,
    }];
  }, [exerciseQuery.data]);

  if (exerciseQuery.isLoading || !ready) return <SessionLoading />;
  if (exerciseQuery.isError || !exerciseQuery.data) return <SessionError onRetry={() => exerciseQuery.refetch()} />;

  const item = items[activeIndex];
  const questions = questionsForItem(exerciseQuery.data.questions || [], activeIndex, items.length);
  const allAttempted = questions.every((question, index) =>
    progress.attemptedQuestions.includes(questionId(question, activeIndex, index)),
  );
  const completed = progress.completedItems.includes(activeIndex);
  const allComplete = items.length > 0 && items.every((_, index) => progress.completedItems.includes(index));
  const nextIndex = items.findIndex((_, index) => index > activeIndex && !progress.completedItems.includes(index));

  function completeItem() {
    if (questions.length && !allAttempted) return;
    setProgress((current) => ({
      ...current,
      completedItems: Array.from(new Set([...current.completedItems, activeIndex])),
      lastOpenedAt: new Date().toISOString(),
    }));
    if (activeIndex < items.length - 1) setActiveIndex(activeIndex + 1);
  }

  async function openSessionTwo() {
    setSyncing(true);
    setSyncError("");
    try {
      await studentApi.saveSessionOneProgress(exerciseId, progress);
      router.push(`/student/lesson/${exerciseId}/part2`);
    } catch (error) {
      setSyncError(
        getApiErrorMessage(
          error,
          "Chưa xác nhận được Session 1. Tiến độ trên máy vẫn được giữ.",
        ),
      );
      setSyncing(false);
    }
  }

  return (
    <div className="learning-shell session-one-shell">
      <header className="learning-header">
        <Link href="/student/roadmap" aria-label="Về lộ trình"><ArrowLeft size={19} /> <span>Lộ trình</span></Link>
        <div className="learning-title"><strong>{exerciseQuery.data.title}</strong><span>Session 1 / 2</span></div>
        <div className="learning-counter"><strong>{progress.completedItems.length}/{items.length}</strong><span>phần</span></div>
      </header>

      <div className="session-one-layout">
        <aside className="knowledge-rail" aria-label="Các phần kiến thức">
          <div className="knowledge-rail-heading"><ReadCvLogo size={20} /><span>Hiểu nền tảng</span></div>
          <div className="knowledge-steps">
            {items.map((knowledgeItem, index) => {
              const done = progress.completedItems.includes(index);
              const unlocked = done || index === 0 || progress.completedItems.includes(index - 1);
              return <button key={`${knowledgeItem.title}-${index}`} data-active={activeIndex === index} data-done={done} disabled={!unlocked} onClick={() => setActiveIndex(index)}><span>{done ? <Check size={15} weight="bold" /> : unlocked ? String(index + 1).padStart(2, "0") : <LockKey size={14} />}</span><strong>{knowledgeItem.title || `Phần ${index + 1}`}</strong></button>;
            })}
          </div>
        </aside>

        <main className="knowledge-workspace">
          <div className="mobile-knowledge-strip" aria-label="Các phần kiến thức">{items.map((_, index) => { const done = progress.completedItems.includes(index); const unlocked = done || index === 0 || progress.completedItems.includes(index - 1); return <button key={index} data-active={activeIndex === index} data-done={done} disabled={!unlocked} onClick={() => setActiveIndex(index)}>{done ? <Check size={14} /> : index + 1}</button>; })}</div>
          <div className="knowledge-scroll">
            <article className="knowledge-content">
              <div className="knowledge-content-heading"><span>Phần {String(activeIndex + 1).padStart(2, "0")}</span><h1>{item?.title || "Nền tảng bài học"}</h1>{completed && <p className="review-badge"><CheckCircle size={17} weight="fill" /> Đã hoàn thành, đang xem lại</p>}</div>
              {activeIndex === 0 && exerciseQuery.data.lesson1Knowledge?.hook && <div className="knowledge-hook"><strong>Đặt vấn đề</strong><MathContent>{exerciseQuery.data.lesson1Knowledge.hook}</MathContent></div>}
              <MathContent className="knowledge-body">{item?.content || "Nội dung đang được cập nhật."}</MathContent>
              {questions.length ? <section className="checkpoint-section"><div><span>Kiểm tra nhanh</span><h2>Thử trước khi sang phần tiếp</h2><p>Chỉ cần trả lời. Bạn không cần đúng ngay lần đầu.</p></div>{questions.map((question, index) => <Checkpoint key={questionId(question, activeIndex, index)} question={question} id={questionId(question, activeIndex, index)} answer={progress.answers[questionId(question, activeIndex, index)] || ""} attempted={progress.attemptedQuestions.includes(questionId(question, activeIndex, index))} onAnswer={(answer) => setProgress((current) => ({ ...current, answers: { ...current.answers, [questionId(question, activeIndex, index)]: answer } }))} onAttempt={() => setProgress((current) => ({ ...current, attemptedQuestions: Array.from(new Set([...current.attemptedQuestions, questionId(question, activeIndex, index)])) }))} />)}</section> : <div className="knowledge-acknowledge"><CheckCircle size={22} /><div><strong>Bạn đã đọc phần này?</strong><span>Đánh dấu hoàn thành để mở nội dung tiếp theo.</span></div></div>}
            </article>
          </div>
          <footer className="knowledge-actions">
            <span>{syncError || (questions.length && !allAttempted && !completed ? `Còn ${questions.length - progress.attemptedQuestions.filter((id) => id.startsWith(`${activeIndex}:`)).length} câu cần thử` : completed ? "Phần này đã được lưu" : "Sẵn sàng mở phần tiếp theo")}</span>
            {allComplete ? <button className="student-primary-button" onClick={() => void openSessionTwo()} disabled={syncing}>{syncing ? "Đang đồng bộ" : "Sang Session 2"} <ArrowRight size={17} /></button> : completed && nextIndex >= 0 ? <button className="student-primary-button" onClick={() => setActiveIndex(nextIndex)}>Phần tiếp theo <ArrowRight size={17} /></button> : <button className="student-primary-button" onClick={completeItem} disabled={questions.length > 0 && !allAttempted}>Hoàn thành phần <ArrowRight size={17} /></button>}
          </footer>
        </main>
      </div>
    </div>
  );
}

function Checkpoint({ question, id, answer, attempted, onAnswer, onAttempt }: { question: LessonOneQuestion; id: string; answer: string; attempted: boolean; onAnswer: (value: string) => void; onAttempt: () => void }) {
  const [localError, setLocalError] = useState("");
  const options = (question.options || []).map((option, index) => typeof option === "string" ? { label: String.fromCharCode(65 + index), text: option } : { label: option.label || String.fromCharCode(65 + index), text: option.text || "" });
  const expected = canonicalAnswer(String(question.correctAnswer ?? question.answer ?? ""));
  const selectedOption = options.find((option) => option.label.toLocaleLowerCase("vi") === answer.toLocaleLowerCase("vi"));
  const actual = canonicalAnswer(selectedOption?.text || answer);
  const selectedLabel = canonicalAnswer(answer);
  const correct = attempted && expected ? actual === expected || selectedLabel === expected : null;
  function submit(event: FormEvent) { event.preventDefault(); if (!answer.trim()) { setLocalError("Chọn hoặc nhập một câu trả lời trước."); return; } setLocalError(""); onAttempt(); }
  return <form className="checkpoint-card" onSubmit={submit}><MathContent className="checkpoint-question">{question.questionText || question.question || "Câu hỏi kiểm tra"}</MathContent>{options.length ? <div className="checkpoint-options">{options.map((option) => <label key={option.label} data-selected={answer === option.label}><input type="radio" name={id} value={option.label} checked={answer === option.label} onChange={(event) => onAnswer(event.target.value)} disabled={attempted} /><span>{option.label}</span><MathContent className="checkpoint-option" answer>{option.text}</MathContent></label>)}</div> : <div className="student-field"><label htmlFor={id}>Câu trả lời của bạn</label><input id={id} value={answer} onChange={(event) => onAnswer(event.target.value)} disabled={attempted} /></div>}{localError && <p className="student-form-error" role="alert">{localError}</p>}{attempted ? <div className={correct ? "checkpoint-feedback correct" : "checkpoint-feedback retry"}>{correct ? <CheckCircle size={21} weight="fill" /> : <XCircle size={21} weight="fill" />}<div><strong>{correct ? "Chính xác" : "Chưa đúng, nhưng bạn đã thử"}</strong><MathContent className="checkpoint-explanation">{question.explanation || (correct ? "Bạn đã nắm phần này." : "Đọc lại lời giải thích rồi tiếp tục khi sẵn sàng.")}</MathContent></div></div> : <button className="student-secondary-button" type="submit">Kiểm tra</button>}</form>;
}

function questionsForItem(questions: LessonOneQuestion[], itemIndex: number, itemCount: number) { const assigned = questions.filter((question) => (question.knowledgeItemIndex ?? question.knowledge_item_index) === itemIndex); if (assigned.length) return assigned; const hasBindings = questions.some((question) => typeof (question.knowledgeItemIndex ?? question.knowledge_item_index) === "number"); if (hasBindings) return []; return itemCount === 1 ? questions : questions.filter((_, index) => index % itemCount === itemIndex); }
function questionId(question: LessonOneQuestion, itemIndex: number, questionIndex: number) { return `${itemIndex}:${question.id || questionIndex}`; }
function SessionLoading() { return <div className="learning-shell"><header className="learning-header"><div className="student-skeleton h-8 w-32" /><div className="student-skeleton h-8 w-72" /><div className="student-skeleton h-8 w-20" /></header><div className="session-one-layout"><div className="student-skeleton m-6" /><div className="student-skeleton m-8" /></div></div>; }
function SessionError({ onRetry }: { onRetry: () => void }) { return <div className="learning-error"><ReadCvLogo size={38} /><h1>Chưa mở được Session 1</h1><p>Bài học có thể chưa sẵn sàng hoặc kết nối vừa bị gián đoạn.</p><div><Link className="student-secondary-button" href="/student/dashboard">Về Hôm nay</Link><button className="student-primary-button" onClick={onRetry}>Thử lại</button></div></div>; }
