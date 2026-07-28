#!/usr/bin/env node
// Generate the demo audio bed + SFX one-shots and upload them to B2.
//
// No binary asset is committed to this repo and no third-party audio licence
// applies: the bed is a 16-bit PCM WAV synthesized at the requested BPM, and the
// three SFX are synthesized one-shots. Upstream video-shotcraft's bundled Mixkit
// BGM/SFX are referenced in docs/LICENSING.md, never vendored.
//
// Synthesis lives server-side (`services/api/app/service/audio.py`) so this
// script and a real render can never disagree about what the bed sounds like —
// which means the API has to be running:
//
//   pnpm dev                       # in another terminal
//   pnpm run make-demo-assets      # optionally: --product my-app --bpm 128

const args = process.argv.slice(2);

function flag(name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at !== -1 && args[at + 1] ? args[at + 1] : fallback;
}

const apiBase = flag("api", process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000");
const product = flag("product", process.env.PROMO_PRODUCT_DEFAULT || "demo-product");
const bpm = Number(flag("bpm", "120"));

const response = await fetch(`${apiBase}/assets/demo-audio`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ product, bpm }),
}).catch((error) => {
  console.error(
    `make-demo-assets: could not reach the API at ${apiBase} (${error.message}). ` +
      "Start it with `pnpm dev` (or `pnpm dev:api`) and try again.",
  );
  process.exit(1);
});

if (!response.ok) {
  const body = await response.text().catch(() => "");
  console.error(
    `make-demo-assets: API returned ${response.status}. ${body.slice(0, 300)}`,
  );
  process.exit(1);
}

const result = await response.json();
console.log(`Audio bed:  ${result.bed_key}`);
for (const sfx of result.sfx ?? []) {
  console.log(`SFX ${sfx.id.padEnd(7)} ${sfx.key}`);
}
console.log(
  `\nAll of the above are now in B2 under assets/${result.product}/audio/. ` +
    "Open /library to play them.",
);
