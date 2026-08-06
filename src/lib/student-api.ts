import { apiClient } from "@/lib/api-client";
import type {
  AuthUser,
  SessionOneProgress,
  StudentAssignment,
  StudentClass,
  StudentExercise,
  StudentMetrics,
  StudentReport,
  StudentRoadmapItem,
  StudySession,
  StudySessionSummary,
} from "@/types/contracts";

export const studentKeys = {
  me: ["student", "me"] as const,
  metrics: ["student", "metrics"] as const,
  classes: ["student", "classes"] as const,
  assignments: ["student", "assignments"] as const,
  roadmap: (classId: string) => ["student", "roadmap", classId] as const,
  classmates: (studentId: string, classId: string) =>
    ["student", "classmates", studentId, classId] as const,
  exercise: (exerciseId: string) => ["student", "exercise", exerciseId] as const,
  sessionOneProgress: (exerciseId: string) =>
    ["student", "session-one-progress", exerciseId] as const,
  activeSession: (lessonId: string) => ["student", "session", lessonId] as const,
  report: (lessonId: string) => ["student", "report", lessonId] as const,
};

export const studentApi = {
  me: async () => (await apiClient.get<AuthUser>("/auth/me")).data,
  metrics: async () => (await apiClient.get<StudentMetrics>("/student/me/metrics")).data,
  classes: async () =>
    (await apiClient.get<{ classes: StudentClass[] }>("/student/me/classes")).data.classes,
  assignments: async () =>
    (await apiClient.get<{ assignments: StudentAssignment[] }>("/student/me/assignments"))
      .data.assignments,
  joinClass: async (classCode: string) =>
    (await apiClient.post<{ message: string }>("/student/classes/join", { classCode })).data,
  classmates: async (studentId: string, classId: string) =>
    (
      await apiClient.get<{ classmates_name: string[] }>(
        `/student/${studentId}/classes/${classId}/classmates`,
      )
    ).data.classmates_name,
  roadmap: async (classId: string) =>
    (await apiClient.get<StudentRoadmapItem[]>(`/student/classes/${classId}/roadmap`)).data,
  exercise: async (exerciseId: string) =>
    (await apiClient.get<StudentExercise>(`/student/exercises/${exerciseId}`)).data,
  sessionOneProgress: async (exerciseId: string) =>
    (
      await apiClient.get<SessionOneProgress>(
        `/student/lessons/${exerciseId}/session-one-progress`,
      )
    ).data,
  saveSessionOneProgress: async (
    exerciseId: string,
    progress: Pick<
      SessionOneProgress,
      "completedItems" | "attemptedQuestions" | "answers"
    >,
  ) =>
    (
      await apiClient.patch<SessionOneProgress>(
        `/student/lessons/${exerciseId}/session-one-progress`,
        progress,
      )
    ).data,
  activeSession: async (lessonId: string) =>
    (await apiClient.get<StudySession>(`/ai-session/active/${lessonId}`)).data,
  startSession: async (lessonId: string, reset = false) =>
    (await apiClient.post<StudySession>("/ai-session/start", { lessonId, reset })).data,
  closeSession: async (sessionId: string, lessonId: string) =>
    (
      await apiClient.post<StudySessionSummary>("/ai-session/close", {
        sessionId,
        lessonId,
      })
    ).data,
  report: async (lessonId: string) =>
    (await apiClient.get<StudentReport>(`/student/report/${lessonId}`)).data,
  extraExercises: async (lessonId: string) =>
    (
      await apiClient.get<{
        lesson_id: string;
        extra_exercises: Array<{
          group_type: string;
          summary: string;
          exercises: Array<{ problem_id?: number; question?: string }>;
        }>;
      }>(`/student/lessons/${lessonId}/extra-exercises`)
    ).data,
};
