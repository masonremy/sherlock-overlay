import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Smoke test: starts its own server on a spare port with a throwaway data
// folder, so it never touches the streamer's cases, maps or portraits.
// Uses the installed Edge by default (PW_CHANNEL=chrome for Chrome).

const PORT = 7790;
const dataDir = mkdtempSync(join(tmpdir(), "sherlock-smoke-"));

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "msedge",
  },
  webServer: {
    command: "npx tsx server/index.ts",
    url: `http://localhost:${PORT}/control`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(PORT), DATA_DIR: dataDir, CASE: "smoke" },
  },
});
