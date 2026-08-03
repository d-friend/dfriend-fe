"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle, Sparkle, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";

export function FollowUpWorkspace({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<Awaited<ReturnType<typeof teacherApi.generateFollowUps>> | null>(null);
  const generate = useMutation({ mutationFn: () => teacherApi.generateFollowUps(lessonId), onSuccess: setResult });

  return (
    <section className="documents-page">
      <header className="page-heading">
        <div><button className="text-button !px-0 mb-4" onClick={() => router.back()}><ArrowLeft size={16} /> Quay lại báo cáo</button><p className="workspace-kicker">Bài học theo nhóm</p><h1>Phụ đạo và nâng cao</h1><p>Copilot tạo từng bản nháp riêng. Bạn mở, review và xuất bản từng nhóm.</p></div>
        {!result && <button className="primary-button" onClick={() => generate.mutate()} disabled={generate.isPending}><Sparkle size={17} weight="fill" />{generate.isPending ? "Đang tạo bản nháp" : "Tạo bài theo nhóm"}</button>}
      </header>
      {generate.isError && <div className="inline-error mt-6"><WarningCircle size={16} className="inline mr-2" />{getApiErrorMessage(generate.error)}</div>}
      {generate.isPending && <div className="generating-lesson !min-h-[28rem]"><span><Sparkle size={25} weight="fill" /></span><h1>Đang phân tích từng nhóm</h1><p>Copilot đang lùi về kỹ năng nền cho nhóm phụ đạo và mở rộng cho nhóm nâng cao.</p><div className="generation-track"><i /></div></div>}
      {result && !result.created && <div className="empty-panel mt-8"><CheckCircle size={30} weight="fill" className="text-[var(--success)]" /><h2>Lớp đang tiến bộ khá đồng đều</h2><p>Không cần tách nhóm phụ đạo hoặc nâng cao cho bài học này.</p></div>}
      {result?.created && <div className="follow-up-grid">{(result.drafts || []).map((draft) => <article key={draft.id}><span className="follow-up-icon"><UsersThree size={22} /></span><p className="workspace-kicker">{draft.groupType === "remedial" ? "Phụ đạo" : "Nâng cao"}</p><h2>{draft.groupType === "remedial" ? "Củng cố kỹ năng nền" : "Mở rộng thử thách"}</h2><p>{draft.summary || "Bản nháp được cá nhân hóa theo dữ liệu của nhóm."}</p><div><span>{draft.studentIds.length} học sinh</span><span>{draft.exercises.length} bài tập</span></div><Link className="primary-button" href={`/teacher/lessons/${draft.aiLessonId}/review`}>Mở bản nháp <ArrowRight size={16} /></Link></article>)}</div>}
    </section>
  );
}
