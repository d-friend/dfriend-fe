"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle, Sparkle, Student, Target, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, teacherApi, type FollowUpDraftHandle, type FollowUpPlan, type FollowUpSuggestion } from "@/lib/api-client";

type LaneKind = "remedial" | "advanced";
type LaneFormState = { skillIds: string[]; lessonGoal: string; goalEdited: boolean };
type LaneState = Record<string, LaneFormState>;

export function FollowUpWorkspace({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const plan = useQuery({ queryKey: ["teacher", "copilot", lessonId, "follow-up-plan"], queryFn: () => teacherApi.followUpPlan(lessonId) });
  const [laneState, setLaneState] = useState<LaneState>({});
  const [createdByKind, setCreatedByKind] = useState<Partial<Record<LaneKind, FollowUpDraftHandle>>>({});
  const [queuedByKind, setQueuedByKind] = useState<Partial<Record<LaneKind, string>>>({});
  const [pendingLaneKeys, setPendingLaneKeys] = useState<string[]>([]);
  const [laneErrors, setLaneErrors] = useState<Record<string, string>>({});
  const [appliedPlanAt, setAppliedPlanAt] = useState("");

  async function createLane(lane: FollowUpSuggestion, laneKey: string, requestId: string, reviewTab: Window) {
    if (!plan.data?.reportId || !plan.data.planId) {
      reviewTab.location.replace(
        generationRoute(requestId, lane.kind as LaneKind, "Kế hoạch chưa gắn với report snapshot."),
      );
      setLaneErrors((current) => ({ ...current, [laneKey]: "Kế hoạch chưa gắn với report snapshot." }));
      return;
    }
    const kind = lane.kind as LaneKind;
    const selected = laneState[laneKey]?.skillIds || [];
    const original = lane.target_skill_ids || [];
    setPendingLaneKeys((current) => [...new Set([...current, laneKey])]);
    setLaneErrors((current) => ({ ...current, [laneKey]: "" }));
    try {
      const result = await teacherApi.createFollowUpDraft(plan.data.lesson_id, {
        reportId: plan.data.reportId,
        planId: plan.data.planId,
        kind,
        conceptKey: lane.concept_key,
        studentIds: lane.target_student_ids || [],
        skillIds: selected,
        lessonGoal: laneState[laneKey]?.lessonGoal || "",
        editedRecommendation: !sameSet(selected, original),
        requestId,
      });
      if (result.draft) {
        setCreatedByKind((current) => ({ ...current, [kind]: result.draft }));
        reviewTab.location.replace(`/teacher/lessons/${result.draft.aiLessonId}/review`);
        return;
      }
      if (!result.jobId) {
        throw new Error("Backend chưa trả request ID cho generation job.");
      }
      setQueuedByKind((current) => ({ ...current, [kind]: result.jobId }));
      reviewTab.location.replace(
        generationRoute(result.jobId, kind),
      );
    } catch (error) {
      const message = getApiErrorMessage(error, `Chưa tạo được bản nháp ${kind === "remedial" ? "phụ đạo" : "nâng cao"}.`);
      reviewTab.location.replace(generationRoute(requestId, kind, message));
      setLaneErrors((current) => ({
        ...current,
        [laneKey]: message,
      }));
    } finally {
      setPendingLaneKeys((current) => current.filter((key) => key !== laneKey));
    }
  }

  function createOne(lane: FollowUpSuggestion, laneKey: string) {
    const requestId = crypto.randomUUID();
    const tab = window.open(generationRoute(requestId, lane.kind as LaneKind), "_blank");
    if (!tab) {
      setLaneErrors((current) => ({ ...current, [laneKey]: "Trình duyệt đang chặn tab mới. Hãy cho phép pop-up rồi thử lại." }));
      return;
    }
    void createLane(lane, laneKey, requestId, tab);
  }

  useEffect(() => {
    if (!plan.data || appliedPlanAt === plan.data.generated_at) return;
    const timer = window.setTimeout(() => {
      setLaneState(Object.fromEntries((plan.data?.groups || []).map((lane, index) => [
        `${lane.kind}-${index}`,
        {
          skillIds: lane.target_skill_ids?.slice(0, 2) || [],
          lessonGoal: buildLaneGoal(lane, plan.data as FollowUpPlan, lane.target_skill_ids?.slice(0, 2) || []),
          goalEdited: false,
        },
      ])));
      setCreatedByKind(plan.data?.laneDrafts || {});
      setQueuedByKind(plan.data?.laneJobs || {});
      setAppliedPlanAt(plan.data?.generated_at || "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [appliedPlanAt, plan.data]);

  const actionableLanes = (plan.data?.groups || []).filter(
    (lane) => (lane.target_student_ids || []).length > 0 && !lane.empty_reason,
  );
  const hasActionableLane = actionableLanes.length > 0;
  const lanesAvailableForBoth = actionableLanes.filter((lane) => !createdByKind[lane.kind as LaneKind] && !queuedByKind[lane.kind as LaneKind]);

  function createBoth() {
    const targets = lanesAvailableForBoth.map((lane) => ({
      lane,
      laneKey: `${lane.kind}-${(plan.data?.groups || []).indexOf(lane)}`,
      requestId: crypto.randomUUID(),
    }));
    const reserved = targets.map((target) => ({
      ...target,
      tab: window.open(generationRoute(target.requestId, target.lane.kind as LaneKind), "_blank"),
    }));
    if (reserved.some((target) => !target.tab)) {
      reserved.forEach((target) => target.tab?.close());
      setLaneErrors((current) => ({ ...current, both: "Trình duyệt đang chặn tab mới. Hãy cho phép pop-up rồi thử lại." }));
      return;
    }
    setLaneErrors((current) => ({ ...current, both: "" }));
    reserved.forEach((target) => void createLane(target.lane, target.laneKey, target.requestId, target.tab as Window));
  }

  return (
    <section className="follow-up-page">
      <header className="follow-up-hero">
        <div>
          <button className="text-button !px-0 mb-4" onClick={() => router.back()}><ArrowLeft size={16} /> Quay lại báo cáo</button>
          <p className="workspace-kicker">Bài học theo nhóm</p>
          <h1>Phụ đạo và nâng cao</h1>
          <p>Mỗi nhóm có bộ kỹ năng riêng. Giáo viên xác nhận trước khi Copilot tạo bản nháp.</p>
        </div>
        {plan.data && (
          <aside className="follow-up-hero-panel" aria-label="Tóm tắt kế hoạch">
            <span><Target size={18} /></span>
            <strong>{plan.data.main?.target_skill_ids?.length || 0} kỹ năng bài tiếp theo</strong>
            <small>{plan.data.groups?.filter((group) => (group.target_student_ids || []).length > 0).length || 0} nhóm cần xử lý</small>
          </aside>
        )}
      </header>

      {plan.isLoading && <div className="generating-lesson !min-h-[28rem]"><span><Sparkle size={25} weight="fill" /></span><h1>Đang dựng kế hoạch follow-up</h1><p>Copilot đang đọc báo cáo lớp và tách nhóm cần phụ đạo hoặc nâng cao.</p><div className="generation-track"><i /></div></div>}
      {plan.isError && <div className="inline-error mt-6"><WarningCircle size={16} className="inline mr-2" />{getApiErrorMessage(plan.error, "Chưa tải được kế hoạch follow-up.")}</div>}
      {laneErrors.both && <div className="inline-error mt-6"><WarningCircle size={16} className="inline mr-2" />{laneErrors.both}</div>}

      {plan.data && !hasActionableLane && (
        <div className="empty-panel mt-8"><CheckCircle size={30} weight="fill" className="text-[var(--success)]" /><h2>Lớp đang tiến bộ khá đồng đều</h2><p>Không cần tách nhóm phụ đạo hoặc nâng cao cho bài học này.</p></div>
      )}

      {plan.data && hasActionableLane && (
        <>
        {lanesAvailableForBoth.length === 2 && (
          <div className="report-actions mt-6">
            <button className="primary-button" disabled={pendingLaneKeys.length > 0} onClick={createBoth}>
              <Sparkle size={17} weight="fill" /> Tạo cả hai bài
            </button>
          </div>
        )}
        <div className="follow-up-planner-grid">
          {actionableLanes.map((lane) => {
            const laneKey = `${lane.kind}-${(plan.data?.groups || []).indexOf(lane)}`;
            const kind = lane.kind as LaneKind;
            return <FollowUpLane
              key={laneKey}
              lane={lane}
              laneKey={laneKey}
              plan={plan.data}
              state={laneState[laneKey] || { skillIds: [], lessonGoal: "", goalEdited: false }}
              pending={pendingLaneKeys.includes(laneKey)}
              queuedJobId={queuedByKind[kind]}
              createdDraft={createdByKind[kind]}
              error={laneErrors[laneKey]}
              onStateChange={(next) => setLaneState((current) => ({ ...current, [laneKey]: next }))}
              onConfirm={() => createOne(lane, laneKey)}
              onOpen={(draft) => window.open(`/teacher/lessons/${draft.aiLessonId}/review`, "_blank", "noopener,noreferrer")}
              onOpenJob={(jobId) => window.open(generationRoute(jobId, kind), "_blank", "noopener,noreferrer")}
            />;
          })}
        </div>
        </>
      )}
    </section>
  );
}

function generationRoute(requestId: string, kind: LaneKind, enqueueError?: string) {
  const params = new URLSearchParams({ kind, origin: "copilot" });
  if (enqueueError) params.set("enqueueError", enqueueError);
  return `/teacher/lessons/generating/${encodeURIComponent(requestId)}?${params.toString()}`;
}

function FollowUpLane({
  lane,
  laneKey,
  plan,
  state,
  pending,
  queuedJobId,
  createdDraft,
  error,
  onStateChange,
  onConfirm,
  onOpen,
  onOpenJob,
}: {
  lane: FollowUpSuggestion;
  laneKey: string;
  plan: FollowUpPlan;
  state: LaneFormState;
  pending: boolean;
  queuedJobId?: string;
  createdDraft?: FollowUpDraftHandle;
  error?: string;
  onStateChange: (state: LaneFormState) => void;
  onConfirm: () => void;
  onOpen: (draft: FollowUpDraftHandle) => void;
  onOpenJob: (jobId: string) => void;
}) {
  const kind = lane.kind as LaneKind;
  const parsed = parseConceptKey(lane?.concept_key || "");
  const skills = useQuery({
    queryKey: ["curriculum", "skills", parsed?.subject, parsed?.topic, parsed?.concept],
    queryFn: () => teacherApi.curriculumSkills(parsed?.subject || "", parsed?.topic || "", parsed?.concept || ""),
    enabled: Boolean(parsed),
    staleTime: Infinity,
  });
  const skillLabelById = useMemo(
    () => new Map((skills.data || []).map((skill) => [skill.skill_id, skill.label_vi] as const)),
    [skills.data],
  );
  const studentIds = lane?.target_student_ids || [];
  const empty = !lane || !studentIds.length || Boolean(lane.empty_reason);
  const canConfirm = !empty && !createdDraft && !queuedJobId && state.skillIds.length > 0 && state.skillIds.length <= 2 && !pending;
  const title = kind === "remedial" ? "Phụ đạo" : "Nâng cao";
  const selectedLabels = state.skillIds.map((id) => skillLabelById.get(id) || readableSkill(id));

  return (
    <article className="follow-up-lane" data-kind={kind} data-empty={empty}>
      <div className="follow-up-lane-head">
        <span className="follow-up-icon">{kind === "remedial" ? <UsersThree size={22} /> : <Sparkle size={21} weight="fill" />}</span>
        <div>
          <p className="workspace-kicker">{title}</p>
          <h2>{kind === "remedial" ? "Củng cố kỹ năng nền" : "Mở rộng thử thách"}</h2>
        </div>
      </div>

      <p className="follow-up-reason">{lane?.reason || "Chưa có đề xuất cho nhóm này."}</p>

      <div className="follow-up-stats" aria-label={`${title} summary`}>
        <span><Student size={15} />{studentIds.length} học sinh</span>
        <span><Target size={15} />{state.skillIds.length}/2 kỹ năng</span>
      </div>

      {studentIds.length > 0 && (
        <div className="follow-up-students">
          {studentIds.map((id) => <span key={id}>{plan.studentNames?.[id] || id}</span>)}
        </div>
      )}

      {empty ? (
        <p className="muted-copy">{emptyReason(lane?.empty_reason)}</p>
      ) : (
        <>
          <div className="follow-up-field">
            <div>
              <label>Kỹ năng</label>
              <small>Chọn tối đa 2 kỹ năng.</small>
            </div>
          </div>
          <div className="follow-up-skill-list">
            {(skills.data || []).map((skill) => {
              const checked = state.skillIds.includes(skill.skill_id);
              return (
                <label key={skill.skill_id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && state.skillIds.length >= 2}
                    onChange={(event) =>
                      {
                        const skillIds = event.target.checked
                          ? [...state.skillIds, skill.skill_id].slice(0, 2)
                          : state.skillIds.filter((item) => item !== skill.skill_id);
                        onStateChange({
                          ...state,
                          skillIds,
                          lessonGoal: state.goalEdited ? state.lessonGoal : buildLaneGoal(lane, plan, skillIds),
                        });
                      }
                    }
                  />
                  <span><strong>{skill.label_vi}</strong><small>{skill.skill_id}</small></span>
                </label>
              );
            })}
            {skills.isLoading && <div className="studio-empty-selection">Đang tải kỹ năng.</div>}
          </div>
          <div className="follow-up-goal-field">
            <div>
              <label htmlFor={`goal-${laneKey}`}>Mục tiêu riêng</label>
              <small>{selectedLabels.length ? selectedLabels.join(", ") : "Kỹ năng đã chọn sẽ là nguồn chính."}</small>
            </div>
            <textarea
              id={`goal-${laneKey}`}
              className="textarea"
              value={state.lessonGoal}
              onChange={(event) => onStateChange({ ...state, lessonGoal: event.target.value, goalEdited: true })}
              placeholder="Mục tiêu follow-up"
            />
          </div>
          {error && <div className="inline-error"><WarningCircle size={16} className="inline mr-2" />{error}</div>}
          {queuedJobId ? (
            <button className="secondary-button follow-up-confirm" onClick={() => onOpenJob(queuedJobId)}>
              <Sparkle size={17} weight="fill" /> Mở tiến trình tạo bài <ArrowRight size={16} />
            </button>
          ) : createdDraft ? (
            <button className="secondary-button follow-up-confirm" onClick={() => onOpen(createdDraft)}>
              <CheckCircle size={17} weight="fill" /> Mở bản nháp <ArrowRight size={16} />
            </button>
          ) : (
            <button className="primary-button follow-up-confirm" disabled={!canConfirm} onClick={onConfirm}>
              <Sparkle size={17} weight="fill" />{pending ? "Đang tạo bản nháp" : `Tạo bài ${kind === "remedial" ? "phụ đạo" : "nâng cao"}`} <ArrowRight size={16} />
            </button>
          )}
        </>
      )}
    </article>
  );
}

function buildLaneGoal(lane: FollowUpSuggestion, plan: FollowUpPlan, skillIds: string[]) {
  const skills = skillIds.map(readableSkill).join(", ") || "các kỹ năng đã chọn";
  const students = lane.target_student_ids?.length || 0;
  const source = plan.parentLessonTitle ? ` sau bài “${plan.parentLessonTitle}”` : "";
  const report = plan.reportVersion ? ` theo báo cáo lớp phiên bản ${plan.reportVersion}` : " theo báo cáo lớp";
  if (lane.kind === "remedial") {
    return `Đây là bài phụ đạo${source} dành cho ${students} học sinh${report} còn yếu ở ${skills}. Phiên kiến thức phải dạy lại đúng pattern và misconception của các kỹ năng này bằng ví dụ có hướng dẫn; không lùi sang prerequisite trừ khi có evidence trực tiếp ở ít nhất hai session khác nhau. Phiên luyện tập cần củng cố để học sinh tự làm được ${skills}, rồi kết thúc bằng một bài challenge vừa sức.`;
  }
  return `Đây là bài nâng cao${source} dành cho ${students} học sinh${report} đã sẵn sàng mở rộng ${skills}. Phiên kiến thức phải bắt đầu từ nền tảng các em đã chứng minh, giới thiệu biểu diễn hoặc pattern sâu hơn và không dạy lại kiến thức cơ bản. Phiên luyện tập cần có challenge, transfer/exploration và extension để học sinh vận dụng ${skills} trong tình huống mới.`;
}

function parseConceptKey(value: string) {
  const [subject, topic, concept] = value.split(":");
  if (!subject || !topic || !concept) return null;
  return { subject, topic, concept };
}

function emptyReason(value?: string | null) {
  if (value === "no_remedial_students") return "Không có học sinh cần phụ đạo sau bài này.";
  if (value === "no_advanced_students") return "Chưa có nhóm học sinh cần bài nâng cao.";
  if (value === "no_valid_remedial_skills") return "Chưa tìm được kỹ năng phụ đạo hợp lệ trong taxonomy.";
  if (value === "no_valid_advanced_skills") return "Chưa tìm được kỹ năng nâng cao hợp lệ trong taxonomy.";
  return "Chưa đủ dữ liệu để tạo nhóm này.";
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function readableSkill(value: string) {
  return (value.split("#").pop() || value).replace(/[-_]+/g, " ");
}
