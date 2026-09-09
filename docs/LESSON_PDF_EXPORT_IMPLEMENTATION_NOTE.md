# Lesson Full-content PDF Export - Implementation Note

Status: Implemented and verified locally; migration/deployment/live MinIO acceptance pending
Started: 2026-09-08
Specification: `docs/LESSON_PDF_EXPORT_SPEC.md`

## 2026-09-09 formatting and teacher-copy update

- Reproduced the reported defect from `Bat-phuong-trinh-bac-nhat-2-an-ban-1.pdf`: every inline MathML token was laid out as a centered block, splitting Vietnamese sentences across many lines and expanding the lesson to 16 pages.
- Added explicit inline KaTeX/MathML CSS while retaining block layout for display-delimited formulas. A new three-page A4 fixture was rendered and visually inspected: inline numbers, variables, and inequalities remain inside their sentences with no clipping or overlap.
- Added a separate `TEACHER_FULL_CONTENT_PDF` artifact and migration. The teacher copy uses the same deterministic Mastery order as the student copy and includes canonical `Đáp án` and `Lời giải` blocks where present.
- The existing `FULL_CONTENT_PDF` remains the student-safe copy. Its render contract is bumped from v1 to v2 so READY v1 files with broken formatting are not silently reused.
- Added teacher-copy generate/status endpoints, frontend API methods, independent Draft Review actions, and two labeled document cards in Teacher Class view.
- Teacher Class selects only student v2 and teacher v1 render contracts for the exact published revision. Student roadmap still does not query or return either artifact.
- Current PDF renderer/artifact tests pass: 2 suites, 12 tests. The Nest production build, frontend targeted ESLint, TypeScript check, and diff checks pass. The full backend suite and live browser/MinIO flow were not rerun for this condition change.
- A real export confirmed that the matrix's missing slot was genuine: the earlier exact-12 artifact gate returned `PDF_MASTERY_INCOMPLETE`. The founder then superseded that gate with the canonical lesson-publish condition. Both PDF endpoints now call AI-service publish-check for the exact revision and reject a non-publishable draft with `PDF_NOT_PUBLISHABLE` plus its blockers.
- Draft Review enables both PDF actions under the same content conditions as Publish: current revision approved, authoritative publish-check passes, at least one complete arc, no unresolved rejection, and no mutation in progress. Class selection, title assignment, and deadline remain Publish-only delivery fields.
- A publishable partial pool now exports every distinct blueprint-resolved Mastery problem and skips empty slots. It does not reduce the document to the single publishable arc; 12 remains the ideal generated pool, not an export blocker.

## Confirmed scope

- Separate `Bản học sinh` and `Bản giáo viên` actions on Teacher Draft Review; no class picker.
- Both PDFs contain all Knowledge, then all checkpoints, then every Mastery problem resolved by the publishable revision in the same order.
- Knowledge and checkpoints preserve authored order.
- Mastery uses one deterministic shuffled order per exact lesson revision.
- The student copy has no answer areas, answer key, worked solutions, or internal blueprint/problem metadata. The private teacher copy adds canonical answers and solutions only.
- Store one artifact per audience/lesson/taxonomy/revision in MinIO and reuse it across Teacher Class views.
- Export has no publish or class-assignment side effect.

## Current repository state at start

All three repositories already contained unrelated/user changes. This implementation must preserve them and stage nothing implicitly.

- `new_frontend`: existing edits in review/authoring styles and API files, plus the approved proposal spec.
- `edtech-backend`: existing edits in AI teacher/review files and tests, plus an untracked latency ledger.
- `ai-service`: substantial existing generation, curriculum, prompt, model, test, and implementation-note changes.

## Boundary audit

- Canonical authored content remains AI-service `teacher_lessons`, available through `AiTeacherService.getLessonDraft()`.
- NestJS already owns teacher authorization, `LessonPublication`, Postgres, and MinIO access.
- Existing `StorageService.uploadFile()` is unsuitable because it returns a presigned URL and permits local fallback.
- Teacher Class roadmap currently resolves only published `LessonPublication` records and returns `lessonId` but not `contentRevision` or PDF artifact metadata.
- Backend had no server-side HTML/PDF renderer dependency at start.

## Implementation ledger

### 2026-09-08 - dependency boundary

- Added pinned runtime dependencies for HTML/KaTeX/Chromium PDF rendering: `katex@0.16.22`, `marked@9.1.6`, and `puppeteer-core@24.16.0`. `marked@16.2.1` was rejected because its ESM-only entry path was incompatible with the current Jest VM configuration; v9 supplies the required CommonJS export without a test-only runtime fork.
- Planned runtime contract: use installed Chromium through `PUPPETEER_EXECUTABLE_PATH`; Docker must install Chromium explicitly.
- Renderer remains injectable/mockable so unit tests do not require a browser process.

### 2026-09-08 - backend artifact lifecycle

- Added the Postgres `LessonArtifact` record and migration, unique by lesson, content revision, artifact type, and render contract version.
- Added teacher-only generate, status, and short-lived access endpoints under `/api/teacher/lessons`.
- The service reads the canonical AI draft through the existing `AiTeacherService.getLessonDraft()` ownership boundary; no AI-service write or new contract was required.
- The sanitized render model contains only the lesson title/revision, Knowledge content, checkpoint question/choices, and Mastery question/choices. Answers, solutions, IDs, blueprint roles, provenance, and policies are excluded before rendering.
- Mastery resolution requires exactly 12 distinct blueprint-owned problem IDs. The stable source list is shuffled with the specified SHA-256 seed and seeded Fisher-Yates implementation.
- READY artifacts are idempotently reused. FAILED artifacts can be retried, and a GENERATING claim older than five minutes can be reclaimed after a crashed process.
- Added strict artifact storage methods: MinIO is mandatory, the database stores only the private object key, and every open/download action requests a new 15-minute signed URL.
- A failed database update after upload attempts bounded object cleanup; a failed render/upload remains FAILED and never appears in Class view.

### 2026-09-08 - renderer and runtime

- Added an isolated HTML/CSS renderer using `puppeteer-core`, escaped Markdown via `marked`, and server-rendered KaTeX MathML. Browser network requests are blocked, so lesson content cannot fetch arbitrary remote resources while rendering.
- Output is A4 with explicit section page breaks, Vietnamese text support from runtime fonts, and page/revision footers.
- The production Docker runtime installs Chromium and Noto fonts and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.
- The accepted spec mentioned embedded font/KaTeX assets. The implementation instead installs fonts in the immutable runtime image and emits KaTeX MathML with no remote assets; this preserves offline rendering without inflating each PDF with duplicated font assets.

### 2026-09-08 - teacher surfaces

- Draft Review now has one `Xuất PDF` action only; there is no control-class selector and export does not publish or assign the lesson.
- The action shows GENERATING/READY/FAILED states, polls an active generation, reopens an existing READY artifact, and sends the exact visible draft revision.
- Teacher Class roadmap enriches only the matching published lesson revision with READY artifact metadata. Student roadmap neither queries nor returns teacher PDF artifact metadata.
- Class lesson detail shows `Tài liệu bài học` with `Mở PDF` and `Tải xuống`; both go through authorized short-lived access generation.

## Verification evidence

- Backend focused tests: 4 suites, 42 tests passed.
- Backend full tests: 32 suites, 229 tests passed.
- Postgres Prisma schema validation passed; both Prisma clients generated successfully.
- NestJS production compilation passed with `npx nest build`.
- Frontend targeted ESLint passed for the two teacher surfaces, API client, and contracts; `npm run typecheck` passed.
- Frontend production build passed under Next.js 16.2.12 after allowing the build to fetch its configured Google fonts. The first sandboxed attempt failed only at that blocked network boundary.
- Production backend Docker runtime image built successfully with Chromium. The renderer executed inside that image and produced a non-empty PDF (`72,891` bytes).
- A richer local fixture produced a 4-page A4 PDF (`247,730` bytes). `pdfinfo` found no JavaScript; extracted text contained Knowledge, checkpoints, all 12 Mastery questions, and page numbers. Every rendered page was visually inspected for Vietnamese text, Markdown/table layout, inline/display math, choices, clipping, and overlap.
- Dependency resolution was checked at the pinned versions: `katex@0.16.22`, `marked@9.1.6`, `puppeteer-core@24.16.0`.
- `git diff --check` passed in backend and frontend.

## Deliberately not claimed

- The Postgres migration has been authored but not applied to any shared or production database.
- No service was deployed and no live MinIO upload, signed URL, authenticated browser flow, or cross-service acceptance run was performed.
- No commit, push, or pull request was created.
- Existing unrelated dirty changes in all repositories remain untouched. The temporary PDF/PNG QA artifacts are removed after verification and are not product outputs.
- `npm install` reported 10 dependency audit findings (6 moderate, 4 high). This run did not establish whether they are pre-existing, nor change packages beyond the three pinned renderer dependencies.

## Remaining work before pilot use

- [ ] Apply the migration in the intended environment.
- [ ] Deploy backend and frontend images/configuration.
- [ ] Generate one artifact from a real authenticated teacher draft against live MinIO.
- [ ] Confirm the same READY revision appears in each relevant Teacher Class view and that open/download URLs expire as expected.
- [ ] Run one final privacy check against the downloaded PDF and teacher/student API responses.
