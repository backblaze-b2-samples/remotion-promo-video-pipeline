#!/usr/bin/env node
/**
 * Frame renderer — the only process that crosses the Python -> Node boundary.
 *
 * Usage:
 *   node render-frames.mjs --storyboard <path> --variant <id> \
 *     --out-dir <path> --frame-range a-b [--concurrency N]
 *
 * STDOUT CONTRACT: NDJSON, one JSON object per line, and nothing else.
 *
 *   {"type":"progress","rendered":N,"total":M}
 *   {"type":"done","frameCount":N,"width":W,"height":H}
 *   {"type":"error","message":"..."}      (plus a non-zero exit code)
 *
 * Every human-readable log goes to stderr. `console.log` is re-pointed at stderr
 * below so a stray library write can never corrupt the stream the Python side
 * parses line by line (services/api/app/service/render_engine.py).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderFrames, selectComposition } from "@remotion/renderer";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY_POINT = resolve(HERE, "src/index.ts");
const COMPOSITION_ID = "Promo";
const FRAME_DIGITS = 6;

// --- stdout discipline -----------------------------------------------------
const emitLine = process.stdout.write.bind(process.stdout);
const logToStderr = (...args) => {
  process.stderr.write(
    args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") + "\n",
  );
};
console.log = logToStderr;
console.info = logToStderr;
console.debug = logToStderr;

function emit(event) {
  emitLine(JSON.stringify(event) + "\n");
}

function fail(message) {
  emit({ type: "error", message });
  process.exit(1);
}

// --- argv ------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const storyboardPath = args.storyboard;
const variant = args.variant;
const outDir = args["out-dir"];
const rangeArg = args["frame-range"] ?? "";
const concurrency = Math.max(1, Number.parseInt(args.concurrency ?? "1", 10) || 1);

if (!storyboardPath || !variant || !outDir) {
  fail("Missing required argument: --storyboard, --variant and --out-dir are all required");
}
if (!existsSync(storyboardPath)) {
  fail(`Storyboard file not found: ${storyboardPath}`);
}

const rangeMatch = /^(\d+)-(\d+)$/.exec(rangeArg.trim());
if (!rangeMatch) {
  fail(`--frame-range must look like "0-179", got "${rangeArg}"`);
}
const rangeStart = Number(rangeMatch[1]);
const rangeEnd = Number(rangeMatch[2]);
if (rangeEnd < rangeStart) {
  fail(`--frame-range end (${rangeEnd}) is before its start (${rangeStart})`);
}

let storyboard;
try {
  storyboard = JSON.parse(readFileSync(storyboardPath, "utf8"));
} catch (error) {
  fail(`Storyboard file is not valid JSON: ${error.message}`);
}

// --- render ----------------------------------------------------------------
// Frames are rendered into a scratch subdirectory and then renamed into the
// canonical `frame-%06d.png` the B2 key layout uses. Renaming (instead of
// trusting Remotion's own file naming) keeps the storage layout stable across
// Remotion versions.
const RAW_DIR = join(outDir, ".raw");

function frameFileName(index) {
  return `frame-${String(index).padStart(FRAME_DIGITS, "0")}.png`;
}

function normalizeFrameNames(expectedCount) {
  const files = readdirSync(RAW_DIR)
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .map((name) => ({ name, index: Number((/(\d+)/.exec(name) ?? [])[1] ?? NaN) }))
    .filter((entry) => Number.isFinite(entry.index))
    .sort((a, b) => a.index - b.index);

  // Remotion has named range output both absolutely and relative to the range
  // start across versions. When the count matches the requested range, map
  // positionally (correct either way); otherwise trust the parsed number.
  const positional = files.length === expectedCount;
  let moved = 0;
  files.forEach((entry, position) => {
    const target = positional ? rangeStart + position : entry.index;
    renameSync(join(RAW_DIR, entry.name), join(outDir, frameFileName(target)));
    moved += 1;
  });
  rmSync(RAW_DIR, { recursive: true, force: true });
  return moved;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  rmSync(RAW_DIR, { recursive: true, force: true });
  mkdirSync(RAW_DIR, { recursive: true });

  // Downloads Chrome Headless Shell on first use (~120 MB, cached afterwards).
  // Progress goes to stderr so the NDJSON stream stays clean.
  await ensureBrowser({
    onBrowserDownload: () => ({
      onProgress: ({ percent }) =>
        logToStderr(`chrome-headless-shell download ${Math.round(percent * 100)}%`),
    }),
  });

  logToStderr(`bundling ${ENTRY_POINT}`);
  const serveUrl = await bundle({
    entryPoint: ENTRY_POINT,
    onProgress: (percent) => logToStderr(`bundle ${percent}%`),
  });

  const inputProps = { storyboard, variant };
  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
  });

  const expected = rangeEnd - rangeStart + 1;
  let rendered = 0;

  await renderFrames({
    composition,
    serveUrl,
    inputProps,
    outputDir: RAW_DIR,
    imageFormat: "png",
    frameRange: [rangeStart, rangeEnd],
    concurrency,
    logLevel: "error",
    onBrowserLog: (log) => logToStderr(`[browser] ${log.text}`),
    onStart: ({ frameCount }) => emit({ type: "progress", rendered: 0, total: frameCount }),
    onFrameUpdate: (count) => {
      rendered = count;
      emit({ type: "progress", rendered: count, total: expected });
    },
  });

  const moved = normalizeFrameNames(expected);
  emit({
    type: "done",
    frameCount: moved || rendered,
    width: composition.width,
    height: composition.height,
  });
}

main().catch((error) => {
  logToStderr(error?.stack ?? String(error));
  fail(error?.message ?? String(error));
});
