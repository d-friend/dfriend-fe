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
  thinkingScore: number;
  skillScore: number;
  resultScore: number;
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

export interface CopilotReportSummary {
  lessonId: string;
  title: string;
  subject: string;
  topic: string;
  classNames: string;
  classIds?: string[];
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
    not_finished_student_ids: string[];
    top_weak_skill_ids: string[];
    attention_reasons: Record<string, string[]>;
    student_names: Record<string, string>;
    score_scale: number;
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
  concept: string;
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
  thinking_score: number;
  skill_score: number;
  result_score: number;
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
}

export interface StudentRoadmapItem {
  id: string;
  lessonId: string;
  title: string;
  status: "completed" | "active" | "locked";
  extra_exercises?: Array<{
    group_type: string;
    summary: string;
    exercises: Array<{ problem_id?: number; question?: string }>;
  }>;
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
}

export interface StudentReport {
  lessonId: string;
  lessonTitle?: string | null;
  score?: number;
  sessionProgress?: number | null;
  status?: string;
  sessionSummary?: StudySessionSummary | null;
  textContent?: string;
  highlights?: Array<{ word: string; color?: string; feedback: string }>;
}
