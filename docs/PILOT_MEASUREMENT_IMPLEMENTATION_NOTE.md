# D-Friend Pilot Measurement Implementation Note

Status: In progress
Started: 2026-08-27
Authoritative spec: `docs/PILOT_MEASUREMENT_SPEC.md`

## Confirmed implementation scope

- Add one durable teacher decision record per immutable main report.
- Capture the teacher's intended classroom action before the first report reveal.
- Record the first real report reveal idempotently.
- Capture changed/confirmed/no-effect, final action, application, and control spillover after class.
- Keep measurement-critical state in Postgres; mirror lifecycle events to `product_events` for audit only.
- Add offline pilot registry/assessment templates and a read-only exporter.
- Do not add a pilot analytics dashboard.
- Do not implement or depend on remedial/advanced follow-up lanes for this pilot.

## Work log

### 2026-08-27 — kickoff

- Saved the approved pilot direction to Codex memory.
- Re-read active frontend/NestJS/AI-service worktrees and preserved unrelated dirty changes.
- Confirmed `lesson_reports` is the immutable report authority and the current report detail endpoint is `GET /teacher/copilot/reports/:reportId`.
- Confirmed current frontend fetches report detail immediately on selection; it must be gated behind the before-decision capture to make "before report reveal" factual.
- Confirmed `copilot_acknowledged_at` is notification dismissal, not a reliable report-open fact.

### 2026-08-27 — durable report-decision backend

- Added one Postgres `teacher_report_decisions` row per immutable main report, linked to report, teacher, and class.
- Added validated endpoints for reading the snapshot, saving intended action, recording first reveal, and saving the post-class effect.
- Main-report detail now rejects direct reads until intended action is stored and the explicit reveal endpoint has run; follow-up reports are not pulled into this pilot measurement flow.
- Before-action edits are locked after reveal. Report-open is idempotent. Post-class capture requires a recorded reveal.
- Mirrored the three lifecycle moments to `product_events`; Postgres remains authoritative.
- Added focused service coverage for the empty state, before capture, reveal prerequisite/idempotency, lock after reveal, post-class capture, and direct-read gate.

### 2026-08-27 — teacher UI and offline export

- Added frontend contracts and API calls for the durable before/open/after flow.
- Main reports now show one required intended-action selection before reveal. The report query is disabled until the explicit reveal timestamp exists.
- Added a compact post-class capture for changed/confirmed/no-effect, final action, application level, useful evidence, and control-class spillover.
- Kept existing follow-up report views outside the measurement gate; no new follow-up workflow was added.
- Added a private registry example, common-assessment CSV template, and one read-only cross-database exporter that writes the four spec files.
- The exporter normalizes authenticated `user_id` through Postgres `students.user_id`, excludes names/raw chat, preserves missing dimensions as blank, and emits identity/data-quality warnings instead of guessing.

## Repository status

### edtech-backend

Status: implemented and locally verified; migration not applied to a live database.

- Prisma `TeacherReportDecision` model and forward-only migration added.
- Validated before/open/after endpoints added under the report snapshot route.
- Teacher ownership and main-report-kind checks enforced.
- Main-report body is server-gated, not merely hidden by frontend state.

### new_frontend

Status: implemented and statically verified.

- API contracts/client methods added.
- Before-reveal gate and after-class capture added to class report detail.
- Existing report generation and follow-up report display remain intact.

### ai-service

Status: no runtime change required.

- The backend-owned read-only exporter reads AI-owned `mastery_sessions` and selected session lifecycle events directly from MongoDB.
- No AI data is mutated and no raw minor chat is exported.

### Offline pilot operations

Status: implemented; blocked on final class IDs, arm assignment, roster provisioning, and real cycle publications.

- `edtech-backend/pilot/pilot-registry.example.json`
- `edtech-backend/pilot/pilot-assessment-template.csv`
- `edtech-backend/scripts/export-pilot-measurement.mjs`
- `npm run pilot:export -- --config ... --out ...`

## Verification ledger

- `docs/PILOT_MEASUREMENT_SPEC.md`: written; `git diff --check` passed before implementation kickoff.
- Backend Prisma clients: generated successfully after schema change.
- Backend focused suite: `58 passed` in `src/copilot/copilot.service.spec.ts`.
- Backend compile: `npx nest build` passed.
- Backend migration: present but deliberately not deployed from this implementation workspace.
- Frontend: `npm run typecheck` passed.
- Frontend targeted ESLint passed for the report UI, API client, and contracts.
- Frontend production build passed after allowing the existing Google Fonts fetch.
- Mocked browser regression suite: `5 passed`, including proof that report detail is not requested before intent and that the after-class payload persists.
- Exporter: Prettier, `node --check`, and the CLI help path passed.
- Exporter read-only live-data dry run: created all four CSVs from local Postgres/Mongo. It correctly warned that the placeholder control roster was empty and the new decision migration was not yet applied.
- Backend repo-wide/targeted ESLint is not a clean verification gate today: the existing Copilot controller/service/spec surface reports hundreds of pre-existing unsafe-`any` violations. Feature verification therefore relies on Prisma validation, focused tests, and Nest compile.
- Live cross-service pilot: not yet run.

## Remaining gates

- Run production-like browser/API verification after applying the migration in a test environment.
- Provision real 9/1 and 9/2 rosters.
- Confirm treatment/control assignment and baseline class strength.
- Approve or replace the proposed success gates before topic-end outcomes are viewed.
- Run a test-account dry cycle proving report -> before decision -> reveal -> after-class decision -> export joins.
