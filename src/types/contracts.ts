export type WorkspaceMode = "copilot" | "classes";
export type ClassTab = "students" | "learning-path" | "reports";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  is_beta_activated: boolean;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  isBetaActivated: boolean;
  studentId?: string;
  createdAt: string;
  updatedAt: string;
}

export type TeacherInviteStatus =
  | "pending_password_setup"
  | "active"
  | "expired"
  | "revoked";

export interface TeacherInvite {
  id: string;
  userId: string;
  email: string;
  username: string;
  fullName: string;
  status: TeacherInviteStatus;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  inviteLink?: string;
}

export interface AdminOverview {
  stats: {
    users: Record<"ADMIN" | "TEACHER" | "STUDENT", number>;
    classes: number;
    enrollments: number;
    lessons: number;
    submissions: number;
    submissionsToday: number;
    activityEvents: number;
    documentEvents: number;
    activeUsersNow: number;
  };
  dau: {
    from: string;
    to: string;
    timezone: string;
    data: Array<{ date: string; activeUsers: number }>;
  };
  recentUsers: AdminUser[];
  recentClasses: Array<{
    classId: string;
    className: string;
    classCode: string;
    teacherId: string;
    studentCount: number;
    lessonCount: number;
    createdAt: string | null;
  }>;
  recentSubmissions: Array<{
    id: string;
    exerciseId: string;
    status: string;
    grade: number | null;
    studentName: string;
    submittedAt: string;
  }>;
  recentActivities: Array<{
    id: string;
    actorUserId?: string | null;
    actorRole?: string | null;
    studentId?: string | null;
    eventType: string;
    source: string;
    classId?: string | null;
    lessonId?: string | null;
    sessionId?: string | null;
    subject?: string | null;
    topic?: string | null;
    conceptKey?: string | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
    createdAt: string;
  }>;
}

export interface ProductEvent {
  id: string;
  eventType: string;
  source: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  studentId?: string | null;
  classId?: string | null;
  lessonId?: string | null;
  sessionId?: string | null;
  subject?: string | null;
  topic?: string | null;
  conceptKey?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface ProductEventPage {
  data: ProductEvent[];
  nextCursor: string | null;
}

export interface AdminOperations {
  generatedAt: string;
  queues: Array<{
    name: string;
    status: "healthy" | "degraded" | "unavailable";
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
  }>;
  reports: {
    status: "healthy" | "degraded" | "unavailable";
    pending: number;
    analysing: number;
    ready: number;
    failed: number;
    unread: number;
    oldestAnalysingAt: string | null;
  };
  ai: {
    status: "healthy" | "degraded" | "unavailable";
    reason: string | null;
    costSinceStartUsd: number;
    pipelines: Array<{ pipeline: string; costUsd: number; succeeded: number; failed: number }>;
    latencyByModel: Array<{ model: string; p50Seconds: number | null; p95Seconds: number | null }>;
  };
}

export interface TeacherClass {
  class_id: string;
  class_name: string;
  description: string;
  class_code: string;
  student_count: number;
}

export interface StudentInClass {
  student_id: string;
  full_name: string;
  username?: string;
}

export interface TeacherStudentMetrics {
  studentId?: string;
  studentName?: string;
  correctnessScore: number | null;
  independenceScore: number | null;
  reasoningScore: number | null;
  transferScore: number | null;
  averageScore?: number;
  completedLessons?: number;
  totalLessons?: number;
  mastery?: Array<{ skill: string; score: number; status?: string }>;
}

export interface TeacherRoadmapItem {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  status: "active";
  type: "exercise";
  questionsCount: number;
  completedCount: number;
  deadline?: string;
  hook?: string;
  material?: string;
  content?: string;
  lesson1Knowledge?: {
    concept_name?: string;
    hook?: string;
    items?: Array<{ title?: string; content?: string }>;
  } | null;
  knowledge?: {
    hook?: string;
    content?: string;
    material?: string;
  } | null;
}

export interface TeacherSubmission {
  id?: string;
  submission_id?: string;
  exercise_id?: string;
  lessonId?: string;
  lessonTitle?: string;
  student_id?: string;
  student_name?: string;
  status?: string;
  grade?: number | null;
  feedback?: string | null;
  content?: unknown;
  submitted_at?: string;
  submittedAt?: string;
}

export interface ActivityEvent {
  id?: string;
  eventType?: string;
  event_type?: string;
  createdAt?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  conversation_id: string;
  title: string;
  preview?: string;
  class_id?: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface CopilotTurn {
  role: "user" | "assistant" | "tool";
  content: string;
  created_at?: string;
  steps?: CopilotStep[];
  drafts?: CopilotDraft[];
  plans?: CopilotLessonPlan[];
}

export interface ConversationDetail extends ConversationSummary {
  turns: CopilotTurn[];
}

export interface CopilotStep {
  label: string;
  status: "started" | "succeeded" | "failed";
}

export interface CopilotDraft {
  lessonId: string;
  classId?: string | null;
  conceptKey?: string | null;
  goalText?: string | null;
  problemCount: number;
}

export interface CopilotPlanSkill {
  skillId: string;
  label: string;
  selected: boolean;
  evidence?: string | null;
}

export interface CopilotLessonPlan {
  goalText: string;
  conceptKey: string;
  subjectLabel: string;
  topicLabel: string;
  conceptLabel: string;
  verdict: string;
  detail: string;
  skills: CopilotPlanSkill[];
  bankProblems: number;
  documentUnits: number;
  confirmable: boolean;
}

export interface CopilotChatResponse {
  conversation_id: string;
  response: string;
  steps?: CopilotStep[];
  drafts?: CopilotDraft[];
  plans?: CopilotLessonPlan[];
}

export interface CopilotReportSummary {
  reportId?: string;
  reportVersion?: number;
  reportHash?: string;
  publicationId?: string;
  lessonKind?: "main" | "remedial" | "advanced";
  reportKind?: "main_outcome" | "follow_up_outcome" | null;
  sourceReportId?: string | null;
  sourceReportVersion?: number | null;
  sourceReportHash?: string | null;
  parentPublicationId?: string | null;
  canPlanFollowUp?: boolean;
  canCreateNextMain?: boolean;
  lessonId: string;
  title: string;
  subject: string;
  topic: string;
  classNames: string;
  classIds: string[];
  classId?: string;
  completedStudents?: number;
  totalStudents?: number;
  status: "PENDING" | "ANALYSING" | "REPORT_READY" | "FAILED";
  reportedAt: string | null;
  acknowledgedAt: string | null;
  publishedAt: string;
}

export interface CopilotReportDetail extends CopilotReportSummary {
  concept: string;
  totalStudents: number;
  report: null | {
    strengths: string[];
    gaps: string[];
    remedial_student_ids: string[];
    advanced_student_ids: string[];
    on_track_student_ids?: string[];
    not_finished_student_ids: string[];
    not_assessed_student_ids?: string[];
    not_assessed_skill_ids?: string[];
    top_weak_skill_ids: string[];
    attention_reasons: Record<string, string[]>;
    student_skill_gaps?: Record<string, string[]>;
    student_skill_gap_session_counts?: Record<string, Record<string, number>>;
    skill_metrics?: Record<string, {
      skill_id: string;
      assessed_student_count: number;
      lesson_average: number;
      cumulative_average?: number | null;
      correctness: number;
      independence: number;
      reasoning: number;
      transfer?: number | null;
    }>;
    follow_up_skill_deltas?: Record<string, {
      skill_id: string;
      baseline_average?: number | null;
      follow_up_average?: number | null;
      delta?: number | null;
    }>;
    follow_up_student_outcomes?: Record<string, {
      status: "recovered" | "developing" | "still_needs_support" | "extended" | "sustained" | "needs_consolidation" | "not_assessed";
      assessed_skill_ids: string[];
      baseline_gap_skill_ids: string[];
    }>;
    student_names: Record<string, string>;
    score_scale: number;
  };
}

export type TeacherReportAction =
  | "continue_as_planned"
  | "reteach_whole_class"
  | "change_target_skill"
  | "change_examples_or_exercises"
  | "change_pacing"
  | "group_students"
  | "check_specific_students"
  | "undecided"
  | "other";

export type TeacherReportEffect = "changed" | "confirmed" | "no_effect";
export type TeacherReportApplication = "yes" | "partly" | "no";

export interface TeacherReportDecision {
  reportId: string;
  reportVersion: number;
  publicationId: string;
  lessonId: string;
  classId: string;
  before: null | {
    action: TeacherReportAction;
    note: string | null;
    recordedAt: string;
  };
  reportOpenedAt: string | null;
  after: null | {
    effect: TeacherReportEffect;
    action: TeacherReportAction;
    note: string | null;
    evidenceUsed: string | null;
    applied: TeacherReportApplication;
    controlSpillover: boolean;
    recordedAt: string;
  };
}

export interface CurriculumConcept {
  value: string;
  label: string;
}

export interface CurriculumTopic {
  value: string;
  label: string;
  concepts: CurriculumConcept[];
}

export interface CurriculumSubject {
  value: string;
  label: string;
  topics: CurriculumTopic[];
}

export interface ExerciseDocument {
  documentId: string;
  title: string;
  description?: string;
  subject: string;
  topic: string;
  concept: string | null;
  scopeKind: "concept" | "general_topic";
  indexStatus: "pending" | "indexing" | "ready" | "needs_manual" | "failed";
  indexSummary?: Record<string, number>;
  indexError?: string | null;
  shared: boolean;
  fileName?: string;
  contentType?: string;
  previewUrl?: string;
  createdAt: string;
}

export interface ApiErrorEnvelope {
  statusCode: number;
  timestamp?: string;
  path?: string;
  message: string | string[];
  blockers?: Array<{ code?: string; message?: string; detail?: string }>;
}

export interface StudentMetrics {
  student_id: string;
  studentId?: string;
  correctness_score: number | null;
  independence_score: number | null;
  reasoning_score: number | null;
  transfer_score: number | null;
  correctnessScore?: number | null;
  independenceScore?: number | null;
  reasoningScore?: number | null;
  transferScore?: number | null;
}

export interface StudentClass {
  class_id: string;
  class_name: string;
  teacher_id: string;
  teacher_name: string;
  completed_lessons: number;
  total_lessons: number;
  progress: number;
}

export interface StudentAssignment {
  assignment_id: string;
  title: string;
  description: string;
  due_date: string;
  status: "TODO" | "DONE" | "OVERDUE";
  class_id: string;
  session1_completed_items?: number[];
  session1_item_count?: number;
  session1_completed_at?: string | null;
}

export interface StudentRoadmapItem {
  id: string;
  lessonId: string;
  lesson_id?: string;
  title: string;
  status: "completed" | "active" | "locked";
  extra_exercises?: Array<{
    publication_id: string;
    problem_count?: number;
    group_type: string;
    summary: string;
    exercises: Array<{ problem_id?: number; question?: string }>;
  }>;
  extra_completed?: boolean;
}

export interface LessonOneKnowledgeItem {
  title?: string;
  content?: string;
  is_core?: boolean;
  from_source?: boolean;
}

export interface LessonOneQuestion {
  id?: string;
  type?: "mcq" | "multiple_choice" | "fill_in_the_blank" | "true_false" | string;
  questionText?: string;
  question?: string;
  options?: Array<{ label?: string; text?: string } | string>;
  correctAnswer?: string;
  answer?: string;
  explanation?: string;
  knowledgeItemIndex?: number | null;
  knowledge_item_index?: number | null;
}

export interface SessionOneProgress {
  completedItems: number[];
  attemptedQuestions: string[];
  answers: Record<string, string>;
  itemCount: number;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface StudentExercise {
  id: string;
  title: string;
  description: string;
  material?: string;
  classId?: string | null;
  lesson1Knowledge?: {
    concept_name?: string;
    hook?: string;
    prerequisites?: string[];
    items?: LessonOneKnowledgeItem[];
  } | null;
  questions: LessonOneQuestion[];
}

export interface StudyProblem {
  problem_id: number;
  question: string;
  attachment_url?: string;
  recommended_problem_role?: string;
}

export interface StudySession {
  status: "success" | "not_found" | string;
  session_id?: string;
  lesson_id?: string;
  problems?: StudyProblem[];
  current_problem_id?: number | null;
  current_progress?: number;
  current_process?: number;
  session_completed?: boolean;
  completed_problem_count?: number;
  total_problem_count?: number;
  subject?: string;
  topic?: string;
  concept?: string;
}

export interface StudySessionSummary {
  status?: "error" | string;
  message?: string;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  mastering_at?: string[];
  struggling_at?: string[];
  finished_exercise?: Record<
    string,
    {
      score?: number;
      bloom_level?: string;
      strengths?: string[];
      weaknesses?: string[];
    }
  >;
  post_mastery_report?: PostMasteryReport | null;
}

export interface PostMasteryMetricSet {
  correctness?: number | null;
  independence?: number | null;
  reasoning?: number | null;
  transfer?: number | null;
}

export interface PostMasteryEvidenceItem {
  problem_id: number;
  role: string;
  score: number;
  attempts: number;
  solved: boolean;
  received_intervention?: boolean;
  reasoning_quality?: string;
  evidence_id?: string;
}

export interface PostMasterySkillEvidence {
  skill_id: string;
  status: "strength" | "gap" | "developing";
  score: number;
  metrics?: PostMasteryMetricSet | null;
  evidence?: PostMasteryEvidenceItem[];
  reason?: string;
}

export interface PostMasteryCriterion {
  code: string;
  label: string;
  description: string;
}

export interface PostMasteryReport {
  score?: number | null;
  metrics?: PostMasteryMetricSet | null;
  strengths?: PostMasterySkillEvidence[];
  gaps?: PostMasterySkillEvidence[];
  developing?: PostMasterySkillEvidence[];
  criteria?: PostMasteryCriterion[];
}

export interface StudentReport {
  lessonId: string;
  lessonTitle?: string | null;
  score?: number;
  sessionProgress?: number | null;
  status?: string;
  sessionSummary?: StudySessionSummary | null;
  textContent?: string;
  highlights?: Array<{
    word: string;
    color?: string;
    feedback: string;
    kind?: "strength" | "gap" | "developing";
    evidence?: PostMasteryEvidenceItem[];
    metrics?: PostMasteryMetricSet | null;
    reason?: string;
  }>;
  metrics?: PostMasteryMetricSet | null;
  criteria?: PostMasteryCriterion[];
}
