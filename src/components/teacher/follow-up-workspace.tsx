"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle, Sparkle, Student, Target, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, teacherApi, type FollowUpPlan, type FollowUpSuggestion } from "@/lib/api-client";

type LaneKind = "remedial" | "advanced";
type LaneState = Record<LaneKind, { skillIds: string[]; lessonGoal: string }>;

const emptyLaneState: LaneState = {
  remedial: { skillIds: [], lessonGoal: "" },
  advanced: { skillIds: [], lessonGoal: "" },
};

export function FollowUpWorkspace({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const plan = useQuery({ queryKey: ["teacher", "copilot", lessonId, "follow-up-plan"], queryFn: () => teacherApi.followUpPlan(lessonId) });
  const [laneState, setLaneState] = useState<LaneState>(emptyLaneState);
  const [appliedPlanAt, setAppliedPlanAt] = useState("");
  const createDraft = useMutation({
    mutationFn: async (kind: LaneKind) => {
      const lane = laneFromPlan(plan.data, kind);
      if (!lane) throw new Error("Không tìm thấy nhóm follow-up.");
      const selected = laneState[kind].skillIds;
      const original = lane.target_skill_ids || [];
      const result = await teacherApi.createFollowUpDraft(lessonId, {
        kind,
        conceptKey: lane.concept_key,
        studentIds: lane.target_student_ids || [],
        skillIds: selected,
        lessonGoal: laneState[kind].lessonGoal,
        editedRecommendation: !sameSet(selected, original),
      });
      return result;
    },
    onSuccess: (result) => {
      router.push(`/teacher/lessons/${result.draft.aiLessonId}/review`);
    },
  });

  useEffect(() => {
    if (!plan.data || appliedPlanAt === plan.data.generated_at) return;
    setLaneState({
      remedial: {
        skillIds: laneFromPlan(plan.data, "remedial")?.target_skill_ids?.slice(0, 2) || [],
        lessonGoal: "",
      },
      advanced: {
        skillIds: laneFromPlan(plan.data, "advanced")?.target_skill_ids?.slice(0, 2) || [],
        lessonGoal: "",
      },
    });
    setAppliedPlanAt(plan.data.generated_at);
  }, [appliedPlanAt, plan.data]);

  const hasActionableLane = ["remedial", "advanced"].some((kind) => {
    const lane = laneFromPlan(plan.data, kind as LaneKind);
    return lane && (lane.target_student_ids || []).length > 0 && !lane.empty_reason;
  });

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
      {createDraft.isError && <div className="inline-error mt-6"><WarningCircle size={16} className="inline mr-2" />{getApiErrorMessage(createDraft.error, "Chưa tạo được bản nháp follow-up.")}</div>}

      {plan.data && !hasActionableLane && (
        <div className="empty-panel mt-8"><CheckCircle size={30} weight="fill" className="text-[var(--success)]" /><h2>Lớp đang tiến bộ khá đồng đều</h2><p>Không cần tách nhóm phụ đạo hoặc nâng cao cho bài học này.</p></div>
      )}

      {plan.data && hasActionableLane && (
        <div className="follow-up-planner-grid">
          <FollowUpLane
            kind="remedial"
            plan={plan.data}
            state={laneState.remedial}
            pending={createDraft.isPending}
            onStateChange={(next) => setLaneState((current) => ({ ...current, remedial: next }))}
            onConfirm={() => createDraft.mutate("remedial")}
          />
          <FollowUpLane
            kind="advanced"
            plan={plan.data}
            state={laneState.advanced}
            pending={createDraft.isPending}
            onStateChange={(next) => setLaneState((current) => ({ ...current, advanced: next }))}
            onConfirm={() => createDraft.mutate("advanced")}
          />
        </div>
      )}
    </section>
  );
}

function FollowUpLane({
  kind,
  plan,
  state,
  pending,
  onStateChange,
  onConfirm,
}: {
  kind: LaneKind;
  plan: FollowUpPlan;
  state: { skillIds: string[]; lessonGoal: string };
  pending: boolean;
  onStateChange: (state: { skillIds: string[]; lessonGoal: string }) => void;
  onConfirm: () => void;
}) {
  const lane = laneFromPlan(plan, kind);
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
  const canConfirm = !empty && state.skillIds.length > 0 && state.skillIds.length <= 2 && !pending;
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
                      onStateChange({
                        ...state,
                        skillIds: event.target.checked
                          ? [...state.skillIds, skill.skill_id].slice(0, 2)
                          : state.skillIds.filter((item) => item !== skill.skill_id),
                      })
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
              <label htmlFor={`goal-${kind}`}>Mục tiêu riêng</label>
              <small>{selectedLabels.length ? selectedLabels.join(", ") : "Kỹ năng đã chọn sẽ là nguồn chính."}</small>
            </div>
            <textarea
              id={`goal-${kind}`}
              className="textarea"
              value={state.lessonGoal}
              onChange={(event) => onStateChange({ ...state, lessonGoal: event.target.value })}
              placeholder="Không bắt buộc"
            />
          </div>
          <button className="primary-button follow-up-confirm" disabled={!canConfirm} onClick={onConfirm}>
            <Sparkle size={17} weight="fill" />{pending ? "Đang tạo bản nháp" : "Tạo bản nháp"} <ArrowRight size={16} />
          </button>
        </>
      )}
    </article>
  );
}

function laneFromPlan(plan: FollowUpPlan | undefined, kind: LaneKind): FollowUpSuggestion | undefined {
  return plan?.groups?.find((item) => item.kind === kind);
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
