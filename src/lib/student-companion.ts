import type { ResponseAdaptationPolicy } from "@/types/contracts";

export const DEFAULT_COMPANION_POLICY: ResponseAdaptationPolicy = {
  student_display_name: "bạn",
  companion_name: "D-Friend",
  preferred_representation: [],
  scaffolding: "adaptive",
  pace: "concise",
  challenge: "balanced",
  tone: "calm",
};

export function companionPolicy(
  policy?: Partial<ResponseAdaptationPolicy> | null,
): ResponseAdaptationPolicy {
  return {
    ...DEFAULT_COMPANION_POLICY,
    ...policy,
    student_display_name:
      policy?.student_display_name?.trim() ||
      DEFAULT_COMPANION_POLICY.student_display_name,
    companion_name:
      policy?.companion_name?.trim() || DEFAULT_COMPANION_POLICY.companion_name,
  };
}

export function buildMasteryGreeting(
  rawPolicy?: Partial<ResponseAdaptationPolicy> | null,
) {
  const policy = companionPolicy(rawPolicy);
  const student = policy.student_display_name;
  const companion = policy.companion_name;

  if (policy.tone === "direct") {
    return `Chào ${student}, ${companion} đây. Mình bắt đầu nhé — bạn đưa ra cách nghĩ, mình sẽ hỏi đúng chỗ cần làm rõ và không làm hộ bài.`;
  }
  if (policy.tone === "encouraging") {
    return `${student} ơi, ${companion} đã có mặt ✦ Cứ thử theo cách của bạn nhé. Sai cũng không sao, mình sẽ cùng bạn tìm ra chỗ cần chỉnh.`;
  }
  return `Chào ${student}, mình là ${companion}. Hôm nay mình sẽ cùng bạn đi từng bước. Cứ nói điều bạn đang nghĩ, chỗ nào chưa rõ mình sẽ cùng bạn gỡ.`;
}
