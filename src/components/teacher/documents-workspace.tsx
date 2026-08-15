"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Check,
  File,
  FilePdf,
  FolderOpen,
  LockSimple,
  MagnifyingGlass,
  Trash,
  UploadSimple,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { getApiErrorMessage, teacherApi } from "@/lib/api-client";

const acceptedExtensions = ["pdf", "docx", "md", "txt"];

export function DocumentsWorkspace() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [concept, setConcept] = useState("");
  const [shared, setShared] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const documentsQuery = useQuery({ queryKey: ["teacher", "documents"], queryFn: teacherApi.documents, refetchInterval: (query) => query.state.data?.some((item) => item.indexStatus === "pending" || item.indexStatus === "indexing") ? 5000 : false });
  const curriculumQuery = useQuery({ queryKey: ["curriculum"], queryFn: teacherApi.curriculum, staleTime: 5 * 60 * 1000 });

  const topics = useMemo(() => curriculumQuery.data?.find((item) => item.value === subject)?.topics || [], [curriculumQuery.data, subject]);
  const concepts = useMemo(() => topics.find((item) => item.value === topic)?.concepts || [], [topics, topic]);
  const canUpload = Boolean(file && title.trim() && subject && topic);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    if (!needle) return documentsQuery.data || [];
    return (documentsQuery.data || []).filter((item) =>
      [item.title, item.fileName, item.subject, item.topic, item.concept]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(needle)),
    );
  }, [documentsQuery.data, query]);

  const upload = useMutation({
    mutationFn: teacherApi.uploadDocument,
    onSuccess: async (result) => {
      setSuccess("Đã lưu tài liệu vào kho bài tập.");
      setError("");
      setFile(null);
      setTitle("");
      setDescription("");
      setSubject("");
      setTopic("");
      setConcept("");
      setShared(true);
      await queryClient.invalidateQueries({ queryKey: ["teacher", "documents"] });
      window.setTimeout(() => setSuccess(result.message || "Đã lưu tài liệu."), 0);
    },
    onError: (uploadError) => setError(getApiErrorMessage(uploadError, "Không thể tải tài liệu lên.")),
  });

  const remove = useMutation({
    mutationFn: teacherApi.deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher", "documents"] }),
  });
  const retryIndex = useMutation({
    mutationFn: teacherApi.retryDocumentIndex,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher", "documents"] }),
    onError: (retryError) => setError(getApiErrorMessage(retryError, "Không thể lập chỉ mục lại tài liệu.")),
  });

  function chooseFile(next: File | null) {
    setError("");
    if (!next) return;
    const extension = next.name.split(".").pop()?.toLowerCase() || "";
    if (!acceptedExtensions.includes(extension)) {
      setError("Chỉ hỗ trợ PDF, DOCX, Markdown và TXT.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("Tệp vượt quá giới hạn 10 MB.");
      return;
    }
    setFile(next);
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, ""));
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0] || null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!file || !title.trim() || !subject || !topic) {
      setError("Chọn đủ môn, chủ đề, tên tài liệu và tệp trước khi tải lên.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    body.append("title", title.trim());
    body.append("description", description.trim());
    body.append("subject", subject);
    body.append("topic", topic);
    if (concept) body.append("concept", concept);
    body.append("shared", shared ? "true" : "false");
    upload.mutate(body);
  }

  return (
    <section className="documents-page">
      <header className="page-heading">
        <div>
          <p className="workspace-kicker">Copilot</p>
          <h1>Kho tài liệu</h1>
          <p>Tài liệu được lưu trước và chỉ khai thác khi một bài học thực sự cần đến.</p>
        </div>
        <button className="primary-button" onClick={() => setUploadOpen((value) => !value)}>
          {uploadOpen ? <X size={17} /> : <UploadSimple size={17} weight="bold" />}
          {uploadOpen ? "Đóng" : "Tải tài liệu"}
        </button>
      </header>

      {uploadOpen && (
        <form className="upload-panel" onSubmit={submit}>
          <div className="upload-copy">
            <span className="upload-icon"><FolderOpen size={24} /></span>
            <h2>Thêm nguồn bài tập</h2>
            <p>Phân loại bắt buộc giúp Copilot tìm đúng bài theo kỹ năng, không đoán theo tên tệp.</p>
          </div>
          <div className="upload-fields">
            {error && <p className="inline-error col-span-full" role="alert"><WarningCircle size={15} className="inline mr-1" />{error}</p>}
            {success && <p className="success-message col-span-full" role="status"><Check size={15} />{success}</p>}
            <div className="form-field">
              <label htmlFor="document-subject">Môn học</label>
              <select id="document-subject" className="select" value={subject} onChange={(event) => { setSubject(event.target.value); setTopic(""); setConcept(""); }} required>
                <option value="">Chọn môn học</option>
                {(curriculumQuery.data || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="document-topic">Chủ đề</label>
              <select id="document-topic" className="select" value={topic} onChange={(event) => { setTopic(event.target.value); setConcept(""); }} disabled={!subject} required>
                <option value="">Chọn chủ đề</option>
                {topics.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="document-concept">Khái niệm (không bắt buộc)</label>
              <select id="document-concept" className="select" value={concept} onChange={(event) => setConcept(event.target.value)} disabled={!topic}>
                <option value="">Tài liệu chung của chủ đề</option>
                {concepts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="form-field col-span-full">
              <label htmlFor="document-title">Tên tài liệu</label>
              <input id="document-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Bộ bài tập Đơn thức" required />
            </div>
            <div className="form-field col-span-full">
              <label htmlFor="document-description">Ghi chú</label>
              <textarea id="document-description" className="textarea !min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Nguồn, khối lớp hoặc cách bạn muốn dùng tài liệu" />
            </div>
            <button
              type="button"
              className="dropzone col-span-full"
              data-dragging={dragging}
              onClick={() => fileInput.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              <input ref={fileInput} type="file" hidden accept=".pdf,.docx,.md,.txt" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
              {file ? <><FilePdf size={24} /><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span></> : <><UploadSimple size={24} /><span><strong>Kéo tệp vào đây hoặc chọn từ máy</strong><small>PDF, DOCX, MD, TXT, tối đa 10 MB</small></span></>}
            </button>
            <label className="share-toggle col-span-full">
              <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
              <span className="toggle-track"><span /></span>
              <span>{shared ? <UsersThree size={18} /> : <LockSimple size={18} />}<strong>{shared ? "Chia sẻ với kho chung" : "Chỉ mình tôi"}</strong><small>{shared ? "Giáo viên khác có thể dùng bài tập từ tài liệu này." : "Tài liệu chỉ xuất hiện trong kết quả của bạn."}</small></span>
            </label>
            <div className="col-span-full flex justify-end">
              <button className="primary-button" type="submit" disabled={upload.isPending || !canUpload} title={canUpload ? undefined : "Chọn môn, chủ đề, tên tài liệu và tệp trước khi lưu"}>{upload.isPending ? "Đang lưu tài liệu" : "Lưu vào kho"}</button>
            </div>
          </div>
        </form>
      )}

      <div className="document-toolbar">
        <label className="search-field"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc taxonomy" aria-label="Tìm tài liệu" /></label>
        <span>{filtered.length} tài liệu</span>
      </div>

      {documentsQuery.isLoading ? (
        <div className="document-grid"><div className="skeleton h-48" /><div className="skeleton h-48" /><div className="skeleton h-48" /></div>
      ) : documentsQuery.isError ? (
        <div className="empty-panel"><WarningCircle size={28} /><h2>Không tải được kho tài liệu</h2><p>{getApiErrorMessage(documentsQuery.error)}</p><button className="secondary-button" onClick={() => documentsQuery.refetch()}>Thử lại</button></div>
      ) : filtered.length ? (
        <div className="document-grid">
          {filtered.map((document) => (
            <article className="document-card" key={document.documentId}>
              <div className="document-card-top"><span className="document-file-icon"><File size={21} /></span><span className="document-visibility">{document.shared ? <UsersThree size={14} /> : <LockSimple size={14} />}{document.shared ? "Dùng chung" : "Riêng tư"}</span></div>
              <div><h2>{document.title}</h2><p>{document.description || document.fileName || "Nguồn bài tập đã phân loại"}</p></div>
              <div className="taxonomy-path"><span>{document.subject}</span><span>{document.topic}</span><span>{document.concept || "Tài liệu chung"}</span></div>
              {document.indexStatus === "needs_manual" && <p className="document-index-help">Tệp nguồn không đọc được. Xóa và tải lại tệp để dùng cho Copilot.</p>}
              <footer><span>{documentIndexLabel(document.indexStatus)} · {formatDate(document.createdAt)}</span><div>{document.previewUrl && <a className="icon-button" href={document.previewUrl} target="_blank" rel="noreferrer" aria-label="Xem tài liệu"><ArrowSquareOut size={16} /></a>}{document.indexStatus === "failed" && <button className="icon-button" disabled={retryIndex.isPending} onClick={() => retryIndex.mutate(document.documentId)} aria-label="Lập chỉ mục lại"><ArrowsClockwise size={16} /></button>}<button className="icon-button" onClick={() => { if (window.confirm("Xóa tài liệu khỏi kho?")) remove.mutate(document.documentId); }} aria-label="Xóa tài liệu"><Trash size={16} /></button></div></footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel"><FolderOpen size={30} /><h2>{query ? "Không tìm thấy tài liệu" : "Kho tài liệu đang trống"}</h2><p>{query ? "Thử từ khóa hoặc taxonomy khác." : "Tải nguồn đầu tiên để Copilot có bài tập thật để tìm kiếm."}</p>{!query && <button className="primary-button" onClick={() => setUploadOpen(true)}><UploadSimple size={16} /> Tải tài liệu</button>}</div>
      )}
    </section>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Gần đây" : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function documentIndexLabel(status: string) {
  if (status === "ready") return "Sẵn sàng dùng";
  if (status === "needs_manual") return "Cần thay tệp nguồn";
  if (status === "failed") return "Chưa thể lập chỉ mục";
  return "Đang lập chỉ mục";
}
