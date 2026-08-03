# D-Friend Frontend Specification

**Purpose:** a complete, implementation-ready description of every route, endpoint, contract, and page behaviour the frontend depends on — written so a new frontend can be built against it without reading the backend.

**Scope:** the boundary between the Next.js app and the NestJS API only. The FastAPI `ai-service` sits behind NestJS and is never reachable from a browser; it appears here only where its data shapes leak through unchanged.

**Basis:** the code as it exists today (branch `dev`). Section 11 lists contract defects and proposed changes separately — nothing in sections 1–10 is aspirational.

---

## Table of contents

1. [Architecture](#1-architecture)
2. [Conventions](#2-conventions)
3. [Route map and access control](#3-route-map-and-access-control)
4. [Shared types](#4-shared-types)
5. [Endpoint reference — Auth](#5-endpoint-reference--auth)
6. [Endpoint reference — Student](#6-endpoint-reference--student)
7. [Endpoint reference — Teacher](#7-endpoint-reference--teacher)
8. [Endpoint reference — Lessons, Copilot, AI Tutor](#8-endpoint-reference--lessons-copilot-ai-tutor)
9. [Realtime: Socket.IO and SSE](#9-realtime-socketio-and-sse)
10. [Page specifications](#10-page-specifications)
11. [Contract defects and proposed changes](#11-contract-defects-and-proposed-changes)
12. [Appendix: enums and coverage matrix](#12-appendix-enums-and-coverage-matrix)

---

## 1. Architecture

```
┌────────────────────┐   REST + SSE + Socket.IO    ┌─────────────────────┐   REST   ┌──────────────┐
│  edtech-frontend   │ ──────────────────────────► │   edtech-backend    │ ───────► │  ai-service  │
│  Next.js 16 (App)  │ ◄────────────────────────── │   NestJS 11         │ ◄─────── │  FastAPI     │
│  React 19          │   HttpOnly cookie auth      │   Postgres + Mongo  │          │  (internal)  │
└────────────────────┘                             │   Redis + BullMQ    │          └──────────────┘
                                                   └─────────────────────┘
```

The frontend has exactly **one** upstream: NestJS. There is no direct browser access to the AI service, to Postgres, to Mongo, or to object storage.

### Data ownership (matters when a value looks stale)

| Data | System of record | Notes for the UI |
|---|---|---|
| Users, classes, enrolment, submissions, lesson publications | **Postgres** | Authoritative. Class ownership is checked here on every teacher route. |
| Exercise documents (lesson content, question pools) | **Mongo** | `_id` is a 24-hex ObjectId string. |
| AI tutor sessions, per-problem state, cached metrics | **Redis** | 12-hour TTL on sessions. Server-side cache TTLs are listed per endpoint; a mutation may not be visible for that long. |
| Lesson drafts before publication, copilot conversations | **ai-service** | Reached only through NestJS proxy endpoints. |

### Frontend stack in use

`next@16.2.6` (App Router, all pages `'use client'`) · `react@19.2.4` · `@tanstack/react-query@5` for server state · `axios` (single shared instance) · `socket.io-client@4` · `tailwindcss@4` · `@tiptap/react` (scratchpad editor) · `chart.js` + `react-chartjs-2` (radar charts) · `react-markdown` + `remark-math` + `rehype-katex` (LaTeX rendering) · `posthog-js` (analytics) · `motion` (animation) · icons from both `lucide-react` and `@phosphor-icons/react`.

---

## 2. Conventions

### 2.1 Base URL

```
NEXT_PUBLIC_API_URL          e.g. https://api.example.com/api   (falls back to "/api")
NEXT_PUBLIC_BACKEND_URL      origin used for the Socket.IO connection
```

NestJS applies a global prefix of `api`. Every path in this document is written **without** that prefix — prepend the base URL as configured. `POST /auth/login` means `POST {NEXT_PUBLIC_API_URL}/auth/login`.

### 2.2 Authentication

Cookie-based. There is no bearer token in the browser.

| Cookie | HttpOnly | Lifetime | Purpose |
|---|---|---|---|
| `access_token` | yes | 7 days | JWT. Sent automatically; the client cannot read it. |
| `refresh_token` | yes | 30 days | Rotated by `POST /auth/refresh`. Set only by `/auth/refresh` — **not** by `/auth/login`. |
| `csrf_token` | **no** | 7 days | Read by JS and echoed as a request header. |

Every request must set `withCredentials: true` (fetch: `credentials: 'include'`).

`sameSite` is `none` + `secure` in production, `lax` otherwise — so local development over plain HTTP works and cross-origin production works.

**JWT payload** (decodable client-side for routing decisions only — never for authorisation):

```ts
interface JwtPayload {
  sub: string;              // user UUID
  username: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  studentId?: string;       // present when role === 'STUDENT'
  isBetaActivated?: boolean;
}
```

Next.js `middleware.ts` decodes this from the cookie to gate routes before render. Server-side, `request.user` is `{ id, username, role, studentId, isBetaActivated }`.

### 2.3 CSRF

A global `CsrfGuard` enforces double-submit on every mutating request.

- Applies to `POST`, `PUT`, `PATCH`, `DELETE`.
- Skipped for `GET`/`HEAD`/`OPTIONS` and for `/auth/login`, `/auth/register`, `/auth/csrf-token`.
- The client reads the `csrf_token` cookie and sends it as **`X-CSRF-Token`**.
- Mismatch or absence → `403 { message: "CSRF validation failed: ..." }`.

This must be implemented in the shared HTTP client, not per call site. Reference implementation ([apiClient.ts](../src/lib/apiClient.ts)):

```ts
apiClient.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();
  if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = readCookie('csrf_token');
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});
```

Note: raw `fetch` calls bypass axios interceptors. The SSE chat path is the one place this happens today and it re-reads the cookie by hand — any new `fetch` usage must do the same.

### 2.4 Error envelope

`GlobalExceptionFilter` normalises every failure:

```ts
interface ApiError {
  statusCode: number;
  timestamp: string;   // ISO 8601
  path: string;        // request URL
  message: string | string[];   // array when class-validator rejects multiple fields
}
```

`message` is an **array of strings** for validation failures and a plain string otherwise. The UI must handle both — see [getApiErrorMessage.ts](../src/lib/getApiErrorMessage.ts).

Two endpoints add a field beyond the envelope. The publish gate returns actionable reasons:

```ts
// 400 from PATCH /exercises/:id and POST /exercises/ai-drafts/:lessonId/publish
{
  statusCode: 400,
  message: 'Bài giảng chưa đủ điều kiện xuất bản.',
  blockers: PublishBlocker[]        // see §4
}
```

**Never collapse `blockers` into a generic alert** — each entry names something the teacher can fix.

Status codes in use:

| Code | Meaning here |
|---|---|
| 400 | Validation failure, or a publish gate rejection carrying `blockers`. |
| 401 | Missing/expired `access_token`. The client redirects to `/login?clear_cookie=1`. |
| 403 | Wrong role, not the owner of a class, or CSRF failure. |
| 404 | Resource missing or not visible to this user. |
| 409 | Conflict — e.g. publishing with no class selected, student not in class. |
| 429 | Throttled (see below). |
| 502/503 | AI service unreachable. Copy should say "try again shortly", not "error". |

### 2.5 Rate limiting

Global `ThrottlerGuard`: **100 requests per 60 seconds per IP**, applied to every route. Two frontend behaviours push against this and must be reconsidered in a redesign:

- Teacher dashboard polls `/teacher/classes` and `/teacher/classes/:id/students` every **5 seconds**.
- Presence, activity history, and copilot reports poll every **30 seconds**.

A teacher with the dashboard open consumes roughly 24 req/min from polling alone before touching anything.

### 2.6 Response shape conventions (inconsistent — read carefully)

There are four different envelope styles in use. A generic `unwrap()` helper will not work.

| Style | Endpoints |
|---|---|
| Bare array | `GET /student/classes/:id/roadmap`, `GET /teacher/classes/:id/roadmap`, `GET /teacher/copilot/reports`, `GET /teacher/classes/:c/exercises/:e/submissions` |
| Named collection key | `GET /teacher/classes` → `{ classes }`, `GET /student/me/classes` → `{ classes }`, `GET /teacher/classes/:id/students` → `{ students }`, `GET /student/me/assignments` → `{ assignments }` |
| `{ success, data }` | `GET /exercises`, `GET /teacher/classes/:id/activity/presence`, `GET /teacher/.../activity` |
| Bare object | `GET /auth/me`, `GET /student/exercises/:id`, `GET /student/report/:id`, all AI-session routes |

Casing is equally inconsistent: student-facing DTOs are `snake_case`, teacher-facing DTOs are mostly `camelCase`, and AI-derived payloads are `snake_case` throughout. Individual fields are documented literally below.

### 2.7 Language

All user-facing strings from the backend are **Vietnamese**, including AI-generated `detail` text on content notices — which is explicitly documented as "render it, do not re-word it". The UI must not attempt to translate server copy.

---

## 3. Route map and access control

### 3.1 Pages

| Route | Role | Purpose |
|---|---|---|
| `/` | — | Redirect stub. |
| `/login` | public | Sign in; redirects by role. |
| `/register` | public | Sign up as student or teacher. |
| `/forgot-password` | public | **Mock only — no API call.** |
| `/student/dashboard` | STUDENT | Overview, next action, join class. |
| `/student/classes` | STUDENT | All enrolled classes. |
| `/student/roadmap?class=:id` | STUDENT | Lesson path for one class. |
| `/student/lesson/[id]/part1` | STUDENT | Gated theory + checkpoint quiz. |
| `/student/lesson/[id]/part2` | STUDENT | AI tutor session (4 problems). |
| `/student/lesson/[id]/extra` | STUDENT | Personalised follow-up session. |
| `/student/essay/[id]` | STUDENT | Essay submission with file upload. |
| `/student/report/[id]` | STUDENT | Post-session AI report. |
| `/teacher/dashboard` | TEACHER, ADMIN | 4-tab class console. |
| `/teacher/lesson/create` | TEACHER, ADMIN | 3-step lesson authoring wizard. |
| `/teacher/lesson/[lessonId]/review` | TEACHER, ADMIN | Review + publish a copilot draft. |
| `/teacher/copilot` | TEACHER, ADMIN | Copilot chat + report list. |
| `/teacher/copilot/[lessonId]` | TEACHER, ADMIN | Post-deadline lesson report. |
| `/teacher/copilot/[lessonId]/extra` | TEACHER, ADMIN | Generate/publish follow-up sets. |
| `/teacher/exercises/upload` | TEACHER, ADMIN | Register a source document. |
| `/teacher/settings` | TEACHER, ADMIN | Profile and password. |

### 3.2 Middleware guard

`middleware.ts` runs on `/student/:path*`, `/teacher/:path*`, and `/login`:

1. `?clear_cookie=1` → delete `access_token`, redirect to a clean `/login`. (This exists to break a redirect loop; keep it.)
2. No token and not on `/login` → redirect to `/login`.
3. Token present and on `/login` → redirect to the role's dashboard.
4. `STUDENT` on `/teacher/*` → `/student/dashboard`. `TEACHER` on `/student/*` → `/teacher/dashboard`.

The middleware also forces `Content-Type: text/html; charset=utf-8` on document requests and sets `X-Content-Type-Options: nosniff`. Dropping the charset header breaks Vietnamese diacritics in some deployments — keep it.

**`ADMIN` is not routed.** Rule 3 sends ADMIN to `/teacher/dashboard`, but rule 4 never fires for ADMIN, so an admin can reach both sections. The backend does grant ADMIN teacher-level access on most routes.

### 3.3 Server-side guards per route group

| Path prefix | Guards |
|---|---|
| `/auth/*` | `JwtAuthGuard` on `me`, `profile`, `logout-all`, `activate-beta` only. Others are public or cookie-driven. |
| `/student/*` | `JwtAuthGuard`. Per-route ownership: a STUDENT may only read their own `:studentId`; lesson access requires enrolment **and** a non-locked roadmap status. |
| `/teacher/*` | `JwtAuthGuard` + `RolesGuard(TEACHER, ADMIN)` + per-call class-ownership verification. |
| `/exercises/*` | `JwtAuthGuard` + `RolesGuard(TEACHER, ADMIN)`. |
| `/teacher/copilot/*` | `JwtAuthGuard` + `RolesGuard(TEACHER, ADMIN)`. |
| `/ai-session/*` | `JwtAuthGuard` + lesson-access check per call. |
| `/activity/*` | `JwtAuthGuard`; analytics routes additionally require TEACHER or ADMIN. |
| `/storage/*` | `JwtAuthGuard`. |

---

## 4. Shared types

Copy these into the new frontend as the single source of truth. Field names mirror the wire format exactly — do not re-case them.

### 4.1 Identity

```ts
type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_beta_activated: boolean;
}
```

### 4.2 Classes and roster

```ts
// GET /teacher/classes → { classes: TeacherClass[] }
interface TeacherClass {
  class_id: string;
  class_name: string;
  description: string;
  class_code: string;      // the 6-char code students type to join
  student_count: number;
}

// GET /student/me/classes → { classes: StudentClass[] }
interface StudentClass {
  class_id: string;
  class_name: string;
  teacher_id: string;
  teacher_name: string;
  completed_lessons: number;
  total_lessons: number;
  progress: number;        // 0–100
}

interface StudentInClass {
  student_id: string;
  full_name: string;
}
```

### 4.3 Roadmap

Two different shapes share one concept. The student version carries lock state and follow-up sets; the teacher version carries completion counts.

```ts
interface StudentRoadmapItem {
  id: string;              // Mongo exercise id — use for /student/exercises/:id and lesson routes
  lessonId: string;        // publication id — use for extra-exercise routes
  title: string;
  status: 'locked' | 'active' | 'completed';
  extra_exercises: Array<{
    group_type: 'advanced' | 'remedial';
    summary: string;
    exercises: Array<Record<string, unknown>>;
  }>;
}

interface TeacherRoadmapItem {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  status: 'active';        // always 'active' for teachers
  type: 'exercise';
  questionsCount: number;
  completedCount: number;  // distinct students with any submission
}
```

**`id` vs `lessonId` is the single most error-prone thing in this API.** `id` is the Mongo draft-exercise id; `lessonId` is the Postgres publication id. Lesson pages and `/student/exercises/:id` take `id`; extra-exercise and copilot routes take `lessonId`. Server-side, `resolveLessonPublicationId` accepts either, which masks mistakes until it doesn't.

Exactly one lesson per class is `active` at a time: the first not-yet-completed lesson in `sort_order`. Everything after it is `locked`. A lesson counts as completed when a submission exists with status `GRADED`, `SUBMITTED`, or `EVALUATED`.

### 4.4 Lesson content

```ts
// GET /student/exercises/:id
interface LessonExercise {
  id: string;
  title: string;
  description: string;         // markdown; usually the rendered theory
  material: string;            // markdown built from lesson1Knowledge
  lesson1Knowledge: Lesson1Knowledge | null;
  questions: LessonQuestion[];
  classId: string | null;
}

interface Lesson1Knowledge {
  concept_name?: string;
  hook_type?: string;
  hook?: string;               // the "why should I care" opener
  prerequisites?: string[];
  items?: Lesson1KnowledgeItem[];
}

interface Lesson1KnowledgeItem {
  content_type?: string;
  title?: string;
  content?: string;            // markdown, may contain LaTeX
  is_core?: boolean;           // render a "Core" badge
  from_source?: boolean;       // false ⇒ AI-written, render an "AI bổ sung" badge
}

interface LessonQuestion {
  id: string;
  type: 'mcq';
  questionText: string;
  options: Array<{ label: string; text: string }>;   // labels are 'A'..'F'
  correctAnswer: string;       // a label, not the option text
  explanation: string;
  knowledgeItemIndex: number | null;   // 0-based; drives the gated flow
}
```

Part 1 grading is **entirely client-side** — `correctAnswer` and `explanation` ship to the browser. This is intentional for checkpoint questions; it is not true of Part 2.

### 4.5 AI tutor session

```ts
interface AiSession {
  status: 'success';
  session_id: string;
  user_id: string;
  source: 'ai-service';
  problems: SanitizedProblem[];
  current_problem_id: number | null;
  current_progress: number;    // 0–100
  current_process: number;     // duplicate of current_progress, kept for legacy readers
  lesson_id: string;
  subject: string;
  topic: string;
  concept: string;
}

// GET /ai-session/active/:lessonId when nothing is open
interface NoSession { status: 'not_found' }

// Everything the browser is allowed to see about a problem.
interface SanitizedProblem {
  problem_id: number;
  question: string;
  attachment_url?: string[];
  recommended_problem_role?: 'reinforcement' | 'challenge' | 'exploration' | 'extension';
}
```

`final_answer` and `approach_list` are stripped server-side by `sanitizeProblemForClient`. **The frontend's `ComplexProblem` type in [exercise.types.ts](../src/lib/types/exercise.types.ts) still declares those fields** — it is wrong, and a redesign should replace it with `SanitizedProblem`.

`current_progress` and `current_process` always hold the same value. Read `current_progress`; treat `current_process` as deprecated.

```ts
interface ChatTurnResult {
  status: 'success' | 'error';
  correlation_id: string;
  reply: string;                        // markdown
  is_correct: boolean | null;           // null on non-submission turns
  state_updated: boolean;               // did progress or problem actually move
  current_progress: number;
  current_process: number;
  current_problem_id: number | null;
  unlocked_problem_id: number | null;   // non-null exactly when a new problem opened
  awaiting_reasoning: boolean;          // correct answer held pending an explanation
  spam: boolean;                        // progress-farming detected
}
```

`awaiting_reasoning: true` is a distinct UI state, not a failure: the answer was right, the tutor is asking *how*. Progress deliberately does not move. Rendering it as "wrong" or as a stalled bar is the specific mistake the backend comments warn against.

`status: 'error'` still returns `200` with a friendly `reply` — the chat stays usable when the AI service is down. A real HTTP error status means a contract violation (403/404/409/422/429), not a degraded reply.

```ts
interface SessionSummary {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  learning_style: { cognitive_operation: string[]; representation: string[] } | null;
  preferred_difficulty: 'easy' | 'medium' | 'hard' | null;
  mastering_at: string[];
  struggling_at: string[];
  finished_exercise: Record<string, {   // keyed by problem role
    score: number;                      // 0–1 — multiply by 100 to display
    bloom_level: string;
    strengths: string[];
    weaknesses: string[];
    pattern: { cognitive_operation: string[]; representation: string[] };
  }>;
}

// POST /ai-session/close returns either the summary or:
interface SessionSummaryError { status: 'error'; message: string }
```

The keys of `strengths`, `weaknesses`, `mastering_at`, `struggling_at`, and `bloom_level` are snake_case English tokens (`good_logic`, `over_thinking`, `misconception`, `apply`, …) that the frontend maps to Vietnamese labels. That dictionary is currently duplicated verbatim in three files — centralise it.

### 4.6 Lesson drafts and publishing

These mirror the AI service wire format exactly.

```ts
type SkillId = string;      // "{subject}:{topic}:{concept}#{skillCode}"
type ConceptKey = string;   // "math8:polynomials:monomials"

interface ReviewProblem {
  bank_problem_id?: string;
  problem_id?: number;
  question: string;
  final_answer?: string;              // present in teacher-side payloads only
  solution?: string | null;
  recommended_problem_role?: 'reinforcement' | 'challenge' | 'exploration' | 'extension';
  origin?: 'extracted' | 'derived_variant' | 'ai_generated';
  skills_primary?: SkillId[];
  skills_secondary?: SkillId[];
  approved_by_teacher?: boolean;
  source_document_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface GoalCoverage {
  requested_skill_ids?: SkillId[];
  covered_skill_ids?: SkillId[];
  missing_skill_ids?: SkillId[];      // non-empty is information, not an error
  missing_problem_roles?: string[];
  coverage?: number;                  // 0–1
}

interface GoalTarget {
  skill_id: SkillId;
  evidence_span?: string;   // guaranteed verbatim substring of the teacher's goal text
  emphasis?: string;
  method?: string;
}

interface ContentProvenance {
  origin?: 'generated' | 'sourced' | 'hybrid';
  producer?: string;
  source_refs?: string[];
}

interface ContentNotice {
  code: 'composed_from_source_structure' | 'source_images_dropped' | 'exploration_not_applied';
  problem_ids?: string[];
  document_ids?: string[];
  count?: number | null;
  detail?: string | null;   // pre-written Vietnamese. Render as-is.
}

interface PublishBlocker {
  code: 'missing_skills' | 'missing_problem_roles' | 'pool_incomplete'
      | 'unapproved_ai_problems' | 'knowledge_missing';
  skill_ids?: string[];
  roles?: string[];
  problem_ids?: string[];
  have?: number | null;
  need?: number | null;
}

interface LessonFeasibility {
  concept_key: ConceptKey;
  goal_text: string;
  skill_ids: SkillId[];
  skills: Array<{
    skill_id: SkillId;
    status: 'in_bank' | 'in_documents' | 'no_material';
    bank_problems: number;
    document_units: number;
    evidence_span?: string | null;
  }>;
  verdict: 'ready' | 'needs_extraction' | 'no_material';
  missing_skill_ids: SkillId[];
}
```

**Three verdicts, only one blocks.** `ready` and `needs_extraction` both proceed silently — `needs_extraction` means the material exists in registered documents and will be mined during composition, so interrupting the teacher would be asking about work the system already knows it can do. Only `no_material` warrants a dialog offering "generate anyway".

**Notices never block publishing.** They are caveats the teacher must see before approving a pool — e.g. problems composed from a document's structure rather than being the teacher's own questions.

The two draft flows (wizard and copilot) reach different shapes of the same record; [draft.types.ts](../src/lib/types/draft.types.ts) exports `normalizeDraft()` which folds both into one `DraftReviewModel`. Keep that seam.

```ts
interface DraftReviewModel {
  lessonId: string;
  kind?: 'main' | 'remedial' | 'advanced';
  targetStudentIds?: string[];
  title?: string;
  goalText?: string;
  conceptKey?: string;
  problems: ReviewProblem[];
  coverage?: GoalCoverage | null;
  goalTargets: GoalTarget[];
  notices: ContentNotice[];
  provenance?: ContentProvenance | null;
  checkpointCount?: number;
  knowledgeSummary?: string | null;
}
```

A complete pool holds **12 problems: 3 per role**, in the order `reinforcement → challenge → exploration → extension`. A student session draws **4** from it — one per role.

### 4.7 Submissions, metrics, presence

```ts
interface Submission {
  id: string;
  student_id: string;
  exercise_id: string;
  content: string | null;
  file_url: string | null;
  status: 'SUBMITTED' | 'GRADED' | 'EVALUATED';
  grade: number | null;       // 0–10 scale
  feedback: string | null;
  submitted_at: string;
  graded_at: string | null;
}

// as returned to a teacher, with the student's name joined in
interface TeacherSubmission extends Omit<Submission, 'exercise_id'> {
  student_name: string;
}

// GET /student/me/metrics  — snake_case
interface StudentMetrics {
  student_id: string;
  thinking_score: number;
  skill_score: number;
  result_score: number;
}

// GET /teacher/classes/:c/students/:s/metrics — camelCase, different field names
interface TeacherStudentMetrics {
  studentId: string;
  studentName: string;
  thinkingScore: number;
  skillScore: number;
  resultScore: number;
}

interface StudentPresence {
  studentId: string;
  userId: string;
  fullName?: string | null;
  username?: string | null;
  status: 'online' | 'idle' | 'offline';
  lastSeenAt?: string | null;
  currentClassId?: string | null;
  currentLessonId?: string | null;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  source?: string | null;
  class_id?: string | null;
  lesson_id?: string | null;
  session_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}
```

The two metrics endpoints describe the same three numbers with different casing **and** different key names. See §11.1 — the current frontend reads the wrong one and silently renders zeros.

---

## 5. Endpoint reference — Auth

### `POST /auth/register` → 201

```ts
// request
{
  username: string;      // 3–50 chars
  email: string;
  full_name: string;     // ≤100 chars
  password: string;      // 6–100 chars
  role?: 'STUDENT' | 'TEACHER';   // default STUDENT
  invite_code?: string;
}
// response: AuthUser
```
No cookies set. The client must send the user to `/login` afterwards.

### `POST /auth/login` → 200

```ts
{ username: string; password: string }   // password ≥6
// response: AuthUser
// side effects: sets access_token (7d) and csrf_token (7d)
```
Also records an `AUTH_LOGIN` activity event. Note it does **not** set `refresh_token` — only `/auth/refresh` does, which means the refresh flow is unreachable from a fresh login today (§11.5).

### `GET /auth/me` → 200 · auth required
Returns `AuthUser` from the JWT payload — **no database read**. Values are as of token issue: a profile edit is not reflected here until the token is reissued.

### `GET /auth/token` → 200
```ts
{ token: string }
```
Echoes the `access_token` cookie into a readable body, purely so Socket.IO can put it in its handshake `auth`. Not a general-purpose token endpoint.

### `GET /auth/csrf-token` → 200
```ts
{ csrfToken: string }   // also re-sets the cookie
```
Currently unused by the frontend, which relies on the cookie set at login. Useful after a 403 CSRF failure.

### `PATCH /auth/profile` → 200 · auth required
```ts
{ fullName?: string; newPassword?: string }   // camelCase, unlike everything else on this route
// response: AuthUser
```

### `POST /auth/logout` → 200
Clears all three cookies, revokes the refresh token, logs `AUTH_LOGOUT`. Returns `{ message }`. Safe to call without a session.

### `POST /auth/refresh` → 200
Rotates `refresh_token` and reissues `access_token`. `401` if no refresh cookie. Returns `{ message }`.

### `POST /auth/logout-all` → 200 · auth required
Revokes every refresh token for the user and clears cookies. Not currently used by the UI — worth surfacing in settings.

### `POST /auth/activate-beta` → 200 · auth required
```ts
{ code: string }
// response: AuthUser  (and a reissued access_token with isBetaActivated)
```
Not currently used. `middleware.ts` decodes `isBetaActivated` but never branches on it.

---

## 6. Endpoint reference — Student

All require auth. Routes under `/student/me/*` and `/student/:studentId/*` are duplicates of each other; prefer `/me/*`.

### `POST /student/classes/join` → 201
```ts
{ classCode: string }
// response: { message: string }
```
Invalidates the server's `student:classes:*` cache. On the client, invalidate `['student','classes']`.

### `GET /student/me/metrics` → 200
Returns `StudentMetrics`. Server-cached 2 minutes.

### `GET /student/me/classes` → 200
Returns `{ classes: StudentClass[] }`. Server-cached 5 minutes.

### `GET /student/me/assignments` → 200
Returns `{ assignments: Assignment[] }` where

```ts
interface Assignment {
  assignment_id: string;   // Mongo exercise id
  title: string;
  description: string;
  due_date: string;        // ⚠ ALWAYS now + 7 days — see §11.2
  status: 'TODO';          // ⚠ ALWAYS 'TODO'
  class_id: string;
}
```
Only exercises with no completed submission are returned. The `due_date` and `status` fields carry no real information today.

### `GET /student/classes/:classId/roadmap` → 200
Returns a bare `StudentRoadmapItem[]`. `403` if not enrolled.

Role-polymorphic: a TEACHER or ADMIN hitting this path gets the **teacher** shape (`TeacherRoadmapItem[]`) instead. Do not rely on this — use `/teacher/classes/:id/roadmap`.

### `GET /student/exercises/:id` → 200
Returns `LessonExercise`. `403` unless the student has a submission for it or it is a non-locked lesson in an enrolled class.

⚠ **When the id does not exist, this returns a hardcoded English "Photosynthesis Fundamentals" mock with a 200 status** instead of a 404. See §11.3.

### `GET /student/exercises/:id/submission` → 200
Returns `Submission | null`.

### `GET /student/submissions/me` → 200
Returns `Submission[]`, newest first. Unused by the current UI.

### `POST /student/submissions` → 201
```ts
{ exerciseId: string; content?: string; fileUrl?: string }
// response: Submission
```
Upsert: re-submitting overwrites and resets `status` to `SUBMITTED`. Notifies the class teacher over Socket.IO (`ASSIGNMENT_SUBMITTED`).

### `GET /student/report/:lessonId` → 200
```ts
interface StudentReport {
  lessonId: string;
  lessonTitle: string | null;
  score: number;                     // 0–100
  sessionProgress: number | null;    // prefer this over `score` when present
  status: 'PASSED' | 'FAILED';
  sessionSummary: SessionSummary | null;
  textContent: string;
  highlights: Array<{ word: string; color: string; feedback: string }>;
}
```

Two problems the UI must know about. First, `highlights[].color` contains **raw Tailwind class strings** (`'bg-emerald-100 text-emerald-800'`) generated by the backend — a design-system violation that also breaks under Tailwind's JIT purge if those classes appear nowhere else. Second, when there is no real data this endpoint **fabricates** a score of 85, a `PASSED` status, and an English worked solution about solving a system of equations. See §11.3.

### `GET /student/lessons/:lessonId/extra-exercises` → 200
```ts
{
  lesson_id: string;
  extra_exercises: Array<{ group_type: string; summary: string; exercises: Array<{ problem_id?, question, attachment_url? }> }>
}
```
Answer keys are stripped. Currently unused — the roadmap embeds the same data.

### `GET /student/:studentId/classes/:classId/classmates` → 200
`{ classmates_name: string[] }`. Unused.

---

## 7. Endpoint reference — Teacher

All require `TEACHER` or `ADMIN`, plus class ownership where a `classId` appears.

### `POST /teacher/classes` → 201
```ts
{ className: string; description: string }
// response: { className: string; createdAt: string; message: string }
```
⚠ The response does **not** include `class_id` or the generated `class_code`. The client must refetch `/teacher/classes` to learn the code it needs to show the teacher.

### `GET /teacher/classes` → 200
`{ classes: TeacherClass[] }`. Server-cached 5 minutes — a class created a moment ago may not appear immediately, which is why the dashboard polls.

### `POST /teacher/classes/add-students` → 200
```ts
{ classId: string; usernames: string[] }   // usernames, not ids
// response
{
  message: string;         // pre-formatted Vietnamese summary
  added: string[];
  skipped: string[];       // already enrolled
  notFound: string[];      // no such username
}
```
A partial success is the normal case. Render the three lists, not `message`.

### `GET /teacher/classes/:classId/students` → 200
`{ students: StudentInClass[] }`. Server-cached 3 minutes.

### `GET /teacher/classes/:classId/students/:studentId/metrics` → 200
Returns `TeacherStudentMetrics` (camelCase). `409` if the student is not in that class. Server-cached 2 minutes.

### `GET /teacher/classes/:classId/roadmap` → 200
Bare `TeacherRoadmapItem[]`.

### `GET /teacher/classes/:classId/exercises/:exerciseId/submissions` → 200
Bare `TeacherSubmission[]`, newest first.

### `POST /teacher/submissions/:submissionId/grade` → 200
```ts
{ grade: number; feedback: string }   // grade on a 0–10 scale
// response: Submission
```
Notifies the student (`ASSIGNMENT_GRADED`) and invalidates both metrics caches.

### `DELETE /teacher/classes/:classId/exercises/:exerciseId` → 200
`{ success: true }`. Deletes the Mongo exercise, its `lesson_publications` row, and every `class_lessons` link — across **all** classes, not just `:classId`. Destructive and irreversible; require an explicit confirm.

### `GET /teacher/classes/:classId/activity/presence` → 200
`{ success: true, data: StudentPresence[] }`.

### `GET /teacher/classes/:classId/students/:studentId/activity` → 200
Query: `limit` (default 20), `cursor`.
`{ success: true, data: ActivityEvent[], nextCursor?: string }`.

### `POST /activity/log` → 200
```ts
{ eventType: string; classId?: string; lessonId?: string; sessionId?: string; metadata?: unknown }
```
`eventType` must be one of `LESSON_OPENED`, `EXTRA_LESSON_OPENED`, `AI_SESSION_STARTED`, `AI_SESSION_CLOSED` — anything else is `400`. Also refreshes presence. **Not called by the current frontend**, which sends its analytics to PostHog instead; teacher-facing presence and activity timelines are therefore thinner than they could be (§11.6).

### `GET /activity/analytics/dau` · `GET /activity/analytics/retention/d3` → 200
Query: `from`, `to`, `role`, `classId`. TEACHER/ADMIN only. `{ success: true, ... }`. Unused — no analytics screen exists.

### `POST /storage/upload` → 200
`multipart/form-data`, field `file`. Max 10 MB. Extensions: pdf, doc(x), xls(x), ppt(x), png, jpg, jpeg, gif, txt, md, zip, rar, cpp, java, py, js, ts, cs. Magic-byte validated beyond the extension check.
```ts
{ url: string }
```

---

## 8. Endpoint reference — Lessons, Copilot, AI Tutor

### 8.1 Lesson authoring (`/exercises/*`)

#### `POST /exercises/create-lesson/precheck` → 200
```ts
{ lessonGoal?: string; title?: string; subject?: string; topic?: string; concept?: string }
// response: LessonFeasibility
```
Cheap and read-only. Call it before paying for generation. Treat an outage as non-blocking — it is an optimisation, not a gate.

#### `POST /exercises/create-lesson/lesson1` → 200 · `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `file` | binary | optional; ≤10 MB; pdf, docx, md, txt only (`.doc` deliberately rejected) |
| `title` | string | |
| `description` | string | |
| `lessonGoal` | string | ≤1000 chars — the teacher's own words |
| `subject` / `topic` / `concept` | string | must be a valid triple (§12.1) |
| `classIds` | string | JSON array string or comma-separated |
| `lessonId` | string | pass back to regenerate over an existing draft |
| `allowGenerated` | `'true'` | send **only** after a `no_material` precheck and explicit consent |

```ts
// response
{
  success: true;
  draftExerciseId: string;      // Mongo id — everything downstream uses this
  lessonId: string;             // AI-side lesson id
  knowledge: Lesson1Knowledge | null;
  coverage: GoalCoverage;
  provenance: ContentProvenance | null;
  masteryNotices: ContentNotice[];
  masteryProvenance: ContentProvenance | null;
  previousLessons: unknown[];
}
```

This is a **single call that produces both halves** of the lesson — the theory and all 12 mastery problems. Expect it to take a long time (two LLM generations plus document mining). The wizard shows two steps for the teacher's benefit; step 2 reads what this call already returned.

`403` if the teacher does not own every class in `classIds`.

#### `POST /exercises/create-lesson/lesson2` → 200 · `multipart/form-data`
Fields: `draftExerciseId` (required), `classIds`, `file` (accepted and ignored).
```ts
{ success: true; draftExerciseId: string; lessonId: string; problems: ReviewProblem[] }
```
**No AI call happens here.** It reads the pool stage 1 already produced and persists the class targeting. `404` if the draft has no pool — the teacher must restart from step 1.

⚠ Read `problems`. The frontend also probes `output.exercise.problem_list` and `output.problem_list`, neither of which this endpoint has ever returned — a redesign should drop those fallbacks.

#### `POST /exercises/ai-drafts/:lessonId/approve-generated` → 200
Approves every AI-written problem in the draft in one deliberate act. Clears the `unapproved_ai_problems` publish blocker.

#### `PATCH /exercises/:id` → 200 — **publish a wizard draft**
```ts
{ classIds: string[]; deadline?: string }   // classIds must be UUIDs; deadline ISO 8601 UTC
```
`:id` is the **`draftExerciseId`**, not a lesson id.

Deadline rules: defaults to publish + 7 days; must be at least publish + 1 day; invalid or too-early values are `400`.

```ts
// 200
{ success: true; message: string; lessonId: string; classIds: string[]; deadline: string }
// 400 when the gate rejects
{ statusCode: 400; message: 'Bài giảng chưa đủ điều kiện xuất bản.'; blockers: PublishBlocker[] }
```

Publishing runs the AI-side gate first and only then writes Postgres, so a rejection leaves nothing half-published. It also enqueues a BullMQ job that fires **at the deadline** to produce the copilot report, and pushes an `ASSIGNMENT_PUBLISHED` notification to every enrolled student.

#### `POST /exercises/ai-drafts/:lessonId/publish` → 200 — **publish a copilot draft**
```ts
{ classIds: string[]; deadline?: string; title?: string }
```
`:lessonId` is the **AI-side lesson id**. A copilot draft has no Mongo row until this call materialises one; publishing twice reuses the same row rather than creating a duplicate. Falls through to the same gate and the same response/error shapes as `PATCH /exercises/:id`.

#### `POST /exercises/upload` → 202 — **register a source document**
`multipart/form-data`: `file` (required), `title`, `description`, `subject`, `topic`, `concept`, `shared` (boolean).
```ts
{ message: string; documentId: string; previewUrl: string }
```
This **does not create a lesson and does not parse anything**. It stores the file and registers it in the shared exercise bank; extraction is deferred until a lesson goal actually needs it. `previewUrl` is short-lived and for display only — never persist it.

`shared: true` makes the document's problems available to other teachers. The bank is one pool filtered by visibility.

#### `GET /exercises` → 200
`{ success: true, data: RawExerciseDocument[] }`

⚠ **Returns every exercise document in the database with no filter of any kind** — other teachers' drafts, unpublished pools, and `final_answer` on every problem. The wizard calls it and scans client-side to recover one draft. This is both a data-exposure problem and an unbounded payload. See §11.4.

#### `POST /exercises` → 200
Creates an exercise document directly. Internal plumbing used by the two `create-lesson` endpoints; there is no reason for a UI to call it.

### 8.2 Teacher Copilot (`/teacher/copilot/*`)

#### `POST /teacher/copilot/chat` → 200
```ts
{ message: string; conversation_id?: string | null; class_id?: string | null }   // message ≤8000
```
```ts
{
  conversation_id: string;             // persist it; without it the copilot loses context
  response: string;                    // markdown
  steps: Array<{ label: string; status: 'started' | 'succeeded' | 'failed' }>;
  drafts: Array<{
    lessonId: string;
    classId: string | null;
    conceptKey: string | null;
    goalText: string | null;
    problemCount: number;
  }>;
}
```

The copilot spans **all** of a teacher's classes; `class_id` is only a focus hint. One turn may spend several tool calls before answering — render `steps` so the teacher can see it actually read their class data rather than watching a bare spinner. Labels are already translated to Vietnamese; internal tool names never reach the browser.

`drafts` is non-empty when the copilot built a lesson during the turn. Link each entry to `/teacher/lesson/{lessonId}/review`.

Errors: `403` "cannot access this class context yet" · `400` on a request the copilot could not parse · `503` when the AI service is down.

The frontend currently keeps `conversation_id` in `localStorage` under `teacher-copilot:conversation-id:v1`, giving one global conversation per browser. There is no history endpoint — reloading the page loses the transcript (§11.7).

#### `GET /teacher/copilot/reports` → 200
Bare array:
```ts
{
  lessonId: string;
  title: string;
  subject: string;
  topic: string;
  classNames: string;      // comma-joined
  status: 'PENDING' | 'ANALYSING' | 'REPORT_READY' | 'FAILED';
  reportedAt: string | null;
  acknowledgedAt: string | null;    // null ⇒ unread
  publishedAt: string;
}
```

#### `GET /teacher/copilot/:lessonId/report` → 200
```ts
{
  lessonId: string;
  title: string;
  subject: string; topic: string; concept: string;   // carried for "continue the curriculum"
  status: 'PENDING' | 'ANALYSING' | 'REPORT_READY' | 'FAILED';
  report: SkillLessonReport | null;
  totalStudents: number;
  reportedAt: string | null;
  acknowledgedAt: string | null;
  classNames: string;
}

interface SkillLessonReport {
  class_id: string;
  lesson_id: string;
  strengths: SkillId[];
  gaps: SkillId[];
  remedial_student_ids: string[];
  advanced_student_ids: string[];
  not_finished_student_ids: string[];   // no evidence yet — produces no follow-up
  top_weak_skill_ids: SkillId[];
  attention_reasons: Record<string, string[]>;   // keyed by student id
  recommended_draft_kinds: string[];
  generated_at: string;
  score_scale: number;
  student_names: Record<string, string>;   // id → display name, added by NestJS
}
```

`report` is `null` until `status === 'REPORT_READY'`. The report is **skill-keyed and contains no prose** — there is no summary field and there never was. Use `student_names` to resolve ids wherever a name is needed. Poll while `status` is `PENDING` or `ANALYSING`; stop otherwise.

#### `POST /teacher/copilot/:lessonId/extra-exercises` → 200
No body. Generates follow-up lessons for the remedial and advanced groups.

```ts
// groups exist
{
  created: true;
  lessonTitle: string;
  classNames: string;
  drafts: Array<{
    id: string;
    groupType: 'remedial' | 'advanced';
    studentIds: string[];
    exercises: ReviewProblem[];
    summary: string;
    aiLessonId: string;      // the per-group publish key
  }>;
}
// class is even — nothing to differentiate
{ created: false; reason: 'recommendation_proceed' }
```

Idempotent-ish: existing unpublished drafts are returned as-is; a fresh generation replaces stale ones. Slow — it calls the AI service.

#### `POST /teacher/copilot/extra-exercises/:aiLessonId/publish` → 200 — **one group**
```ts
{ success: true; message: string; lessonId: string; groupType: string; studentCount: number }
```
Use this from the review screen. It publishes only the group the teacher actually looked at.

#### `POST /teacher/copilot/:lessonId/extra-exercises/publish` → 200 — **all groups**
`{ success: true; message: string }`. Approves every group at once, including ones never displayed. Prefer the per-group route.

#### `POST /teacher/copilot/:lessonId/dismiss` → 200
Sets `acknowledgedAt`. `{ success: true; message: string }`.

#### `GET /teacher/copilot/drafts/:lessonId` → 200
Returns the raw AI-service `LessonDraft` for the review screen. Ownership is enforced by the AI service — `404` for someone else's lesson. Pass it straight to `normalizeDraft()`.

### 8.3 AI Tutor session (`/ai-session/*`)

#### `POST /ai-session/start` → 200
```ts
{ lessonId: string; reset?: boolean }
// response: AiSession
```
Reuses an open session unless `reset: true`. Prefix `lessonId` with `extra_` to open a follow-up session (e.g. `extra_<publicationId>`). `403` without lesson access; `502` when the AI service cannot draw a pool.

#### `GET /ai-session/active/:lessonId` → 200
`AiSession | { status: 'not_found' }`. Always `200` — check the `status` field, not the HTTP code.

#### `POST /ai-session/chat` → 200
```ts
{ session_id: string; message: string; is_submission: boolean; problem_id: number }
// response: ChatTurnResult
```
Buffered variant. Prefer the streaming route for the main flow.

#### `POST /ai-session/chat/stream` → 200 · `text/event-stream`
Same body. See §9.2.

#### `POST /ai-session/close` → 200
```ts
{ sessionId: string; lessonId?: string }
// response: SessionSummary | { status: 'error', message: string }
```
Syncs the session to Postgres (creating or updating a submission with status `EVALUATED`), writes the mastery profile, and returns the end-of-session summary. Pass `lessonId` — it lets the server serve a cached summary if the session has already expired, which is the difference between a graceful close and a hard error.

---

## 9. Realtime: Socket.IO and SSE

### 9.1 Socket.IO — notifications and presence

```
URL       {NEXT_PUBLIC_BACKEND_URL origin}/notifications
path      /socket.io
auth      { token }   ← from GET /auth/token
transports ['websocket', 'polling']
credentials true
```

Handshake auth is read **before** the cookie, so a client that refreshes its token by setting `socket.auth` and reconnecting is honoured.

**Server → client**

| Event | Payload | Meaning |
|---|---|---|
| `notification` | `{ title?, message?, type?, lessonId?, path? }` | Toast it. If `path` is set, navigate there on click; else if `lessonId` is set, go to `/teacher/copilot/{lessonId}`. |
| `error` | `{ code: 'token_expired' \| 'auth_failed', message }` | Emitted immediately before the server hangs up. Listen for it — it is the only signal that says *why*. |

`type` values seen in practice: `ASSIGNMENT_SUBMITTED`, `ASSIGNMENT_GRADED`, `ASSIGNMENT_PUBLISHED`.

**Client → server**

| Event | Payload | Cadence |
|---|---|---|
| `presence:heartbeat` | `{ classId?, lessonId? }` | every 25 s while connected |
| `presence:offline` | — | before a deliberate disconnect |

**Reconnection rules that must be preserved.** `disconnect` with reason `io server disconnect` means the gateway rejected the token; Socket.IO will not auto-retry it, and when it did retry it reused the same rejected token. Handle it by fetching a fresh token from `/auth/token`, assigning `socket.auth`, and reconnecting manually. Same for `connect_error` whose message matches `jwt|auth|token|unauthorized|forbidden`.

Create the socket **once per mount and keep it until unmount.** Rebuilding it when a dependency changes tears down live listeners; capturing changing values in listener closures freezes them. Use refs for anything the handlers read.

`pagehide` fires when a page enters the back/forward cache — a phone locking the screen is enough. Only tear down when `event.persisted` is false, and reconnect on the matching `pageshow`.

Notifications are mirrored into `localStorage` under `eduflow.notifications` (last 10) and rebroadcast on the `eduflow-notification` window event, which is how the teacher dashboard's bell renders without its own socket.

### 9.2 SSE — streaming tutor replies

`EventSource` cannot POST, so this uses `fetch` with a manually parsed body.

```
POST /ai-session/chat/stream
Content-Type: application/json
X-CSRF-Token: <from cookie>          ← must be set by hand; axios interceptors do not apply
credentials: include
body: { session_id, message, is_submission, problem_id }
```

Frames are `data: {json}\n\n`. Parse incrementally on the `\n\n` boundary; do not wait for the stream to end.

```ts
type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done' } & ChatTurnResult       // minus `status` and `reply`
  | { type: 'error'; message?: string };
```

Rules:

- **Auth and validation failures arrive as real HTTP statuses** (400/403/404/429) *before* any bytes are flushed. Check `response.ok` first and read the JSON error body — do not assume a 200 stream.
- `done` and `error` are terminal and fire exactly once. Guard with a `settled` flag.
- A stream that closes without a terminal frame is an interruption; surface it while keeping the partial reply on screen.
- Token frames are relayed byte-for-byte from the AI service and are the hot path — append them straight to the message being built.

The `extra` lesson page uses the non-streaming `POST /ai-session/chat` instead. That asymmetry is unintentional (§11.8).

---

## 10. Page specifications

Format for each page: route → guard → what loads → what the user can do → states to design → where it navigates.

### 10.1 `/login`

- **Guard:** redirects to the role dashboard if a valid token exists.
- **Loads:** nothing.
- **Actions:** `POST /auth/login` with `{ username, password }`.
- **On success:** cookies are set; route by `role` — `ADMIN`/`TEACHER` → `/teacher/dashboard`, `STUDENT` → `/student/dashboard`.
- **States:** idle · submitting · error (render `message`, which may be an array) · `?registered=true` success banner from registration.

### 10.2 `/register`

- **Actions:** `POST /auth/register`. Role is chosen in the form.
- **On success:** navigate to `/login?registered=true`. **No session is created** — the user must log in.
- **States:** idle · submitting · field validation errors (server-side, arrive as a `message` array) · duplicate username/email.

### 10.3 `/forgot-password`

Currently a **1500 ms `setTimeout` with no network call.** There is no password-reset endpoint on the backend. Either build the endpoint or remove the page — shipping a form that silently does nothing is worse than not offering it.

### 10.4 `/student/dashboard`

- **Loads on mount** (parallel):
  - `GET /auth/me` — `['auth','me']`, staleTime 10 min
  - `GET /student/me/metrics` — staleTime 5 min
  - `GET /student/me/classes` — staleTime 5 min
  - `GET /student/me/assignments` — staleTime 2 min
  - then **one `GET /student/classes/:id/roadmap` per class** (`useQueries` fan-out), staleTime 2 min

- **The "next action" card** is the primary CTA. Resolution order:
  1. Oldest pending assignment → `/student/lesson/{assignment_id}/part1`
  2. First `active` roadmap lesson in any class → `/student/lesson/{id}/part1?class={classId}`
  3. First lesson with `extra_exercises` → `/student/lesson/{lessonId}/extra?class={classId}`
  4. Any class enrolled → `/student/roadmap?class={firstClassId}`
  5. Nothing → hide the card

- **Progress** is `completed_lessons / total_lessons` summed across classes; if `total_lessons` is 0 everywhere, fall back to the mean of `progress`.
- **Competence radar** (3 axes: thinking / skill / result) renders only when at least one score is > 0. Otherwise show an explicit "not enough data yet" panel — an empty chart reads as a bug.
- **Actions:** join a class (`POST /student/classes/join`, then invalidate `['student','classes']`) · open the assignment calendar modal.
- **States:** skeleton while `/auth/me` resolves · partial-failure banner when any query errors (the page stays usable) · zero-classes empty state, which replaces most of the page · zero-assignments empty state inside the task list.

### 10.5 `/student/classes`

- **Loads:** `GET /student/me/classes`.
- **Actions:** client-side search over name/description; A–Z sort toggle.
- **States:** loading skeleton · no classes · no search matches (distinct copy from no classes).
- **Navigates to:** `/student/roadmap?class={class_id}`.

### 10.6 `/student/roadmap?class=:classId`

- **Loads:** `GET /student/me/classes`, then `GET /student/classes/{classId}/roadmap`. Falls back to the first class when `?class` is absent.
- **Renders** a vertical path of numbered nodes:
  - `completed` — green, clickable, links with `&retake=1`
  - `active` — outlined, clickable
  - `locked` — greyed with a lock, not clickable, and it must genuinely not be clickable
  - A lesson with `extra_exercises` gets a branch node linking to `/student/lesson/{lessonId}/extra?class={classId}` — note this uses **`lessonId`**, while the main link uses **`id`**.
- **States:** loading · not enrolled in any class · `?class` names a class the student is not in (distinct 403-style copy) · empty roadmap.

### 10.7 `/student/lesson/[id]/part1`

The gated theory flow. `[id]` is a **Mongo exercise id** (`StudentRoadmapItem.id`).

- **Loads:** `GET /student/exercises/{id}` → `LessonExercise`.
- **Structure:** optional `hook` panel · `prerequisites` chips · then `lesson1Knowledge.items` **one at a time**.
- **Gating:** items `0 … completedItems-1` are done, `completedItems` is active, the rest are locked and rendered as a stub. Advancing requires every question in the active item to have been submitted (correctness is not required to proceed — only an attempt).
- **Question routing:** `groupQuestionsByItem` assigns each question to its `knowledgeItemIndex`. Legacy lessons with no indexes at all are distributed round-robin across items. Unassignable questions land on the last item so none are lost.
- **Grading is client-side.** Compare against `correctAnswer` (a label for MCQ, a case-insensitive trimmed string for short answers). Show `explanation` after submit; offer "try again" on a wrong answer.
- **Badges:** `is_core` → "Core"; `from_source === false` → "AI bổ sung". Both matter — a teacher-sourced item and an AI-written one are not the same claim.
- **Legacy path:** when `lesson1Knowledge.items` is empty, render `description`/`material` plus all questions ungated.
- **Completion:** on all items done, reveal the CTA to `/student/lesson/{id}/part2` (carrying `?retake=1` through).
- **Analytics:** `lesson_started`, `lesson_content_completed`, `lesson_quiz_started` to PostHog.
- **States:** loading · gated/active/locked per item · answered-correct · answered-wrong · all-complete.
- **Back link:** `/student/roadmap?class={?class || localStorage.currentClassId}`.

### 10.8 `/student/lesson/[id]/part2` — AI tutor

The most complex screen. Three panes: problem list · chat · scratchpad.

- **Initialisation** (guarded by a ref keyed `{id}:{retake|normal}` so React 19 double-mount does not double-start):
  1. Unless `?retake=1`: `GET /ai-session/active/{id}`
  2. If that returns `status: 'not_found'` or has no `session_id`: `POST /ai-session/start { lessonId, reset: isRetake }`
  3. Empty `problems` is a hard failure — show the error screen, not an empty workspace.
- **Derived state:** progress is 0–100 across all problems; a problem counts as completed when progress crosses `(index+1) × 100/n`, or when it precedes `current_problem_id`.
- **Two input surfaces, one transport:**
  - Chat box → `is_submission: false`. Appends to the main transcript.
  - "Submit answer" → `is_submission: true`. Appends to `submissionFeedbacks[problemId]`, a per-problem thread.
  Both call `chatStream` with `problem_id = activeProblemId`.
- **Streaming render:** on the first token, drop the typing indicator and append a new AI message; grow it in place as deltas arrive.
- **On `done`:** stamp `is_correct` onto the submission entry; update progress and `current_problem_id`; if `unlocked_problem_id` is non-null, switch the active problem to it and clear the scratchpad.
- **Closing:** "sync and close" → `POST /ai-session/close { sessionId, lessonId }`. Renders `SessionSummary` in a modal: summary prose, `preferred_difficulty`, strengths, weaknesses, and per-role scores (`score × 100`). Then links to `/student/report/{id}`.
- **States to design:** initialising · init-failed (retry / back to Part 1) · idle · typing · streaming · submitting · **`awaiting_reasoning`** (right answer, tutor wants the reasoning — progress deliberately flat) · `spam: true` (farming detected) · degraded (`status: 'error'` with a friendly reply) · closing · closed-with-summary · close-failed (retry / return to lesson).
- **Editor:** TipTap with bold/italic and `x² √ π ∫` insert buttons. Content is local only — it is never sent anywhere unless the student submits it.

`allProblemsCompleted` should make the close button unmissable; today it pulses red.

### 10.9 `/student/lesson/[id]/extra`

Same three-pane workspace, targeting personalised follow-up problems. `[id]` is a **`lessonId`** (publication id), not an exercise id.

- Session id is `'extra_' + id` on all three of start, active, and close.
- Uses the **non-streaming** `POST /ai-session/chat`.
- Otherwise identical in state model to Part 2.

Given how much these two pages share, extract one workspace component parameterised by session key and transport.

### 10.10 `/student/essay/[id]`

Essay submission with a side AI-tutor chat.

- **Loads on mount, in order:** `GET /student/exercises/{id}` → `GET /student/exercises/{id}/submission` → `GET /ai-session/active/{id}`, falling back to `POST /ai-session/start` when there is no session. Progress is seeded from the submission status (`SUBMITTED` → 80 %, `GRADED` → 100 %).
- **Upload:** `POST /storage/upload` (multipart, field `file`) → `{ url }`. The filename shown is decoded from the last path segment of `file_url`.
- **Submit** runs three calls in sequence:
  1. `POST /student/submissions { exerciseId, content, fileUrl }`
  2. `POST /ai-session/chat` with `is_submission: true` and a message shaped `[Student Submission]: {content} File: {url}` — this is what grounds the AI's evaluation
  3. `POST /ai-session/close` to produce the mastery score

  Submitting is blocked until the AI session exists; the current UI shows an alert saying so.
- **States:** initialising · loaded, not yet submitted · uploading · submitting (three-step, so show progress rather than a single spinner) · submitted (`submitted_at`) · graded (`grade`/10 and `feedback`) · resubmit, which overwrites the previous submission · AI session unavailable (submission blocked).

The `[Student Submission]:` prefix is a string contract between this page and the report endpoint, which strips it back off when reconstructing `textContent`. Changing the format breaks the report.

### 10.11 `/student/report/[id]`

- **Loads:** `GET /student/me/classes` then `GET /student/report/{id}` (enabled only when the student has classes).
- **Score:** prefer `sessionProgress` rounded; fall back to `score`. Pass/fail at 50.
- **Renders:** `sessionSummary` — summary prose, `preferred_difficulty`, strengths, weaknesses, `mastering_at`, `struggling_at`, and per-role cards with a score bar and Bloom level.
- **States:** loading · no classes · report exists but `sessionSummary` is null (only the score header renders — thin, and worth designing explicitly) · full report.
- Ignore `highlights[].color`; it contains raw Tailwind classes (§11.3).

### 10.12 `/teacher/*` shell

`TeacherShell` wraps every teacher route as a segment layout, so the sidebar stays mounted across navigations and its class list is fetched once.

- **Loads:** `GET /teacher/classes` — `['teacher','classes']`, staleTime 60 s, shared with every page underneath via the react-query cache.
- **Nav:** Tổng quan `/teacher/dashboard` · Soạn bài `/teacher/lesson/create` · Copilot `/teacher/copilot` · Tài liệu `/teacher/exercises/upload` · Cài đặt `/teacher/settings`. Active state uses `startsWith` so nested routes light up their section.
- The shell owns the scroll container; `body` is `overflow-hidden` app-wide.

### 10.13 `/teacher/dashboard`

Four tabs over a selected class: **student-list**, **learning-paths**, **resources**, **grading**. The tab is reflected in the query string.

- **Loads:** `GET /auth/me` · `GET /teacher/classes` (**poll 5 s**) · `GET /teacher/copilot/reports` (**poll 30 s**).
- **Per selected class:** `GET /teacher/classes/:id/students` (**poll 5 s**) · `GET /teacher/classes/:id/activity/presence` (**poll 30 s**) · `GET /teacher/classes/:id/roadmap`.
- **Per selected student:** `GET .../students/:sid/metrics` · `GET .../students/:sid/activity?limit=20` (**poll 30 s**, only on the student-list tab).
- **Per selected exercise:** `GET .../exercises/:eid/submissions`.
- **Actions:** create class · add students by username (render `added`/`skipped`/`notFound` separately) · grade a submission (`POST /teacher/submissions/:id/grade`, then invalidate both the submissions list and that student's metrics) · delete a lesson (destructive — confirm) · logout.
- **Notifications** are read from `localStorage['eduflow.notifications']` and the `eduflow-notification` window event, not from a socket of its own.
- **States:** no classes at all · class selected with no students · no student selected · no submissions for an exercise · copilot report ready (badge) · metrics unavailable.

Two things to fix while redesigning: the 5-second polls (§2.5) should become socket-driven or user-triggered refreshes, and the student radar reads the wrong field names so it always plots zeros (§11.1). The file is **1,906 lines** — every tab, modal, and card is inlined. Split it.

### 10.14 `/teacher/lesson/create` — authoring wizard

Three steps, with draft recovery through `localStorage['draftExerciseId']`.

**Step 1 — goal.** Title, description, `lessonGoal` (≤1000 chars), curriculum triple (subject → topic → concept, cascading; §12.1), class multi-select, optional file.

On "generate":
1. `POST /exercises/create-lesson/precheck`. Verdict `no_material` → show what is missing (each `skills[]` entry carries an `evidence_span` quoting the teacher's own words) and offer "generate anyway". Any other verdict, or a precheck failure, proceeds silently.
2. `POST /exercises/create-lesson/lesson1` (multipart), passing `allowGenerated: 'true'` only if the teacher explicitly consented. Store `draftExerciseId` in `localStorage`.
3. `POST /exercises/create-lesson/lesson2` (multipart) with `draftExerciseId`. Read `problems`.

**Step 2 — generating.** Long-running; both calls use an extended timeout. Show which phase is active. On failure, the wizard retries recovery up to 4 times by re-reading the draft from the server (a fallback model may have completed it) before surfacing an error.

**Step 3 — review + publish.** Renders `DraftReview` over the 12-problem pool grouped by role (3 each), plus `coverage`, `masteryNotices`, `masteryProvenance`, and the Lesson 1 checkpoint questions. The teacher may reject problems; a non-empty rejection list disables publishing and asks for a regeneration.

Publish → `PATCH /exercises/{draftExerciseId} { classIds, deadline }`. On `400`, read `blockers` from the error body, render them, and scroll to top. On success, clear `localStorage` and go to `/teacher/dashboard`.

- **States:** step 1 form · precheck running · `no_material` dialog · generating lesson 1 · generating lesson 2 · recovery-in-progress · review · publishing · blocked-by-gate · published.

Two things to change: recovery currently fetches `GET /exercises` (the whole collection) and filters client-side — it needs a real "get my draft" endpoint (§11.4). And user feedback is delivered through `alert()` throughout; replace it.

### 10.15 `/teacher/lesson/[lessonId]/review`

The shared review screen for copilot-built drafts. `[lessonId]` is an **AI-side lesson id**.

- **Loads:** `GET /teacher/copilot/drafts/{lessonId}` → `normalizeDraft()` · `GET /teacher/classes` for the picker.
- **Branches on `draft.kind`:**
  - `main` → class picker + deadline; publish via `POST /exercises/ai-drafts/{lessonId}/publish`.
  - `remedial` / `advanced` → **hide the class picker entirely** and publish via `POST /teacher/copilot/extra-exercises/{lessonId}/publish`. A follow-up targets the specific students the AI service selected; re-aiming it at a whole class would hand the remedial set to students who did not need it.
- **Actions:** approve all AI-written problems (`POST /exercises/ai-drafts/{lessonId}/approve-generated`, then refetch) · reject problems · publish.
- **States:** loading · not found (404 from the AI service) · main draft · follow-up draft · unapproved-AI-problems blocker · publishing · blocked (render `blockers`) · published.

### 10.16 `/teacher/copilot`

Split view: chat on the left, report list on the right.

- **Loads:** `GET /teacher/copilot/reports`.
- **Chat:** `POST /teacher/copilot/chat` with `conversation_id` from `localStorage`. Insert an optimistic "analysing…" bubble, then replace it with `response` + `steps` + `drafts`.
- **Renders per message:** markdown response · `steps` as a tool-activity trail · `drafts` as cards linking to `/teacher/lesson/{lessonId}/review`.
- **Report list:** highlights `REPORT_READY`; unread count is `REPORT_READY && !acknowledgedAt`.
- **Suggested prompts** seed an empty conversation.
- **States:** empty conversation (welcome message) · sending · responded · error (`getReadableError` handles `message` as string or array) · reports loading/empty.

Transcript is in-memory only; a reload loses it (§11.7).

### 10.17 `/teacher/copilot/[lessonId]`

Post-deadline lesson report.

- **Loads:** `GET /teacher/copilot/{lessonId}/report`, **polling while `status` is `PENDING` or `ANALYSING`** and stopping otherwise.
- **Renders:** strengths and gaps as skills · student groups (remedial / advanced / not-finished) resolved through `student_names` · `attention_reasons` per student · `totalStudents`.
- **Actions:** dismiss (`POST /teacher/copilot/{lessonId}/dismiss` → back) · continue the curriculum (prefills `/teacher/lesson/create` with `subject`/`topic`/`concept` from the report) · generate follow-ups (`/teacher/copilot/{lessonId}/extra`).
- **States:** PENDING · ANALYSING · REPORT_READY · FAILED · `REPORT_READY` with a `null` report body (design it — it has happened).

### 10.18 `/teacher/copilot/[lessonId]/extra`

- **Actions:** generate (`POST /teacher/copilot/{lessonId}/extra-exercises`) · publish all (`POST /teacher/copilot/{lessonId}/extra-exercises/publish`), then invalidate `['teacher','copilot',lessonId,'report']`.
- **Renders:** one panel per group (`remedial` / `advanced`) with student count, summary, and problems; answers behind a reveal toggle.
- **States:** idle · generating · `created: false, reason: 'recommendation_proceed'` (the class is even — say so plainly, it is a good outcome) · drafts ready · publishing · published.

Prefer routing each group through `/teacher/lesson/{aiLessonId}/review` and publishing per-group, so a teacher never approves a set sight unseen.

### 10.19 `/teacher/exercises/upload`

- **Actions:** pick a curriculum triple, drag or choose a file, `POST /exercises/upload` (multipart).
- **Copy must be accurate:** this registers a document for later mining. It does **not** create a lesson and does not parse anything now.
- **States:** idle · dragging · uploading · stored (show `documentId`, offer `previewUrl`) · rejected (wrong type, >10 MB, magic-byte mismatch).
- The `shared` flag is in the DTO but not in the UI — expose it. A private-by-default bank is what leaves every new teacher with nothing.

### 10.20 `/teacher/settings`

- **Loads:** `GET /auth/me`.
- **Actions:** `PATCH /auth/profile { fullName?, newPassword? }`.
- **States:** loading · editing · saving · saved · error.
- Note `/auth/me` reads the JWT, not the database, so a name change does not appear here until the token is reissued. Either reissue on profile update or read from the mutation response.

---

## 11. Contract defects and proposed changes

These are real defects found in the current code, ordered by impact. Each is a decision the redesign should make deliberately.

### 11.1 Teacher student-metrics: field names do not match — the radar always shows zero

The backend returns `{ studentId, studentName, thinkingScore, skillScore, resultScore }`. The frontend type declares `{ studentName, thinking_score, skill_score, result_score, attendance, engagement, average_score }` and the dashboard reads `studentMetrics?.thinking_score ?? 0` for all six radar axes.

Result: **every axis renders 0 for every student.** Three fields exist under different names; `attendance`, `engagement`, and `average_score` do not exist at all.

*Proposed:* make both metrics endpoints return the same shape. Standardise on `snake_case` (matching the student endpoint and the AI service), and either implement `attendance`/`engagement`/`average_score` or drop those axes from the chart.

```ts
// proposed, both endpoints
interface Metrics {
  student_id: string;
  student_name?: string;   // teacher view only
  thinking_score: number;
  skill_score: number;
  result_score: number;
}
```

### 11.2 Assignments carry no real due date or status

`GET /student/me/assignments` hardcodes `due_date = now + 7 days` on every item and `status = 'TODO'` on every item. The dashboard sorts by that date, renders a calendar from it, and shows an "overdue" concept the data cannot support. Meanwhile a real deadline **does** exist — `lesson_publications.deadline`, set at publish time and used to schedule the copilot job.

*Proposed:* read the real deadline and derive real status.

```ts
interface Assignment {
  assignment_id: string;
  lesson_id: string;
  title: string;
  description: string;
  due_date: string;                              // from lesson_publications.deadline
  status: 'TODO' | 'SUBMITTED' | 'GRADED' | 'OVERDUE';
  class_id: string;
  class_name: string;
}
```

### 11.3 Two endpoints fabricate data instead of returning 404

- `GET /student/exercises/:id` — an unknown id returns `200` with a hardcoded English "Photosynthesis Fundamentals" lesson and one MCQ about chloroplasts.
- `GET /student/report/:lessonId` — with no session data it returns a score of **85**, status `PASSED`, and an English worked solution about solving a system of equations, with invented Vietnamese feedback strings.

A student can be shown a passing grade for work they never did. Both should `404`.

*Also:* `StudentReport.highlights[].color` contains raw Tailwind class strings generated server-side (`'bg-emerald-100 text-emerald-800'`). Presentation belongs in the frontend, and JIT purging will drop classes that appear nowhere in the source.

*Proposed:*

```ts
interface Highlight {
  word: string;
  kind: 'strength' | 'weakness' | 'note';   // frontend maps kind → styling
  feedback: string;
}
```

### 11.4 `GET /exercises` returns the entire collection, unfiltered

No teacher filter, no pagination, no field projection. Every exercise document in the database — other teachers' drafts, unpublished pools, and `final_answer` on every problem — is returned to any authenticated teacher. The wizard calls it and scans client-side to recover one draft by id.

This is a data-exposure problem and an unbounded payload that grows with the product.

*Proposed:* delete the route. Replace with the two lookups the frontend actually needs:

```
GET /exercises/drafts/:draftExerciseId   → the draft, ownership enforced
GET /exercises/drafts?lessonId=:lessonId → the draft for a lesson id
```

### 11.5 Login never sets `refresh_token`, so refresh is unreachable

`POST /auth/login` sets `access_token` and `csrf_token`. Only `POST /auth/refresh` sets `refresh_token` — and it requires one to already be present. The refresh flow can therefore never start; a 7-day access token simply expires and the user is bounced to `/login`. The frontend has no refresh interceptor either.

*Proposed:* set `refresh_token` at login, and add a 401 interceptor that attempts one refresh before redirecting.

### 11.6 `POST /activity/log` exists but is never called

The whitelist (`LESSON_OPENED`, `EXTRA_LESSON_OPENED`, `AI_SESSION_STARTED`, `AI_SESSION_CLOSED`) matches exactly the moments the student pages already track — to PostHog only. The endpoint also refreshes presence, so calling it would make the teacher's presence and activity timeline substantially richer at no cost.

*Proposed:* fire it alongside `trackEvent` at those four moments.

### 11.7 Copilot conversations have no server-side history

`conversation_id` lives in `localStorage` (one global conversation per browser, shared across every class) and there is no endpoint to read a conversation back. A reload loses the transcript; a second device starts blind; the id can drift from a conversation the server has since dropped.

*Proposed:* `GET /teacher/copilot/conversations` and `GET /teacher/copilot/conversations/:id/messages`, with the id owned by the server rather than the browser.

### 11.8 Streaming is inconsistent between the two tutor surfaces

`/student/lesson/[id]/part2` streams; `/student/lesson/[id]/extra` does not, despite the same backend supporting both and the pages being near-identical. The extra page shows a spinner where the main page shows text arriving.

*Proposed:* one shared session-workspace component using `chatStream` for both.

### 11.9 `POST /teacher/classes` does not return the created class

The response is `{ className, createdAt, message }` — no `class_id`, no `class_code`. Since `class_code` is the whole point (students type it to join) and `/teacher/classes` is server-cached for 5 minutes, the UI cannot reliably show the code right after creating the class.

*Proposed:* return the full `TeacherClass`, and invalidate the teacher's class cache on create.

### 11.10 Response envelopes and casing are inconsistent

Four envelope styles (§2.6) and two casing conventions across one API. This is why the frontend has no shared unwrap helper and why §11.1 went unnoticed.

*Proposed for a v2 surface:* one envelope for collections, bare objects for single resources, `snake_case` throughout.

```ts
interface Paginated<T> { data: T[]; nextCursor?: string; total?: number }
```

### 11.11 Server-side caching fights the UI

`teacher:classes` 5 min, `teacher:students` 3 min, metrics 2 min, `student:classes` 5 min. Mutations invalidate some of these but not all — which is why the dashboard polls every 5 seconds to paper over it. Two caching layers with different TTLs and no coordination produce exactly this.

*Proposed:* invalidate on every relevant mutation, drop the polls to 30–60 s or replace them with socket events, and let react-query own client freshness.

### 11.12 Smaller items

- **`alert()` and `window.location.href`** are used for user feedback and navigation across the teacher wizard, review, and extra pages. Replace with toasts and the router.
- **Two icon libraries** (`lucide-react` and `@phosphor-icons/react`) are both bundled. Pick one.
- **The label dictionary** mapping `good_logic` → "Tư duy tốt" etc. is duplicated verbatim in three files (`part2`, `extra`, `report`). Extract it.
- **`ComplexProblem`** declares `final_answer` and `approach_list`, which the server strips. Replace with `SanitizedProblem` so the type tells the truth.
- **`/forgot-password`** has no backend. Build it or remove it.
- **`current_process`** duplicates `current_progress` on every session payload. Remove it from a v2 surface.
- **`GET /student/:studentId/*`** duplicates every `/student/me/*` route. Drop the parameterised variants.
- **ADMIN has no routing rules** in `middleware.ts` (§3.2). Decide whether ADMIN is a teacher superset or its own section.

---

## 12. Appendix: enums and coverage matrix

### 12.1 Curriculum taxonomy

One subject exists today: **`math8`**. The concept key is `"{subject}:{topic}:{concept}"`. Concept values are only valid under their own topic — the picker must cascade.

| Topic | Concepts |
|---|---|
| `polynomials` | `monomials`, `basics`, `add-subtract`, `multiply`, `divide-by-monomial` |
| `identities` | `square-of-sum-difference`, `difference-of-squares`, `cube-of-sum-difference`, `sum-difference-of-cubes`, `factoring-common-factor`, `factoring-by-identities`, `factoring-by-grouping` |
| `quadrilaterals` | `basics`, `isosceles-trapezoid`, `parallelogram`, `rectangle`, `rhombus`, `square` |
| `thales` | `theorem`, `consequences`, `midsegment`, `angle-bisector` |
| `data-charts` | `collect-classify`, `represent`, `choose-chart`, `analyze` |
| `rational-expressions` | `basics`, `properties`, `add-subtract`, `multiply-divide` |
| `linear-equations-functions` | `solve-equation`, `word-problems`, `function-concept`, `linear-function`, `slope` |
| `probability` | `outcomes`, `by-ratio`, `experimental` |
| `similar-triangles` | `concept`, `cases`, `pythagorean`, `right-triangles`, `similar-figures` |
| `solid-shapes` | `triangular-pyramid`, `square-pyramid` |

Defaults: `math8` / `polynomials` / `monomials`. Note `basics` and `add-subtract` appear under several topics — never treat a concept as globally unique.

A legacy fully-qualified form (`math8-polynomials-monomials`) is still accepted and mapped to the canonical short value. Do not emit it from new code.

### 12.2 Enumerations

| Type | Values |
|---|---|
| User role | `STUDENT`, `TEACHER`, `ADMIN` |
| Roadmap status (student) | `locked`, `active`, `completed` |
| Submission status | `SUBMITTED`, `GRADED`, `EVALUATED` |
| Copilot report status | `PENDING`, `ANALYSING`, `REPORT_READY`, `FAILED` |
| Presence status | `online`, `idle`, `offline` |
| Draft kind | `main`, `remedial`, `advanced` |
| Problem role | `reinforcement`, `challenge`, `exploration`, `extension` |
| Problem origin | `extracted`, `derived_variant`, `ai_generated` |
| Feasibility verdict | `ready`, `needs_extraction`, `no_material` |
| Skill feasibility | `in_bank`, `in_documents`, `no_material` |
| Publish blocker | `missing_skills`, `missing_problem_roles`, `pool_incomplete`, `unapproved_ai_problems`, `knowledge_missing` |
| Content notice | `composed_from_source_structure`, `source_images_dropped`, `exploration_not_applied` |
| Provenance origin | `generated`, `sourced`, `hybrid` |
| Notification type | `ASSIGNMENT_SUBMITTED`, `ASSIGNMENT_GRADED`, `ASSIGNMENT_PUBLISHED` |
| Client activity event | `LESSON_OPENED`, `EXTRA_LESSON_OPENED`, `AI_SESSION_STARTED`, `AI_SESSION_CLOSED` |

### 12.3 Endpoint coverage

**In use by the current frontend (33)**

| Endpoint | Pages |
|---|---|
| `POST /auth/login` | login |
| `POST /auth/register` | register |
| `GET /auth/me` | student layout, student dashboard, teacher dashboard, settings |
| `GET /auth/token` | NotificationListener |
| `PATCH /auth/profile` | settings |
| `POST /auth/logout` | student layout, teacher dashboard |
| `POST /student/classes/join` | student dashboard |
| `GET /student/me/metrics` | student dashboard |
| `GET /student/me/classes` | layout, dashboard, classes, roadmap, report |
| `GET /student/me/assignments` | student dashboard |
| `GET /student/classes/:id/roadmap` | student dashboard, roadmap |
| `GET /student/exercises/:id` | part1, essay |
| `GET /student/exercises/:id/submission` | essay |
| `POST /student/submissions` | essay |
| `GET /student/report/:id` | report |
| `POST /storage/upload` | essay |
| `GET /teacher/classes` | TeacherShell, dashboard, lesson create, review |
| `POST /teacher/classes` | teacher dashboard |
| `POST /teacher/classes/add-students` | teacher dashboard |
| `GET /teacher/classes/:id/students` | teacher dashboard |
| `GET /teacher/classes/:id/students/:sid/metrics` | teacher dashboard |
| `GET /teacher/classes/:id/students/:sid/activity` | teacher dashboard |
| `GET /teacher/classes/:id/activity/presence` | teacher dashboard |
| `GET /teacher/classes/:id/roadmap` | teacher dashboard |
| `GET /teacher/classes/:c/exercises/:e/submissions` | teacher dashboard |
| `POST /teacher/submissions/:id/grade` | teacher dashboard |
| `DELETE /teacher/classes/:c/exercises/:e` | teacher dashboard |
| `POST /exercises/create-lesson/precheck` | lesson create |
| `POST /exercises/create-lesson/lesson1` | lesson create |
| `POST /exercises/create-lesson/lesson2` | lesson create |
| `PATCH /exercises/:id` | lesson create |
| `GET /exercises` | lesson create (draft recovery) |
| `POST /exercises/upload` | exercises upload |
| `POST /exercises/ai-drafts/:id/approve-generated` | review |
| `POST /exercises/ai-drafts/:id/publish` | review |
| `GET /teacher/copilot/reports` | copilot, teacher dashboard |
| `POST /teacher/copilot/chat` | copilot |
| `GET /teacher/copilot/drafts/:id` | review |
| `GET /teacher/copilot/:id/report` | copilot detail |
| `POST /teacher/copilot/:id/extra-exercises` | copilot extra |
| `POST /teacher/copilot/:id/extra-exercises/publish` | copilot extra |
| `POST /teacher/copilot/extra-exercises/:aiLessonId/publish` | review |
| `POST /teacher/copilot/:id/dismiss` | copilot detail |
| `POST /ai-session/start` · `GET /ai-session/active/:id` · `POST /ai-session/close` | part2, extra, essay |
| `POST /ai-session/chat` (buffered) | extra, essay |
| `POST /ai-session/chat/stream` (SSE) | part2 |

**Available but unused (13)** — each is either a gap in the UI or dead weight.

| Endpoint | Verdict |
|---|---|
| `GET /auth/csrf-token` | Useful — call it to recover from a 403 CSRF failure. |
| `POST /auth/refresh` | Blocked by §11.5. Wire it up. |
| `POST /auth/logout-all` | Worth surfacing in settings. |
| `POST /auth/activate-beta` | Needed if beta gating is real; `middleware.ts` already decodes the flag. |
| `POST /activity/log` | **Should be called** — see §11.6. |
| `GET /activity/analytics/dau` | No analytics screen exists. Build one or drop it. |
| `GET /activity/analytics/retention/d3` | Same. |
| `GET /student/submissions/me` | Would support a "my submissions" view. |
| `GET /student/lessons/:id/extra-exercises` | Redundant — the roadmap embeds it. |
| `GET /student/:sid/metrics` · `/classes` · `/assignments` | Duplicates of `/me/*`. Drop. |
| `GET /student/:sid/classes/:cid/classmates` | No feature uses it. |
| `POST /exercises` | Internal plumbing; not a UI route. |
| `GET /health` | Ops only. |

---

*Generated from `edtech-frontend` and `edtech-backend` on branch `dev`. Where this document and the code disagree, the code is right — file a correction.*
