#!/usr/bin/env node
// Opt-in browser install for capture ingest.
//
// Playwright's Chromium is ~150 MB, so it is deliberately NOT part of
// `pnpm run setup`: a cold clone stays fast, and capture degrades to a
// Pillow-drawn placeholder card until you run this.
//
// Run:  pnpm run setup:capture

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENV_PYTHON = resolve(REPO_ROOT, "services/api/.venv/bin/python");

if (!existsSync(VENV_PYTHON)) {
  console.error(
    "setup:capture: services/api/.venv is missing. Run `pnpm run setup` first — " +
      "Playwright is installed into the backend virtualenv.",
  );
  process.exit(1);
}

console.error(
  "Installing Playwright's Chromium (~150 MB). Captures fall back to placeholder " +
    "cards until this finishes.",
);

const result = spawnSync(VENV_PYTHON, ["-m", "playwright", "install", "chromium"], {
  cwd: resolve(REPO_ROOT, "services/api"),
  stdio: "inherit",
});

if (result.error) {
  console.error(`setup:capture: could not start Playwright (${result.error.message}).`);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.error(
  "Chromium installed. Re-ingest from /ingest (or create a new promo) to capture " +
    "the real product UI at 2x.",
);
