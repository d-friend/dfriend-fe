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
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { getApiErrorMessage } from "@/lib/api-client";
import { MathContent } from "@/components/shared/math-content";
import { studentApi, studentKeys } from "@/lib/student-api";
import { streamStudyBuddy, type StudyStreamEvent, type StudyTurnCommand } from "@/lib/student-stream";
import { deriveStudyProgress } from "@/lib/study-progress";
import { buildMasteryGreeting, companionPolicy } from "@/lib/student-companion";
import type { StudyProblem, StudySession } from "@/types/contracts";
import { studentMathPreview } from "@/lib/math-markdown";

type ChatMessage = { id: string; role: "student" | "buddy"; content: string; degraded?: boolean };
type SessionUiState = "initialising" | "idle" | "streaming" | "awaiting_reasoning" | "clarifying" | "farming" | "degraded" | "closing";
type StudyChoice = { label: string; content: string };
type PendingTurn = { commandId: string; content: string; command: StudyTurnCommand; problemId: number; buddyId: string };
type StoredStudyState = { messages?: ChatMessage[]; message?: string; answer?: string; scratchpads?: Record<number, string>; pendingTurn?: PendingTurn | null };

const ROLE_LABELS: Record<string, string> = {
  reinforcement: "The Warm-Up · Chứng minh điều vừa học",
  challenge: "The Push · Nặng hơn nhưng quen thuộc",
  exploration: "The Break · Phá cách làm cũ",
  extension: "The Build · Áp dụng pattern mới",
};

export function StudySessionWorkspace({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [lessonKind, setLessonKind] = useState<"main" | "remedial" | "advanced">("main");
  const [session, setSession] = useState<StudySession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [uiState, setUiState] = useState<SessionUiState>("initialising");
  const [lastCloseWasEarly, setLastCloseWasEarly] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [scratchpads, setScratchpads] = useState<Record<number, string>>({});
  const [mobileTab, setMobileTab] = useState<"problem" | "buddy">("problem");
  const [activeProblemId, setActiveProblemId] = useState<number | null>(null);
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
  const streamController = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const buddyMessageRef = useRef<HTMLTextAreaElement>(null);
  const scratchpadRef = useRef<HTMLTextAreaElement>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);

  const initialise = useCallback(async () => {
    setUiState("initialising");
    setSessionError("");
    try {
      // Entering Session 2 means any lesson-scoped feedback belongs to an
      // earlier attempt. The current close will write a fresh summary.
      sessionStorage.removeItem(`dfriend:feedback:${lessonId}`);
      const lesson = await studentApi.exercise(lessonId);
      setLessonKind(lesson.lessonKind || "main");
      const taxonomyVersion = Number(lesson.taxonomyVersion);
      if (!Number.isInteger(taxonomyVersion) || taxonomyVersion < 1) {
        throw new Error("Bài học chưa có taxonomy version hợp lệ.");
      }
      const active = await studentApi.activeSession(lessonId, taxonomyVersion);
      const value = active.status === "not_found" ? await studentApi.startSession(lessonId, taxonomyVersion) : active;
      if (!value.session_id || !value.problems?.length) throw new Error("Session 2 chưa có bài tập để bắt đầu.");
      const restored = readStoredStudyState(value.session_id);
      const pendingCandidate = restored?.pendingTurn ?? null;
      const validPending = pendingCandidate?.problemId === value.current_problem_id ? pendingCandidate : null;
      setSession(value);
      setMessages(restored?.messages?.length ? restored.messages : [{ id: "welcome", role: "buddy", content: buildMasteryGreeting(value.response_adaptation_policy) }]);
      setMessage(restored?.message || "");
      setAnswer(restored?.answer || "");
      setScratchpads(restored?.scratchpads || {});
      setPendingTurn(validPending);
      setActiveProblemId(value.current_problem_id || value.problems[0].problem_id);
      setUiState(validPending ? "degraded" : value.awaiting_reasoning ? "awaiting_reasoning" : "idle");
    } catch (error) {
      setSessionError(getApiErrorMessage(error, error instanceof Error ? error.message : "Không thể khởi tạo Session 2."));
      setUiState("initialising");
    }
  }, [lessonId]);

  useEffect(() => { void initialise(); return () => streamController.current?.abort(); }, [initialise]);
  useEffect(() => {
    if (!session?.session_id) return;
    sessionStorage.setItem(
      `dfriend:study-session:${session.session_id}`,
      JSON.stringify({ messages, message, answer, scratchpads, pendingTurn }),
    );
  }, [answer, message, messages, pendingTurn, scratchpads, session?.session_id]);
  useEffect(() => { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const input = buddyMessageRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [message]);

  const problems = session?.problems || [];
  const activeCompanion = companionPolicy(session?.response_adaptation_policy);
  const followUp = lessonKind !== "main";
  const currentProblem = problems.find((item) => item.problem_id === activeProblemId) || problems[0];
  const displayedQuestion = currentProblem
    ? splitStudyQuestionChoices(currentProblem.question)
    : { stem: "", choices: [] };
  const answerChoices = displayedQuestion.choices.map((choice) => choice.label);
  const { completedCount, allComplete } = deriveStudyProgress(problems, session);
  const currentProblemIndex = currentProblem
    ? problems.findIndex((item) => item.problem_id === currentProblem.problem_id)
    : -1;
  const currentRoleLabel = currentProblem?.recommended_problem_role
    ? ROLE_LABELS[currentProblem.recommended_problem_role] || "Bài luyện tập"
    : "Bài luyện tập";
  const isViewingCurrentProblem = currentProblem?.problem_id === session?.current_problem_id;

  async function sendTurn(content: string, command: StudyTurnCommand, retryTurn?: PendingTurn) {
    if (!session?.session_id || !currentProblem || !isViewingCurrentProblem || uiState === "streaming" || !content.trim()) return;
    const turn: PendingTurn = retryTurn || {
      commandId: globalThis.crypto?.randomUUID?.() || `turn-${Date.now()}`,
      content: content.trim(),
      command,
      problemId: currentProblem.problem_id,
      buddyId: `buddy-${Date.now()}`,
    };
    if (turn.problemId !== session.current_problem_id) {
      setPendingTurn(null);
      setSessionError("Lượt gửi cũ thuộc bài trước nên không thể gửi lại.");
      return;
    }
    if (retryTurn) {
      setMessages((current) => current.map((item) => item.id === turn.buddyId ? { ...item, content: "", degraded: false } : item));
    } else {
      const studentMessage: ChatMessage = { id: `student-${Date.now()}`, role: "student", content: turn.content };
      setMessages((current) => [...current, studentMessage, { id: turn.buddyId, role: "buddy", content: "" }]);
    }
    setPendingTurn(turn);
    setUiState("streaming");
    setMobileTab("buddy");
    const controller = new AbortController();
    streamController.current = controller;
    try {
      await streamStudyBuddy({ session_id: session.session_id, message: turn.content, is_submission: turn.command === "SUBMIT_ANSWER", problem_id: turn.problemId, command: turn.command, command_id: turn.commandId }, (event) => handleStreamEvent(event, turn.buddyId), controller.signal);
      setPendingTurn(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessages((current) => current.map((item) => item.id === turn.buddyId ? { ...item, content: item.content || (error instanceof Error ? error.message : "Kết nối bị gián đoạn. Bạn có thể thử gửi lại."), degraded: true } : item));
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
    setSession((current) => current ? {
      ...current,
      current_progress: event.current_progress ?? current.current_progress,
      current_process: event.current_process ?? event.current_progress ?? current.current_process,
      current_problem_id: event.current_problem_id ?? current.current_problem_id,
      session_completed: event.session_completed ?? current.session_completed,
      completed_problem_count: event.completed_problem_count ?? current.completed_problem_count,
      total_problem_count: event.total_problem_count ?? current.total_problem_count,
      awaiting_reasoning: event.awaiting_reasoning ?? false,
    } : current);
    if (event.current_problem_id) setActiveProblemId(event.current_problem_id);
    if (event.advanced || event.session_completed) setUiState("idle");
    else if (event.awaiting_reasoning) setUiState("awaiting_reasoning");
    else if (event.needs_clarification) setUiState("clarifying");
    else if (event.spam) setUiState("farming");
    else setUiState("idle");
  }

  const canSendChat = Boolean(message.trim()) && isViewingCurrentProblem && uiState !== "streaming" && uiState !== "closing";
  const canSubmitReasoning = canSendChat && uiState === "awaiting_reasoning";
  const canSubmitScratchpad = Boolean(currentProblem && scratchpads[currentProblem.problem_id]?.trim()) && isViewingCurrentProblem && uiState === "awaiting_reasoning";

  function submitChat(event?: FormEvent) { event?.preventDefault(); if (!canSendChat) return; const value = message; setMessage(""); void sendTurn(value, "CHAT"); }
  function submitReasoning() { if (!canSubmitReasoning) return; const value = message; setMessage(""); void sendTurn(value, "SUBMIT_REASONING"); }
  function submitScratchpadReasoning() { const value = currentProblem ? scratchpads[currentProblem.problem_id] : ""; if (!value?.trim() || !canSubmitScratchpad) return; void sendTurn(value, "SUBMIT_REASONING"); }
  function retryPending() { if (!pendingTurn || pendingTurn.problemId !== session?.current_problem_id) return; void sendTurn(pendingTurn.content, pendingTurn.command, pendingTurn); }
  function skipProblem() {
    if (!isViewingCurrentProblem || allComplete || uiState === "streaming") return;
    const confirmed = window.confirm("Bỏ qua bài này? Bài sẽ được ghi là chưa hoàn thành và không tính là đã nắm vững.");
    if (confirmed) void sendTurn("Em chọn bỏ qua bài này.", "SKIP_PROBLEM");
  }
  function handleChatKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submitChat();
  }
  function submitAnswer(event: FormEvent) { event.preventDefault(); if (!isViewingCurrentProblem) return; const value = answer; setAnswer(""); void sendTurn(value, "SUBMIT_ANSWER"); }

  async function closeSession(finishEarly = false) {
    if (!session?.session_id) return;
    if (finishEarly) {
      const confirmed = window.confirm("Kết thúc sớm phiên học? Bạn sẽ nhận feedback dựa trên phần đã làm. Các bài chưa làm sẽ không được tính là điểm yếu.");
      if (!confirmed) return;
    }
    setLastCloseWasEarly(finishEarly);
    setUiState("closing");
    try {
      const sessionTaxonomyVersion = Number(session.taxonomyVersion);
      if (!Number.isInteger(sessionTaxonomyVersion) || sessionTaxonomyVersion < 1) {
        throw new Error("Phiên học chưa có taxonomy version hợp lệ.");
      }
      const summary = await studentApi.closeSession(session.session_id, lessonId, sessionTaxonomyVersion, { finishEarly });
      if (summary.status === "error") throw new Error(summary.message || "Chưa thể kết thúc phiên học.");
      sessionStorage.removeItem(`dfriend:study-session:${session.session_id}`);
      sessionStorage.setItem(`dfriend:feedback:${lessonId}`, JSON.stringify(summary));
      await queryClient.invalidateQueries({ queryKey: studentKeys.metrics });
      await queryClient.invalidateQueries({ queryKey: studentKeys.classes });
      router.replace(`/student/report/${lessonId}`);
    } catch (error) {
      setSessionError(getApiErrorMessage(error, error instanceof Error ? error.message : "Chưa thể kết thúc phiên học."));
      setUiState("idle");
    }
  }

  if (sessionError && !session) return <SessionStartError message={sessionError} retry={initialise} lessonId={lessonId} followUp={followUp} />;

  return (
    <div className="learning-shell study-shell">
      <header className="learning-header study-header">
        <Link href={`/student/lesson/${lessonId}/part1`}><ArrowLeft size={19} /><span>Session 1</span></Link>
        <div className="study-header-center"><span><Mountains size={16} weight="fill" /> Đường lên đỉnh</span><MountainProgress problems={problems} completedCount={completedCount} currentProblemId={activeProblemId} waiting={uiState === "awaiting_reasoning" || uiState === "farming"} /></div>
        <div className="study-header-actions">
          {!allComplete && session?.session_id ? <button type="button" className="study-early-finish" onClick={() => void closeSession(true)} disabled={uiState === "streaming" || uiState === "closing"}><Flag size={14} weight="fill" /><span>{uiState === "closing" ? "Đang tổng hợp" : "Kết thúc sớm"}</span></button> : null}
          <div className="learning-counter"><strong>{completedCount}/{problems.length || 4}</strong><span>bài</span></div>
        </div>
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
                <div className="study-problem-statement">
                  <MathContent>{displayedQuestion.stem}</MathContent>
                  {currentProblem.attachment_url ? (
                    <a className="study-problem-image" href={currentProblem.attachment_url} target="_blank" rel="noreferrer">
                      {/* Keep private/presigned problem images out of an image optimization proxy. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={currentProblem.attachment_url} alt="Hình minh họa của đề bài" />
                      <span>Chạm để mở hình lớn</span>
                    </a>
                  ) : null}
                  {displayedQuestion.choices.length ? (
                    <ol className="study-problem-choices" type="A">
                      {displayedQuestion.choices.map((choice) => (
                        <li key={choice.label}>
                          <span className="study-choice-label">{choice.label}.</span>
                          <MathContent answer>{choice.content}</MathContent>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              </article>
              <div className="scratchpad"><label htmlFor="scratchpad"><PencilSimpleLine size={18} /> Nháp của bạn</label><textarea ref={scratchpadRef} id="scratchpad" value={scratchpads[currentProblem.problem_id] || ""} onChange={(event) => setScratchpads((current) => ({ ...current, [currentProblem.problem_id]: event.target.value }))} placeholder="Ghi các bước, thử phép tính hoặc viết điều bạn đang nghĩ..." /><MathInputAssist inputRef={scratchpadRef} value={scratchpads[currentProblem.problem_id] || ""} onChange={(value) => setScratchpads((current) => ({ ...current, [currentProblem.problem_id]: value }))} />{uiState === "awaiting_reasoning" && isViewingCurrentProblem ? <button type="button" className="scratchpad-submit" onClick={submitScratchpadReasoning} disabled={!canSubmitScratchpad}>Nộp phần nháp này làm giải thích</button> : null}</div>
            </div>
            <form className="answer-composer" onSubmit={submitAnswer}>{!isViewingCurrentProblem ? <div className="study-readonly-notice"><span>Bạn đang xem lại bài cũ.</span><button type="button" onClick={() => setActiveProblemId(session.current_problem_id ?? problems[0]?.problem_id)}>Quay lại bài đang làm</button></div> : null}<label htmlFor="problem-answer"><strong>Đáp án cuối cùng</strong><span>{answerChoices.length ? "Chọn một phương án bên dưới." : "Nhập bằng bàn phím hoặc dùng phím toán nhanh."}</span></label>{answerChoices.length ? <div className="answer-choice-shortcuts" role="group" aria-label="Chọn đáp án">{answerChoices.map((choice) => <button key={choice} type="button" data-selected={answer === choice} onClick={() => setAnswer(choice)} disabled={!isViewingCurrentProblem || uiState === "streaming" || allComplete}>{choice}</button>)}</div> : <MathInputAssist inputRef={answerInputRef} value={answer} onChange={setAnswer} compact />}<div><input ref={answerInputRef} id="problem-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={answerChoices.length ? "Hoặc nhập A, B, C, D" : "Ví dụ: 5x^2 hoặc 3/4"} autoCapitalize="characters" spellCheck={false} disabled={!isViewingCurrentProblem || uiState === "streaming" || allComplete} /><button className="student-primary-button" disabled={!isViewingCurrentProblem || !answer.trim() || uiState === "streaming" || allComplete}>Kiểm tra <ArrowRight size={16} /></button></div>{isViewingCurrentProblem && !allComplete ? <button type="button" className="study-skip-problem" onClick={skipProblem} disabled={uiState === "streaming" || uiState === "closing"}>Bỏ qua bài này</button> : null}</form>
          </section>

          <section className="buddy-pane" data-mobile-active={mobileTab === "buddy"}>
            <div className="buddy-title"><div><span className="buddy-mark"><Sparkle size={18} weight="fill" /></span><div><strong>{activeCompanion.companion_name}</strong><small>Bạn học AI · Gợi mở, không làm hộ</small></div></div>{uiState === "streaming" && <span className="buddy-typing">Đang đọc cách bạn nghĩ</span>}</div>
            <div className="buddy-transcript" ref={transcriptRef}>{messages.map((item) => <article key={item.id} data-role={item.role} data-degraded={item.degraded}><span>{item.role === "buddy" ? activeCompanion.companion_name : "Bạn"}</span>{item.content ? <MathContent>{item.content}</MathContent> : <div className="markdown-body"><TypingPlaceholder /></div>}</article>)}{uiState === "awaiting_reasoning" && <StateNotice type="reasoning" />}{uiState === "clarifying" && <StateNotice type="clarifying" />}{uiState === "farming" && <StateNotice type="farming" />}{uiState === "degraded" && <StateNotice type="degraded" />}{pendingTurn && uiState === "degraded" ? <button type="button" className="student-secondary-button study-retry-turn" onClick={retryPending}>Gửi lại lượt vừa rồi</button> : null}{allComplete && <div className="summit-card"><Flag size={25} weight="fill" /><div><strong>Bạn đã tới đỉnh của phiên học</strong><span>Kết thúc để nhận phản hồi về điểm mạnh và phần nên luyện tiếp.</span></div><button className="student-primary-button" onClick={() => void closeSession()} disabled={uiState === "closing"}>{uiState === "closing" ? "Đang tổng hợp" : "Nhận feedback"}</button></div>}{sessionError && session && <div className="student-form-error" role="alert">{sessionError} <button onClick={() => void closeSession(lastCloseWasEarly)}>Thử lại</button></div>}</div>
            <form className="buddy-composer" onSubmit={submitChat}><label htmlFor="buddy-message">{uiState === "awaiting_reasoning" ? "Viết cách bạn làm, rồi nộp giải thích" : "Trao đổi cách làm"}</label><MathInputAssist inputRef={buddyMessageRef} value={message} onChange={setMessage} compact /><div><textarea ref={buddyMessageRef} id="buddy-message" rows={1} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={handleChatKeyDown} placeholder={uiState === "awaiting_reasoning" ? "Ví dụ: Mình chuyển vế rồi chia cả hai vế cho..." : "Mình đang nghĩ là..."} disabled={!isViewingCurrentProblem || uiState === "streaming" || uiState === "closing"} />{uiState === "awaiting_reasoning" ? <button type="button" className="buddy-reasoning-submit" onClick={submitReasoning} disabled={!canSubmitReasoning}>Nộp giải thích</button> : null}<button aria-label="Gửi tin nhắn" title="Gửi như tin nhắn" disabled={!canSendChat}><PaperPlaneTilt size={19} weight="fill" /></button></div></form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

const MATH_KEYS = [
  { label: "a/b", insert: "()/()", cursorBack: 4 },
  { label: "√", insert: "sqrt()", cursorBack: 1 },
  { label: "x²", insert: "^2", cursorBack: 0 },
  { label: "≤", insert: " ≤ ", cursorBack: 0 },
  { label: "≥", insert: " ≥ ", cursorBack: 0 },
  { label: "∈", insert: " ∈ ", cursorBack: 0 },
  { label: "∪", insert: " ∪ ", cursorBack: 0 },
  { label: "∩", insert: " ∩ ", cursorBack: 0 },
  { label: "→", insert: " → ", cursorBack: 0 },
  { label: "vectơ", insert: "\\vec{AB}", cursorBack: 3 },
] as const;

function MathInputAssist({ inputRef, value, onChange, compact = false }: {
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  function insertMathToken(token: (typeof MATH_KEYS)[number]) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const insertion = selected
      ? token.label === "√"
        ? `sqrt(${selected})`
        : token.label === "vectơ"
          ? `\\vec{${selected}}`
          : token.label === "a/b"
            ? `(${selected})/()`
            : `${selected}${token.insert}`
      : token.insert;
    const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
    onChange(next);
    const cursor = start + insertion.length - (selected ? 0 : token.cursorBack);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="math-input-assist" data-compact={compact}>
      <div className="math-input-keys" role="toolbar" aria-label="Phím toán nhanh">
        {MATH_KEYS.map((token) => (
          <button key={token.label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMathToken(token)}>{token.label}</button>
        ))}
      </div>
      {value.trim() ? <div className="math-input-preview"><span>Xem trước</span><MathContent>{studentMathPreview(value)}</MathContent></div> : null}
    </div>
  );
}

function readStoredStudyState(sessionId: string): StoredStudyState | null {
  try {
    const stored = sessionStorage.getItem(`dfriend:study-session:${sessionId}`);
    return stored ? JSON.parse(stored) as StoredStudyState : null;
  } catch {
    sessionStorage.removeItem(`dfriend:study-session:${sessionId}`);
    return null;
  }
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
export function splitStudyQuestionChoices(question: string): { stem: string; choices: StudyChoice[] } {
  const normalized = question.replace(/\\n(?=\s*[A-D]\s*[.)\]:：=])/gi, "\n");
  const matches = Array.from(normalized.matchAll(/(?:^|\s)([A-D])\s*[.)\]:：=]\s*/gi));
  const labels = matches.map((match) => match[1].toUpperCase());
  const sequential = labels.every((label, index) => label === String.fromCharCode(65 + index));
  if (matches.length < 3 || matches.length > 4 || !sequential) {
    return { stem: normalized, choices: [] };
  }

  const choices = matches.map((match, index) => ({
    label: labels[index],
    content: normalized
      .slice((match.index || 0) + match[0].length, matches[index + 1]?.index ?? normalized.length)
      .trim(),
  }));
  if (choices.some((choice) => !choice.content)) return { stem: normalized, choices: [] };

  return {
    stem: normalized.slice(0, matches[0].index).trim(),
    choices,
  };
}
function TypingPlaceholder() { return <span className="typing-placeholder"><i /><i /><i /></span>; }
function StateNotice({ type }: { type: "reasoning" | "clarifying" | "farming" | "degraded" }) { const copy = type === "reasoning" ? ["Cần thêm lập luận", "Đáp án có tín hiệu đúng, nhưng Study Buddy cần nghe cách bạn suy nghĩ trước khi đi tiếp."] : type === "clarifying" ? ["Chưa đủ chắc để chấm", "Study Buddy sẽ hỏi lại thay vì đoán. Bài và tiến độ hiện tại được giữ nguyên."] : type === "farming" ? ["Tiến độ chưa thay đổi", "Thử chậm lại và giải thích một bước. Đường lên đỉnh sẽ chỉ tiến khi phần học được xác nhận."] : ["Phản hồi bị gián đoạn", "Nội dung đã nhận vẫn được giữ. Bạn có thể gửi lại khi kết nối ổn định."]; return <div className="buddy-state-notice"><WarningCircle size={20} /><div><strong>{copy[0]}</strong><span>{copy[1]}</span></div></div>; }
function StudyLoading() { return <div className="study-layout"><div className="problem-pane"><div className="student-skeleton m-6" /></div><div className="buddy-pane"><div className="student-skeleton m-6" /></div></div>; }
function SessionStartError({ message, retry, lessonId, followUp }: { message: string; retry: () => void; lessonId: string; followUp: boolean }) { return <div className="learning-error"><ChatCircleDots size={38} /><h1>{followUp ? "Bài follow-up chưa sẵn sàng" : "Session 2 chưa sẵn sàng"}</h1><p>{message}</p><div><Link className="student-secondary-button" href={`/student/lesson/${lessonId}/part1`}>Về Session 1</Link><button className="student-primary-button" onClick={retry}>Thử lại</button></div></div>; }
