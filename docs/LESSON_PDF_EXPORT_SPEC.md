# Lesson Full-content PDF Export

Status: Founder-approved; amended for two PDF variants on 2026-09-09
Date: 2026-09-08
Owners: `new_frontend`, `edtech-backend`, `ai-service`
Primary surface: Teacher lesson Draft Review and Teacher Class view

## 2026-09-09 amendment - student and teacher copies

This amendment supersedes every earlier singular-artifact statement in this document.

- The export now has two separate teacher-accessible artifacts for the same lesson revision.
- `Bản học sinh` contains the original student-safe Knowledge, checkpoints, and 12 shuffled Mastery problems with no answers or solutions.
- `Bản giáo viên` preserves the same content and Mastery order, then adds canonical answers and worked solutions where available.
- Neither artifact is exposed through the student roadmap/API. The labels describe document purpose, not authorization.
- Inline mathematics must remain in the surrounding sentence. Only explicitly display-delimited mathematics may occupy its own line.
- Student render contract v2 intentionally invalidates/replaces the visually broken v1 artifact for lookup; it does not overwrite the old MinIO object.

## 1. Decision

D-Friend will let a teacher export one read-only PDF artifact from a lesson draft. The PDF is designed as the printable lesson material used outside the D-Friend student experience during the pilot.

The exported document contains exactly these three blocks:

1. all Knowledge content in authored order;
2. all Knowledge checkpoints in authored order;
3. all Mastery problems resolved by the publishable revision, in one deterministic shuffled order.

Exporting does not ask the teacher to choose a control class or any other class. The PDF belongs to the lesson content revision, not to a class. It is stored in MinIO and becomes visible in the Teacher Class view wherever that exact lesson revision is already present through the normal lesson-to-class relationship.

The founder explicitly confirmed implementation after accepting this scope. Deployment and live-environment acceptance remain separate steps.

## 2. Product goal

Give the teacher one stable file containing the complete generated lesson content and exercises so it can be opened, downloaded, printed, or shared outside D-Friend.

The MVP optimizes for:

- one-click export from Draft Review;
- exact, revision-safe content;
- reliable Vietnamese text and mathematics rendering;
- one durable MinIO object rather than duplicate files per class;
- simple retrieval from the associated lesson in Teacher Class view.

## 3. Non-goals

The MVP does not include:

- selecting a class during export;
- treatment/control assignment or pilot-group management;
- answer fields, student name fields, scoring fields, or completion tracking;
- answer keys or worked solutions;
- multiple PDF variants or teacher-selected shuffle seeds;
- editing or rearranging PDF sections in the UI;
- student access to the PDF;
- publishing or assigning a D-Friend lesson as a side effect of export;
- replacing the existing digital Knowledge and Mastery learning flow.

## 4. Teacher experience

### 4.1 Draft Review

Add a secondary action named `Xuất PDF` to the Draft Review action bar.

The action has the following states:

- `Xuất PDF`: no ready artifact exists for the visible revision;
- `Đang tạo PDF`: generation is in progress and duplicate clicks are disabled;
- `Mở PDF`: the artifact for the visible revision is ready;
- `Thử lại`: the latest generation attempt failed;
- `Xuất PDF mới`: the draft revision is newer than the last ready artifact.

The export action must not open a class picker. It exports the revision currently visible on the Review page.

PDF export is a separate action and never publishes the lesson. It uses the same canonical content-readiness gate as lesson publishing: the current revision must be teacher-approved and contain at least one safe complete arc. Class selection, deadline, and assignment fields are not PDF conditions because the artifact remains lesson-scoped.

### 4.2 Teacher Class view

When a teacher selects a lesson in the Class `Lộ trình` view, the lesson detail shows a `Tài liệu bài học` section if a ready PDF artifact matches the lesson's exact AI lesson ID and content revision.

The section shows:

- the PDF filename;
- `PDF`;
- the content revision;
- creation time;
- an `Mở PDF` action;
- a `Tải xuống` action.

The same lesson-level artifact may appear in more than one Teacher Class view. The Class view does not copy the MinIO object and does not create a class-specific artifact.

If the lesson has no matching ready artifact, the Class view does not fabricate a link. The MVP may omit the section entirely; an empty-state prompt is not required.

The PDF does not create or display student completion, deadline, submission, or score metrics.

## 5. Content contract

### 5.1 Knowledge

Include every normalized Knowledge section from the canonical draft, preserving authored order. Render section titles, Markdown, lists, tables where supported, and display/inline mathematics.

### 5.2 Checkpoints

Include every normalized Knowledge checkpoint, preserving authored order. Each checkpoint receives a sequential visible number inside the checkpoint block.

Include:

- question text;
- choices for multiple-choice and true/false questions;
- any student-visible attachment already supported by the lesson contract.

Exclude:

- correct answers;
- worked solutions or explanations;
- quality-review metadata;
- provenance and internal IDs.

### 5.3 Mastery

Export is eligible only when the canonical publish-check marks the exact revision publishable. The PDF includes every distinct Mastery problem currently resolved by the persisted blueprint; the ideal pool is 12, but a publishable partial pool is accepted.

Do not select only the publishable arc. Include every resolved problem from complete and partial arcs, while omitting empty slots.

Before shuffling, construct a stable source list from persisted blueprint problem ownership and stable problem IDs. Do not depend on frontend array order or display-only IDs. Apply a deterministic Fisher-Yates shuffle using:

`SHA-256(ai_lesson_id + ":" + content_revision + ":lesson-full-content-pdf-v1")`

The resulting order is stable for the same lesson revision and renderer contract. Repeated exports of the same unchanged revision must not silently change question order.

Each Mastery problem receives a sequential visible number inside the Mastery block. Include the question and student-visible choices. Exclude:

- final answers;
- solutions and internal reasoning policies;
- arc IDs and difficulty tiers;
- P1-P4 positions and role labels;
- skill IDs, bank IDs, slot IDs, provenance, and quality metadata.

### 5.4 Document chrome

The PDF includes:

- lesson title;
- the three section headings;
- page numbers;
- a small content revision marker in the footer.

It does not include student answer areas, student identity fields, a teacher-only appendix, or D-Friend runtime instructions.

## 6. Eligibility and revision rules

The request carries `expectedRevision`. NestJS and AI-service must fail closed if the visible revision is stale.

PDF generation is blocked when:

- canonical publish-check rejects the exact revision;
- Knowledge content is unavailable;
- the checkpoint collection cannot be normalized safely;
- no Mastery problem resolves from the blueprint;
- resolved Mastery IDs are duplicated or ambiguous;
- a problem marked `Cần thay` is still unresolved in the current Review state;
- MinIO is unavailable.

The MVP introduces no approval state beyond the existing publish gate. The artifact is a snapshot of the requested revision. A later regeneration creates a new lesson revision and therefore requires review approval and a new PDF artifact.

A ready artifact is immutable. A new revision never overwrites or mutates the previous revision's artifact. The Class view returns only the artifact whose `content_revision` matches the lesson publication/content item being viewed.

## 7. Ownership and architecture

### 7.1 AI-service

AI-service remains the canonical owner of authored lesson content in `teacher_lessons`. It provides the exact revision, Knowledge, checkpoints, Mastery blueprint, and Mastery problem payload required for export.

AI-service does not store the PDF and does not expose MinIO URLs.

### 7.2 NestJS

NestJS owns:

- teacher authentication and authorization;
- exact-revision retrieval from AI-service;
- export eligibility validation;
- PDF rendering orchestration;
- MinIO upload and durable object-key handling;
- artifact metadata and generation status;
- resolving a fresh signed URL for an authorized teacher;
- enriching the Teacher Class roadmap/detail response with a matching artifact.

NestJS must not copy authored lesson content into a second mutable source of truth. The artifact is a derived immutable output.

### 7.3 Frontend

The frontend:

- starts generation with the visible lesson ID and revision;
- displays generation state and errors;
- opens or downloads a server-authorized signed URL;
- renders artifact metadata in the Teacher Class lesson detail;
- never builds the PDF in the browser;
- never reads MinIO credentials or persists a signed URL.

### 7.4 Object storage

MinIO stores the durable PDF object. Database records store only the bucket-relative object key and metadata. Presigned URLs are short-lived browser responses and are never persisted.

No local-disk fallback is allowed for this artifact because the Class view may run on another instance and retrieve the file later.

## 8. Persistence model

Add a NestJS/Postgres model conceptually equivalent to:

```text
LessonArtifact
- artifact_id UUID primary key
- ai_lesson_id string
- content_revision integer
- artifact_type enum: FULL_CONTENT_PDF
- render_contract_version string
- status enum: GENERATING | READY | FAILED
- object_key string nullable until READY
- filename string
- content_type string: application/pdf
- size_bytes integer nullable
- checksum_sha256 string nullable
- shuffle_seed string
- source_content_hash string
- failure_code string nullable
- failure_detail string nullable, sanitized
- created_by UUID
- created_at timestamp
- updated_at timestamp
```

Required uniqueness:

`(ai_lesson_id, content_revision, artifact_type, render_contract_version)`

No class foreign key or class-assignment table is created for this MVP.

`LessonPublication` remains the class/audience-scoped delivery record. It is not the PDF storage record. Teacher Class view resolves the artifact through the publication's `ai_lesson_id` and `content_revision`.

## 9. API contract

Exact route naming may follow the existing teacher lesson controller structure, but the behavioral contract is:

### Generate or reuse

```http
POST /teacher/lessons/{aiLessonId}/artifacts/full-content-pdf
Content-Type: application/json

{
  "expectedRevision": 7
}
```

Responses:

- `200 READY` when an identical artifact already exists;
- `202 GENERATING` when generation starts or is already running;
- `409 REVISION_CONFLICT` when the draft revision changed;
- `422 PDF_CONTENT_INCOMPLETE` when the export contract is not satisfied;
- `503 PDF_STORAGE_UNAVAILABLE` when durable storage is unavailable.

### Read status

```http
GET /teacher/lessons/{aiLessonId}/artifacts/full-content-pdf?revision=7
```

Returns metadata and status, never a persisted signed URL.

### Open or download

```http
POST /teacher/lesson-artifacts/{artifactId}/access

{
  "disposition": "inline" | "attachment"
}
```

Returns a short-lived authorized URL. The backend revalidates that the caller owns the lesson or owns a class containing that lesson revision.

### Teacher Class roadmap/detail

The teacher-only lesson item gains an optional field:

```json
{
  "pdfArtifact": {
    "artifactId": "uuid",
    "filename": "lesson-title.pdf",
    "contentRevision": 7,
    "createdAt": "ISO-8601"
  }
}
```

The response must not contain the MinIO object key or an already-expiring URL.

## 10. Rendering and storage pipeline

1. Authenticate the teacher and authorize access to the AI lesson.
2. Fetch the canonical draft using `expectedRevision`.
3. Normalize Knowledge and checkpoints at the established boundary.
4. Run canonical publish-check, then resolve every available Mastery problem by persisted blueprint ownership.
5. Remove private answers, solutions, internal IDs, policies, and metadata from the render model.
6. Calculate `source_content_hash` from the sanitized canonical render model.
7. Reuse the existing READY artifact when revision, render contract, and content hash match.
8. Claim or create one GENERATING record using the uniqueness constraint.
9. Build print HTML with embedded Vietnamese-capable fonts and KaTeX assets.
10. Render the HTML to PDF server-side with an HTML/CSS-capable renderer.
11. Verify a non-empty PDF buffer and calculate its SHA-256 checksum.
12. Upload to a durable key such as:

   `lesson-artifacts/{teacher_id}/{ai_lesson_id}/revision-{revision}/full-content-{content_hash}.pdf`

13. Mark the artifact READY only after MinIO upload succeeds.
14. Return artifact metadata. The browser separately requests short-lived access when opening or downloading.

The renderer choice must support KaTeX, Vietnamese glyphs, CSS page breaks, repeating page numbers, and deterministic output closely enough for snapshot verification. Browser `window.print()` is not an accepted generation path.

## 11. Idempotency and failure behavior

- Concurrent requests for the same lesson revision converge on one artifact record.
- A duplicate request while status is GENERATING returns the current status and does not launch a second renderer.
- A READY artifact with the same source hash is reused.
- A failed upload never becomes READY and never appears in Class view.
- A database failure after object upload triggers bounded orphan cleanup or records the object for later cleanup.
- Error responses expose safe reason codes, not MinIO credentials, raw storage errors, or private lesson answers.
- Retry operates on the same lesson revision. If the revision changed, the teacher must export the new revision instead.

## 12. Security and privacy

- All routes are teacher-only.
- MinIO bucket access remains private.
- Signed URLs are short-lived and generated only after authorization.
- The Teacher Class response never includes answers, solutions, object keys, or permanent public URLs.
- The sanitized render model is the only content passed to the renderer.
- Logs may contain artifact ID, lesson ID, revision, timing, status, checksum, and failure code; they must not contain question answers or full lesson content.

## 13. Observability

Record at minimum:

- `lesson_pdf_export_requested`;
- `lesson_pdf_export_ready`;
- `lesson_pdf_export_failed`;
- `lesson_pdf_opened`;
- `lesson_pdf_downloaded`.

Useful metadata includes teacher ID, AI lesson ID, content revision, artifact ID, generation duration, PDF byte size, page count if available, and failure code. Do not add class identity to the export event because export is not class-scoped. Open/download from a Class view may include the current class ID as navigation context, not artifact ownership.

## 14. Acceptance criteria

### Content

- A fixture with complete content exports every Knowledge section, every checkpoint, and exactly 12 unique Mastery problems.
- Knowledge and checkpoints preserve canonical order.
- Mastery order differs from the stable pre-shuffle order and remains identical across repeated exports of the same revision.
- The PDF contains no final answer, solution, reasoning policy, arc, P-position, skill ID, bank ID, or slot ID.
- Multiple-choice and true/false options remain paired with their original question.

### Revision and identity

- A stale `expectedRevision` fails without creating or changing an artifact.
- Revision 8 never overwrites revision 7.
- Repeated concurrent requests for revision 8 produce one durable artifact.
- A Class view for revision 7 never shows the artifact for revision 8, and vice versa.

### Storage and access

- A successful artifact persists a durable MinIO object key, checksum, content type, and size.
- No presigned URL is stored in Postgres.
- MinIO failure produces FAILED/503 behavior and no Class-view link.
- An unauthorized teacher cannot access the artifact even with its artifact ID.
- Expired signed URLs can be replaced by requesting access again.

### Visual verification

- Vietnamese diacritics render correctly.
- Inline and display mathematics render correctly.
- Long Knowledge sections and problems break across pages without overlapping headers, footers, or adjacent questions.
- Choices remain visually attached to their question.
- Page numbering and revision marker are present.

### UI

- Export requires no class-selection step.
- Export does not publish or assign the lesson.
- Draft Review reflects GENERATING, READY, FAILED, retry, and newer-revision states.
- Teacher Class lesson detail shows only a matching READY artifact and can open/download it.

## 15. Implementation sequence after approval

Implementation must start only after explicit founder confirmation.

1. Confirm the canonical AI draft/export payload and exact 12-problem blueprint resolution.
2. Add the Postgres artifact model and migration.
3. Add durable PDF-object methods to `StorageService`; do not reuse upload methods that return and persist presigned URLs or permit local fallback.
4. Implement NestJS render, idempotency, status, access, and teacher authorization.
5. Extend the teacher roadmap/detail contract with matching artifact metadata.
6. Add Draft Review export states and Class view document actions.
7. Run focused unit/integration tests, frontend typecheck/lint/build, PDF visual fixtures, and a credentialed cross-service MinIO smoke test.

Local tests do not prove deployed MinIO access, browser rendering, cross-instance retrieval, or production font/Chromium availability. Those claims require a live deployed acceptance run.

## 16. Confirmation gate

The founder should explicitly confirm or amend these decisions before implementation:

1. one PDF only, with no answer key or answer fields;
2. no class selector and no class association at export time;
3. all Knowledge, all checkpoints, and exactly 12 shuffled Mastery problems;
4. deterministic shuffle per lesson revision;
5. no extra approval gate beyond content completeness;
6. lesson-level immutable artifact stored in MinIO;
7. Teacher Class view resolves the artifact through exact lesson ID plus content revision;
8. no student access and no publication side effect.
