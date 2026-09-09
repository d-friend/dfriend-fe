"use client";

import {
  ArrowLeft,
  ArrowRight,
  ChatCircleDots,
  Check,
  Lightbulb,
  Sparkle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/api-client";
import { studentApi, studentKeys } from "@/lib/student-api";
import type {
  StudentPacePreference,
  StudentOnboarding,
  StudentScaffoldingPreference,
  StudentTonePreference,
} from "@/types/contracts";

type SetupState = {
  studentDisplayName: string;
  companionName: string;
  scaffolding: StudentScaffoldingPreference;
  pace: StudentPacePreference;
  tone: StudentTonePreference;
};

const INITIAL_SETUP: SetupState = {
  studentDisplayName: "",
  companionName: "Mây",
  scaffolding: "guided_questions",
  pace: "step_by_step",
  tone: "calm",
};

const SCAFFOLDING_OPTIONS = [
  { value: "small_hint", title: "Gợi ý nhỏ", detail: "Cho mình một điểm tựa, rồi để mình tự thử tiếp.", sample: "Thử nhìn lại dấu của biểu thức trước nhé." },
  { value: "guided_questions", title: "Hỏi từng bước", detail: "Dẫn mình bằng những câu hỏi ngắn, từng bước một.", sample: "Bước đầu tiên bạn muốn tìm đại lượng nào?" },
  { value: "similar_example", title: "Ví dụ tương tự", detail: "Cho mình xem một bài gần giống nhưng không trùng đáp án.", sample: "Mình thử một ví dụ nhỏ hơn trước nhé." },
] as const;

const PACE_OPTIONS = [
  { value: "concise", title: "Ngắn, vào thẳng ý", detail: "Ít chữ, tập trung đúng chỗ đang kẹt." },
  { value: "step_by_step", title: "Chia từng bước", detail: "Mỗi lần xử lý một ý để mình dễ theo." },
  { value: "intuition_first", title: "Trực giác rồi mới tính", detail: "Giải thích vì sao trước, sau đó mới tới ký hiệu." },
] as const;

const TONE_OPTIONS = [
  { value: "calm", title: "Bình tĩnh", detail: "Nhẹ nhàng, không tạo áp lực." },
  { value: "direct", title: "Thẳng và gọn", detail: "Nói rõ điều cần làm tiếp theo." },
  { value: "encouraging", title: "Năng lượng", detail: "Động viên mình tiếp tục thử." },
] as const;

const COMPANION_SUGGESTIONS = ["Mây", "Mochi", "Nova", "Pi"];

export function StudentCompanionOnboarding({ editing = false }: { editing?: boolean }) {
  const router = useRouter();
  const onboardingQuery = useQuery({
    queryKey: studentKeys.onboarding,
    queryFn: studentApi.onboarding,
  });

  useEffect(() => {
    const data = onboardingQuery.data;
    if (data?.completed && !editing) router.replace("/student/dashboard");
  }, [editing, onboardingQuery.data, router]);

  if (onboardingQuery.isLoading || (onboardingQuery.data?.completed && !editing)) {
    return <OnboardingFrame><div className="companion-loading" aria-label="Đang mở không gian của bạn"><span /><span /><span /></div></OnboardingFrame>;
  }

  if (onboardingQuery.isError) {
    return <OnboardingFrame><section className="companion-error"><Sparkle size={30} weight="fill" /><h1>Chưa mở được thiết lập</h1><p>Thông tin bạn học AI chưa tải được. Kết nối của bạn có thể đang gián đoạn.</p><button className="student-primary-button" onClick={() => onboardingQuery.refetch()}>Thử lại</button></section></OnboardingFrame>;
  }

  if (!onboardingQuery.data) return null;

  return <StudentCompanionSetup key={editing ? "edit" : "first-run"} initial={onboardingQuery.data} editing={editing} />;
}

function OnboardingBrand() {
  return (
    <section className="login-brand companion-onboarding-brand">
      <Image src="/dfriend-logo.png" alt="Logo D-Friend" width={96} height={96} priority />
      <div>
        <p className="workspace-kicker">D-Friend Student</p>
        <h1>Hiểu bạn trước. Đồng hành sau.</h1>
        <p>Chọn cách bạn muốn được gợi mở, giải thích và trò chuyện. Bạn có thể đổi lại bất cứ lúc nào.</p>
      </div>
    </section>
  );
}

function OnboardingFrame({ children }: { children: React.ReactNode }) {
  return <main className="login-page companion-onboarding"><OnboardingBrand /><section className="login-form-wrap companion-onboarding-wrap">{children}</section></main>;
}

function StudentCompanionSetup({ initial, editing }: { initial: StudentOnboarding; editing: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<SetupState>(() => ({
    ...INITIAL_SETUP,
    studentDisplayName: initial.student_display_name || "",
    companionName: initial.companion_name || "Mây",
    scaffolding: initial.preferences.scaffolding,
    pace: initial.preferences.pace,
    tone: initial.preferences.tone,
  }));
  const [error, setError] = useState("");
  const saveMutation = useMutation({
    mutationFn: studentApi.saveOnboarding,
    onSuccess: async (value) => {
      queryClient.setQueryData(studentKeys.onboarding, value);
      await queryClient.invalidateQueries({ queryKey: studentKeys.me });
      router.replace(editing ? "/student/profile" : "/student/dashboard");
    },
    onError: (saveError) =>
      setError(getApiErrorMessage(saveError, "Chưa thể lưu thiết lập. Thử lại nhé.")),
  });

  function update<K extends keyof SetupState>(key: K, value: SetupState[K]) {
    setSetup((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function next() {
    if (step === 0 && !setup.studentDisplayName.trim()) {
      setError("Cho D-Friend biết nên gọi bạn là gì nhé.");
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, 4));
  }

  function save() {
    if (!setup.companionName.trim()) {
      setError("Bạn học AI vẫn đang chờ một nickname.");
      return;
    }
    saveMutation.mutate({
      skipped: false,
      studentDisplayName: setup.studentDisplayName.trim(),
      companionName: setup.companionName.trim(),
      scaffolding: setup.scaffolding,
      pace: setup.pace,
      tone: setup.tone,
    });
  }

  function skip() {
    setError("");
    saveMutation.mutate({ skipped: true });
  }

  return (
    <main className="login-page companion-onboarding">
      <OnboardingBrand />
      <section className="login-form-wrap companion-onboarding-wrap">
        <div className="companion-setup-shell">
        <header className="companion-setup-header">
          <div>
            <span>Thiết lập bạn học AI</span>
            <div className="companion-progress" aria-label={`Bước ${step + 1} trên 5`}>
              {[0, 1, 2, 3, 4].map((item) => <span key={item} data-active={item <= step} />)}
            </div>
          </div>
          <button type="button" onClick={editing ? () => router.push("/student/profile") : skip} disabled={saveMutation.isPending}>{editing ? "Đóng" : "Bỏ qua"}</button>
        </header>

        <div className="companion-setup-content">
          {step === 0 ? <NameStep value={setup.studentDisplayName} onChange={(value) => update("studentDisplayName", value)} /> : null}
          {step === 1 ? <ChoiceStep eyebrow="Khi chưa hiểu" title="Bạn muốn được hỗ trợ thế nào?" options={SCAFFOLDING_OPTIONS} value={setup.scaffolding} onChange={(value) => update("scaffolding", value)} /> : null}
          {step === 2 ? <ChoiceStep eyebrow="Cách giải thích" title="Một lời giải dễ theo với bạn là…" options={PACE_OPTIONS} value={setup.pace} onChange={(value) => update("pace", value)} /> : null}
          {step === 3 ? <ChoiceStep eyebrow="Không khí học" title="Bạn muốn D-Friend nói chuyện thế nào?" options={TONE_OPTIONS} value={setup.tone} onChange={(value) => update("tone", value)} /> : null}
          {step === 4 ? <CompanionReveal studentName={setup.studentDisplayName} value={setup.companionName} onChange={(value) => update("companionName", value)} /> : null}
        </div>

        <footer className="companion-setup-footer">
          <div>{error ? <p role="alert">{error}</p> : <span>{step + 1} / 5</span>}</div>
          <div>
            {step > 0 ? <button type="button" className="student-secondary-button" onClick={() => setStep((current) => current - 1)} disabled={saveMutation.isPending}><ArrowLeft size={17} /> Quay lại</button> : null}
            {step < 4 ? <button type="button" className="student-primary-button" onClick={next}>Tiếp tục <ArrowRight size={17} /></button> : <button type="button" className="student-primary-button" onClick={save} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Đang lưu" : editing ? "Lưu thay đổi" : `Bắt đầu cùng ${setup.companionName.trim() || "bạn học AI"}`} <ArrowRight size={17} /></button>}
          </div>
        </footer>
        </div>
      </section>
    </main>
  );
}

function NameStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="companion-step name-step"><div className="companion-step-icon"><ChatCircleDots size={26} weight="fill" /></div><p>D-Friend làm quen với bạn</p><h1>D-Friend có thể gọi bạn là gì?</h1><span>Tên thật, tên ở nhà hay nickname đều được.</span><label><span>Tên bạn muốn được gọi</span><input autoFocus value={value} onChange={(event) => onChange(event.target.value)} maxLength={24} pattern="[A-Za-zÀ-ỹ0-9 ._'’\-]+" placeholder="Ví dụ: Minh" autoComplete="nickname" /></label><small>D-Friend chỉ dùng tên này để nói chuyện tự nhiên hơn.</small></div>;
}

function ChoiceStep<T extends string>({ eyebrow, title, options, value, onChange }: { eyebrow: string; title: string; options: readonly { value: T; title: string; detail: string; sample?: string }[]; value: T; onChange: (value: T) => void }) {
  return <div className="companion-step choice-step"><p>{eyebrow}</p><h1>{title}</h1><div className="companion-choice-list" role="radiogroup" aria-label={title}>{options.map((option) => <button type="button" role="radio" aria-checked={value === option.value} data-selected={value === option.value} key={option.value} onClick={() => onChange(option.value)}><span className="companion-choice-check">{value === option.value ? <Check size={15} weight="bold" /> : null}</span><span><strong>{option.title}</strong><small>{option.detail}</small>{option.sample ? <em>“{option.sample}”</em> : null}</span></button>)}</div></div>;
}

function CompanionReveal({ studentName, value, onChange }: { studentName: string; value: string; onChange: (value: string) => void }) {
  return <div className="companion-step reveal-step"><div className="companion-orbit" aria-hidden="true"><span><Sparkle size={34} weight="fill" /></span><i /><i /><i /></div><p>Sẵn sàng đồng hành</p><h1>Bạn học AI của bạn đã sẵn sàng</h1><span>{studentName.trim() || "Bạn"} sẽ luôn là người tự giải. Người bạn này sẽ lắng nghe cách bạn nghĩ, đặt câu hỏi và cùng gỡ chỗ bị kẹt.</span><label><span>Đặt một nickname cho bạn ấy</span><input value={value} onChange={(event) => onChange(event.target.value)} maxLength={24} pattern="[A-Za-zÀ-ỹ0-9 ._'’\-]+" placeholder="Ví dụ: Mây" autoComplete="off" /></label><div className="companion-name-suggestions" aria-label="Nickname gợi ý">{COMPANION_SUGGESTIONS.map((name) => <button type="button" key={name} data-selected={value === name} onClick={() => onChange(name)}>{name}</button>)}</div><div className="companion-boundary-note"><Lightbulb size={18} weight="fill" /><span><strong>{value.trim() || "Bạn học AI"}</strong> sẽ gợi mở, không làm hộ bài và không tự ý chấm bạn dễ hơn.</span></div></div>;
}
