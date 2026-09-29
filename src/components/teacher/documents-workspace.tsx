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
import { getApiErrorMessage, teacherApi, type MarkerSourceExercise } from "@/lib/api-client";
import { MathContent } from "@/components/shared/math-content";

const acceptedExtensions = ["pdf", "docx", "md", "txt"];

export function DocumentsWorkspace() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [concept, setConcept] = useState("");
  const [shared, setShared] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviewDocumentId, setReviewDocumentId] = useState("");
  const [reviewExerciseId, setReviewExerciseId] = useState("");
  const [processedSourceBatches, setProcessedSourceBatches] = useState(0);
  const [bankConcept, setBankConcept] = useState("");
  const [bankSkillId, setBankSkillId] = useState("");
  const [bankRole, setBankRole] = useState<"reinforcement" | "challenge" | "exploration" | "extension">("reinforcement");

  const curriculumQuery = useQuery({ queryKey: ["curriculum"], queryFn: teacherApi.curriculum, staleTime: 5 * 60 * 1000 });
  const catalogVersions = Array.from(new Set((curriculumQuery.data || []).map((item) => item.taxonomy_version)));
  const catalogVersion = catalogVersions.length === 1 ? catalogVersions[0] : undefined;
  const documentsQuery = useQuery({ queryKey: ["teacher", "documents", catalogVersion], queryFn: () => teacherApi.documents(catalogVersion as number), enabled: Boolean(catalogVersion), refetchInterval: (query) => query.state.data?.some((item) =>
    (item.extractionJobId && ["pending_dispatch", "dispatching", "queued", "running"].includes(item.extractionStatus || "")) ||
    ((item.ingestionMode !== "marker" || item.extractionStatus === "succeeded") &&
      (item.indexStatus === "pending" || item.indexStatus === "indexing"))
  ) ? 5000 : false });
  const sourcesQuery = useQuery({
    queryKey: ["teacher", "marker-sources", reviewDocumentId, catalogVersion],
    queryFn: () => teacherApi.markerSourceExercises(reviewDocumentId, catalogVersion as number),
    enabled: Boolean(reviewDocumentId && catalogVersion),
  });
  const selectedSource = sourcesQuery.data?.find((item) => item.exercise_id === reviewExerciseId);
  const reviewDocument = documentsQuery.data?.find((item) => item.documentId === reviewDocumentId);
  const reviewConcepts = curriculumQuery.data?.find((item) => item.value === reviewDocument?.subject)
    ?.topics.find((item) => item.value === reviewDocument?.topic)?.concepts || [];
  const bankSkillsQuery = useQuery({
    queryKey: ["teacher", "marker-bank-skills", reviewDocument?.subject, reviewDocument?.topic, bankConcept, catalogVersion],
    queryFn: () => teacherApi.curriculumSkills(reviewDocument!.subject, reviewDocument!.topic, bankConcept, catalogVersion as number),
    enabled: Boolean(reviewDocument && bankConcept && catalogVersion),
  });
  const sourceAssetsQuery = useQuery({
    queryKey: ["teacher", "marker-source-assets", reviewDocumentId, reviewExerciseId, catalogVersion],
    queryFn: async () => Promise.all((selectedSource?.assets || []).map(async (asset) => ({
      asset,
      access: await teacherApi.markerSourceAssetAccess(
        reviewDocumentId, reviewExerciseId, asset.asset_id, catalogVersion as number,
        selectedSource!.content_hash,
      ),
    }))),
    enabled: Boolean(selectedSource && catalogVersion),
    staleTime: 10 * 60 * 1000,
  });

  const topics = useMemo(() => curriculumQuery.data?.find((item) => item.value === subject)?.topics || [], [curriculumQuery.data, subject]);
  const concepts = useMemo(() => topics.find((item) => item.value === topic)?.concepts || [], [topics, topic]);
  const taxonomyVersion = curriculumQuery.data?.find((item) => item.value === subject)?.taxonomy_version;
  const canUpload = Boolean(files.length && (files.length > 1 || title.trim()) && subject && topic && taxonomyVersion);
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
    mutationFn: async (selectedFiles: File[]) => {
      const results = await Promise.all(selectedFiles.map(async (selectedFile) => {
        const body = new FormData();
        body.append("file", selectedFile);
        body.append("title", selectedFiles.length === 1 ? title.trim() : fileTitle(selectedFile));
        body.append("description", description.trim());
        body.append("subject", subject);
        body.append("topic", topic);
        body.append("taxonomyVersion", String(taxonomyVersion));
        if (concept) body.append("concept", concept);
        body.append("shared", shared ? "true" : "false");
        try {
          const result = await teacherApi.uploadDocument(body);
          return { file: selectedFile, result } as const;
        } catch (uploadError) {
          return { file: selectedFile, error: getApiErrorMessage(uploadError, "Không thể tải lên.") } as const;
        }
      }));
      return {
        uploaded: results.filter((item) => "result" in item),
        failed: results.filter((item) => "error" in item),
      };
    },
    onSuccess: async ({ uploaded, failed }) => {
      setError("");
      setFiles(failed.map((item) => item.file));
      const extracting = uploaded.filter((item) => "result" in item && item.result?.extractionJobId).length;
      setSuccess(uploaded.length
        ? `Đã lưu ${uploaded.length} tài liệu; ${extracting} đã vào hàng đợi Marker.` : "");
      if (uploaded.length > extracting) {
        setError(`${uploaded.length - extracting} tài liệu đã lưu nhưng chưa xếp hàng. Bấm “Xếp hàng trích xuất” tại thẻ tài liệu để thử lại.`);
      }
      if (failed.length) setError(`${failed.length} tệp chưa tải được: ${failed.map((item) => `${item.file.name} (${item.error})`).join("; ")}`);
      if (!failed.length) {
        setTitle("");
        setDescription("");
        setSubject("");
        setTopic("");
        setConcept("");
        setShared(true);
      } else if (failed.length === 1) {
        setTitle(fileTitle(failed[0].file));
      }
      await queryClient.invalidateQueries({ queryKey: ["teacher", "documents"] });
    },
    onError: (uploadError) => setError(getApiErrorMessage(uploadError, "Không thể tải tài liệu lên.")),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) => teacherApi.deleteDocument(documentId, catalogVersion as number),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher", "documents"] }),
  });
  const retryIndex = useMutation({
    mutationFn: (documentId: string) => teacherApi.retryDocumentIndex(documentId, catalogVersion as number),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher", "documents"] }),
    onError: (retryError) => setError(getApiErrorMessage(retryError, "Không thể lập chỉ mục lại tài liệu.")),
  });
  const extractMarker = useMutation({
    mutationFn: (documentId: string) => teacherApi.extractStoredDocumentWithMarker(documentId, catalogVersion as number),
    onSuccess: async () => {
      setError("");
      setSuccess("Đã xếp tài liệu vào hàng đợi trích xuất Marker. Bạn có thể rời trang và quay lại xem trạng thái.");
      await queryClient.invalidateQueries({ queryKey: ["teacher", "documents"] });
    },
    onError: (extractError) => setError(getApiErrorMessage(extractError, "Chưa thể trích xuất tài liệu bằng Marker.")),
  });
  const processSources = useMutation({
    mutationFn: async (documentId: string) => {
      // Each server request processes at most two groups. The durable run keeps
      // checkpoints, so leaving this page only pauses the remaining batches.
      setProcessedSourceBatches(0);
      for (let batch = 0; batch < 32; batch += 1) {
        const result = await teacherApi.processMarkerSourceExercises(
          documentId, catalogVersion as number,
        );
        setProcessedSourceBatches(batch + 1);
        if (result.failed_document_ids.includes(documentId)) {
          throw new Error("Không thể xử lý bài nguồn. Kiểm tra ngân sách hoặc bản trích xuất.");
        }
        if (!result.batch_yielded_document_ids.includes(documentId)) {
          return result;
        }
      }
      throw new Error("Đã dừng sau 32 đợt xử lý. Có thể bấm tiếp để nối từ checkpoint.");
    },
    onSuccess: async (result, documentId) => {
      setError("");
      const coverage = result.coverage_by_document?.[documentId];
      setSuccess(result.waiting_document_ids.length
        ? "Một phiên khác đang xử lý tài liệu. Hãy thử lại sau."
        : `Đã lưu ${result.sources.length} bài nguồn.` +
          (coverage ? ` ${coverage.groups_needs_review} nhóm chưa cấu trúc, ${coverage.groups_unsupported_shape} dạng chưa hỗ trợ, ${coverage.unresolved_blocks} phần nội dung chưa gắn bài.` : "") +
          " Bài rõ nguồn được đối chiếu tự động; bài có cảnh báo vẫn cần xử lý.");
      await queryClient.invalidateQueries({ queryKey: ["teacher", "marker-sources", documentId] });
    },
    onError: (processingError) => setError(getApiErrorMessage(processingError, "Chưa xử lý được bài nguồn.")),
  });
  const prepareSource = useMutation({
    mutationFn: (source: MarkerSourceExercise) => teacherApi.prepareMarkerSourceExercise(
      reviewDocumentId, source.exercise_id, catalogVersion as number,
    ),
    onError: (prepareError) => setError(getApiErrorMessage(prepareError, "Không thể chuẩn bị lời giải từ hình.")),
  });
  const materializeSource = useMutation({
    mutationFn: (source: MarkerSourceExercise) => teacherApi.materializeMarkerSourceExercise(
      reviewDocumentId, source.exercise_id, catalogVersion as number,
      source.content_hash, bankSkillId, bankRole,
    ),
    onSuccess: (_problem, source) => { setError(""); setSuccess(source.assets.length
      ? "Đã lưu bài gốc, hình và lời giải đã kiểm tra vào kho bài tập."
      : "Đã lưu bài gốc và lời giải đã kiểm tra vào kho bài tập."); },
    onError: (materializeError) => setError(getApiErrorMessage(materializeError, "Chưa lưu được bài vào kho.")),
  });

  function chooseFiles(nextFiles: File[]) {
    setError("");
    setSuccess("");
    if (!nextFiles.length) return;
    const rejected: string[] = [];
    const valid = nextFiles.filter((next) => {
      const extension = next.name.split(".").pop()?.toLowerCase() || "";
      if (!acceptedExtensions.includes(extension)) {
        rejected.push(`${next.name}: định dạng không được hỗ trợ`);
        return false;
      }
      if (next.size > 10 * 1024 * 1024) {
        rejected.push(`${next.name}: vượt quá 10 MB`);
        return false;
      }
      return true;
    });
    const combined = deduplicateFiles([...files, ...valid]);
    setFiles(combined);
    if (combined.length === 1) setTitle((current) => current || fileTitle(combined[0]));
    if (combined.length > 1) setTitle("");
    if (rejected.length) setError(`Đã bỏ qua ${rejected.join("; ")}.`);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    chooseFiles(Array.from(event.dataTransfer.files || []));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!files.length || (files.length === 1 && !title.trim()) || !subject || !topic || !taxonomyVersion) {
      setError("Chọn đủ môn, chủ đề và ít nhất một tệp trước khi tải lên.");
      return;
    }
    upload.mutate(files);
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

      {!uploadOpen && error && <p className="inline-error" role="alert">{error}</p>}
      {!uploadOpen && success && <p className="success-message" role="status"><Check size={15} />{success}</p>}

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
            {files.length <= 1 && <div className="form-field col-span-full">
              <label htmlFor="document-title">Tên tài liệu</label>
              <input id="document-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Bộ bài tập Đơn thức" required />
            </div>}
            {files.length > 1 && <p className="upload-batch-note col-span-full">Mỗi tài liệu sẽ dùng tên tệp làm tên trong kho. Taxonomy và ghi chú bên dưới áp dụng cho cả {files.length} tệp.</p>}
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
              <input ref={fileInput} type="file" multiple hidden accept=".pdf,.docx,.md,.txt" onChange={(event) => { chooseFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }} />
              {files.length ? <><FilePdf size={24} /><span><strong>Đã chọn {files.length} tệp</strong><small>Chọn thêm hoặc kéo thêm tệp vào đây</small></span></> : <><UploadSimple size={24} /><span><strong>Kéo nhiều tệp vào đây hoặc chọn từ máy</strong><small>PDF, DOCX, MD, TXT, mỗi tệp tối đa 10 MB</small></span></>}
            </button>
            {files.length > 0 && <div className="upload-file-list col-span-full">{files.map((selectedFile) => <div key={fileKey(selectedFile)}><span><File size={16} /><strong>{selectedFile.name}</strong><small>{formatBytes(selectedFile.size)}</small></span><button type="button" className="icon-button" aria-label={`Bỏ ${selectedFile.name}`} disabled={upload.isPending} onClick={() => { const remaining = files.filter((item) => fileKey(item) !== fileKey(selectedFile)); setFiles(remaining); setTitle(remaining.length === 1 ? fileTitle(remaining[0]) : ""); }}><X size={15} /></button></div>)}</div>}
            <label className="share-toggle col-span-full">
              <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
              <span className="toggle-track"><span /></span>
              <span>{shared ? <UsersThree size={18} /> : <LockSimple size={18} />}<strong>{shared ? "Chia sẻ với kho chung" : "Chỉ mình tôi"}</strong><small>{shared ? "Giáo viên khác có thể dùng bài tập từ tài liệu này." : "Tài liệu chỉ xuất hiện trong kết quả của bạn."}</small></span>
            </label>
            <div className="col-span-full flex justify-end">
              <button className="primary-button" type="submit" disabled={upload.isPending || !canUpload} title={canUpload ? undefined : "Chọn môn, chủ đề và ít nhất một tệp trước khi lưu"}>{upload.isPending ? `Đang lưu ${files.length} tài liệu` : files.length > 1 ? `Lưu ${files.length} tài liệu` : "Lưu vào kho"}</button>
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
              {document.indexStatus === "needs_manual" && <p className="document-index-help">{documentIndexHelp(document.indexSummary)}</p>}
              {document.extractionJobId && document.extractionStatus === "failed" && <p className="document-index-help">Trích xuất thất bại{document.extractionErrorCode ? ` (${document.extractionErrorCode})` : ""}. Tài liệu chưa sẵn sàng để dùng trong bài học.</p>}
              {document.extractionJobId && document.extractionStatus === "budget_exhausted" && <p className="document-index-help">Đã chạm ngân sách trích xuất tháng này. Tài liệu đang chờ xử lý.</p>}
              {Boolean(document.indexSummary?.unreadable_objects) && <p className="document-index-help">Có {document.indexSummary?.unreadable_objects} công thức hoặc hình chưa đọc được. Vẫn có thể dùng cấu trúc nhận diện được để soạn bài mới; bài mới không phải bản trích nguyên.</p>}
              {(!document.extractionJobId || document.extractionStatus === "failed" || document.extractionStatus === "budget_exhausted") && (
                <button type="button" className="document-marker-action" disabled={extractMarker.isPending} onClick={() => extractMarker.mutate(document.documentId)}>
                  <ArrowsClockwise size={15} /> {document.extractionJobId ? "Thử lại trích xuất Marker" : "Xếp hàng trích xuất Marker"}
                </button>
              )}
              {document.ingestionMode === "marker" && document.extractionStatus === "succeeded" && (
                <button type="button" className="document-marker-action" onClick={() => {
                  setReviewDocumentId(document.documentId);
                  setReviewExerciseId("");
                  prepareSource.reset();
                  materializeSource.reset();
                  setBankConcept(document.concept || "");
                  setBankSkillId("");
                }}>Xem bài và hình đã xử lý</button>
              )}
              <footer><span>{document.ingestionMode === "marker" ? `${document.extractionJobId ? documentExtractionLabel(document.extractionStatus) : "Chưa xếp hàng trích xuất"} · Chỉ mục: ${documentIndexLabel(document.indexStatus)}` : documentIndexLabel(document.indexStatus)} · {formatDate(document.createdAt)}</span><div>{document.previewUrl && <a className="icon-button" href={document.previewUrl} target="_blank" rel="noreferrer" aria-label="Xem tài liệu"><ArrowSquareOut size={16} /></a>}{(document.ingestionMode !== "marker" || document.extractionStatus === "succeeded") && (document.indexStatus === "failed" || document.indexStatus === "needs_manual") && <button className="icon-button" disabled={retryIndex.isPending} onClick={() => retryIndex.mutate(document.documentId)} aria-label="Lập chỉ mục lại"><ArrowsClockwise size={16} /></button>}<button className="icon-button" onClick={() => { if (window.confirm("Xóa tài liệu khỏi kho?")) remove.mutate(document.documentId); }} aria-label="Xóa tài liệu"><Trash size={16} /></button></div></footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel"><FolderOpen size={30} /><h2>{query ? "Không tìm thấy tài liệu" : "Kho tài liệu đang trống"}</h2><p>{query ? "Thử từ khóa hoặc taxonomy khác." : "Tải nguồn đầu tiên để Copilot có bài tập thật để tìm kiếm."}</p>{!query && <button className="primary-button" onClick={() => setUploadOpen(true)}><UploadSimple size={16} /> Tải tài liệu</button>}</div>
      )}

      {reviewDocumentId && <section className="upload-panel" aria-label="Duyệt bài trích xuất">
        <div className="upload-copy">
          <h2>Bài trích xuất từ Marker</h2>
          <p>Đề và hình được hệ thống đối chiếu với bản trích xuất. Bài chưa rõ nguồn sẽ không được dùng để soạn lesson.</p>
          <button type="button" className="text-button" onClick={() => { setReviewDocumentId(""); setReviewExerciseId(""); }}>Đóng</button>
        </div>
        {sourcesQuery.isLoading && <p>Đang tải bài nguồn…</p>}
        {sourcesQuery.isError && <p className="inline-error">{getApiErrorMessage(sourcesQuery.error, "Không tải được bài nguồn.")}</p>}
        {sourcesQuery.data?.length === 0 && <p>Chưa có bài nguồn được cấu trúc từ bản trích xuất.</p>}
        <button type="button" className="secondary-button" disabled={processSources.isPending || !catalogVersion} onClick={() => processSources.mutate(reviewDocumentId)}>
          {processSources.isPending ? `Đang xử lý bài nguồn · ${processedSourceBatches} đợt xong` : sourcesQuery.data?.length ? "Tiếp tục xử lý nguồn" : "Xử lý bài nguồn"}
        </button>
        {Boolean(sourcesQuery.data?.length) && <div className="flex flex-wrap gap-2">
          {sourcesQuery.data?.map((source, index) => <button key={source.exercise_id} type="button" className="secondary-button" onClick={() => { setReviewExerciseId(source.exercise_id); prepareSource.reset(); materializeSource.reset(); }} aria-pressed={reviewExerciseId === source.exercise_id}>
            {source.source_label || `Bài ${index + 1}`} · Vị trí {source.source_order + 1} · {source.fidelity_status === "verified" ? "Nguồn đã đối chiếu" : "Nguồn có cảnh báo"}
          </button>)}
        </div>}
        {selectedSource && <article className="document-card">
          <h3>{selectedSource.source_label || "Bài nguồn"}</h3>
          {selectedSource.task_shape !== "single_stem" && <p className="document-index-help">Bài {selectedSource.task_shape === "multiple_choice" ? "trắc nghiệm" : selectedSource.task_shape === "multi_part" ? "nhiều ý" : "trộn nhiều ý và lựa chọn"} đang chờ bộ kiểm tra ranh giới câu hỏi. Đề gốc được giữ nguyên để bạn xem; bài này chưa được đưa vào lesson.</p>}
          <MathContent>{selectedSource.stem}</MathContent>
          {sourceAssetsQuery.isLoading && <p>Đang tải hình…</p>}
          {sourceAssetsQuery.isError && <p className="inline-error">Không tải được hình. <button type="button" className="text-button" onClick={() => sourceAssetsQuery.refetch()}>Thử lại</button></p>}
          {sourceAssetsQuery.data?.map(({ asset, access }) => <figure key={asset.asset_id}>
            {/* Owner-scoped signed URLs must load directly, without an image proxy. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={access.access_url} alt={`Hình ${asset.order + 1} của ${selectedSource.source_label || "bài nguồn"}`} className="max-h-80 max-w-full object-contain" onError={() => setError("Chưa tải được hình nguồn. Hãy thử tải lại hình.")} />
            <figcaption>{asset.audience === "private_solution" ? "Hình lời giải, chỉ giáo viên thấy" : "Hình đề bài"} · {asset.target}</figcaption>
          </figure>)}
          {Boolean(sourceAssetsQuery.data?.length) && <button type="button" className="text-button" onClick={() => sourceAssetsQuery.refetch()}>Tải lại hình</button>}
          {selectedSource.source_answer?.map((answer, index) => <details key={`answer-${index}`}><summary>Đáp án trong tài liệu</summary><MathContent answer>{answer.content}</MathContent></details>)}
          {selectedSource.source_solution?.map((solution, index) => <details key={`solution-${index}`}><summary>Lời giải trong tài liệu</summary><MathContent>{solution.content}</MathContent></details>)}
          {selectedSource.fidelity_status !== "verified" && <p className="document-index-help">Bài này chưa đủ tin cậy để dùng tự động: {selectedSource.issues.join(", ") || "chưa xác định được vị trí đề và hình"}.</p>}
          {selectedSource.fidelity_status === "verified" && <button type="button" className="primary-button" disabled={prepareSource.isPending} onClick={() => prepareSource.mutate(selectedSource)}>{prepareSource.isPending ? selectedSource.assets.length ? "Đang đọc hình và kiểm tra lời giải…" : "Đang kiểm tra lời giải…" : "Chuẩn bị lời giải một lần"}</button>}
          {prepareSource.data?.source_exercise_id === selectedSource.exercise_id && <div>
            <h4>Lời giải đã chuẩn bị</h4>
            <p>Đáp án: <strong>{prepareSource.data.final_answer}</strong></p>
            <MathContent>{prepareSource.data.solution}</MathContent>
            <ul>{prepareSource.data.visual_facts.map((fact, index) => <li key={`${fact.asset_id}:${index}`}>{fact.fact}</li>)}</ul>
            <div className="upload-fields">
              <label className="form-field"><span>Khái niệm của bài</span><select className="select" value={bankConcept} onChange={(event) => { setBankConcept(event.target.value); setBankSkillId(""); }}><option value="">Chọn khái niệm</option>{reviewConcepts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="form-field"><span>Kỹ năng được đánh giá</span><select className="select" value={bankSkillId} onChange={(event) => setBankSkillId(event.target.value)} disabled={!bankConcept || bankSkillsQuery.isLoading}><option value="">Chọn kỹ năng</option>{(bankSkillsQuery.data || []).map((item) => <option key={item.skill_id} value={item.skill_id}>{item.label_vi}</option>)}</select></label>
              <label className="form-field"><span>Vai trò trong arc</span><select className="select" value={bankRole} onChange={(event) => setBankRole(event.target.value as typeof bankRole)}><option value="reinforcement">P1 · Củng cố</option><option value="challenge">P2 · Thử thách</option><option value="exploration">P3 · Khám phá</option><option value="extension">P4 · Mở rộng</option></select></label>
            </div>
            {bankSkillsQuery.isError && <p className="inline-error">Không tải được kỹ năng của khái niệm.</p>}
            <button type="button" className="primary-button" disabled={!bankSkillId || materializeSource.isPending} onClick={() => materializeSource.mutate(selectedSource)}>{materializeSource.isPending ? "Đang lưu bài…" : "Lưu bài đã kiểm tra vào kho"}</button>
            {materializeSource.data && <p role="status">Mã bài trong kho: {materializeSource.data.bank_problem_id}</p>}
          </div>}
        </article>}
      </section>}
    </section>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function fileTitle(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function deduplicateFiles(files: File[]) {
  return Array.from(new Map(files.map((file) => [fileKey(file), file])).values());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Gần đây" : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function documentIndexLabel(status: string) {
  if (status === "ready") return "Sẵn sàng dùng";
  if (status === "needs_manual") return "Cần kiểm tra tài liệu";
  if (status === "failed") return "Chưa thể lập chỉ mục";
  return "Đang lập chỉ mục";
}

function documentExtractionLabel(status: string | null | undefined) {
  if (status === "succeeded") return "Đã trích xuất";
  if (status === "partial") return "Trích xuất một phần · Cần kiểm tra";
  if (status === "failed") return "Trích xuất thất bại";
  if (status === "budget_exhausted") return "Đang chờ ngân sách";
  if (status === "cancelled") return "Đã hủy trích xuất";
  if (status === "running") return "Đang trích xuất";
  return "Đang chờ trích xuất";
}

function documentIndexHelp(summary?: Record<string, number>) {
  if (summary?.requires_reindex) return "Bộ đọc tài liệu đã được cập nhật. Bấm Lập chỉ mục lại để dùng nguồn này.";
  if (summary?.source_needs_review) return `${summary.source_needs_review} bài hoặc hình chưa xác định được vị trí an toàn; các bài rõ ràng được lập chỉ mục riêng.`;
  const total = Number(summary?.total || 0);
  if (total > 0) {
    return `Đã đọc được ${total} mục, nhưng chưa gắn đủ chắc vào kỹ năng. Hãy kiểm tra taxonomy hoặc thử lập chỉ mục lại.`;
  }
  return "Không tìm thấy nội dung chữ có thể dùng. Hãy kiểm tra tệp rồi tải lại.";
}
