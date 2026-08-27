import { expect, test, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";

const frontendPort = 3910;
const backendPort = 3912;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
let backend: Server;
let frontend: ChildProcess;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  backend = createServer((request, response) => {
    if (request.url === "/api/auth/me") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "teacher-1", username: "teacher", full_name: "Teacher Test", role: "TEACHER" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => backend.listen(backendPort, "127.0.0.1", resolve));
  frontend = spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(frontendPort)], {
    cwd: process.cwd(),
    env: { ...process.env, BACKEND_API_URL: `http://127.0.0.1:${backendPort}` },
    stdio: "ignore",
  });
  await waitForServer(frontendUrl);
});

test.afterAll(async () => {
  frontend?.kill("SIGTERM");
  await new Promise<void>((resolve) => backend?.close(() => resolve()));
});

test("follow-up lanes create independently, open new tabs, and restore created state", async ({ browser }) => {
  const state = { remedialCreated: false };
  let submittedRequestId = "";
  const context = await teacherContext(browser, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/follow-up-plan")) {
      return json(route, planPayload(state.remedialCreated));
    }
    if (url.pathname.endsWith("/follow-up-drafts") && request.method() === "POST") {
      const body = request.postDataJSON() as { kind: "remedial" | "advanced"; requestId: string };
      submittedRequestId = body.requestId;
      await delay(250);
      state.remedialCreated ||= body.kind === "remedial";
      return json(route, draftPayload(body.kind));
    }
    return shellApi(route);
  });
  const page = await context.newPage();
  await page.goto(`${frontendUrl}/teacher/copilot/report-1/extra`);

  await expect(page.getByLabel("Mục tiêu riêng").first()).toContainText("bài phụ đạo");
  await expect(page.getByLabel("Mục tiêu riêng").last()).toContainText("bài nâng cao");

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Tạo bài phụ đạo" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/teacher\/lessons\/generating\/[0-9a-f-]+\?kind=remedial&origin=copilot$/);
  const openedRequestId = new URL(popup.url()).pathname.split("/").at(-1);
  await expect.poll(() => submittedRequestId).toBe(openedRequestId);
  await expect(page.getByRole("button", { name: "Tạo bài nâng cao" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Đang tạo bản nháp" })).toBeDisabled();
  await popup.waitForURL(/\/teacher\/lessons\/ai-remedial-1\/review$/);
  await expect(page.getByRole("button", { name: "Mở bản nháp" }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Mở bản nháp" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo bài nâng cao" })).toBeEnabled();
  await context.close();
});

test("create both preserves remedial success when advanced creation fails", async ({ browser }) => {
  const context = await teacherContext(browser, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/follow-up-plan")) return json(route, planPayload(false));
    if (url.pathname.endsWith("/follow-up-drafts") && request.method() === "POST") {
      const body = request.postDataJSON() as { kind: "remedial" | "advanced" };
      await delay(150);
      if (body.kind === "advanced") {
        return json(route, { message: "advanced generation failed" }, 500);
      }
      return json(route, draftPayload(body.kind));
    }
    return shellApi(route);
  });
  const page = await context.newPage();
  await page.goto(`${frontendUrl}/teacher/copilot/report-1/extra`);

  const opened: Page[] = [];
  context.on("page", (popup) => opened.push(popup));
  await page.getByRole("button", { name: "Tạo cả hai bài" }).click();
  await expect(page.getByRole("button", { name: "Mở bản nháp" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo bài nâng cao" })).toBeEnabled();
  await expect(page.getByText("advanced generation failed")).toBeVisible();
  await expect.poll(() => opened.some((popup) => /ai-remedial-1\/review$/.test(popup.url()))).toBe(true);
  await context.close();
});

test("loading route survives pre-registration 404 and reloads into the same job", async ({ browser }) => {
  let requestId = "";
  let jobReads = 0;
  const context = await teacherContext(browser, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/follow-up-plan")) return json(route, planPayload(false));
    if (pathname.endsWith("/follow-up-drafts") && request.method() === "POST") {
      requestId = (request.postDataJSON() as { requestId: string }).requestId;
      return json(route, { created: false, queued: true, jobId: requestId, requestId, kind: "remedial" });
    }
    if (requestId && pathname.endsWith(`/exercises/create-lesson/jobs/${requestId}`)) {
      jobReads += 1;
      if (jobReads <= 2) return json(route, { message: "not registered" }, 404);
      if (jobReads === 3) return json(route, { status: "generating", progress: { stage: "knowledge" }, result: null });
      return json(route, { status: "ready", progress: { stage: "ready" }, result: { lessonId: "ai-remedial-ready", generationStatus: "complete" } });
    }
    return shellApi(route);
  });
  const page = await context.newPage();
  await page.goto(`${frontendUrl}/teacher/copilot/report-1/extra`);

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Tạo bài phụ đạo" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/teacher\/lessons\/generating\/[0-9a-f-]+/);
  await popup.reload();
  await popup.waitForURL(/\/teacher\/lessons\/ai-remedial-ready\/review$/);
  expect(jobReads).toBeGreaterThanOrEqual(4);
  await context.close();
});

test("report tree keeps immutable source nesting and the detail panel restores keyboard width", async ({ browser }) => {
  const reports = reportSummaries();
  const context = await teacherContext(browser, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/teacher/classes")) {
      return json(route, {
        classes: [{ class_id: "class-1", class_name: "Lớp 8", description: "", class_code: "LOP8", student_count: 2 }],
      });
    }
    if (pathname.endsWith("/teacher/classes/class-1/students")) return json(route, { students: [] });
    if (pathname.endsWith("/teacher/classes/class-1/roadmap")) return json(route, []);
    if (pathname.endsWith("/teacher/copilot/reports/report-remedial-v2")) {
      return json(route, followUpReportDetail(reports.find((report) => report.reportId === "report-remedial-v2")));
    }
    if (pathname.endsWith("/teacher/copilot/reports")) return json(route, reports);
    if (pathname.endsWith("/exercises/curriculum/skills")) return json(route, { skills: [] });
    return shellApi(route);
  });
  const page = await context.newPage();
  await page.goto(`${frontendUrl}/teacher/classes/class-1?tab=reports`);

  await expect(page.getByText("Báo cáo lớp · v2")).toBeVisible();
  await expect(page.getByText("Báo cáo lớp · v1")).toBeVisible();
  await expect(page.getByLabel("Phụ đạo từ report v1")).toContainText("Kết quả phụ đạo · v2 · từ report v1");
  await expect(page.getByLabel("Nâng cao từ report v1")).toContainText("Kết quả nâng cao · v1 · từ report v1");

  await page.getByRole("button", { name: /Kết quả phụ đạo · v2/ }).click();
  await expect(page.getByRole("link", { name: "Tạo bài tiếp theo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tạo bài follow-up" })).toHaveCount(0);

  const separator = page.getByRole("separator", { name: "Đổi độ rộng panel chi tiết" });
  await expect(separator).toHaveAttribute("aria-valuenow", "560");
  await separator.focus();
  await separator.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "592");
  await page.reload();
  await expect(page.getByRole("separator", { name: "Đổi độ rộng panel chi tiết" })).toHaveAttribute("aria-valuenow", "592");
  await context.close();
});

test("main report stays hidden until intent is saved, then captures the post-class effect", async ({ browser }) => {
  const reports = reportSummaries();
  let before: { action: string; note?: string } | null = null;
  let openedAt: string | null = null;
  let after: Record<string, unknown> | null = null;
  let reportReads = 0;
  const decisionPayload = () => ({
    reportId: "report-main-v2",
    reportVersion: 2,
    publicationId: "publication-main",
    lessonId: "lesson-main-1",
    classId: "class-1",
    before: before ? { ...before, recordedAt: "2026-08-27T01:00:00Z" } : null,
    reportOpenedAt: openedAt,
    after,
  });
  const context = await teacherContext(browser, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/teacher/classes")) {
      return json(route, {
        classes: [{ class_id: "class-1", class_name: "Lớp 8", description: "", class_code: "LOP8", student_count: 2 }],
      });
    }
    if (pathname.endsWith("/teacher/classes/class-1/students")) return json(route, { students: [] });
    if (pathname.endsWith("/teacher/classes/class-1/roadmap")) return json(route, []);
    if (pathname.endsWith("/teacher/copilot/reports/report-main-v2/decision") && request.method() === "GET") {
      return json(route, decisionPayload());
    }
    if (pathname.endsWith("/teacher/copilot/reports/report-main-v2/decision/before") && request.method() === "PUT") {
      before = request.postDataJSON() as { action: string; note?: string };
      return json(route, decisionPayload());
    }
    if (pathname.endsWith("/teacher/copilot/reports/report-main-v2/open") && request.method() === "POST") {
      expect(before).not.toBeNull();
      openedAt = "2026-08-27T01:01:00Z";
      return json(route, decisionPayload());
    }
    if (pathname.endsWith("/teacher/copilot/reports/report-main-v2/decision/after") && request.method() === "PUT") {
      const body = request.postDataJSON() as Record<string, unknown>;
      after = { ...body, recordedAt: "2026-08-27T03:00:00Z" };
      return json(route, decisionPayload());
    }
    if (pathname.endsWith("/teacher/copilot/reports/report-main-v2")) {
      reportReads += 1;
      return json(route, mainReportDetail(reports[0]));
    }
    if (pathname.endsWith("/teacher/copilot/reports")) return json(route, reports);
    if (pathname.endsWith("/exercises/curriculum/skills")) return json(route, { skills: [] });
    return shellApi(route);
  });
  const page = await context.newPage();
  await page.goto(`${frontendUrl}/teacher/classes/class-1?tab=reports`);
  await page.getByRole("button", { name: /Báo cáo lớp · v2/ }).click();

  await expect(page.getByRole("heading", { name: "Trước khi xem báo cáo" })).toHaveCount(0);
  await expect(page.getByText("Nếu chưa xem phân tích của D-Friend")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kỹ năng lớp làm tốt" })).toHaveCount(0);
  expect(reportReads).toBe(0);

  await page.getByLabel("Kế hoạch dự kiến").selectOption("continue_as_planned");
  await page.getByLabel(/Ghi chú ngắn/).fill("Tiếp tục theo giáo án hiện tại");
  await page.getByRole("button", { name: "Lưu và mở báo cáo" }).click();
  await expect(page.getByRole("heading", { name: "Kỹ năng lớp làm tốt" })).toBeVisible();
  expect(reportReads).toBe(1);
  expect(before).toEqual({ action: "continue_as_planned", note: "Tiếp tục theo giáo án hiện tại" });

  await page.getByLabel("So với kế hoạch ban đầu").selectOption("changed");
  await page.getByLabel("Hành động cuối cùng").selectOption("change_examples_or_exercises");
  await page.getByLabel("Đã áp dụng trong lớp?").selectOption("yes");
  await page.getByLabel(/Chi tiết nào trong report/).fill("Nhóm học sinh yếu ở bước biến đổi.");
  await page.getByLabel(/dùng insight từ report/).check();
  await page.getByRole("button", { name: "Lưu phản hồi sau tiết học" }).click();

  await expect(page.getByText("Đã ghi nhận tác động sau tiết học")).toBeVisible();
  expect(after).toMatchObject({
    effect: "changed",
    action: "change_examples_or_exercises",
    applied: "yes",
    controlSpillover: true,
  });
  await context.close();
});

async function teacherContext(
  browser: Browser,
  handler: (route: Route) => Promise<void>,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addCookies([{ name: "access_token", value: "test-token", domain: "127.0.0.1", path: "/" }]);
  await context.route(`${frontendUrl}/api/**`, handler);
  return context;
}

async function shellApi(route: Route) {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname.endsWith("/auth/me")) return json(route, { id: "teacher-1", username: "teacher", full_name: "Teacher Test", role: "TEACHER" });
  if (pathname.endsWith("/teacher/classes")) return json(route, { classes: [] });
  if (pathname.endsWith("/teacher/copilot/conversations")) return json(route, { conversations: [] });
  if (pathname.endsWith("/teacher/copilot/reports")) return json(route, []);
  if (pathname.endsWith("/exercises/curriculum/skills")) {
    return json(route, {
      skills: [
        { skill_id: "math8:polynomials:monomials#identify-monomial", label_vi: "Nhận biết đơn thức" },
        { skill_id: "math8:polynomials:monomials#reduce-monomial", label_vi: "Thu gọn đơn thức" },
      ],
    });
  }
  if (pathname.includes("/teacher/copilot/drafts/")) return json(route, {});
  return json(route, {});
}

function planPayload(remedialCreated: boolean) {
  return {
    class_id: "class-1",
    lesson_id: "lesson-1",
    source_concept_key: "math8:polynomials:monomials",
    main: { kind: "main", concept_key: "math8:polynomials:monomials", target_skill_ids: [], reason: "next" },
    groups: [
      { kind: "remedial", concept_key: "math8:polynomials:monomials", target_student_ids: ["student-1"], target_skill_ids: ["math8:polynomials:monomials#identify-monomial"], reason: "support" },
      { kind: "advanced", concept_key: "math8:polynomials:monomials", target_student_ids: ["student-2"], target_skill_ids: ["math8:polynomials:monomials#reduce-monomial"], reason: "extend" },
    ],
    generated_at: "2026-08-23T00:00:00Z",
    planId: "plan-1",
    reportId: "report-1",
    reportVersion: 1,
    parentLessonTitle: "Đơn thức",
    studentNames: { "student-1": "An", "student-2": "Bình" },
    laneDrafts: remedialCreated ? { remedial: draftPayload("remedial").draft } : {},
  };
}

function draftPayload(kind: "remedial" | "advanced") {
  return {
    created: true,
    draft: {
      id: `extra-${kind}-1`,
      groupType: kind,
      studentIds: [kind === "remedial" ? "student-1" : "student-2"],
      exercises: [],
      summary: kind,
      aiLessonId: `ai-${kind}-1`,
    },
  };
}

function reportSummaries() {
  const common = {
    lessonId: "lesson-main-1",
    title: "Đơn thức",
    subject: "math8",
    topic: "polynomials",
    classNames: "Lớp 8",
    classIds: ["class-1"],
    classId: "class-1",
    completedStudents: 2,
    totalStudents: 2,
    status: "REPORT_READY" as const,
    reportedAt: "2026-08-23T00:00:00Z",
    acknowledgedAt: null,
    publishedAt: "2026-08-22T00:00:00Z",
  };
  return [
    { ...common, reportId: "report-main-v2", reportVersion: 2, publicationId: "publication-main", lessonKind: "main" as const, reportKind: "main_outcome" as const },
    { ...common, reportId: "report-main-v1", reportVersion: 1, publicationId: "publication-main", lessonKind: "main" as const, reportKind: "main_outcome" as const },
    { ...common, reportId: "report-remedial-v2", reportVersion: 2, publicationId: "publication-remedial", lessonId: "lesson-remedial", lessonKind: "remedial" as const, reportKind: "follow_up_outcome" as const, sourceReportId: "report-main-v1", sourceReportVersion: 1, completedStudents: 1, totalStudents: 1 },
    { ...common, reportId: "report-remedial-v1", reportVersion: 1, publicationId: "publication-remedial", lessonId: "lesson-remedial", lessonKind: "remedial" as const, reportKind: "follow_up_outcome" as const, sourceReportId: "report-main-v1", sourceReportVersion: 1, completedStudents: 1, totalStudents: 1 },
    { ...common, reportId: "report-advanced-v1", reportVersion: 1, publicationId: "publication-advanced", lessonId: "lesson-advanced", lessonKind: "advanced" as const, reportKind: "follow_up_outcome" as const, sourceReportId: "report-main-v1", sourceReportVersion: 1, completedStudents: 1, totalStudents: 1 },
  ];
}

function followUpReportDetail(summary: ReturnType<typeof reportSummaries>[number] | undefined) {
  return {
    ...summary,
    concept: "monomials",
    canPlanFollowUp: false,
    canCreateNextMain: true,
    report: {
      strengths: [], gaps: [], remedial_student_ids: [], advanced_student_ids: [], not_finished_student_ids: [], top_weak_skill_ids: [], attention_reasons: {}, student_names: {}, score_scale: 10,
      follow_up_student_outcomes: {}, follow_up_skill_deltas: {}, skill_metrics: {},
    },
  };
}

function mainReportDetail(summary: ReturnType<typeof reportSummaries>[number] | undefined) {
  return {
    ...summary,
    concept: "monomials",
    canPlanFollowUp: true,
    canCreateNextMain: true,
    report: {
      strengths: ["math8:polynomials:monomials#identify-monomial"],
      gaps: [],
      remedial_student_ids: [],
      advanced_student_ids: [],
      on_track_student_ids: [],
      not_finished_student_ids: [],
      top_weak_skill_ids: [],
      attention_reasons: {},
      student_names: {},
      score_scale: 10,
      skill_metrics: {},
    },
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Timed out waiting for isolated Next.js test server");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
