"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChatCircleDots,
  Flag,
  FlagPennant,
  ListNumbers,
  Mountains,
  PaperPlaneTilt,
  PencilSimpleLine,
  PersonSimpleHike,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "@/lib/api-client";
import { MathContent } from "@/components/shared/math-content";
import { studentApi, studentKeys } from "@/lib/student-api";
import { streamStudyBuddy, type StudyStreamEvent } from "@/lib/student-stream";
import { deriveStudyProgress } from "@/lib/study-progress";
import type { StudyProblem, StudySession } from "@/types/contracts";

type ChatMessage = { id: string; role: "student" | "buddy"; content: string; degraded?: boolean };
type SessionUiState = "initialising" | "idle" | "streaming" | "awaiting_reasoning" | "farming" | "degraded" | "closing";

const ROLE_LABELS: Record<string, string> = {
  reinforcement: "Làm chắc nền tảng",
  challenge: "Thử thách",
  exploration: "Khám phá",
  extension: "Mở rộng",
};

export function StudySessionWorkspace({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const followUp = lessonId.startsWith("extra_");
  const parentLessonId = followUp ? lessonId.slice("extra_".length) : lessonId;
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StudySession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [uiState, setUiState] = useState<SessionUiState>("initialising");
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "welcome", role: "buddy", content: "Mình là bạn học của bạn trong buổi này. Mình sẽ nghe cách bạn nghĩ, hỏi lại khi cần và cùng gỡ chỗ bị kẹt, nhưng không làm hộ bài." }]);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [scratchpads, setScratchpads] = useState<Record<number, string>>({});
  const [mobileTab, setMobileTab] = useState<"problem" | "buddy">("problem");
  const [activeProblemId, setActiveProblemId] = useState<number | null>(null);
  const streamController = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const initialise = useCallback(async () => {
    setUiState("initialising");
    setSessionError("");
    try {
      const active = await studentApi.activeSession(lessonId);
      const value = active.status === "not_found" ? await studentApi.startSession(lessonId) : active;
      if (!value.session_id || !value.problems?.length) throw new Error("Session 2 chưa có bài tập để bắt đầu.");
      setSession(value);
      setActiveProblemId(value.current_problem_id || value.problems[0].problem_id);
      setUiState("idle");
    } catch (error) {
      setSessionError(getApiErrorMessage(error, error instanceof Error ? error.message : "Không thể khởi tạo Session 2."));
      setUiState("initialising");
    }
  }, [lessonId]);

  useEffect(() => { void initialise(); return () => streamController.current?.abort(); }, [initialise]);
  useEffect(() => { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const problems = session?.problems || [];
  const currentProblem = problems.find((item) => item.problem_id === activeProblemId) || problems[0];
  const answerChoices = currentProblem
    ? choiceLabelsFromQuestion(currentProblem.question)
    : [];
  const { completedCount, allComplete } = deriveStudyProgress(problems, session);
  const currentProblemIndex = currentProblem
    ? problems.findIndex((item) => item.problem_id === currentProblem.problem_id)
    : -1;
  const currentRoleLabel = currentProblem?.recommended_problem_role
    ? ROLE_LABELS[currentProblem.recommended_problem_role] || "Bài luyện tập"
    : "Bài luyện tập";

  async function sendTurn(content: string, isSubmission: boolean) {
    if (!session?.session_id || !currentProblem || uiState === "streaming" || !content.trim()) return;
    const studentMessage: ChatMessage = { id: `student-${Date.now()}`, role: "student", content: content.trim() };
    const buddyId = `buddy-${Date.now()}`;
    setMessages((current) => [...current, studentMessage, { id: buddyId, role: "buddy", content: "" }]);
    setUiState("streaming");
    setMobileTab("buddy");
    const controller = new AbortController();
    streamController.current = controller;
    try {
      await streamStudyBuddy({ session_id: session.session_id, message: content.trim(), is_submission: isSubmission, problem_id: currentProblem.problem_id }, (event) => handleStreamEvent(event, buddyId), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessages((current) => current.map((item) => item.id === buddyId ? { ...item, content: item.content || (error instanceof Error ? error.message : "Kết nối bị gián đoạn. Bạn có thể thử gửi lại."), degraded: true } : item));
      setUiState("degraded");
    } finally {
      streamController.current = null;
    }
  }

  function handleStreamEvent(event: StudyStreamEvent, buddyId: string) {
    if (event.type === "token") {
      setMessages((current) => current.map((item) => item.id === buddyId ? { ...item, content: item.content + event.content } : item));
      return;
    }
    if (event.type === "error") {
      setMessages((current) => current.map((item) => item.id === buddyId ? { ...item, content: item.content || event.message || "Study Buddy bị gián đoạn. Thử lại nhé.", degraded: true } : item));
      setUiState("degraded");
      return;
    }
    setSession((current) => current ? { ...current, current_progress: event.current_progress ?? current.current_progress, current_process: event.current_process ?? event.current_progress ?? current.current_process, current_problem_id: event.current_problem_id ?? current.current_problem_id } : current);
    if (event.current_problem_id) setActiveProblemId(event.current_problem_id);
    if (event.awaiting_reasoning) setUiState("awaiting_reasoning");
    else if (event.spam) setUiState("farming");
    else setUiState("idle");
  }

  function submitChat(event: FormEvent) { event.preventDefault(); const value = message; setMessage(""); void sendTurn(value, false); }
  function submitAnswer(event: FormEvent) { event.preventDefault(); const value = answer; setAnswer(""); void sendTurn(value, true); }

  async function closeSession() {
    if (!session?.session_id) return;
    setUiState("closing");
    try {
      const summary = await studentApi.closeSession(session.session_id, lessonId);
      if (summary.status === "error") throw new Error(summary.message || "Chưa thể kết thúc phiên học.");
      sessionStorage.setItem(`dfriend:feedback:${lessonId}`, JSON.stringify(summary));
      await queryClient.invalidateQueries({ queryKey: studentKeys.metrics });
      await queryClient.invalidateQueries({ queryKey: studentKeys.classes });
      router.replace(`/student/report/${lessonId}`);
    } catch (error) {
      setSessionError(getApiErrorMessage(error, error instanceof Error ? error.message : "Chưa thể kết thúc phiên học."));
      setUiState("idle");
    }
  }

  if (sessionError && !session) return <SessionStartError message={sessionError} retry={initialise} lessonId={lessonId} followUp={followUp} parentLessonId={parentLessonId} />;

  return (
    <div className="learning-shell study-shell">
      <header className="learning-header study-header">
        <Link href={followUp ? `/student/report/${parentLessonId}` : `/student/lesson/${lessonId}/part1`}><ArrowLeft size={19} /><span>{followUp ? "Feedback trước" : "Session 1"}</span></Link>
        <div className="study-header-center"><span><Mountains size={16} weight="fill" /> Đường lên đỉnh</span><MountainProgress problems={problems} completedCount={completedCount} currentProblemId={activeProblemId} waiting={uiState === "awaiting_reasoning" || uiState === "farming"} /></div>
        <div className="learning-counter"><strong>{completedCount}/{problems.length || 4}</strong><span>bài</span></div>
      </header>

      {uiState === "initialising" && !session ? <StudyLoading /> : session && currentProblem ? (
        <div className="study-layout">
          <div className="study-mobile-tabs" role="tablist"><button role="tab" aria-selected={mobileTab === "problem"} onClick={() => setMobileTab("problem")}><PencilSimpleLine size={17} /> Bài tập</button><button role="tab" aria-selected={mobileTab === "buddy"} onClick={() => setMobileTab("buddy")}><ChatCircleDots size={17} /> Study Buddy</button></div>
          <section className="problem-pane" data-mobile-active={mobileTab === "problem"}>
            <div className="problem-pane-scroll">
              <div className="problem-list" aria-label="Danh sách bài tập"><span><ListNumbers size={17} /> Bài trong phiên</span><div>{problems.map((problem, index) => { const done = index < completedCount; const unlocked = done || problem.problem_id === session.current_problem_id || index <= completedCount; return <button key={problem.problem_id} data-active={problem.problem_id === currentProblem.problem_id} data-done={done} disabled={!unlocked} onClick={() => setActiveProblemId(problem.problem_id)}>{done ? <Check size={14} /> : index + 1}</button>; })}</div></div>
              <article className="problem-card">
                <header>
                  <span>Bài {currentProblemIndex + 1} / {problems.length}</span>
                  <strong>{currentRoleLabel}</strong>
                </header>
                <MathContent>{currentProblem.question}</MathContent>
              </article>
              <div className="scratchpad"><label htmlFor="scratchpad"><PencilSimpleLine size={18} /> Nháp của bạn</label><textarea id="scratchpad" value={scratchpads[currentProblem.problem_id] || ""} onChange={(event) => setScratchpads((current) => ({ ...current, [currentProblem.problem_id]: event.target.value }))} placeholder="Ghi các bước, thử phép tính hoặc viết điều bạn đang nghĩ..." /></div>
            </div>
            <form className="answer-composer" onSubmit={submitAnswer}><label htmlFor="problem-answer"><strong>Đáp án cuối cùng</strong><span>{answerChoices.length ? "Chọn một phương án bên dưới." : "Nhập bằng bàn phím: 5x^2 · 3/4 · x=2 · sqrt(2)"}</span></label>{answerChoices.length ? <div className="answer-choice-shortcuts" role="group" aria-label="Chọn đáp án">{answerChoices.map((choice) => <button key={choice} type="button" data-selected={answer === choice} onClick={() => setAnswer(choice)} disabled={uiState === "streaming" || allComplete}>{choice}</button>)}</div> : null}<div><input id="problem-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={answerChoices.length ? "Hoặc nhập A, B, C, D" : "Ví dụ: 5x^2 hoặc 3/4"} autoCapitalize="characters" spellCheck={false} disabled={uiState === "streaming" || allComplete} /><button className="student-primary-button" disabled={!answer.trim() || uiState === "streaming" || allComplete}>Kiểm tra <ArrowRight size={16} /></button></div></form>
          </section>

          <section className="buddy-pane" data-mobile-active={mobileTab === "buddy"}>
            <div className="buddy-title"><div><span className="buddy-mark"><Sparkle size={18} weight="fill" /></span><div><strong>Bạn học AI</strong><small>Gợi mở, không làm hộ</small></div></div>{uiState === "streaming" && <span className="buddy-typing">Đang đọc cách bạn nghĩ</span>}</div>
            <div className="buddy-transcript" ref={transcriptRef}>{messages.map((item) => <article key={item.id} data-role={item.role} data-degraded={item.degraded}><span>{item.role === "buddy" ? "Study Buddy" : "Bạn"}</span>{item.content ? <MathContent>{item.content}</MathContent> : <div className="markdown-body"><TypingPlaceholder /></div>}</article>)}{uiState === "awaiting_reasoning" && <StateNotice type="reasoning" />}{uiState === "farming" && <StateNotice type="farming" />}{uiState === "degraded" && <StateNotice type="degraded" />}{allComplete && <div className="summit-card"><Flag size={25} weight="fill" /><div><strong>Bạn đã tới đỉnh của phiên học</strong><span>Kết thúc để nhận phản hồi về điểm mạnh và phần nên luyện tiếp.</span></div><button className="student-primary-button" onClick={closeSession} disabled={uiState === "closing"}>{uiState === "closing" ? "Đang tổng hợp" : "Nhận feedback"}</button></div>}{sessionError && session && <div className="student-form-error" role="alert">{sessionError} <button onClick={closeSession}>Thử lại</button></div>}</div>
            <form className="buddy-composer" onSubmit={submitChat}><label htmlFor="buddy-message">Trao đổi cách làm</label><div><textarea id="buddy-message" rows={1} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mình đang nghĩ là..." disabled={uiState === "streaming" || uiState === "closing"} /><button aria-label="Gửi tin nhắn" disabled={!message.trim() || uiState === "streaming" || uiState === "closing"}><PaperPlaneTilt size={19} weight="fill" /></button></div></form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function MountainProgress({ problems, completedCount, currentProblemId, waiting }: { problems: StudyProblem[]; completedCount: number; currentProblemId: number | null; waiting: boolean }) {
  const stages = problems.length ? problems : Array.from({ length: 4 }, (_, index) => ({ problem_id: index + 1, question: "" }));
  return <div className="mountain-progress" data-waiting={waiting} aria-label={`Đã hoàn thành ${completedCount} trên ${stages.length} bài`}>
    {stages.map((problem, index) => {
      const done = index < completedCount;
      const current = problem.problem_id === currentProblemId;
      return <div key={problem.problem_id} className="mountain-progress-stage" data-stage={index} data-done={done} data-current={current}>
        <span>{done ? <Check size={13} weight="bold" /> : current ? <PersonSimpleHike size={15} weight="fill" /> : index === stages.length - 1 ? <FlagPennant size={13} weight="fill" /> : index + 1}</span>
        {index < stages.length - 1 && <i />}
      </div>;
    })}
  </div>;
}
function choiceLabelsFromQuestion(question: string) { const labels = Array.from(question.matchAll(/(?:^|\s)([A-D])\s*[.)\]:：]\s*/gi), (match) => match[1].toUpperCase()); const unique = Array.from(new Set(labels)); return unique.length >= 3 ? unique : []; }
function TypingPlaceholder() { return <span className="typing-placeholder"><i /><i /><i /></span>; }
function StateNotice({ type }: { type: "reasoning" | "farming" | "degraded" }) { const copy = type === "reasoning" ? ["Cần thêm lập luận", "Đáp án có tín hiệu đúng, nhưng Study Buddy cần nghe cách bạn suy nghĩ trước khi đi tiếp."] : type === "farming" ? ["Tiến độ chưa thay đổi", "Thử chậm lại và giải thích một bước. Đường lên đỉnh sẽ chỉ tiến khi phần học được xác nhận."] : ["Phản hồi bị gián đoạn", "Nội dung đã nhận vẫn được giữ. Bạn có thể gửi lại khi kết nối ổn định."]; return <div className="buddy-state-notice"><WarningCircle size={20} /><div><strong>{copy[0]}</strong><span>{copy[1]}</span></div></div>; }
function StudyLoading() { return <div className="study-layout"><div className="problem-pane"><div className="student-skeleton m-6" /></div><div className="buddy-pane"><div className="student-skeleton m-6" /></div></div>; }
function SessionStartError({ message, retry, lessonId, followUp, parentLessonId }: { message: string; retry: () => void; lessonId: string; followUp: boolean; parentLessonId: string }) { return <div className="learning-error"><ChatCircleDots size={38} /><h1>{followUp ? "Bài luyện thêm chưa sẵn sàng" : "Session 2 chưa sẵn sàng"}</h1><p>{message}</p><div><Link className="student-secondary-button" href={followUp ? `/student/report/${parentLessonId}` : `/student/lesson/${lessonId}/part1`}>{followUp ? "Về feedback trước" : "Về Session 1"}</Link><button className="student-primary-button" onClick={retry}>Thử lại</button></div></div>; }
