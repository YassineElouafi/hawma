import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/shots",
  timeout: 90_000,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", reducedMotion: "no-preference" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "npm run build && npm run preview -- --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI, timeout: 180_000 },
});
