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
  const context = await teacherContext(browser, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/follow-up-plan")) {
      return json(route, planPayload(state.remedialCreated));
    }
    if (url.pathname.endsWith("/follow-up-drafts") && request.method() === "POST") {
      const body = request.postDataJSON() as { kind: "remedial" | "advanced" };
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
