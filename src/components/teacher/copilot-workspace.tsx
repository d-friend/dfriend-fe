"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  ArrowClockwise,
  BookOpenText,
  Check,
  CheckCircle,
  CircleNotch,
  Copy,
  DotsThree,
  PencilSimple,
  Sparkle,
  Stop,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MathContent } from "@/components/shared/math-content";
import { LessonGenerationLoading } from "@/components/teacher/lesson-generation-loading";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";
import { waitForLessonGeneration, type LessonGenerationResult } from "@/lib/lesson-generation";
import { streamCopilot } from "@/lib/copilot-stream";
import type { CopilotDraft, CopilotLessonPlan, CopilotStep, CopilotTurn } from "@/types/contracts";

const suggestions = [
  "Tóm tắt lớp nào cần mình chú ý hôm nay?",
  "Soạn một bài ôn tập Đơn thức cho lớp 8A1",
  "Giải thích báo cáo gần nhất bằng ngôn ngữ đơn giản",
];

interface DisplayTurn extends CopilotTurn {
  id: string;
  pending?: boolean;
  error?: string;
}

export function CopilotWorkspace({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [turns, setTurns] = useState<DisplayTurn[]>([]);
  const [message, setMessage] = useState("");
  const [classId, setClassId] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(conversationId || "");
  const [sending, setSending] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("Cuộc trò chuyện mới");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const classesQuery = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  const conversationQuery = useQuery({
    queryKey: ["teacher", "copilot", "conversation", conversationId],
    queryFn: () => teacherApi.conversation(conversationId as string),
    enabled: Boolean(conversationId),
  });

  useEffect(() => {
    if (!conversationQuery.data) return;
    setTitle(conversationQuery.data.title);
    setActiveConversationId(conversationQuery.data.conversation_id);
    setClassId(conversationQuery.data.class_id || "");
    setTurns(
      conversationQuery.data.turns
        .filter((turn) => turn.role !== "tool")
        .map((turn, index) => ({ ...turn, id: `${conversationQuery.data.conversation_id}-${index}` })),
    );
  }, [conversationQuery.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [turns, reduceMotion]);

  useEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [message]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const renameConversation = useMutation({
    mutationFn: (nextTitle: string) => teacherApi.renameConversation(activeConversationId, nextTitle),
    onSuccess: (conversation) => {
      setTitle(conversation.title);
      setRenaming(false);
      queryClient.invalidateQueries({ queryKey: ["teacher", "copilot", "conversations"] });
    },
  });

  const deleteConversation = useMutation({
    mutationFn: () => teacherApi.deleteConversation(activeConversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher", "copilot", "conversations"] });
      router.push("/teacher/copilot/new");
    },
  });

  const canSend = message.trim().length > 0 && !sending;

  async function send(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const content = (preset || message).trim();
    if (!content || sending) return;
    setMessage("");
    setSending(true);
    const userTurn: DisplayTurn = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    setTurns((current) => [
      ...current,
      userTurn,
      { id: assistantId, role: "assistant", content: "", steps: [], drafts: [], pending: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let resolvedConversation = activeConversationId;
      let streamError = "";
      await streamCopilot(
        { message: content, conversation_id: activeConversationId || null, class_id: classId || null },
        (streamEvent) => {
          if (streamEvent.type === "conversation") {
            resolvedConversation = streamEvent.conversation_id;
            setActiveConversationId(resolvedConversation);
            return;
          }
          setTurns((current) => current.map((turn) => {
            if (turn.id !== assistantId) return turn;
            if (streamEvent.type === "delta") return { ...turn, content: `${turn.content}${streamEvent.delta}` };
            if (streamEvent.type === "step") {
              const steps = [...(turn.steps || [])];
              const existing = steps.findIndex((step) => step.label === streamEvent.step.label && step.status === "started");
              if (existing >= 0 && streamEvent.step.status !== "started") steps[existing] = streamEvent.step;
              else steps.push(streamEvent.step);
              return { ...turn, steps };
            }
            if (streamEvent.type === "draft") return { ...turn, drafts: [...(turn.drafts || []), streamEvent.draft] };
            if (streamEvent.type === "plan") return { ...turn, plans: [...(turn.plans || []), streamEvent.plan] };
            if (streamEvent.type === "done") return { ...turn, pending: false };
            if (streamEvent.type === "error") {
              streamError = streamEvent.message;
              return { ...turn, pending: false, error: streamEvent.message };
            }
            return turn;
          }));
        },
        controller.signal,
      );
      if (streamError) throw new Error(streamError);
      await queryClient.invalidateQueries({ queryKey: ["teacher", "copilot", "conversations"] });
      if (!conversationId && resolvedConversation) {
        router.replace(`/teacher/copilot/${resolvedConversation}`);
      }
    } catch (error) {
      const stopped = controller.signal.aborted;
      setTurns((current) =>
        current.map((turn) =>
          turn.id === assistantId
            ? {
                ...turn,
                pending: false,
                error: stopped ? "Đã dừng phản hồi." : error instanceof Error ? error.message : "Copilot chưa thể phản hồi.",
              }
            : turn,
        ),
      );
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  if (conversationQuery.isLoading) return <CopilotSkeleton />;
  if (conversationQuery.isError) {
    return (
      <div className="center-state">
        <WarningCircle size={30} />
        <h1>Không mở được cuộc trò chuyện</h1>
        <p>{getApiErrorMessage(conversationQuery.error)}</p>
        <Link className="secondary-button" href="/teacher/copilot/new">Bắt đầu cuộc trò chuyện mới</Link>
      </div>
    );
  }

  return (
    <section className="copilot-workspace">
      <header className="copilot-header">
        <div className="min-w-0">
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const nextTitle = String(form.get("title") || "").trim();
                if (nextTitle) renameConversation.mutate(nextTitle);
              }}
            >
              <input name="title" className="input !py-2" defaultValue={title} maxLength={80} autoFocus />
              <button className="primary-button !min-h-9" type="submit">Lưu</button>
            </form>
          ) : (
            <>
              <p className="workspace-kicker">Copilot</p>
              <h1>{title}</h1>
            </>
          )}
        </div>
        <div className="copilot-header-actions">
          <label className="context-select-label">
            <span>Ngữ cảnh</span>
            <select className="select context-select" value={classId} onChange={(event) => setClassId(event.target.value)} aria-label="Chọn lớp làm ngữ cảnh">
              <option value="">Toàn bộ lớp học</option>
              {(classesQuery.data || []).map((item) => <option key={item.class_id} value={item.class_id}>{item.class_name}</option>)}
            </select>
          </label>
          {activeConversationId && (
            <div className="relative">
              <button className="icon-button" onClick={() => setHeaderMenu((value) => !value)} aria-label="Thao tác cuộc trò chuyện" aria-expanded={headerMenu}><DotsThree size={20} weight="bold" /></button>
              {headerMenu && (
                <div className="conversation-menu">
                  <button onClick={() => { setRenaming(true); setHeaderMenu(false); }}><PencilSimple size={16} /> Đổi tên</button>
                  <button className="danger" onClick={() => { if (window.confirm("Xóa cuộc trò chuyện này?")) deleteConversation.mutate(); }}><Trash size={16} /> Xóa</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="copilot-thread" aria-live="polite">
        {!turns.length ? (
          <EmptyCopilot onSuggestion={(value) => void send(undefined, value)} />
        ) : (
          <div className="message-stack">
            <AnimatePresence initial={false}>
              {turns.map((turn) => <MessageBubble key={turn.id} turn={turn} classId={classId} />)}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <form className="composer" onSubmit={(event) => void send(event)}>
          <textarea
            ref={composerRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) void send();
              }
            }}
            placeholder="Hỏi về lớp học, báo cáo hoặc tạo bài mới"
            aria-label="Tin nhắn cho Copilot"
            rows={1}
          />
          {sending ? (
            <button className="composer-send" type="button" onClick={stop} aria-label="Dừng phản hồi"><Stop size={16} weight="fill" /></button>
          ) : (
            <button className="composer-send" type="submit" disabled={!canSend} aria-label="Gửi tin nhắn"><ArrowUp size={17} weight="bold" /></button>
          )}
        </form>
        <p className="composer-note">Copilot tạo bản nháp. Giáo viên luôn là người duyệt và xuất bản.</p>
      </div>
    </section>
  );
}

function EmptyCopilot({ onSuggestion }: { onSuggestion: (value: string) => void }) {
  return (
    <div className="copilot-empty">
      <span className="copilot-mark"><Sparkle size={23} weight="fill" /></span>
      <h2>Hôm nay mình giúp gì cho lớp?</h2>
      <p>Soạn bài, đọc báo cáo hoặc tìm đúng kỹ năng cần củng cố.</p>
      <div className="suggestion-grid">
        {suggestions.map((item) => <button key={item} onClick={() => onSuggestion(item)}>{item}<ArrowUp size={15} /></button>)}
      </div>
    </div>
  );
}

function MessageBubble({ turn, classId }: { turn: DisplayTurn; classId: string }) {
  const [copied, setCopied] = useState(false);
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      className={`message ${turn.role === "user" ? "message-user" : "message-assistant"}`}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      <div className="message-role">{turn.role === "user" ? "Bạn" : "D-Friend Copilot"}</div>
      {turn.steps?.length ? <ToolSteps steps={turn.steps} /> : null}
      {turn.content ? (
        <MathContent>{turn.content}</MathContent>
      ) : turn.pending ? (
        <div className="thinking-line"><CircleNotch className="animate-spin" size={16} /> Đang suy nghĩ</div>
      ) : null}
      {turn.plans?.map((plan, index) => <LessonPlanCard key={`${plan.conceptKey}:${index}`} plan={plan} classId={classId} />)}
      {turn.drafts?.map((draft) => <DraftCard key={draft.lessonId} draft={draft} />)}
      {turn.error && <p className="message-error"><WarningCircle size={16} /> {turn.error}</p>}
      {turn.role === "assistant" && turn.content && (
        <button className="copy-answer" onClick={async () => { await navigator.clipboard.writeText(turn.content); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <CheckCircle size={15} /> : <Copy size={15} />} {copied ? "Đã sao chép" : "Sao chép"}
        </button>
      )}
    </motion.article>
  );
}

function LessonPlanCard({ plan, classId }: { plan: CopilotLessonPlan; classId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(plan.skills.filter((skill) => skill.selected).map((skill) => skill.skillId)));
  const [activeJobId, setActiveJobId] = useState("");
  const [generationStep, setGenerationStep] = useState("Đang đưa yêu cầu vào hàng đợi");
  const [partial, setPartial] = useState<LessonGenerationResult | null>(null);
  const startsWithoutMaterial = plan.verdict === "no_material" || (plan.bankProblems === 0 && plan.documentUnits === 0);
  const [requiresGenerationConsent, setRequiresGenerationConsent] = useState(startsWithoutMaterial);
  const [consentDetail, setConsentDetail] = useState(startsWithoutMaterial ? plan.detail : "");
  const confirm = useMutation({
    mutationFn: async (allowGenerated: boolean) => {
      const queued = await teacherApi.confirmCopilotPlan({
        classId,
        goalText: plan.goalText,
        conceptKey: plan.conceptKey,
        skillIds: Array.from(selected),
        allowGenerated,
      });
      setActiveJobId(queued.jobId);
      return queued;
    },
    onSuccess: (queued) => {
      router.push(
        `/teacher/lessons/generating/${encodeURIComponent(queued.jobId)}?origin=copilot`,
      );
    },
    onError: (mutationError) => {
      const requirement = generationConsentRequirement(mutationError);
      if (!requirement) return;
      setRequiresGenerationConsent(true);
      setConsentDetail(requirement);
    },
  });
  const retryMissing = useMutation({
    mutationFn: async () => {
      const queued = await teacherApi.retryMissingLessonSlots(activeJobId);
      setActiveJobId(queued.jobId);
      setGenerationStep("Đang tạo tiếp các slot còn thiếu");
      return waitForLessonGeneration(queued.jobId, setGenerationStep);
    },
    onSuccess: (result) => {
      if (result.generationStatus === "partial") {
        setPartial(result);
        return;
      }
      setPartial(null);
      const lessonId = String(result.lessonId || "");
      if (lessonId) router.push(`/teacher/lessons/${lessonId}/review`);
    },
  });

  return (
    <section className="lesson-plan-card" aria-label="Xác nhận kế hoạch bài học">
      {(confirm.isPending || retryMissing.isPending) && (
        <LessonGenerationLoading
          origin="copilot"
          detail={generationStep}
        />
      )}
      <header>
        <span><BookOpenText size={18} weight="fill" /></span>
        <div className="lesson-plan-breadcrumb">
          <strong>{plan.subjectLabel}</strong><i>›</i><strong>{plan.topicLabel}</strong><i>›</i><strong>{plan.conceptLabel}</strong>
        </div>
      </header>
      <p className="lesson-plan-detail">{plan.detail}</p>
      {partial && (
        <div className="lesson-plan-consent" role="status">
          <WarningCircle size={16} />
          <span>
            Đã giữ {partial.generationCompletedSlots || 0}/{partial.generationTotalSlots || 12} bài đạt chuẩn.
            Bạn có thể review bản hiện tại hoặc chỉ tạo tiếp phần còn thiếu.
          </span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => retryMissing.mutate()}
            disabled={retryMissing.isPending}
          >
            <ArrowClockwise size={16} /> Tạo tiếp
          </button>
          {partial.lessonId && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => router.push(`/teacher/lessons/${String(partial.lessonId)}/review`)}
            >
              <BookOpenText size={16} /> Review
            </button>
          )}
        </div>
      )}
      <fieldset>
        <legend>Kỹ năng trong bài</legend>
        <div className="lesson-plan-skills">
          {plan.skills.map((skill) => (
            <label key={skill.skillId} data-selected={selected.has(skill.skillId)}>
              <input
                type="checkbox"
                checked={selected.has(skill.skillId)}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(skill.skillId); else next.delete(skill.skillId);
                  // The previous material verdict described the previous selection.
                  // Let the server recheck these edited boxes before asking for
                  // generation consent again.
                  setRequiresGenerationConsent(false);
                  setConsentDetail("");
                  return next;
                })}
              />
              <span><strong>{skill.label}</strong>{skill.evidence ? <em>từ chỗ bạn viết “{skill.evidence}”</em> : null}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="lesson-plan-footer">
        <p>Ngân hàng: {plan.bankProblems} bài <i>·</i> Tài liệu: {plan.documentUnits} phần</p>
        {plan.confirmable === true && (
          <button
            className="primary-button"
            onClick={() => confirm.mutate(requiresGenerationConsent)}
            disabled={confirm.isPending || retryMissing.isPending || selected.size === 0 || !classId}
            title={!classId ? "Chọn một lớp ở mục Ngữ cảnh trước khi soạn bài" : undefined}
          >
            <Check size={16} weight="bold" />
            {requiresGenerationConsent ? "Cho phép AI soạn phần thiếu" : "Đúng rồi, soạn bài"}
          </button>
        )}
      </div>
      {requiresGenerationConsent && <p className="lesson-plan-consent"><WarningCircle size={16} /> {consentDetail || "Một số kỹ năng chưa có nguồn bài. AI chỉ soạn phần thiếu sau khi bạn xác nhận."}</p>}
      {plan.confirmable === true && !classId && <p className="lesson-plan-hint">Chọn một lớp ở mục Ngữ cảnh để tiếp tục.</p>}
      {confirm.isError && !generationConsentRequirement(confirm.error) && <p className="message-error"><WarningCircle size={16} /> {getApiErrorMessage(confirm.error, "Chưa thể tạo bản nháp từ kế hoạch này.")}</p>}
    </section>
  );
}

function generationConsentRequirement(error: unknown) {
  const axiosResponse = (error as { response?: { status?: number; data?: unknown } })?.response;
  const response = axiosResponse?.data;
  if (!response || typeof response !== "object" || Array.isArray(response)) return "";
  const body = response as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message : "";
  const explicitCode = body.code === "GENERATION_CONSENT_REQUIRED";
  // Compatibility with older Nest deployments whose exception filter stripped the
  // structured code. This endpoint uses 409 specifically for generation consent.
  const legacyConsent = axiosResponse?.status === 409 && /xác nhận|AI soạn phần còn thiếu/i.test(message);
  if (!explicitCode && !legacyConsent) return "";
  return message || "Một số kỹ năng đã chọn chưa có nguồn bài.";
}

function ToolSteps({ steps }: { steps: CopilotStep[] }) {
  return (
    <div className="tool-steps">
      {steps.map((step, index) => (
        <div key={`${step.label}-${index}`} data-status={step.status}>
          {step.status === "started" ? <CircleNotch className="animate-spin" size={14} /> : step.status === "failed" ? <WarningCircle size={14} /> : <CheckCircle size={14} weight="fill" />}
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function DraftCard({ draft }: { draft: CopilotDraft }) {
  return (
    <Link href={`/teacher/lessons/${draft.lessonId}/review`} className="draft-card">
      <span className="draft-icon"><Sparkle size={18} weight="fill" /></span>
      <span><strong>Bản nháp bài học đã sẵn sàng</strong><small>{draft.problemCount} bài tập, cần giáo viên review</small></span>
      <ArrowUp size={17} className="rotate-45" />
    </Link>
  );
}

function CopilotSkeleton() {
  return <div className="copilot-workspace"><div className="copilot-header"><div><div className="skeleton h-3 w-20 mb-2" /><div className="skeleton h-7 w-56" /></div></div><div className="message-stack pt-12"><div className="skeleton h-24 w-[70%]" /><div className="skeleton h-32 w-[82%] ml-auto" /></div></div>;
}
