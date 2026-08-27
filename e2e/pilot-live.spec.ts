import { expect, test, type Page } from "@playwright/test";

type PilotConfig = {
  teacherUsername: string;
  teacherPassword: string;
  studentUsername: string;
  studentPassword: string;
  documentPath: string;
  subject: string;
  topic: string;
  concept: string;
};

let pilot: PilotConfig;
const generationTimeoutMs = Number(process.env.E2E_GENERATION_TIMEOUT_MS || 10 * 60_000);

let className = "";
let secondClassName = "";
let classId = "";
let secondClassId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  pilot = {
    teacherUsername: required("E2E_TEACHER_USERNAME"),
    teacherPassword: required("E2E_TEACHER_PASSWORD"),
    studentUsername: required("E2E_STUDENT_USERNAME"),
    studentPassword: required("E2E_STUDENT_PASSWORD"),
    documentPath: required("E2E_DOCUMENT_PATH"),
    subject: process.env.E2E_SUBJECT || "math8",
    topic: process.env.E2E_TOPIC || "polynomials",
    concept: process.env.E2E_CONCEPT || "monomials",
  };
});

test("live pilot: teacher creates a class, adds the student, uploads material, and publishes a wizard lesson", async ({ page }) => {
  const runId = Date.now();
  className = `E2E Primary ${runId}`;
  secondClassName = `E2E Secondary ${runId}`;

  await login(page, pilot.teacherUsername, pilot.teacherPassword, /\/teacher\/copilot\/new$/);
  classId = await createClass(page, className);
  await addStudent(page, pilot.studentUsername);
  secondClassId = await createClass(page, secondClassName);
  await addStudent(page, pilot.studentUsername);
  await uploadDocument(page, className);
  await publishWizardLesson(page, [className, secondClassName]);

  const [firstRoadmap, secondRoadmap] = await Promise.all([
    authenticatedJson<Array<{ id: string; lessonId: string }>>(page, `/api/student/classes/${classId}/roadmap`),
    authenticatedJson<Array<{ id: string; lessonId: string }>>(page, `/api/student/classes/${secondClassId}/roadmap`),
  ]);
  expect(firstRoadmap[0]?.id).toBeTruthy();
  expect(secondRoadmap[0]?.id).toBeTruthy();
  expect(firstRoadmap[0].id).not.toBe(secondRoadmap[0].id);
  expect(firstRoadmap[0].lessonId).toBe(secondRoadmap[0].lessonId);
});

test("live pilot: teacher can create and publish a second lesson through Copilot", async ({ page }) => {
  test.skip(!className, "The wizard setup test must create a pilot class first.");

  await login(page, pilot.teacherUsername, pilot.teacherPassword, /\/teacher\/copilot\/new$/);
  await page.getByLabel("Chọn lớp làm ngữ cảnh", { exact: true }).selectOption({ label: className });
  await page.getByLabel("Tin nhắn cho Copilot", { exact: true }).fill(
    "Soạn một bài ôn tập ngắn về đơn thức cho lớp này. Hãy tạo kế hoạch có thể review trước khi xuất bản.",
  );
  await page.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();

  const plan = page.getByRole("region", { name: "Xác nhận kế hoạch bài học" });
  await expect(plan).toBeVisible({ timeout: generationTimeoutMs });
  const consent = plan.getByRole("button", { name: "Cho phép AI soạn phần thiếu", exact: true });
  const standard = plan.getByRole("button", { name: "Đúng rồi, soạn bài", exact: true });
  if (await consent.isVisible()) await consent.click();
  else await standard.click();

  await page.waitForURL(/\/teacher\/lessons\/[^/]+\/review$/, { timeout: generationTimeoutMs });
  await page.locator(".class-picker label").filter({ hasText: className }).locator('input[type="checkbox"]').check();
  await approveAndPublish(page);
});

test("live pilot: enrolled student can enter the active Session 1 in the newly created class", async ({ browser }) => {
  test.skip(!className, "The teacher flow must run before the student journey.");

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, pilot.studentUsername, pilot.studentPassword, /\/student\/dashboard$/);
    await page.getByRole("link", { name: "Lớp học", exact: true }).click();

    // The dashboard aggregates every class the configured student has joined. It
    // can contain older pilot data, so select the class created by this run before
    // asserting that its active lesson opens.
    const pilotClass = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: className, exact: true }) });
    await expect(pilotClass).toBeVisible({ timeout: 60_000 });
    await pilotClass.getByRole("link", { name: "Mở lớp", exact: true }).click();
    await expect(page.getByRole("heading", { name: className, exact: true })).toBeVisible();

    const lessonLink = page.locator('a[href^="/student/lesson/"][href$="/part1"]').first();
    await expect(lessonLink).toBeVisible({ timeout: 60_000 });
    await lessonLink.click();
    await expect(page.getByText("Session 1 / 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Copy .env.e2e.example and inject pilot secrets through your shell or CI.`);
  return value;
}

async function login(page: Page, username: string, password: string, destination: RegExp) {
  await page.goto("/login?clear_cookie=1");
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill(username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(destination);
}

async function createClass(page: Page, name: string): Promise<string> {
  await page.goto("/teacher/classes");
  const createClassButton = page.getByRole("button", { name: "Tạo lớp mới", exact: true });
  await createClassButton.click({ force: true });
  await expect(page.getByRole("complementary", { name: "Tạo lớp trong vài giây" })).toBeVisible();
  await page.getByLabel("Tên lớp", { exact: true }).fill(name);
  await page.getByLabel("Mô tả", { exact: true }).fill("Dữ liệu do Playwright tạo cho pilot E2E.");
  await page.getByRole("button", { name: "Tạo lớp", exact: true }).click();
  await page.waitForURL(/\/teacher\/classes\/[^?]+\?tab=students$/);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const match = page.url().match(/\/teacher\/classes\/([^?]+)/);
  if (!match?.[1]) throw new Error(`Class ${name} was created without a stable class id in the URL.`);
  return decodeURIComponent(match[1]);
}

async function addStudent(page: Page, username: string) {
  const sheetTitle = page.getByRole("heading", { name: "Thêm học sinh", exact: true });
  const trigger = page.getByRole("button", { name: "Thêm học sinh", exact: true });
  // The panel is animated. The first click may happen while the class layout is
  // still settling, so verify the actual panel state before continuing.
  for (let attempt = 0; attempt < 2 && !(await sheetTitle.isVisible()); attempt += 1) {
    await trigger.click({ force: true });
    await page.waitForTimeout(250);
  }
  await expect(sheetTitle).toBeVisible();
  await page.getByLabel("Username học sinh", { exact: true }).fill(username);
  await page.getByRole("button", { name: "Thêm vào lớp", exact: true }).click();
  await expect(page.getByText(/Đã thêm 1|Đã có trong lớp 1/)).toBeVisible();
}

async function uploadDocument(page: Page, name: string) {
  await page.goto("/teacher/documents");
  await page.getByRole("button", { name: "Tải tài liệu", exact: true }).click();
  await page.getByLabel("Môn học", { exact: true }).selectOption(pilot.subject);
  await page.getByLabel("Chủ đề", { exact: true }).selectOption(pilot.topic);
  await page.getByLabel("Khái niệm", { exact: true }).selectOption(pilot.concept);
  await page.getByLabel("Tên tài liệu", { exact: true }).fill(`${name} - nguồn đa thức`);
  await page.locator('input[type="file"]').setInputFiles(pilot.documentPath);
  await page.getByRole("button", { name: "Lưu vào kho", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Đã lưu tài liệu|Document stored and registered/, { timeout: 2 * 60_000 });
  await expect(page.getByRole("heading", { name: `${name} - nguồn đa thức`, exact: true })).toBeVisible();
}

async function publishWizardLesson(page: Page, classNames: string[]) {
  const [name] = classNames;
  await page.goto("/teacher/lessons/new");
  await page.getByLabel("Tên bài học", { exact: true }).fill(`${name} - ôn tập đơn thức`);
  await page.getByLabel("Mục tiêu bài học", { exact: true }).fill(
    "Học sinh nhận biết đơn thức, xác định hệ số và thu gọn đơn thức bằng cách trình bày từng bước.",
  );
  await page.getByLabel("Môn học", { exact: true }).selectOption(pilot.subject);
  await page.getByLabel("Chủ đề", { exact: true }).selectOption(pilot.topic);
  await page.getByLabel("Khái niệm", { exact: true }).selectOption(pilot.concept);
  for (const className of classNames) {
    await page.locator(".class-picker label").filter({ hasText: className }).locator('input[type="checkbox"]').check();
  }
  await page.getByRole("button", { name: "Kiểm tra và tạo bài", exact: true }).click();

  const consent = page.getByRole("button", { name: "Cho phép AI soạn phần thiếu", exact: true });
  const approve = page.getByRole("button", { name: "Duyệt toàn bộ bản nháp", exact: true });
  await Promise.race([
    consent.waitFor({ state: "visible", timeout: generationTimeoutMs }),
    approve.waitFor({ state: "visible", timeout: generationTimeoutMs }),
  ]);
  if (await consent.isVisible()) await consent.click();
  await expect(approve).toBeVisible({ timeout: generationTimeoutMs });
  await approveAndPublish(page);
}

async function authenticatedJson<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(path);
  expect(response.ok(), `${path} returned ${response.status()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function approveAndPublish(page: Page) {
  const approve = page.getByRole("button", { name: "Duyệt toàn bộ bản nháp", exact: true });
  if (await approve.isVisible()) {
    await approve.click();
    await expect(page.getByText(/Đã duyệt/).first()).toBeVisible({ timeout: 2 * 60_000 });
  }
  const publish = page.getByRole("button", { name: "Xuất bản", exact: true });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByRole("heading", { name: "Đã xuất bản bài học", exact: true })).toBeVisible({ timeout: 3 * 60_000 });
}
