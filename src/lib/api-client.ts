import axios, { AxiosError } from "axios";
import type {
  AdminOverview,
  AdminOperations,
  AdminUser,
  ActivityEvent,
  ApiErrorEnvelope,
  AuthUser,
  ConversationDetail,
  ConversationSummary,
  CopilotChatResponse,
  CopilotReportDetail,
  CopilotReportSummary,
  TeacherReportAction,
  TeacherReportApplication,
  TeacherReportDecision,
  TeacherReportEffect,
  CurriculumSubject,
  ExerciseDocument,
  ProductEventPage,
  StudentInClass,
  TeacherClass,
  TeacherInvite,
  TeacherRoadmapItem,
  TeacherStudentMetrics,
  TeacherSubmission,
} from "@/types/contracts";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : null;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30_000,
});

apiClient.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = readCookie("csrf_token");
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (
      typeof window !== "undefined" &&
      error.response?.status === 401 &&
      !window.location.pathname.startsWith("/login")
    ) {
      window.location.assign("/login?clear_cookie=1");
    }
    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error: unknown, fallback = "Không thể hoàn tất yêu cầu.") {
  if (!axios.isAxiosError<ApiErrorEnvelope>(error)) return fallback;
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message || fallback;
}

export function isApiErrorStatus(error: unknown, status: number) {
  return axios.isAxiosError(error) && error.response?.status === status;
}

export interface FollowUpSuggestion {
  kind: "main" | "remedial" | "advanced";
  concept_key: string;
  target_student_ids?: string[] | null;
  target_skill_ids: string[];
  reason: string;
  empty_reason?: string | null;
  originating_skill_ids?: string[];
  prerequisite_routes?: Record<string, string>;
}

export interface FollowUpPlan {
  class_id: string;
  lesson_id: string;
  source_concept_key: string;
  main: FollowUpSuggestion;
  groups: FollowUpSuggestion[];
  generated_at: string;
  planId?: string;
  reportId?: string;
  reportVersion?: number;
  reportHash?: string;
  parentLessonTitle?: string;
  laneDrafts?: Partial<Record<"remedial" | "advanced", FollowUpDraftHandle>>;
  laneJobs?: Partial<Record<"remedial" | "advanced", string>>;
  studentNames?: Record<string, string>;
}

export interface FollowUpDraftHandle {
  id: string;
  groupType: "remedial" | "advanced";
  studentIds: string[];
  exercises: Array<Record<string, unknown>>;
  summary: string;
  aiLessonId: string;
  publicationId?: string;
  classId?: string;
  sourceReportId?: string;
  sourceReportVersion?: number;
  published?: boolean;
}

export interface FollowUpDraftResult {
  created: boolean;
  reused?: boolean;
  queued?: boolean;
  jobId?: string;
  requestId?: string;
  generationRunId?: string;
  kind?: "remedial" | "advanced";
  draft?: FollowUpDraftHandle;
}

export interface CompletePoolResult {
  draft: Record<string, unknown>;
  completed_slot_ids: string[];
  failed_slots: Array<{
    slot_id: string;
    role: string;
    reason: string;
  }>;
}

export interface PublishReadiness {
  publishable: boolean;
  blockers: Array<Record<string, unknown>>;
  complete_arc_ids: string[];
  publishable_arc_ids: string[];
}

export const adminApi = {
  me: async () => (await apiClient.get<AuthUser>("/auth/me")).data,
  overview: async () => (await apiClient.get<AdminOverview>("/admin/overview")).data,
  operations: async () => (await apiClient.get<AdminOperations>("/admin/operations")).data,
  productEvents: async (params?: {
    limit?: number;
    cursor?: string | null;
    eventType?: string;
    actorUserId?: string;
    classId?: string;
    lessonId?: string;
  }) =>
    (
      await apiClient.get<ProductEventPage>("/admin/product-events", {
        params: {
          ...(params?.limit ? { limit: params.limit } : {}),
          ...(params?.cursor ? { cursor: params.cursor } : {}),
          ...(params?.eventType ? { eventType: params.eventType } : {}),
          ...(params?.actorUserId ? { actorUserId: params.actorUserId } : {}),
          ...(params?.classId ? { classId: params.classId } : {}),
          ...(params?.lessonId ? { lessonId: params.lessonId } : {}),
        },
      })
    ).data,
  users: async (params?: { query?: string; role?: AdminUser["role"] | "" }) => {
    const requestParams = {
      ...(params?.query ? { query: params.query } : {}),
      ...(params?.role ? { role: params.role } : {}),
    };
    return (await apiClient.get<AdminUser[]>("/admin/users", { params: requestParams })).data;
  },
  createUser: async (payload: {
    username: string;
    email: string;
    fullName: string;
    password: string;
    role: "STUDENT" | "TEACHER";
  }) => (await apiClient.post<AdminUser>("/admin/users", payload)).data,
  resetPassword: async (userId: string, newPassword: string) =>
    (await apiClient.patch<AdminUser>(`/admin/users/${userId}/password`, { newPassword })).data,
  teacherInvites: async () =>
    (await apiClient.get<TeacherInvite[]>("/admin/teacher-password-invites")).data,
  createTeacherInvite: async (payload: { email: string }) =>
    (await apiClient.post<TeacherInvite>("/admin/teacher-password-invites", payload)).data,
  resendTeacherInvite: async (inviteId: string) =>
    (await apiClient.post<TeacherInvite>(`/admin/teacher-password-invites/${inviteId}/resend`)).data,
  revokeTeacherInvite: async (inviteId: string) =>
    (await apiClient.post<TeacherInvite>(`/admin/teacher-password-invites/${inviteId}/revoke`)).data,
};

export const authApi = {
  setupTeacherPassword: async (payload: { token: string; password: string }) =>
    (await apiClient.post<AuthUser>("/auth/teacher-password-setup", payload)).data,
};

export const teacherApi = {
  me: async () => (await apiClient.get<AuthUser>("/auth/me")).data,
  classes: async () =>
    (await apiClient.get<{ classes: TeacherClass[] }>("/teacher/classes")).data.classes,
  createClass: async (payload: { className: string; description: string }) =>
    (await apiClient.post<TeacherClass>("/teacher/classes", payload)).data,
  addStudents: async (payload: { classId: string; usernames: string[] }) =>
    (
      await apiClient.post<{
        message: string;
        added: string[];
        skipped: string[];
        notFound: string[];
      }>("/teacher/classes/add-students", payload)
    ).data,
  students: async (classId: string) =>
    (
      await apiClient.get<{ students: StudentInClass[] }>(
        `/teacher/classes/${classId}/students`,
      )
    ).data.students,
  metrics: async (classId: string, studentId: string) =>
    (
      await apiClient.get<TeacherStudentMetrics>(
        `/teacher/classes/${classId}/students/${studentId}/metrics`,
      )
    ).data,
  studentSubmissions: async (classId: string, studentId: string) =>
    (
      await apiClient.get<TeacherSubmission[]>(
        `/teacher/classes/${classId}/students/${studentId}/submissions`,
      )
    ).data,
  studentActivity: async (classId: string, studentId: string) =>
    (
      await apiClient.get<{ success: true; data: ActivityEvent[] }>(
        `/teacher/classes/${classId}/students/${studentId}/activity?limit=30`,
      )
    ).data.data,
  roadmap: async (classId: string) =>
    (
      await apiClient.get<TeacherRoadmapItem[]>(
        `/teacher/classes/${classId}/roadmap`,
      )
    ).data,
  grade: async (submissionId: string, payload: { grade: number; feedback: string }) =>
    (
      await apiClient.post<TeacherSubmission>(
        `/teacher/submissions/${submissionId}/grade`,
        payload,
      )
    ).data,
  reports: async () =>
    (await apiClient.get<CopilotReportSummary[]>("/teacher/copilot/reports")).data,
  dismissCopilotReport: async (lessonId: string) =>
    apiClient.post(`/teacher/copilot/${lessonId}/dismiss`),
  report: async (reportId: string) =>
    (
      await apiClient.get<CopilotReportDetail>(
        `/teacher/copilot/reports/${reportId}`,
      )
    ).data,
  reportDecision: async (reportId: string) =>
    (
      await apiClient.get<TeacherReportDecision>(
        `/teacher/copilot/reports/${reportId}/decision`,
      )
    ).data,
  recordReportDecisionBefore: async (
    reportId: string,
    payload: { action: TeacherReportAction; note?: string },
  ) =>
    (
      await apiClient.put<TeacherReportDecision>(
        `/teacher/copilot/reports/${reportId}/decision/before`,
        payload,
      )
    ).data,
  openReport: async (reportId: string) =>
    (
      await apiClient.post<TeacherReportDecision>(
        `/teacher/copilot/reports/${reportId}/open`,
      )
    ).data,
  recordReportDecisionAfter: async (
    reportId: string,
    payload: {
      effect: TeacherReportEffect;
      action: TeacherReportAction;
      note?: string;
      evidenceUsed?: string;
      applied: TeacherReportApplication;
      controlSpillover: boolean;
    },
  ) =>
    (
      await apiClient.put<TeacherReportDecision>(
        `/teacher/copilot/reports/${reportId}/decision/after`,
        payload,
      )
    ).data,
  runClassReport: async (publicationId: string, classId: string) =>
    (
      await apiClient.post<{
        status: "ANALYSING";
        publicationId: string;
        classId: string;
        completedStudents: number;
        totalStudents: number;
      }>(
        `/teacher/copilot/reports/${publicationId}/classes/${classId}/run`,
      )
    ).data,
  conversations: async () =>
    (
      await apiClient.get<{ conversations: ConversationSummary[] }>(
        "/teacher/copilot/conversations",
      )
    ).data.conversations,
  conversation: async (conversationId: string) =>
    (
      await apiClient.get<ConversationDetail>(
        `/teacher/copilot/conversations/${conversationId}`,
      )
    ).data,
  chatCopilot: async (
    payload: { message: string; conversation_id?: string | null; class_id?: string | null },
    signal?: AbortSignal,
  ) =>
    (
      await apiClient.post<CopilotChatResponse>("/teacher/copilot/chat", payload, {
        signal,
        timeout: 360_000,
      })
    ).data,
  confirmCopilotPlan: async (
    payload: { classId: string; goalText: string; conceptKey: string; skillIds: string[]; allowGenerated?: boolean; requestId?: string },
  ) =>
    (
      await apiClient.post<{ jobId: string; generationRunId: string; status: "queued" }>(
        "/teacher/copilot/lesson-plan/confirm",
        payload,
        { timeout: 30_000 },
      )
    ).data,
  renameConversation: async (conversationId: string, title: string) =>
    (
      await apiClient.patch<ConversationSummary>(
        `/teacher/copilot/conversations/${conversationId}`,
        { title },
      )
    ).data,
  deleteConversation: async (conversationId: string) =>
    apiClient.delete(`/teacher/copilot/conversations/${conversationId}`),
  curriculum: async () =>
    (await apiClient.get<{ subjects: CurriculumSubject[] }>("/exercises/curriculum")).data
      .subjects,
  curriculumSkills: async (subject: string, topic: string, concept: string) =>
    (await apiClient.get<{ skills: Array<{ skill_id: string; label_vi: string }> }>("/exercises/curriculum/skills", { params: { subject, topic, concept } })).data.skills,
  documents: async () =>
    (
      await apiClient.get<{ documents: ExerciseDocument[] }>(
        "/exercises/documents/mine",
      )
    ).data.documents,
  uploadDocument: async (body: FormData) =>
    (
      await apiClient.post<{ message: string; documentId: string; previewUrl: string; indexStatus: string }>(
        "/exercises/upload",
        body,
        { timeout: 120_000 },
      )
    ).data,
  deleteDocument: async (documentId: string) =>
    apiClient.delete(`/exercises/documents/${documentId}`),
  retryDocumentIndex: async (documentId: string) =>
    (await apiClient.post<{ documentId: string; indexStatus: string }>(`/exercises/documents/${documentId}/retry-index`)).data,
  precheckLesson: async (payload: {
    lessonGoal?: string;
    title: string;
    subject: string;
    topic: string;
    concept: string;
    explicitSkillIds?: string[];
  }) =>
    (
      await apiClient.post<Record<string, unknown>>(
        "/exercises/create-lesson/precheck",
        payload,
        { timeout: 60_000 },
      )
    ).data,
  generateLesson1: async (body: FormData) =>
    (
      await apiClient.post<Record<string, unknown>>(
        "/exercises/create-lesson/lesson1",
        body,
        { timeout: 30_000 },
      )
    ).data,
  lessonGenerationJob: async (jobId: string) =>
    (
      await apiClient.get<Record<string, unknown>>(
        `/exercises/create-lesson/jobs/${encodeURIComponent(jobId)}`,
      )
    ).data,
  retryMissingLessonSlots: async (jobId: string) =>
    (
      await apiClient.post<{ jobId: string; generationRunId: string; status: "queued" }>(
        `/exercises/create-lesson/jobs/${encodeURIComponent(jobId)}/retry-missing`,
      )
    ).data,
  generateLesson2: async (body: FormData) =>
    (
      await apiClient.post<Record<string, unknown>>(
        "/exercises/create-lesson/lesson2",
        body,
        { timeout: 180_000 },
      )
    ).data,
  publishWizardDraft: async (
    draftExerciseId: string,
    payload: { classIds: string[]; deadline?: string },
  ) =>
    (
      await apiClient.patch<Record<string, unknown>>(
        `/exercises/${draftExerciseId}`,
        payload,
      )
    ).data,
  copilotDraft: async (lessonId: string) =>
    (
      await apiClient.get<Record<string, unknown>>(
        `/teacher/copilot/drafts/${lessonId}`,
      )
    ).data,
  approveGenerated: async (lessonId: string, expectedRevision: number) =>
    (
      await apiClient.post<Record<string, unknown>>(
        `/exercises/ai-drafts/${lessonId}/approve-generated`,
        { expectedRevision },
      )
    ).data,
  approveLessonReview: async (lessonId: string, expectedRevision: number) =>
    (
      await apiClient.post<Record<string, unknown>>(
        `/exercises/ai-drafts/${lessonId}/review/approve`,
        { expectedRevision },
      )
    ).data,
  reopenLessonReview: async (lessonId: string, expectedRevision: number) =>
    (
      await apiClient.post<Record<string, unknown>>(
        `/exercises/ai-drafts/${lessonId}/review/reopen`,
        { expectedRevision },
      )
    ).data,
  completeLessonReviewPool: async (lessonId: string, expectedRevision: number) =>
    (
      await apiClient.post<CompletePoolResult>(
        `/exercises/ai-drafts/${lessonId}/review/complete-pool`,
        { expectedRevision },
        { timeout: 360_000 },
      )
    ).data,
  regenerateLessonReview: async (
    lessonId: string,
    targets: Array<{ kind: "mastery" | "knowledge_checkpoint"; id?: string; index?: number }>,
    expectedRevision: number,
  ) =>
    (
      await apiClient.post<Record<string, unknown>>(
        `/exercises/ai-drafts/${lessonId}/review/regenerate`,
        { targets, expectedRevision },
        { timeout: 360_000 },
      )
    ).data,
  checkLessonPublish: async (lessonId: string, expectedRevision: number) =>
    (
      await apiClient.post<PublishReadiness>(
        `/exercises/ai-drafts/${lessonId}/publish-check`,
        { expectedRevision },
      )
    ).data,
  publishCopilotDraft: async (
    lessonId: string,
    payload: { classIds: string[]; deadline?: string; title?: string; expectedRevision: number },
  ) =>
    (
      await apiClient.post<Record<string, unknown>>(
        `/exercises/ai-drafts/${lessonId}/publish`,
        payload,
      )
    ).data,
  publishFollowUpDraft: async (aiLessonId: string, expectedRevision: number) =>
    (
      await apiClient.post<Record<string, unknown>>(
        `/teacher/copilot/extra-exercises/${aiLessonId}/publish`,
        { expectedRevision },
      )
    ).data,
  generateFollowUps: async (lessonId: string) =>
    (
      await apiClient.post<{
        created: boolean;
        reason?: string;
        lessonTitle?: string;
        classNames?: string;
        drafts?: Array<{
          id: string;
          groupType: "remedial" | "advanced";
          studentIds: string[];
          exercises: Array<Record<string, unknown>>;
          summary: string;
          aiLessonId: string;
        }>;
      }>(`/teacher/copilot/${lessonId}/extra-exercises`, undefined, {
        timeout: 360_000,
      })
    ).data,
  followUpPlan: async (reportId: string) =>
    (await apiClient.get<FollowUpPlan>(`/teacher/copilot/reports/${reportId}/follow-up-plan`)).data,
  createFollowUpDraft: async (
    lessonId: string,
    payload: {
      reportId: string;
      planId: string;
      kind: "remedial" | "advanced";
      conceptKey: string;
      studentIds: string[];
      skillIds: string[];
      lessonGoal?: string;
      editedRecommendation?: boolean;
      requestId?: string;
    },
  ) =>
    (
      await apiClient.post<FollowUpDraftResult>(
        `/teacher/copilot/${lessonId}/follow-up-drafts`,
        payload,
        { timeout: 360_000 },
      )
    ).data,
};
