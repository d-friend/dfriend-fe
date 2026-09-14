# Create Lesson Recovery and Pool Stability Specification

**Status:** Implemented and locally verified on 2026-09-14; deployment acceptance pending

**Date:** 2026-09-14

**Applies to:** create-lesson generation in `new_frontend`, `edtech-backend`, and `ai-service`

**Production topology:** one `edtech-backend` container and one `ai-service` container; no horizontal replicas

**Supersedes:** only the automatic-retry rules in Sections 2.9, 6.1, 6.4, and 17 of `CREATE_DRAFT_STABILITY_UPDATE_SPEC.md` when knowledge exists but no complete mastery arc exists

## 1. Outcome

This update must make create-lesson reliable and truthful under the two observed failure modes:

1. Prisma cannot borrow a PostgreSQL connection for the job-status poll and throws `P2024` after using its implicit 21-connection pool.
2. Knowledge is saved, but the first generation envelope ends with `partial_blocked`, zero complete arcs, and all mastery slots missing.

The teacher must not lose accepted knowledge, must not need to keep the loading page open, and must see whether the system is creating a new draft, recovering saved work, or retrying mastery.

The target behavior is:

- use an explicit, bounded Prisma pool appropriate for one long-lived backend container;
- treat transient pool pressure as a temporary status-read failure, not as lesson-generation failure;
- preserve knowledge and accepted slot checkpoints;
- when knowledge exists but there is no complete valid arc, retry only missing mastery work automatically up to two times;
- stop automatic retries as soon as one complete valid arc exists;
- after exhaustion, show a failed mastery state with a teacher-triggered retry action;
- make every retry durable and resumable after page close, refresh, or container restart.

## 2. Confirmed product decisions

1. Production remains two containers: `edtech-backend` and `ai-service`.
2. API and BullMQ lesson-generation worker remain in the same `edtech-backend` process and share one Prisma client pool.
3. Production has one `edtech-backend` instance. This specification does not cover horizontal replicas or PM2/Node clustering.
4. If knowledge exists and zero complete valid arcs exist, keep the knowledge and automatically retry only missing mastery slots.
5. One retry cycle permits at most two automatic mastery retries after the current attempt.
6. As soon as at least one complete valid arc exists, automatic mastery retry stops and the existing `partial_ready` behavior applies.
7. If the cycle still has zero complete arcs after two automatic retries, show a failed mastery state with a teacher-visible retry button.
8. A teacher-triggered retry preserves knowledge and accepted slots and starts a new bounded mastery-only retry cycle.
9. The loading UI must not claim it is recovering a saved process for every newly created lesson.

## 3. Non-goals

- Adding a third worker container or changing the deployment topology.
- Moving the API or BullMQ worker to another process.
- Increasing BullMQ concurrency above `1`.
- Recreating knowledge during a mastery-only retry.
- Replacing or rewriting accepted mastery slots.
- Guaranteeing `12/12`; one complete quality-accepted `4/4` arc remains sufficient for ordinary review.
- Retrying authorization, validation, taxonomy, request-identity, or persistence failures as mastery failures.
- Treating a longer `pool_timeout` as the primary fix for pool exhaustion.
- Query/index optimization without evidence of a slow query.

## 4. Terminology

### 4.1 Generation attempt

The original create-lesson job is the first generation attempt. It may generate knowledge and mastery.

### 4.2 Mastery-only retry

A mastery-only retry:

- uses the same `generation_run_id`;
- loads the existing knowledge checkpoint;
- loads all accepted mastery slot checkpoints;
- receives a new `generation_budget_envelope_id`;
- requests only still-missing mastery slots;
- never calls knowledge generation;
- never mutates an accepted slot.

### 4.3 Retry cycle

A retry cycle consists of one current attempt plus at most two automatic mastery-only retries. The original create-lesson attempt starts the first cycle. A teacher clicking **Thử tạo lại bài tập** starts a new cycle.

### 4.4 Valid arc

A valid arc is one complete, quality-accepted four-slot arc identified from explicit blueprint slot IDs. A non-empty problem list or four unrelated accepted problems is not a valid arc.

## 5. Prisma and Supavisor contract

### 5.1 Connection mode

`edtech-backend` is a persistent container. This update preserves the deployed `DATABASE_URL` endpoint and connection mode; it must not silently switch between Supavisor session mode, transaction mode, and a direct database route. Any endpoint or mode change is a separate infrastructure decision.

`DIRECT_URL` remains reserved for Prisma migration and administrative commands. Runtime application traffic must not silently switch between `DATABASE_URL` and `DIRECT_URL`.

### 5.2 Explicit pool settings

The deployed `DATABASE_URL` must merge these Prisma parameters with its existing query string:

```text
connection_limit=5&pool_timeout=15
```

Rationale:

- the current implicit Prisma limit is `21`, which can exceed or monopolize the session-mode Supavisor allocation;
- one backend instance, BullMQ concurrency `1`, and short observed status queries do not justify 21 application-side connections;
- five connections leave room for the worker, API polling, authentication, and ordinary teacher requests without allowing one process to consume a large session pool;
- fifteen seconds permits a bounded burst to clear, but the design must not hide persistent exhaustion behind a very long wait.

Before deployment, the operator must verify the project’s current Supavisor **Pool Size** in Database Settings. Deployment is blocked if it is below `5` for the application database-role combination. Do not increase `connection_limit` above `5` during this update without concurrent-load evidence.

### 5.3 Startup validation and safe logs

On startup, `edtech-backend` must validate and emit one secret-safe structured event containing:

- connection mode: `supavisor_session`, `supavisor_transaction`, or `direct`;
- database port;
- configured `connection_limit`;
- configured `pool_timeout`;
- backend process count and lesson-worker concurrency.

The log must never include username, password, full connection string, database host credentials, or query-string secrets.

The application defaults to `connection_limit=5` and `pool_timeout=15` so the bounded pool is active without requiring an atomic production environment update. Explicit overrides must pass startup validation; invalid or out-of-range values fail startup.

### 5.4 `P2024` handling

`GET /api/exercises/create-lesson/jobs/:jobId` is a read-only status boundary. When Prisma returns `P2024`:

1. log `lesson_generation.poll_pool_timeout` with job/request ID, Prisma code, retry number, and elapsed time;
2. retry the read once after a small jittered delay between `100–300 ms`;
3. if the second read fails, return HTTP `503` with stable code `GENERATION_STATUS_TEMPORARILY_UNAVAILABLE` and `Retry-After: 2`;
4. do not change the durable generation job status;
5. do not enqueue or cancel generation work.

The frontend may continue its bounded transient polling retry for `500/502/503/504`, but the backend must use `503`, not an opaque `500`, for an exhausted `P2024` status read.

No automatic retry is added to arbitrary database writes. Write idempotency must be designed at the owning operation rather than inferred from `P2024`.

## 6. Automatic mastery recovery state machine

```text
original generation attempt
  -> complete: 12/12, stop
  -> partial_ready: at least one valid arc, stop and open review
  -> zero valid arcs + knowledge exists + retryable missing mastery
       -> mastery_retrying (automatic retry 1/2)
          -> complete or partial_ready: stop and open review
          -> zero valid arcs
               -> mastery_retrying (automatic retry 2/2)
                  -> complete or partial_ready: stop and open review
                  -> zero valid arcs: mastery_failed
                       -> teacher retry starts a new bounded cycle
  -> no knowledge or non-retryable request/persistence error
       -> existing failure contract; no mastery retry
```

### 6.1 Eligibility

An automatic mastery retry is allowed only when all conditions hold:

- the lesson has a durable knowledge checkpoint;
- `generationCompleteArcIds.length === 0`;
- at least one mastery slot remains missing;
- the current cycle has used fewer than two automatic retries;
- immutable request identity, taxonomy version, lesson ID, and teacher ownership still match;
- the missing work is not blocked entirely by a deterministic non-retryable contract error.

Retryable mastery reasons include budget/deadline exhaustion, transient provider/transport failure, structured-output exhaustion, and bounded quality-attempt exhaustion. If deterministic feasibility proves that no remaining combination can form a complete arc, the system may stop the cycle early and surface the exact teacher-safe blocker.

### 6.2 Stop condition

Automatic retry stops immediately when any complete valid arc exists. Missing slots in other arcs remain visible, but the result is `partial_ready`; no extra automatic budget is spent trying to reach `12/12`.

### 6.3 Budget bound

Every mastery-only retry receives its own `$0.50 / 75-second` envelope and may spend it only on missing mastery slots. Therefore one automatic cycle has a hard theoretical ceiling of three envelopes: the current attempt plus two automatic retries.

The response and observability data must expose actual cost per envelope and cumulative cost per cycle. Queue redelivery does not create a new envelope.

### 6.4 Durable retry creation

Automatic retry must enqueue a new durable lesson-generation job; it must not be an in-memory loop inside the current BullMQ processor.

The child job must carry:

```json
{
  "generationRunId": "same-run-id",
  "generationBudgetEnvelopeId": "new-envelope-id",
  "checkpointLessonId": "existing-draft-id",
  "retryMode": "mastery_missing_only",
  "retryTrigger": "automatic",
  "retryCycleId": "stable-cycle-id",
  "automaticRetryAttempt": 1,
  "automaticRetryLimit": 2
}
```

`checkpointLessonId` is the repository key of the draft that owns the durable
knowledge checkpoint. It may differ from `generationRunId` for existing drafts.
Retry must update that draft in place while retaining and validating the immutable
generation-run identity; it must not create a second draft merely to reconcile the IDs.

The automatic child request ID must be deterministic from the current durable job ID, retry cycle ID, and next automatic attempt. Reprocessing the same parent result must resolve the same child job instead of spending twice.

Existing `retry_of_job_id`, `attempt`, `generation_run_id`, `result_json`, and `progress_json` may carry the chain. A schema migration is not required unless implementation proves exact-once creation cannot be guaranteed with deterministic request IDs and the existing unique `request_id`.

### 6.5 Parent and child visibility

Before the parent BullMQ delivery completes, NestJS must:

1. save the latest partial result and knowledge/mastery checkpoint facts;
2. create or resolve the deterministic child durable job;
3. set the parent stage to `mastery_retrying`;
4. persist the child `request_id` as `activeJobId` in progress/result metadata;
5. complete the parent BullMQ delivery as an application result, not throw it as a transport failure.

Polling any earlier job in the same retry chain must return or point to the current active child. Refreshing an old generation URL must therefore resume the latest attempt rather than showing a stale `partial_blocked` result.

### 6.6 Exhausted state

When the second automatic retry ends with zero valid arcs:

- preserve knowledge and all accepted slot checkpoints;
- persist terminal stage `mastery_failed`;
- use stable error code `MASTERY_RETRY_EXHAUSTED`;
- include completed/missing slot IDs and teacher-safe missing reasons;
- return `retryAllowed: true` when request identity and knowledge checkpoint remain valid;
- do not clear the recoverable job handle merely because the durable status is failed;
- do not expose internal provider messages or stack traces.

The teacher action **Thử tạo lại bài tập** creates a new mastery-only retry cycle. It never regenerates knowledge.

## 7. Job-status API contract

The job-status response must include enough information for a refreshed browser to render the current state without BullMQ job retention:

```json
{
  "jobId": "requested-job-id",
  "rootJobId": "first-job-id",
  "activeJobId": "latest-child-job-id",
  "generationRunId": "stable-run-id",
  "status": "generating",
  "stage": "mastery_retrying",
  "progress": {
    "completedSlots": 0,
    "totalSlots": 12,
    "completeArcIds": [],
    "automaticRetryAttempt": 1,
    "automaticRetryLimit": 2
  },
  "result": null,
  "error": null
}
```

All information needed to retry must come from durable PostgreSQL records and saved generation payload/checkpoints. The manual retry endpoint must not depend exclusively on a BullMQ job that may have expired after 24 hours.

## 8. Frontend behavior

### 8.1 Truthful initial copy

The generation page initial message is neutral until the first job-status response:

```text
Đang kiểm tra tiến trình tạo bài
```

It must not initialize every visit with `Đang khôi phục tiến trình đã lưu`.

After the first response, render from actual stage:

| State | Teacher-visible copy |
|---|---|
| newly queued | `Yêu cầu đã vào hàng đợi` |
| knowledge generation | `Đang soạn nội dung kiến thức` |
| mastery generation | `Đang tạo bài tập theo kỹ năng` |
| automatic mastery retry | `Chưa có arc hoàn chỉnh. D-Friend đang tạo lại phần bài tập — lần {n}/2` |
| temporary status-read outage | `Tạm mất kết nối trạng thái. Bài vẫn đang được xử lý` |
| recovered existing job | `Đã khôi phục tiến trình đang chạy` |
| partial ready | `Một arc hoàn chỉnh đã sẵn sàng để review` |
| mastery retry exhausted | `Đã giữ phần kiến thức nhưng chưa tạo được arc bài tập hoàn chỉnh` |

`origin=wizard|copilot` identifies the authoring source, not whether the job is new or recovered.

### 8.2 Background expectation

During `mastery_retrying`, show:

- automatic retry number and limit;
- accepted slot count and `0` complete arcs;
- explicit copy: `Bạn có thể rời trang. Tiến trình được lưu và vẫn tiếp tục chạy.`;
- a navigation action back to the teacher workspace or lesson list;
- no manual retry button while an automatic retry is active.

Closing or refreshing the page must not cancel the job. Local storage must update from an older job ID to `activeJobId` while preserving the immutable request identity.

### 8.3 Exhausted UI

For `MASTERY_RETRY_EXHAUSTED`, show:

- that knowledge was preserved;
- completed and missing mastery counts;
- a **Thử tạo lại bài tập** button when `retryAllowed` is true;
- an option to open the preserved draft for inspection when lesson/taxonomy identity is available;
- no generic `Internal server error` and no implication that the entire lesson was lost.

The manual button is disabled while enqueue is pending and must be idempotent against double click.

## 9. Observability

Required structured events:

- `postgres.pool_configured`;
- `lesson_generation.poll_pool_timeout`;
- `lesson_generation.poll_temporarily_unavailable`;
- `lesson_generation.mastery_retry_eligible`;
- `lesson_generation.mastery_retry_enqueued`;
- `lesson_generation.mastery_retry_reused`;
- `lesson_generation.mastery_retry_completed`;
- `lesson_generation.mastery_retry_exhausted`.

Every mastery-retry event must include:

- root, parent, active, and durable job IDs;
- `generation_run_id` and budget envelope ID;
- retry trigger and cycle ID;
- automatic retry attempt/limit;
- completed slot count, missing slot count, and complete arc count;
- normalized missing-reason counts;
- elapsed time and per-envelope/cumulative cost.

Never log lesson content, student data, database credentials, full provider bodies, or stack traces in teacher-visible responses.

Required rollout metrics:

- Prisma `P2024` count on all endpoints and specifically job polling;
- job-poll `503` count and recovery rate;
- pool wait duration p50/p95;
- zero-arc rate after original attempt;
- success rate after automatic retry 1 and retry 2;
- `MASTERY_RETRY_EXHAUSTED` rate;
- cumulative generation cost and duration by retry cycle;
- percentage of cycles stopped after reaching the first valid arc.

## 10. Acceptance tests

### 10.1 Pool and polling

- Production preserves its configured endpoint/mode and resolves to `connection_limit=5` and `pool_timeout=15` without logging credentials.
- Invalid explicit pool parameters fail startup with an actionable configuration error; absent parameters use the bounded defaults.
- One `P2024` on job polling is retried once and returns the durable job state.
- Two consecutive `P2024` reads return `503 GENERATION_STATUS_TEMPORARILY_UNAVAILABLE`, preserve job state, and do not enqueue another generation.
- Frontend transient polling survives that `503` and continues to the eventual job result.
- A focused concurrent test runs the lesson worker plus teacher polling and ordinary authenticated API reads without any `P2024`.

### 10.2 Mastery retry

- Knowledge exists, zero arcs exist, and the first attempt exhausts its deadline: automatic retry 1 is durably enqueued and knowledge is not regenerated.
- Duplicate processing of the same parent creates or resolves exactly one automatic child job and one budget envelope.
- Automatic retry 1 produces a valid arc: status becomes `partial_ready`; retry 2 is not enqueued.
- Retry 1 still has zero arcs and retry 2 produces a valid arc: status becomes `partial_ready`.
- Both automatic retries end with zero arcs: state becomes `mastery_failed` with `MASTERY_RETRY_EXHAUSTED` and `retryAllowed=true`.
- Teacher retry after exhaustion starts a new bounded mastery-only cycle and preserves the same knowledge and `generation_run_id`.
- Container restart between parent completion and child processing resumes the child without duplicate spend.
- Existing accepted slots are reused and never overwritten in every retry path.
- No mastery retry occurs when knowledge is missing or the request/taxonomy/ownership contract is invalid.

### 10.3 Mobile UI

At a real mobile viewport:

- a newly created job never initially says it is restoring saved progress;
- `mastery_retrying` displays retry attempt, saved-progress copy, and the ability to leave;
- closing and reopening the page follows `activeJobId` and shows the current attempt;
- a temporary polling `503` displays a non-terminal connection message;
- exhausted mastery displays the preserved-knowledge explanation and retry button without horizontal overflow;
- reaching `partial_ready` routes to review normally.

### 10.4 Production smoke

Run one authenticated production teacher flow from create lesson through generation review at a mobile viewport. Capture:

- effective secret-safe pool configuration;
- root/child job chain and retry events;
- job polling status codes;
- knowledge-generation call count;
- mastery retry count;
- final complete-arc and slot counts;
- total duration and cost.

This update is not accepted based only on local tests or successful container connectivity. Production acceptance requires no `P2024` during the smoke and proof that a forced zero-arc fixture preserves knowledge and follows the bounded retry state machine.

## 11. Rollout and rollback

1. Deploy explicit pool configuration and `P2024` classification first.
2. Observe ordinary API and job polling under the existing single-worker concurrency.
3. Enable automatic mastery retry behind a versioned feature flag for pilot teachers.
4. Verify one-cycle cost, duration, and duplicate-enqueue metrics before wider enablement.
5. Roll back automatic retry independently by disabling the feature flag; existing durable child jobs remain inspectable and must not be deleted.
6. Pool rollback restores the previous URL only after confirming it will not reintroduce the 21-connection default.

## 12. Implementation-note requirement

After implementation, update `/Users/nguyenkhanhtrinh/dfriend/ai-service/documents/implementation-note.md` with:

- exact files and service boundaries changed;
- the final effective pool configuration without credentials;
- schema migration status;
- focused tests and their exact results;
- mobile browser evidence;
- production smoke evidence, or an explicit statement that it has not been run;
- commit IDs and deployment status when those actions are separately authorized.

Writing this specification does not authorize implementation, commit, push, migration, or deployment.

## 13. References

- [Supabase: Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: Troubleshooting Prisma errors](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting)
- [Supabase: Connection pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- `/Users/nguyenkhanhtrinh/dfriend/ai-service/documents/CREATE_DRAFT_STABILITY_UPDATE_SPEC.md`
