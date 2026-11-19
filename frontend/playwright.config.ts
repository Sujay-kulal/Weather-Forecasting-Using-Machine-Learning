import { defineConfig, devices } from "@playwright/test";

const database = process.env.WEATHER_TEST_DATABASE_URL;
if (!database) throw new Error("Set WEATHER_TEST_DATABASE_URL to a seeded disposable PostgreSQL database.");
const databaseUrl = new URL(database);
if (!["localhost", "127.0.0.1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.endsWith("_test")) {
  throw new Error("Browser tests require a local database with a name ending in _test.");
}

const api = "http://127.0.0.1:58000";
const frontend = "http://127.0.0.1:55173";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 40_000,
  workers: 1,
  use: { baseURL: frontend, channel: process.env.WEATHER_BROWSER_CHANNEL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "python -m uvicorn --app-dir backend app.main:app --host 127.0.0.1 --port 58000",
      cwd: "..",
      url: `${api}/ready`,
      env: { DATABASE_URL: database, ENABLE_INGESTION_SCHEDULER: "false" },
    },
    {
      command: "npm run preview -- --host 127.0.0.1 --port 55173 --strictPort",
      url: frontend,
      env: { WEATHER_API_PROXY_TARGET: api },
    },
  ],
});
