# D-Friend Student Workspace — UX/UI Plan V1

Status: proposed for product review  
Scope: planning and design only  
Primary flow: `Session 1 → Session 2 → Feedback`

## 1. Product intent

Student Workspace is a focused learning environment for mostly middle-school students and a smaller high-school cohort. It should feel energetic and supportive without looking childish or turning learning into a points game.

The daily loop is deliberately short:

1. Open the app.
2. See every currently available lesson.
3. Choose a lesson and enter Session 1.
4. Review or complete Session 1 knowledge items.
5. Continue into Session 2 with the Study Buddy.
6. Receive feedback.
7. Return to Today or start personalised practice when available.

### Product principles

- Task-first: the student immediately sees what can be learned now.
- Resume without confusion: opening a lesson always starts at Session 1, while preserving completed items.
- No public comparison: no rankings, class averages or classmates' learning data.
- Study Buddy, not tutor: the AI is framed as a peer learning alongside the student. Behaviour remains owned by `ai-service`.
- Progress with meaning: progress only moves when the backend confirms learning progress. It must remain flat during `awaiting_reasoning`.
- Feedback over judgement: describe strengths, gaps and the next useful action instead of a pass/fail identity.

## 2. V1 boundaries

### Included

- Today dashboard with all open lessons.
- Joined classes and classmate directory.
- Per-class roadmap.
- Student profile, competence snapshot and feedback history.
- Session 1 gated knowledge flow.
- Session 2 two-column problem + Study Buddy workspace.
- Mountain progress visualization.
- End-of-session feedback.
- Join class by class code.
- Desktop, tablet and mobile behavior.

### Not included

- Essay and file-upload assignments.
- Global/free-form AI chat.
- Leaderboards, streaks, coins, XP or class averages.
- Social messaging between classmates.
- Student access to another student's scores, activity or progress.
- Editing the Study Buddy's reasoning policy in the frontend.

## 3. Information architecture

The student shell uses top navigation on desktop/tablet and bottom navigation on mobile.

| Navigation | Route | Purpose |
|---|---|---|
| Hôm nay | `/student/dashboard` | All current lessons and the next deadlines |
| Lộ trình | `/student/roadmap` | Per-class completed, active and locked lessons |
| Lớp học | `/student/classes` | Joined classes, teacher, progress, classmates and join-by-code |
| Hồ sơ | `/student/profile` | Competence, completed lessons and prior feedback |

Reports are not a top-level navigation item. They live in Profile and at the end of a lesson. Assignments are represented as lessons on Today and Roadmap.

Immersive learning routes hide the normal navigation:

- `/student/lesson/[exerciseId]/part1`
- `/student/lesson/[exerciseId]/part2`
- `/student/lesson/[lessonId]/extra`
- `/student/report/[lessonId]`

## 4. Visual direction

### Design read

A learning workspace for ages 12–17 with a calm, contemporary EdTech language: focused enough for long study sessions, warm enough to feel encouraging, and mature enough for high-school students.

### Design dials

- Design variance: 5/10
- Motion intensity: 4/10
- Visual density: 5/10

### Foundation

Reuse the landing/teacher design tokens:

- Background: `#fdfaf7`
- Surface: `#ffffff`
- Ink: `#292524`
- Muted: `#78716c`
- Line: `#e7e5e4`
- Brand: `#ff751f`
- Brand deep: `#de6113`
- Brand soft: `#ffe3d1`
- Accent: `#ffaf7e`
- Success: `#10b981`

Use Phosphor icons only. Use a display weight for page headings and a neutral sans for reading. Avoid cartoon mascots, emoji, confetti and ornamental gradients.

## 5. Student shell

### Desktop/tablet

```text
┌──────────────────────────────────────────────────────────────────────┐
│ D-Friend     Hôm nay  Lộ trình  Lớp học  Hồ sơ      [avatar ▾]     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                         page content                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- One light topbar consistent with the landing palette.
- Active navigation uses brand-soft background and ink text.
- Account menu contains identity and logout.
- Shell owns page scroll. Immersive lesson routes own their internal scroll regions.

### Mobile

```text
┌──────────────────────────────┐
│ D-Friend              avatar │
├──────────────────────────────┤
│                              │
│         page content         │
│                              │
├──────────────────────────────┤
│ Hôm nay  Lộ trình  Lớp  Tôi │
└──────────────────────────────┘
```

- Four-item bottom navigation.
- Safe-area aware and fixed above the device home indicator.
- Page content receives bottom padding equal to the navigation height.

## 6. Hôm nay dashboard

### Purpose

Show every currently open lesson. The dashboard does not choose only one “next lesson”.

### Ordering

1. Overdue lessons.
2. Lessons already started.
3. Upcoming lessons by nearest deadline.
4. Active roadmap lessons without a deadline.

### Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Chào An, hôm nay mình học gì?                     2 lớp · 4 bài mở  │
│                                                                      │
│ [Tiến độ tuần: 3/6 bài]       [Tư duy] [Kỹ năng] [Kết quả]          │
│                                                                      │
│ Bài học hiện tại                                                    │
│ ┌───────────────────────────┐ ┌───────────────────────────┐         │
│ │ Toán 8A1 · còn 2 ngày     │ │ Toán 8A2 · đang học      │         │
│ │ Đơn thức và đa thức       │ │ Phép cộng đa thức        │         │
│ │ Session 1  3/5 phần       │ │ Session 2  2/4 bài       │         │
│ │ [Học từ Session 1]        │ │ [Mở lại Session 1]       │         │
│ └───────────────────────────┘ └───────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

### Lesson card

- Class name.
- Lesson title and short goal.
- Deadline with relative copy.
- Current phase and progress.
- Primary CTA always enters Session 1.
- Completed Session 1 items remain completed.
- Overdue is communicated with copy and a restrained danger accent, not a full red card.

### States

- Loading: header and lesson-card skeletons.
- Partial failure: compact inline banner while successful sections remain usable.
- No classes: join-class onboarding replaces the lesson grid.
- Classes but no open lessons: calm empty state linking to Roadmap.
- Metrics all zero: “Chưa đủ dữ liệu để vẽ năng lực”, never an empty radar.

### Data

- `GET /auth/me`
- `GET /student/me/metrics`
- `GET /student/me/classes`
- `GET /student/me/assignments`
- `GET /student/classes/:classId/roadmap` for each joined class

## 7. Lớp học

### Class index

- Search by class or teacher.
- A–Z sorting.
- Join class button opens a right-side sheet on desktop and bottom sheet on mobile.
- Each class shows teacher, lesson completion and personal progress only.

### Class detail

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Toán 8A1 · Cô Nguyễn Minh Anh                        [Mở lộ trình]  │
│ Tiến độ của bạn  7/10 bài                                           │
├──────────────────────────────────────────────────────────────────────┤
│ Bài đang mở                         Bạn cùng lớp                     │
│ • Đơn thức và đa thức               MA  Trần Minh An                 │
│ • Phép cộng đa thức                 NL  Phạm Ngọc Lan                │
│                                     HN  Lê Hoàng Nam                 │
└──────────────────────────────────────────────────────────────────────┘
```

Classmates expose only display name/avatar. They are not clickable profiles and show no scores, progress, rank or online competition state.

### Data

- `GET /student/me/classes`
- `GET /student/:studentId/classes/:classId/classmates`
- `POST /student/classes/join { classCode }`

## 8. Lộ trình

### Layout

A vertical mountain trail, not a generic stepper. The selected class sits in a compact class switcher above the path.

```text
             [05] Đích tiếp theo · locked
                 ╱
        [04] Phép nhân đa thức · active
             ╱      └── Luyện thêm
    [03] Cộng đa thức · completed
         ╱
[02] Thu gọn đa thức · completed
```

### Node rules

- Completed: success color, clickable, opens with `retake=1`.
- Active: brand outline, clickable.
- Locked: muted, genuinely non-interactive.
- Extra exercises: a branch node off the main trail.
- The trail does not imply comparison with classmates.

### Data

- `GET /student/me/classes`
- `GET /student/classes/:classId/roadmap`

## 9. Session 1 — Understand

### Purpose

Build the minimum knowledge needed before problem practice. Every visit starts on Session 1, while previously completed items remain complete.

### Desktop layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ← Lộ trình    Đơn thức và đa thức       Session 1/2     3/5 phần   │
├───────────────────────┬──────────────────────────────────────────────┤
│ 01 ✓ Khái niệm        │                                              │
│ 02 ✓ Ví dụ            │  Phần 03 · Thu gọn đơn thức                 │
│ 03 ● Thu gọn          │  Knowledge content                          │
│ 04 🔒 Tính giá trị    │                                              │
│ 05 🔒 Kiểm tra        │  Check question                              │
│                       │  [answer controls] [Kiểm tra]                │
│                       │                              [Tiếp tục]      │
└───────────────────────┴──────────────────────────────────────────────┘
```

### Interaction model

- Show one knowledge item at a time.
- Completed items remain reviewable.
- Only the next item is active; future items appear as compact locked stubs.
- Advancing requires an attempt on every check question, not a correct answer.
- Wrong answers show explanation and “Thử lại”.
- Teacher-authored and AI-added content retain their source badges.
- When all items are complete, reveal “Sang Session 2”.

### Mobile

- Replace the left rail with a compact horizontal step strip.
- Content is the only scrolling region under a fixed lesson header.
- CTA is sticky but occupies its own layout row and never overlays content.

### Data

- `GET /student/exercises/:exerciseId`
- Local progress persistence keyed by exercise and user, reconciled with backend session state where available.

## 10. Session 2 — Practise with Study Buddy

### Core layout

Two columns on desktop:

- Problem workspace: 42%.
- Study Buddy chat: 58%.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ← Session 1    ĐƯỜNG LÊN ĐỈNH  ◆──◆──◇──◇       2/4 bài            │
├──────────────────────────────┬───────────────────────────────────────┤
│ Bài 02 · Thu gọn đơn thức    │ Study Buddy                          │
│                              │                                       │
│ [problem statement]          │ Buddy message                         │
│                              │ Student message                       │
│ Scratchpad                   │ Buddy asks for reasoning              │
│ [editor / math shortcuts]    │                                       │
│                              │                                       │
│ [Nộp đáp án]                 │ [Nhắn cho Study Buddy]          [↑]   │
└──────────────────────────────┴───────────────────────────────────────┘
```

The page itself does not scroll. The problem pane and chat transcript scroll independently. Both composers remain in normal grid rows and never overlay content.

### Mountain progress

Use a restrained ridge line made from the geometric language of the D-Friend logo.

- One summit stage per assigned problem.
- Completed stage: filled brand/success marker.
- Current stage: D-Friend marker with a subtle 180–240 ms step animation.
- Future stage: neutral outline.
- `awaiting_reasoning`: marker stays in place and label changes to “Cần thêm lập luận”.
- Farming/spam: marker stays in place; show a neutral explanation instead of punishment language.
- All complete: summit flag appears and the close-session CTA becomes visually dominant.
- No character mascot, coins, streak, confetti or red pulsing CTA.

### Study Buddy framing

- UI label is always “Study Buddy”, never “AI Tutor”.
- Copy sounds peer-to-peer: “Cùng thử cách này” rather than “Thầy/cô sẽ hướng dẫn”.
- Response policy, refusal behavior, reasoning gates and safety are owned by `ai-service`; frontend must not recreate or infer them.

### State model

- Initialising session.
- Initialisation failed: retry and return to Session 1.
- Idle.
- Buddy typing.
- Streaming reply.
- Submitting answer.
- Awaiting reasoning.
- Farming/spam detected.
- Degraded AI reply.
- All problems complete.
- Closing.
- Closed with feedback.
- Close failed: retry without losing the transcript.

### Responsive behavior

- Desktop ≥1024 px: simultaneous 42/58 split.
- Tablet 768–1023 px: 46/54 split with collapsible problem list.
- Mobile <768 px: single workspace with “Bài tập / Study Buddy” tabs.
- Mountain progress remains sticky under the lesson header.
- Switching tabs preserves scratchpad, chat scroll and active problem.

### Data

- `GET /ai-session/active/:exerciseId`
- `POST /ai-session/start { lessonId, reset }`
- `POST /ai-session/chat/stream`
- `POST /ai-session/close { sessionId, lessonId }`

## 11. Feedback

### Hierarchy

Feedback answers three questions in this order:

1. What did I complete?
2. What did I do well?
3. What should I practise next?

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    Bạn đã hoàn thành bài học                         │
│                         4/4 bài · 78%                                │
│                                                                      │
│  Bạn làm tốt                 Cần luyện thêm                          │
│  • Nhận biết đơn thức        • Giải thích bước thu gọn              │
│  • Chọn đúng quy tắc         • Kiểm tra dấu                         │
│                                                                      │
│  Tư duy 7.4       Kỹ năng 8.1       Kết quả 7.8                    │
│                                                                      │
│  Study Buddy nhận thấy: ...                                         │
│                                                                      │
│  [Về Hôm nay]                         [Luyện thêm nếu có]            │
└──────────────────────────────────────────────────────────────────────┘
```

### Rules

- Avoid pass/fail identity language.
- Show at most three strengths and two gaps.
- Display the existing 0–10 competence scale consistently.
- Evidence copy should be short enough for a student to understand without teacher interpretation.
- “Luyện thêm” only renders when extra exercises exist.
- “Về Hôm nay” is the primary default exit.

### Data

- Session summary returned by `POST /ai-session/close`.
- `GET /student/report/:lessonId` for revisiting feedback.

## 12. Hồ sơ

Profile is personal reflection, not a public identity page.

### Sections

- Name/avatar and joined class count.
- Competence snapshot: Thinking, Skill, Result on 0–10 scale.
- Completed lesson history.
- Prior feedback grouped by class and date.
- Account menu for profile editing and logout.

### Empty state

When all metrics are zero, explain that competence appears after completing a Session 2. Do not render a zero radar as if it were an assessment.

### Data

- `GET /auth/me`
- `GET /student/me/metrics`
- `GET /student/submissions/me` only when submission history becomes part of a later scope
- Existing lesson reports available from roadmap/history links

## 13. Shared frontend architecture

```text
src/
├── app/student/
│   ├── layout.tsx
│   ├── dashboard/page.tsx
│   ├── classes/page.tsx
│   ├── classes/[classId]/page.tsx
│   ├── roadmap/page.tsx
│   ├── profile/page.tsx
│   ├── lesson/[id]/part1/page.tsx
│   ├── lesson/[id]/part2/page.tsx
│   ├── lesson/[id]/extra/page.tsx
│   └── report/[id]/page.tsx
├── components/student/
│   ├── student-shell.tsx
│   ├── today-dashboard.tsx
│   ├── lesson-card.tsx
│   ├── class-workspace.tsx
│   ├── mountain-roadmap.tsx
│   ├── session-one-workspace.tsx
│   ├── study-session-workspace.tsx
│   ├── mountain-progress.tsx
│   ├── study-buddy-chat.tsx
│   └── feedback-workspace.tsx
└── lib/
    ├── student-api.ts
    └── student-stream.ts
```

`study-session-workspace.tsx` must be shared by normal Session 2 and personalised extra practice. Only session key, problem source and transport mode differ.

## 14. Data and security boundaries

- Route students by authenticated role; never trust a student id from the client when a `/me` route exists.
- Keep the backend's lesson-access checks authoritative.
- Locked roadmap nodes are both visually and functionally disabled.
- Never fetch classmates' metrics or reports.
- Do not store AI tokens or raw auth tokens in localStorage.
- Preserve partial Study Buddy output if a stream disconnects and allow a safe retry.
- A closed session cannot accept further messages.

## 15. Implementation phases after approval

### Phase 1 — Shell and Today

- Student API contracts and query keys.
- Student shell and responsive navigation.
- Today dashboard, all-open-lessons ordering and join-class empty state.

### Phase 2 — Classes and Roadmap

- Class index/detail and privacy-safe classmate directory.
- Per-class mountain roadmap with completed/active/locked states.

### Phase 3 — Session 1

- Knowledge-item gating.
- Answer attempts, explanations, review and preserved completion.

### Phase 4 — Session 2

- Shared study-session workspace.
- Streaming Study Buddy chat.
- Answer submission threads and scratchpad.
- Mountain progress and all backend states.

### Phase 5 — Feedback and Profile

- Close-session feedback.
- Report revisit and profile history.
- Empty/loading/error/degraded states.

### Phase 6 — Verification

- API contract tests.
- Desktop/tablet/mobile visual QA.
- Keyboard and focus testing.
- Stream interruption and retry testing.
- Production typecheck, lint and build.

## 16. Acceptance criteria

The design is ready for implementation when all of the following remain true:

- Dashboard shows every open lesson and always enters through Session 1.
- Reopening Session 1 preserves completed knowledge items.
- Session 2 is 42/58 problem/chat on desktop and tabbed on mobile.
- Only the Session 2 internal panes scroll; the page and composers do not overlap.
- Mountain progress reflects backend-confirmed state and does not advance during reasoning gates or farming detection.
- The AI is labeled Study Buddy everywhere in student UI.
- Classmates are visible without any scores, progress or comparison data.
- Feedback prioritizes completion, strengths, gaps and next action.
- No V1 route exposes essay/file-upload flow or global AI chat.
- All primary screens define loading, empty, error and responsive states.

