import { describe, expect, it } from "vitest";
import type { FileMetadata } from "@remotion-promo-video-pipeline/shared";

import {
  allFolderPaths,
  buildFileTree,
  type TreeFile,
  type TreeFolder,
} from "./file-tree";

function file(key: string, uploadedAt: string): FileMetadata {
  return {
    key,
    filename: key.split("/").pop() ?? key,
    folder: "",
    size_bytes: 1,
    size_human: "1 B",
    content_type: "text/plain",
    uploaded_at: uploadedAt,
    url: null,
  };
}

describe("buildFileTree", () => {
  it("nests files under folders derived from their keys", () => {
    const tree = buildFileTree([
      file("uploads/a.txt", "2026-02-01T00:00:00Z"),
      file("uploads/photos/b.png", "2026-02-02T00:00:00Z"),
      file("docs/c.pdf", "2026-02-03T00:00:00Z"),
    ]);

    // Two top-level folders, sorted alphabetically.
    expect(tree.map((n) => n.type)).toEqual(["folder", "folder"]);
    expect((tree[0] as TreeFolder).name).toBe("docs");
    expect((tree[1] as TreeFolder).name).toBe("uploads");

    // uploads/ contains a nested photos/ folder.
    const uploads = tree[1] as TreeFolder;
    expect((uploads.children[0] as TreeFolder).name).toBe("photos");
  });

  it("sorts files newest-first within a folder", () => {
    const tree = buildFileTree([
      file("uploads/old.txt", "2026-01-01T00:00:00Z"),
      file("uploads/new.txt", "2026-03-01T00:00:00Z"),
    ]);

    const uploads = tree[0] as TreeFolder;
    const names = uploads.children
      .filter((c): c is TreeFile => c.type === "file")
      .map((f) => f.name);
    expect(names).toEqual(["new.txt", "old.txt"]);
  });

  it("orders folders before files at the same level", () => {
    const tree = buildFileTree([
      file("root-file.txt", "2026-02-01T00:00:00Z"),
      file("zzz-folder/inner.txt", "2026-02-02T00:00:00Z"),
    ]);

    expect(tree[0].type).toBe("folder");
    expect(tree[1].type).toBe("file");
  });
});

// Regression suite for the prefix-scoped Files view: scoping to a deep prefix
// produced a chain of collapsed single-child folders, so the objects the user
// scoped to see were still three clicks away.
describe("allFolderPaths", () => {
  it("returns every folder path at every depth, with trailing slashes", () => {
    const tree = buildFileTree([
      file("frames/job1/pass-01/master-16x9/frame-000000.png", "2026-02-01T00:00:00Z"),
      file("frames/job1/pass-01/master-16x9/frame-000001.png", "2026-02-01T00:00:01Z"),
    ]);

    expect(allFolderPaths(tree)).toEqual([
      "frames/",
      "frames/job1/",
      "frames/job1/pass-01/",
      "frames/job1/pass-01/master-16x9/",
    ]);
  });

  it("covers sibling branches and ignores files", () => {
    const tree = buildFileTree([
      file("renders/job1/master.mp4", "2026-02-01T00:00:00Z"),
      file("manifests/job1.json", "2026-02-01T00:00:00Z"),
      file("top-level.txt", "2026-02-01T00:00:00Z"),
    ]);

    expect(allFolderPaths(tree).sort()).toEqual([
      "manifests/",
      "renders/",
      "renders/job1/",
    ]);
  });

  it("is empty for a flat listing", () => {
    expect(allFolderPaths(buildFileTree([file("a.txt", "2026-02-01T00:00:00Z")]))).toEqual([]);
  });
});
