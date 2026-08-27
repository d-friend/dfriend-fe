# D-Friend Pilot Measurement Spec

Status: Draft for founder approval
Audit snapshot: 2026-08-27
Pilot scope: Grade 9, square roots and cube roots, 3-4 lesson cycles

## 1. Decision this pilot must support

The pilot tests the incremental value of adding D-Friend to the school's normal teaching workflow:

1. The teacher prepares a D-Friend lesson before the scheduled classroom lesson.
2. The treatment class uses D-Friend before class; the control class continues with the school's normal programme.
3. D-Friend turns the treatment-class activity into a lesson report.
4. The teacher may change the upcoming in-person lesson after reading that report.

The product loop under test is:

`teacher assigns -> student practises -> evidence -> report -> teacher changes the classroom next step`

Both student value and teacher-report value are required. Student outcome is the stronger signal, but the product does not pass if either side has no useful effect.

### Included

- One treatment class and one control class: 9/1 and 9/2, approximately 40 students per class; exact rosters are still to be confirmed.
- One teacher teaches both classes.
- One topic: square roots and cube roots.
- Three or four main-lesson/report cycles.
- Existing Student Session 1 and Session 2.
- Main lesson reports and the teacher's change to the upcoming classroom lesson.
- Offline analysis from exported product data plus a small assessment sheet.

### Excluded

- Remedial and advanced follow-up lesson generation, publication, and outcome reports.
- A new pilot analytics dashboard.
- Proving that students explicitly use P-D-E-O.
- Separating the causal contribution of P-D-E-O, P1-P4, and Study Buddy behaviour.
- Claiming general causal validity or product-market fit from two classes and one related teacher.

The pilot tests the student module as one product bundle. P-D-E-O is the thinking framework, P1-P4 is the learning model, and Study Buddy is the interaction behaviour. Internal data may explain a result, but the common school assessment is the outcome measure.

## 2. Current data audit

This section distinguishes durable source data from UI indicators and event proxies. Counts below came from read-only queries against the databases configured by the current local `.env` files on 2026-08-27.

### 2.1 Current database state

Postgres currently contains:

| Data | Count |
|---|---:|
| Users | 4 |
| Classes | 1 |
| Active enrolments | 2 |
| Main lesson publications | 1 |
| Published main lesson publications | 1 |
| Immutable main report versions | 3 |
| Session 1 progress rows | 3 |
| Session 1 completed rows | 3 |
| Submission rows | 2 |
| Legacy user activity events | 11 |

The only current class is `Toán 9A1`, with two active students and one assigned main lesson. The current published lesson is `Căn bậc 2 & Căn thức bậc 2`, and it has three ready report versions. The full 9/1 and 9/2 pilot rosters are therefore not provisioned yet.

AI-service MongoDB currently contains:

| Collection | Count |
|---|---:|
| `teacher_lessons` | 3 |
| `mastery_sessions` | 4 |
| `teacher_skill_reports` | 1 |
| `student_skill_mastery` | 3 |
| `student_profiles` | 2 |
| `session_messages` | 6 |
| `product_events` | 67 |

All four mastery-session records have non-empty `class_id` and `publication_id`. Two are completed and two are expired partial records. Postgres keeps three immutable report versions; `teacher_skill_reports` keeps one current report per `(lesson_id, class_id)`, so it must not be used for report-version audit.

### 2.2 Durable data that is already useful

#### Class, roster, and lesson identity

Postgres already owns:

- `classes`: class identity and teacher ownership.
- `students`, `users`, and `enrollments`: roster and account mapping.
- `lesson_publications`: `publication_id`, AI lesson ID, class, taxonomy, selected skills, status, deadline, and report status.
- `class_lessons`: the assignment of a publication to a class.

Important identity rule for analysis:

- AI `mastery_sessions.student_id`, `session_messages.user_id`, and product-event `actor_user_id` use the authenticated `users.id` identity.
- Postgres `students.student_id` is a different operational ID.
- The exporter must normalize both through `students.user_id`; it must not compare the two strings directly.

#### Session 1

`student_lesson_progress` durably stores, per student and exercise:

- completed knowledge items;
- attempted checkpoint questions;
- checkpoint answers;
- item count;
- completion and update timestamps.

Its key is `exercise_id`, not `publication_id`. Analysis must join it through `lesson_publications.draft_exercise_id`, then through the publication/class identity.

This data measures exposure and completion. It is not an independent learning outcome.

#### Session 2 factual evidence

AI-service `mastery_sessions` is the strongest existing student data source. Each immutable record contains:

- session, authenticated student/user, AI lesson, publication, class, concept, and completion status;
- up to four P1-P4 problem records;
- role, primary/secondary skills, attempts, solved status, intervention, reasoning quality, mismatch, and score;
- correctness, independence, reasoning, and transfer dimensions;
- lesson-scoped skill performance and evidence count.

Use these records for mechanism and exposure analysis. Do not use cumulative `student_skill_mastery`, `student_profiles.knowledge_map`, or Postgres `student_metrics` as the topic-level causal outcome; those are cumulative projections and can include evidence outside the exact pilot lesson.

Missing mastery evidence is `not assessed`, not zero and not weak.

#### Teacher reports

Postgres `lesson_reports` is the authoritative report audit source. It stores an immutable snapshot keyed by publication, class, and version, including:

- exact roster and evidence cutoff;
- report hash and version;
- finished, not-finished, and not-assessed students;
- strengths, gaps, weak skills, attention reasons, and student skill gaps;
- class skill metrics for correctness, independence, reasoning, and transfer.

AI-service `teacher_skill_reports` is useful as a current compatibility read but is overwritten per lesson/class and is not a version history.

#### Conversation data

`session_messages` archives student/assistant message content with session and authenticated user IDs. It can support a small qualitative audit of Study Buddy behaviour, but raw chat is not a default pilot export because the users are minors. Structured mastery evidence should be used first. Any transcript sample must be explicitly selected, anonymized, and access-controlled.

### 2.3 Existing product events

The Mongo product log currently contains:

| Event | Count | Student ID | Class ID | Lesson ID | Session ID |
|---|---:|---:|---:|---:|---:|
| `problem_submitted` | 25 | 0 | 0 | 25 | 25 |
| `student_session_started` | 6 | 1 | 6 | 6 | 6 |
| `session_completed` | 3 | 3 | 0 | 3 | 0 |
| `session_ended_early` | 2 | 2 | 0 | 2 | 0 |
| `lesson_published` | 1 | 0 | 1 | 1 | 0 |
| `report_generated` | 3 | 0 | 3 | 3 | 0 |
| `followup_plan_viewed` | 2 | 0 | 2 | 2 | 0 |

Every product event has `actor_user_id`, so student events can usually be reconstructed by joining the actor to the roster. `problem_submitted` can inherit class identity from `student_session_started` through `session_id`. This is usable for an offline exporter, but the raw event rows are not independently analysis-ready.

The `problem_submitted` payload already includes answer verdict, approach quality, reasoning-evidence verdict, terminal resolution, whether the turn advanced, farming status, and progress. These are mechanism signals, not school-learning outcomes.

### 2.4 Admin page capability

The current admin page is an inspectable event timeline. It supports server-side filters for event type, actor, class, and lesson; the UI exposes event type, class, and lesson. It displays raw metadata for a selected event.

It does not currently provide:

- treatment/control or pilot-cycle identity;
- student or date filters in the UI;
- CSV export;
- assessment results;
- teacher decision snapshots;
- outcome aggregation or treatment/control comparison.

This is acceptable because the pilot has chosen offline analysis. Expanding the admin dashboard is not a prerequisite.

## 3. Measurement gaps

The following data does not exist today:

1. A durable declaration of which class is treatment and which is control.
2. A cycle registry that binds each school lesson date to its publication and report.
3. A common baseline and topic-end assessment for both classes.
4. An explicit tag for transfer items in that assessment.
5. A reliable `report_opened` fact.
6. The teacher's intended classroom action before seeing a report.
7. Whether the report changed, confirmed, or did not affect that action.
8. Whether the teacher actually applied the changed action.
9. Whether report insight leaked into control-class teaching before the endpoint assessment.

`copilot_acknowledged_at` is not a report-view metric: it is set when a teacher dismisses/opens a report-ready notification, and a teacher may reach a report through the class page without it. `followup_plan_viewed` is a planning call and is excluded with targeted follow-up.

`submissions.grade` must not be silently reused as the school outcome. It is valid only if the common assessment is explicitly administered and graded through that exact submission workflow.

## 4. Minimal data collection contract

### 4.1 One-time pilot registry

Keep a small private registry outside the application database for this pilot:

| Field | Requirement |
|---|---|
| `pilot_id` | Stable value, e.g. `sqrt-cuberoot-2026` |
| `treatment_class_id` | Postgres class UUID; TBD |
| `control_class_id` | Postgres class UUID; TBD |
| `teacher_user_id` | Authenticated teacher UUID |
| `topic_key` | `math9:square-and-cube-roots` or exact active taxonomy key |
| `planned_cycles` | 3 or 4 |
| `started_at`, `ended_at` | Pilot analysis window |

The treatment/control choice must be recorded before topic-end outcomes are inspected. Record the pre-topic class-strength information when it becomes available; do not switch arms after seeing pilot results.

### 4.2 Cycle registry

One row per classroom lesson:

| Field | Source |
|---|---|
| `cycle_id` | Manual stable label, e.g. `sqrt-01` |
| `school_lesson_at` | School timetable |
| `publication_id`, `ai_lesson_id` | `lesson_publications` |
| `treatment_class_id` | Pilot registry |
| `report_id`, `report_version` | `lesson_reports` |
| `report_ready_at` | `lesson_reports.created_at` |
| `report_before_class` | Derived boolean |
| `control_plan_locked_at` | Teacher snapshot |

Only main publications and `main_outcome` reports are eligible. Targeted remedial/advanced rows are excluded.

### 4.3 Common school assessment sheet

Use one private sheet/CSV with pseudonymous student codes. Minimum columns:

```text
pilot_id,student_code,user_id,class_id,arm,
baseline_score,baseline_max,
topic_end_score,topic_end_max,
transfer_score,transfer_max,
assessment_status
```

Rules:

- Both classes take the same baseline instrument or use a genuinely comparable existing common assessment.
- Both classes take the same topic-end assessment without D-Friend assistance.
- Mark the pre-agreed transfer items before scores are inspected.
- Grade both classes with the same fixed rubric; mix/anonymize scripts where practical.
- Missing assessment is missing. Never convert absence to zero unless the school rubric itself assigns zero.
- Names are not required in the analysis export.

No additional quiz is required after every lesson cycle. Product data provides cycle-level mechanism evidence; the common assessment provides topic-level outcome evidence.

### 4.4 Teacher report decision record

Add one durable row per teacher/report, separate from the immutable report itself:

```text
report_id,teacher_user_id,class_id,
before_action,before_note,before_recorded_at,
report_opened_at,
effect,after_action,after_note,evidence_used,
applied,control_spillover,after_recorded_at
```

Allowed `before_action` and `after_action` values:

- `continue_as_planned`
- `reteach_whole_class`
- `change_target_skill`
- `change_examples_or_exercises`
- `change_pacing`
- `group_students`
- `check_specific_students`
- `undecided`
- `other`

Allowed `effect` values:

- `changed`
- `confirmed`
- `no_effect`

Allowed `applied` values:

- `yes`
- `partly`
- `no`

The UI burden is two moments per eligible report:

1. Before the first report reveal: one action chip and an optional short note.
2. After the classroom lesson: effect, final action, whether it was applied, and whether the insight also affected control teaching. All are chips; notes remain optional.

The write must be idempotent and durable. Best-effort `product_events` alone is not sufficient for this measurement-critical record. Product events may mirror the save for timeline/debugging.

### 4.5 Read-only pilot export

One read-only command should create four files for analysis:

- `pilot_roster.csv`
- `pilot_cycles.csv`
- `pilot_student_exposure.csv`
- `pilot_teacher_decisions.csv`

`pilot_student_exposure.csv` should join:

- roster and arm;
- Session 1 completion;
- Session 2 start/completion;
- immutable mastery-session problem and skill dimensions;
- session events for audit only.

The exporter must emit data-quality warnings for missing class/publication/session identity instead of guessing or assigning zero.

## 5. Metrics and analysis

### 5.1 Student primary outcome

Normalize assessment scores to percentages:

```text
baseline_pct = baseline_score / baseline_max * 100
topic_end_pct = topic_end_score / topic_end_max * 100
student_gain = topic_end_pct - baseline_pct
incremental_gain = mean(treatment student_gain) - mean(control student_gain)
```

Report:

- class baseline mean/median and distribution;
- class topic-end mean/median and distribution;
- incremental gain;
- percentage of students who improved in each class;
- transfer percentage and treatment-control difference;
- missing assessment count by arm.

Primary analysis is intention-to-treat: all rostered students with valid common assessments remain in their assigned arm, including treatment students who did not complete D-Friend. This answers whether offering D-Friend to the class adds value in practice.

A secondary per-protocol view may compare treatment students who completed the required D-Friend exposure, but it must be labelled selection-biased and must not replace the primary result.

### 5.2 Student mechanism and feasibility metrics

For the treatment class only:

- Session 1 start and completion rate.
- Session 2 start and completion rate.
- P1-P4 completion and role coverage.
- Valid attempts per problem.
- Correctness, independence, reasoning, and transfer dimensions.
- Intervention and reasoning-mismatch rates.
- Expired-partial and early-ended sessions.

These metrics explain product behaviour. They cannot prove school learning without the common assessment.

### 5.3 Teacher report outcome

An eligible teacher cycle requires:

- a ready main report before the classroom lesson;
- a before-decision snapshot recorded before the report is revealed;
- an after-class response.

Report:

```text
changed_and_applied_rate = cycles(effect=changed and applied in [yes, partly]) / eligible_cycles
confirmed_rate = cycles(effect=confirmed) / eligible_cycles
no_effect_rate = cycles(effect=no_effect) / eligible_cycles
```

Also list the exact action category and report evidence used in every changed cycle. With one teacher and 3-4 cycles, raw cycle evidence is more honest than a polished percentage.

At the end of the topic, conduct one short structured debrief. For each report's most consequential claim, mark it `accurate`, `mixed`, or `wrong` against the teacher's classroom observation. A wrong diagnosis that changes teaching is a failure, not engagement.

### 5.4 Contamination and interpretation

Because one teacher teaches both classes, report insight may affect control teaching. Lock the baseline control plan before the report is opened and record `control_spillover` after class.

If spillover occurs:

- retain the cycle;
- flag it visibly;
- do not pretend the treatment-control difference isolates the full report loop;
- note that spillover normally biases the observed product difference toward zero.

This remains a two-class feasibility pilot. Class-level differences, timetable order, attendance, and teacher-founder relationship limit generalization.

## 6. Proposed gates requiring founder approval

These gates must be accepted or replaced before topic-end results are opened.

### Measurement validity

- Both full rosters are provisioned and mapped before cycle 1.
- At least 70% of the treatment roster starts D-Friend, and at least 60% completes the required Session 2 exposure.
- At least 80% of each class has a valid baseline and topic-end assessment.
- At least two teacher-report cycles are eligible.

If these fail, the pilot is inconclusive rather than negative.

### Proposed student green gate

- Incremental gain is at least 10 percentage points, equivalent to 1 point on a 10-point test.
- Treatment transfer performance is at least 10 percentage points above control.
- At least 60% of assessed treatment students improve from baseline.

### Proposed teacher green gate

- At least half of eligible reports lead to a concrete changed action that is applied at least partly.
- The teacher can point to the report evidence behind each changed action.
- No consequential report claim that changed teaching is judged materially wrong in the end-of-topic debrief.

The product-level pilot is green only if both student and teacher gates pass. A mixed result identifies which module or measurement path needs another iteration; it must not be averaged into a fake single score.

## 7. Minimum work before pilot launch

P0 requirements:

1. Provision the real 9/1 and 9/2 class rosters and record treatment/control assignment.
2. Finalize the common baseline, topic-end test, rubric, and transfer-item tags.
3. Implement the durable two-moment teacher decision record and a reliable report-open timestamp.
4. Implement the read-only exporter and its identity/data-quality checks.
5. Run one dry cycle with test accounts to confirm publication, class, mastery-session, report, and decision joins.
6. Approve or replace the success gates before viewing topic-end results.

Not required before launch:

- targeted follow-up lessons;
- a new admin dashboard;
- automated statistical significance testing;
- bulk raw-chat export;
- P-D-E-O classification.

## 8. Audit source map

Frontend:

- `src/components/admin/product-events-workspace.tsx`
- `src/components/teacher/class-workspace.tsx`
- `src/components/teacher/teacher-shell.tsx`
- `src/lib/api-client.ts`

NestJS:

- `prisma/postgres/schema.prisma`
- `prisma/mongo/schema.prisma`
- `src/activity/activity.service.ts`
- `src/ai-session/ai-session.service.ts`
- `src/copilot/copilot.service.ts`

AI-service:

- `domain/student/models/mastery_session.py`
- `application/student/services/mastery_session_service.py`
- `adapters/outbound/student/persistence/mongo_mastery_session_store.py`
- `adapters/outbound/student/persistence/mongo_session_store.py`
- `domain/teacher/models/mastery.py`
- `application/teacher/services/report_service.py`
- `adapters/outbound/teacher/persistence/mongo_report_store.py`
