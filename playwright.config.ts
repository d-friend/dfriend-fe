import { defineConfig, devices } from "@playwright/test";

const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Live draft creation is deliberately exercised against a real LLM. The pilot
  // report still flags slow runs; this ceiling prevents a valid but slow draft
  // from being mistaken for a UI failure.
  timeout: 20 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "pilot", use: { ...devices["Desktop Chrome"] } },
  ],
});
