<!-- last_verified: 2026-07-28 -->
# Feature: File Browser

## Purpose
List, preview, download, and delete **every** object in the bucket — whole-bucket
forensics, unscoped.

This deliberately overlaps [asset-library.md](asset-library.md), which is scoped to
`assets/<product>/`. Two different jobs: "what is in my bucket?" vs. "what material
does this product have?". Per AGENTS.md §3 this view must stay wired to the whole
bucket and must never be removed or scoped.

## Used By
- UI: `/files` page, file browser component
- API: `GET /files`, `GET /files-by-key/metadata?key=...`, `GET /files-by-key/detail?key=...`, `GET /files-by-key/download?key=...`, `GET /files-by-key/preview?key=...`, `DELETE /files-by-key?key=...`
- Legacy API: `GET /files/{key}`, `GET /files/{key}/download`, `GET /files/{key}/preview`, `DELETE /files/{key}`

## Core Functions
- `apps/web/src/components/files/file-browser.tsx` — tree view container with loading, empty, error, refresh, preview, download, and delete flows
- `apps/web/src/components/files/file-tree-row.tsx` — recursive folder/file rows with keyboard-friendly actions and long-name handling
- `apps/web/src/components/files/file-preview.tsx` — dialog modal for file preview
- `apps/web/src/components/files/file-metadata-panel.tsx` — structured metadata display
- `apps/web/src/lib/file-tree.ts` — `buildFileTree()` converts flat S3 keys to folder/file hierarchy
- `apps/web/src/lib/api-client.ts` — `getFiles()`, `getFile()`, `getFileDetail()`, `getDownloadUrl()`, `getPreviewUrl()`, `deleteFile()`; sends object keys as query parameters so slashes and reserved route names cannot be decoded into path segments
- `services/api/app/runtime/files.py` — HTTP handlers for list, get, detail, download, delete
- `services/api/app/service/files.py` — business logic, key validation, `get_file_detail()` on-demand recompute
- `services/api/app/repo/b2_client.py` — `list_files()`, `get_file_metadata()`, `get_presigned_url()`, `delete_file()`
- `services/api/app/repo/b2_object.py` — `get_object_bytes()` (object download for detail recompute)

## Canonical Files
- File route handlers: `services/api/app/runtime/files.py`
- File tree builder: `apps/web/src/lib/file-tree.ts`
- B2 data access pattern: `services/api/app/repo/b2_client.py`

## Inputs
- prefix: string (optional filter for file listing; the `/files` page exposes it as
  a "Scope to a prefix" input, which is the only way to reach deep keys — see Flow)
- limit: int (max files to return, 1-1000; API default 100, the browser requests
  `FILE_PAGE_SIZE` = 500 and offers 1,000)
- key: string (file key for get/download/delete — sent as a query parameter by the web client; no path traversal)

## Outputs
- `GET /files` → `FileMetadata[]` (sorted most recent first)
- `GET /files-by-key/metadata?key=...` → `FileMetadata` (cheap `head_object`; core fields only)
- `GET /files-by-key/detail?key=...` → `FileMetadataDetail` (checksums + image/PDF fields). Downloads the object and re-runs extraction on demand, so it's billed at the tighter write rate-limit tier and returns 413 for objects above `max_file_size`.
- `GET /files-by-key/download?key=...` → `{ url: string }` (presigned URL, attachment disposition, 10-min expiry). Increments the `total_downloads` counter exposed on `/files/stats`. The counter is persisted via `repo/counter.py` to `services/api/data/download_count.json` (override via `DOWNLOAD_COUNT_FILE`). It survives a local process restart; see [RELIABILITY.md](../RELIABILITY.md#stateful-counters--durability-caveats) for its limits on ephemeral filesystems and across replicas.
- `GET /files-by-key/preview?key=...` → `{ url: string }` (presigned URL for inline rendering, 10-min expiry). Does **not** increment the download counter — used by the preview modal for images / PDFs.
- `DELETE /files-by-key?key=...` → `{ deleted: true, key: string }`
- Legacy `/files/{key}` routes remain available for compatibility. The web client uses them only as a rolling-deploy fallback when `/files-by-key` is unavailable and the key is safe to place in a legacy path.
- Side effects: DELETE removes file from B2; `/download` increments the in-memory download counter

## Flow
- Page loads → fetches file list from `GET /files` (sorted most recent first)
- **Truncation is disclosed, never silent.** `GET /files` sorts the whole prefix
  newest-first and *then* slices to `limit`, so `limit` genuinely hides the tail.
  The header therefore states "Showing N of M objects in the bucket" (M from
  `GET /files/stats`) and warns when the page is full. With 13,168 objects in a
  bucket, an unscoped view at the old default of 100 showed `frames 96 files` and
  no `assets/` or `storyboards/` prefix at all, while the dashboard next door
  reported 5,220 frames archived — with nothing on screen to reconcile the two
- **No counts are claimed until they are known.** A full-bucket scan takes ~9s,
  and rendering `files.length` unguarded asserted "Showing **0 of 0** objects in
  the bucket" for that whole window — a false *terminal* fact for the exact user
  who came here to check whether their frames landed in B2. While the listing is
  in flight the header shows a skeleton plus a visible "Counting objects in the
  bucket..." (the dashboard tiles' treatment), and the "of M" clause appears only
  once `/files/stats` has answered — "500 of 500" would understate the bucket just
  as badly
- **Scope to a prefix to go deep.** No page size reaches
  `frames/<job-id>/pass-NN/<variant>/` in a busy bucket; scoping the listing to that
  prefix puts one pass comfortably inside the cap. A "Show up to 1,000 objects"
  control raises the page size to the API's own ceiling
- Files organized into tree view — folders expand/collapse, files shown with type-specific icons
- Top-level folders auto-expand on load
- User hovers or focuses a file row → action menu appears (preview / download / delete); touch-sized menu button remains visible on small screens
- Preview: opens dialog, fetches a preview-only presigned URL via `/files-by-key/preview?key=...` (does not count as a download) and renders image/PDF inline. Expanding "Detailed metadata" lazily fetches `/files-by-key/detail?key=...` and renders checksums + image/PDF fields in `FileMetadataPanel`.
- Download: fetches presigned URL via `/files-by-key/download?key=...` (attachment disposition, 10-min expiry), opens in new tab, bumps the download counter, triggers a stats refresh
- Delete: calls `DELETE /files-by-key?key=...`, removes row from tree, shows toast
- All key-based API calls send the key in the query string and validate it against path-traversal patterns in the API service layer
- During frontend/API version skew, the web client falls back to legacy path routes only for keys that cannot collide with reserved file routes such as stats, download, or preview.

## Edge Cases
- File not found (deleted externally) → API returns 404
- Invalid file key (traversal attempt, empty key) → API returns 400
- File key contains `/`, spaces, `#`, `?`, `%`, reserved route names, or suffixes like `/download` and `/preview` → web client sends the key as a query parameter before calling get/download/preview/delete routes
- B2 unreachable → persistent error state with retry
- Empty bucket → prompt with a direct **Ingest assets** action
- Prefix matches nothing → "Nothing under `<prefix>`" with a **Clear prefix**
  action, not the misleading "This bucket is empty"
- More objects than the page size → the count line says so and names prefix
  scoping as the way to reach the rest
- Delete failure → API returns 500, toast error

## UX States
- Empty: centered message with an **Ingest assets** action
- Loading: skeleton rows, and a skeleton + "Counting objects in the bucket..." in
  place of the count line — never a "0 of 0" that reads as a settled answer
- Error: inline error state with Retry
- Loaded: tree view with expand/collapse folders and focus/hover action menus
- Preview: responsive dialog with wrapped file names, fallback copy for preview URL failures, and metadata that tolerates long keys; a "Detailed metadata" disclosure lazily loads checksums/EXIF/PDF fields (skeleton while loading, inline error if the recompute fails)

## Verification
- Test files: `services/api/tests/test_file_key_routes.py`, `apps/web/src/lib/api-client.test.ts`
- Required cases: list files, empty list, file not found, presigned URL generation, delete success, delete failure
- Focused API verify command: `pnpm test:api`
- Focused client route-construction command: `pnpm test:web`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Dev Workflows](../dev-workflows.md#commands) are available
- Pass criteria: focused tests and `pnpm verify` green; explain any skipped `pnpm verify:full` prerequisites

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
