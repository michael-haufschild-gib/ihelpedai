import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const baseURL = `http://localhost:${PORT}`

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
  webServer: {
    command: 'pnpm dev --port ' + PORT + ' --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
