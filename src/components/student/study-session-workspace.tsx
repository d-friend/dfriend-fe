"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChatCircleDots,
  Flag,
  ListNumbers,
  PaperPlaneTilt,
  PencilSimpleLine,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "@/lib/api-client";
import { studentApi, studentKeys } from "@/lib/student-api";
import { streamStudyBuddy, type StudyStreamEvent } from "@/lib/student-stream";
import { normalizeMathMarkdown } from "@/lib/math-markdown";
import type { StudyProblem, StudySession } from "@/types/contracts";

type ChatMessage = { id: string; role: "student" | "buddy"; content: string; degraded?: boolean };
type SessionUiState = "initialising" | "idle" | "streaming" | "awaiting_reasoning" | "farming" | "degraded" | "closing";

export function StudySessionWorkspace({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StudySession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [uiState, setUiState] = useState<SessionUiState>("initialising");
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "welcome", role: "buddy", content: "Mình học cùng nhau nhé. Bạn có thể thử bài bên trái, nói cách bạn nghĩ, hoặc hỏi mình khi bị kẹt." }]);
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
  const completedCount = Math.min(session?.current_progress || session?.current_process || 0, problems.length);
  const allComplete = problems.length > 0 && completedCount >= problems.length;

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

  if (sessionError && !session) return <SessionStartError message={sessionError} retry={initialise} lessonId={lessonId} />;

  return (
    <div className="learning-shell study-shell">
      <header className="learning-header study-header">
        <Link href={`/student/lesson/${lessonId}/part1`}><ArrowLeft size={19} /><span>Session 1</span></Link>
        <div className="study-header-center"><span>Đường lên đỉnh</span><MountainProgress problems={problems} completedCount={completedCount} currentProblemId={activeProblemId} waiting={uiState === "awaiting_reasoning" || uiState === "farming"} /></div>
        <div className="learning-counter"><strong>{completedCount}/{problems.length || 4}</strong><span>bài</span></div>
      </header>

      {uiState === "initialising" && !session ? <StudyLoading /> : session && currentProblem ? (
        <div className="study-layout">
          <div className="study-mobile-tabs" role="tablist"><button role="tab" aria-selected={mobileTab === "problem"} onClick={() => setMobileTab("problem")}><PencilSimpleLine size={17} /> Bài tập</button><button role="tab" aria-selected={mobileTab === "buddy"} onClick={() => setMobileTab("buddy")}><ChatCircleDots size={17} /> Study Buddy</button></div>
          <section className="problem-pane" data-mobile-active={mobileTab === "problem"}>
            <div className="problem-pane-scroll">
              <div className="problem-list" aria-label="Danh sách bài tập"><span><ListNumbers size={17} /> Bài trong phiên</span><div>{problems.map((problem, index) => { const done = index < completedCount; const unlocked = done || problem.problem_id === session.current_problem_id || index <= completedCount; return <button key={problem.problem_id} data-active={problem.problem_id === currentProblem.problem_id} data-done={done} disabled={!unlocked} onClick={() => setActiveProblemId(problem.problem_id)}>{done ? <Check size={14} /> : index + 1}</button>; })}</div></div>
              <article className="problem-card"><span>Bài {String(problems.findIndex((item) => item.problem_id === currentProblem.problem_id) + 1).padStart(2, "0")}</span><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMathMarkdown(currentProblem.question)}</ReactMarkdown></div></article>
              <div className="scratchpad"><label htmlFor="scratchpad"><PencilSimpleLine size={18} /> Nháp của bạn</label><textarea id="scratchpad" value={scratchpads[currentProblem.problem_id] || ""} onChange={(event) => setScratchpads((current) => ({ ...current, [currentProblem.problem_id]: event.target.value }))} placeholder="Ghi các bước, thử phép tính hoặc viết điều bạn đang nghĩ..." /></div>
            </div>
            <form className="answer-composer" onSubmit={submitAnswer}><label htmlFor="problem-answer">Đáp án của bạn</label><div><input id="problem-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Nhập đáp án" disabled={uiState === "streaming" || allComplete} /><button className="student-primary-button" disabled={!answer.trim() || uiState === "streaming" || allComplete}>Nộp đáp án <ArrowRight size={16} /></button></div></form>
          </section>

          <section className="buddy-pane" data-mobile-active={mobileTab === "buddy"}>
            <div className="buddy-title"><div><span className="buddy-mark"><Sparkle size={18} weight="fill" /></span><div><strong>Study Buddy</strong><small>Học cùng bạn trong Session 2</small></div></div>{uiState === "streaming" && <span className="buddy-typing">Đang suy nghĩ</span>}</div>
            <div className="buddy-transcript" ref={transcriptRef}>{messages.map((item) => <article key={item.id} data-role={item.role} data-degraded={item.degraded}><span>{item.role === "buddy" ? "Study Buddy" : "Bạn"}</span><div className="markdown-body">{item.content ? <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMathMarkdown(item.content)}</ReactMarkdown> : <TypingPlaceholder />}</div></article>)}{uiState === "awaiting_reasoning" && <StateNotice type="reasoning" />}{uiState === "farming" && <StateNotice type="farming" />}{uiState === "degraded" && <StateNotice type="degraded" />}{allComplete && <div className="summit-card"><Flag size={25} weight="fill" /><div><strong>Bạn đã tới đỉnh của phiên học</strong><span>Kết thúc để nhận phản hồi về điểm mạnh và phần nên luyện tiếp.</span></div><button className="student-primary-button" onClick={closeSession} disabled={uiState === "closing"}>{uiState === "closing" ? "Đang tổng hợp" : "Nhận feedback"}</button></div>}{sessionError && session && <div className="student-form-error" role="alert">{sessionError} <button onClick={closeSession}>Thử lại</button></div>}</div>
            <form className="buddy-composer" onSubmit={submitChat}><label htmlFor="buddy-message">Nhắn cho Study Buddy</label><div><textarea id="buddy-message" rows={1} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Nói cách bạn đang nghĩ hoặc hỏi khi bị kẹt" disabled={uiState === "streaming" || uiState === "closing"} /><button aria-label="Gửi tin nhắn" disabled={!message.trim() || uiState === "streaming" || uiState === "closing"}><PaperPlaneTilt size={19} weight="fill" /></button></div></form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function MountainProgress({ problems, completedCount, currentProblemId, waiting }: { problems: StudyProblem[]; completedCount: number; currentProblemId: number | null; waiting: boolean }) { return <div className="mountain-progress" data-waiting={waiting}>{(problems.length ? problems : Array.from({ length: 4 }, (_, index) => ({ problem_id: index + 1, question: "" }))).map((problem, index) => <div key={problem.problem_id} className="mountain-progress-stage" data-done={index < completedCount} data-current={problem.problem_id === currentProblemId}><span>{index < completedCount ? <Check size={12} weight="bold" /> : problem.problem_id === currentProblemId ? "D" : index + 1}</span>{index < problems.length - 1 && <i />}</div>)}</div>; }
function TypingPlaceholder() { return <span className="typing-placeholder"><i /><i /><i /></span>; }
function StateNotice({ type }: { type: "reasoning" | "farming" | "degraded" }) { const copy = type === "reasoning" ? ["Cần thêm lập luận", "Đáp án có tín hiệu đúng, nhưng Study Buddy cần nghe cách bạn suy nghĩ trước khi đi tiếp."] : type === "farming" ? ["Tiến độ chưa thay đổi", "Thử chậm lại và giải thích một bước. Đường lên đỉnh sẽ chỉ tiến khi phần học được xác nhận."] : ["Phản hồi bị gián đoạn", "Nội dung đã nhận vẫn được giữ. Bạn có thể gửi lại khi kết nối ổn định."]; return <div className="buddy-state-notice"><WarningCircle size={20} /><div><strong>{copy[0]}</strong><span>{copy[1]}</span></div></div>; }
function StudyLoading() { return <div className="study-layout"><div className="problem-pane"><div className="student-skeleton m-6" /></div><div className="buddy-pane"><div className="student-skeleton m-6" /></div></div>; }
function SessionStartError({ message, retry, lessonId }: { message: string; retry: () => void; lessonId: string }) { return <div className="learning-error"><ChatCircleDots size={38} /><h1>Session 2 chưa sẵn sàng</h1><p>{message}</p><div><Link className="student-secondary-button" href={`/student/lesson/${lessonId}/part1`}>Về Session 1</Link><button className="student-primary-button" onClick={retry}>Thử lại</button></div></div>; }
