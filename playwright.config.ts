import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "journeys", testMatch: /journeys\.spec\.ts/ },
    {
      name: "screenshots",
      testMatch: /screenshots\.spec\.ts/,
      dependencies: ["journeys"],
    },
  ],
  webServer: {
    command:
      "mkdir -p data && rm -f data/e2e-lifemaxing.sqlite data/e2e-lifemaxing.sqlite-wal data/e2e-lifemaxing.sqlite-shm && DATABASE_PATH=./data/e2e-lifemaxing.sqlite SETUP_MODE=local APP_ORIGIN=http://127.0.0.1:3100 HOST=127.0.0.1 PORT=3100 AI_MODE=disabled NEXT_TELEMETRY_DISABLED=1 corepack pnpm exec tsx scripts/migrate.ts && DATABASE_PATH=./data/e2e-lifemaxing.sqlite SETUP_MODE=local APP_ORIGIN=http://127.0.0.1:3100 HOST=127.0.0.1 PORT=3100 AI_MODE=disabled NEXT_TELEMETRY_DISABLED=1 corepack pnpm exec next dev -H 127.0.0.1 -p 3100",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
