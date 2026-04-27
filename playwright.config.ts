import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`
const startWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== '1'

export default defineConfig({
  testDir: './e2e',
  // E2E specs hit a single shared dev server backed by one SQLite file. With
  // multiple workers, two specs writing to the posts/reports table would see
  // each other's rows leak into list responses — "X items" assertions would
  // flake under load. Serialising at the worker level trades wall time for
  // determinism, which is the right trade for the small number of flows we
  // run. fullyParallel still parallelises tests within a single worker file
  // so per-suite overhead stays small.
  fullyParallel: true,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(startWebServer
    ? {
        webServer: {
          command: `pnpm dev:seed && pnpm exec concurrently -n web,api "vite --port ${PORT} --strictPort" "tsx watch server/index.ts"`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          stdout: 'ignore',
          stderr: 'pipe',
        },
      }
    : {}),
})
