import { describe, expect, it } from "vitest";
import {
  KIND_ORDER,
  groupAssetsByKind,
  isProductEmpty,
} from "@/lib/asset-groups";
import type { AssetEntry } from "@remotion-promo-video-pipeline/shared";

function entry(kind: AssetEntry["kind"], key: string): AssetEntry {
  return {
    key,
    name: key.split("/").pop() ?? key,
    kind,
    group: kind,
    size_bytes: 1024,
    size_human: "1.0 KB",
    content_type: "application/octet-stream",
    updated_at: "2026-07-28T10:00:00Z",
    url: null,
  };
}

describe("groupAssetsByKind", () => {
  it("keeps every kind, in order, for a partially populated product", () => {
    const groups = groupAssetsByKind([entry("brand", "assets/acme/brand/logo.png")]);

    expect(groups.map((group) => group.kind)).toEqual(KIND_ORDER);
    expect(groups.find((group) => group.kind === "brand")?.entries).toHaveLength(1);
    // The four kinds with nothing in them still get a card + a way to fill it.
    for (const group of groups.filter((g) => g.kind !== "brand")) {
      expect(group.entries).toEqual([]);
      expect(group.emptyTitle.length).toBeGreaterThan(0);
      expect(group.emptyHint.length).toBeGreaterThan(0);
    }
  });

  it("files each entry under its own kind", () => {
    const groups = groupAssetsByKind([
      entry("capture", "assets/acme/captures/desktop/product@2x.png"),
      entry("bgm", "assets/acme/audio/bgm/pulse-120bpm.wav"),
      entry("sfx", "assets/acme/audio/sfx/whoosh/whoosh.wav"),
      entry("sfx", "assets/acme/audio/sfx/click/click.wav"),
    ]);

    const counts = Object.fromEntries(
      groups.map((group) => [group.kind, group.entries.length]),
    );
    expect(counts).toEqual({ capture: 1, bgm: 1, sfx: 2, brand: 0, other: 0 });
  });

  it("tolerates a missing entry list (the query has not resolved yet)", () => {
    expect(groupAssetsByKind(undefined)).toHaveLength(KIND_ORDER.length);
  });

  it("points each empty kind at the affordance that actually fills it", () => {
    const hint = (kind: AssetEntry["kind"]) =>
      groupAssetsByKind([]).find((group) => group.kind === kind)!.emptyHint;

    expect(hint("capture")).toContain("Ingest");
    expect(hint("brand")).toContain("Ingest");
    expect(hint("bgm")).toContain("Synthesize demo audio");
    expect(hint("sfx")).toContain("Synthesize demo audio");
  });
});

describe("isProductEmpty", () => {
  it("is true only when no kind has anything", () => {
    expect(isProductEmpty(groupAssetsByKind([]))).toBe(true);
    expect(
      isProductEmpty(groupAssetsByKind([entry("brand", "assets/acme/brand/logo.png")])),
    ).toBe(false);
  });
});
