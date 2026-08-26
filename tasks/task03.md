# Task 03 — Upload API, Rasterization & Session Store (PRD Phase 2)

## Title
Implement `POST /api/upload`, page rasterization to PNG, in-memory `SessionState` store, and the static file-serving route; wire the upload button end-to-end.

## Goal
Uploading both real files creates a session, rasterizes every page of both documents to PNGs under `/tmp/{sessionId}/`, returns `sessionId` + metadata, pages are fetchable via `/api/file/...`, and the browser navigates to `/exams/{sessionId}/processing`.

## Scope
- In: `/api/upload/route.ts`, `lib/session.ts`, `lib/raster.ts`, `/api/file/[id]/[type]/[page]/route.ts`, navigation wiring from task02's button.
- Out: pipeline execution (`/start` comes in task07), extraction logic.

## Assumptions
- PDFs rasterized server-side with `pdf-to-img` (chosen in task01) + `sharp` for image normalization; images pass through as-is (single-page image upload = pageCount 1).
- 150–200 DPI target per PRD §6.1.
- Session store is a module-level `Map<string, SessionState>` guarded onto `globalThis` so dev hot-reload doesn't wipe it; the Vercel serverless cold-start caveat is documented in code comments (PRD §4) and README (task10).

## Relevant files
To be created:
| File | Purpose |
|---|---|
| `app/api/upload/route.ts` | multipart parse → save originals → rasterize → create session → return `{ sessionId, questionPaper: {name,size,pageCount}, answerSheet: {…} }` |
| `lib/session.ts` | `getSession`, `createSession`, `updateSession`; `Map` on `globalThis`; `/tmp/{sessionId}/qp|as/page-N.png` path helpers |
| `lib/raster.ts` | `rasterizeToPages(buffer, mime): Promise<{ buffer: Buffer; width: number; height: number }[]>` — one entry per page |
| `app/api/file/[id]/[type]/[page]/route.ts` | streams `page-N.png` back with `Content-Type: image/png`; `type ∈ {qp, as}` |

Existing to modify: `app/exams/upload/page.tsx` (task02) — button now calls the API and routes on success.

## File-by-file / function-by-function audit
- `upload/route.ts`: use Web `Request.formData()` (Next.js native multipart); enforce ≤10MB server-side too; generate `sessionId` via `uuid`; write originals under `/tmp/{sessionId}/orig/`; build `UploadedFile` objects with `pageImages` array of URL paths (`/api/file/{id}/as/{n}`).
- `session.ts`: single source of truth for status transitions; export `SESSION_TTL_MS` cleanup sweep stub (optional).
- `file route`: validate `type` against allowlist and clamp `page` to stored `pageCount` → 404 otherwise.
- Reuse note: nothing exists yet; but `lib/groq.ts` (task04) will consume the same page-image buffers produced here.

## Backend dataflow
Browser (FormData w/ both files) → `POST /api/upload` → server writes originals to `/tmp` → `rasterizeToPages` produces PNGs at known dimensions → dimensions recorded per page (needed later by overlay math) → `SessionState{status:"uploaded"}` stored in Map → response `{sessionId,…}` → client `router.push(/exams/${id}/processing)` (that page is a stub until task07). Page requests hit `GET /api/file/[id]/[type]/[page]` which reads from `/tmp`.

## Database impact
None. Persistence = OS `/tmp` files + process memory Map only.

## Neo4j impact
None.

## Frontend impact
Upload button becomes functional: loading state during POST, error toast on failure, redirect on success. Filled-card metadata can switch from client-guess to server-returned size/pageCount after response.

## API endpoints involved
- `POST /api/upload` — new.
- `GET /api/file/[id]/[type]/[page]` — new.

## Implementation plan
1. Implement `lib/session.ts` (Map on globalThis, CRUD helpers, path helpers).
2. Implement `lib/raster.ts`: branch on MIME — PDF via `pdf-to-img` loop, images via `sharp` (resize/normalize, record width×height). Return per-page `{buffer,width,height}`.
3. Implement `POST /api/upload/route.ts` orchestrating save→rasterize→store→respond.
4. Implement file-serving route with allowlist + bounds checks.
5. Wire upload page: submit → POST → navigate; handle non-200s with toast.
6. Manual verification round-trip (see test plan).

## Test plan
- curl/Postman `POST /api/upload` with a 2-page sample PDF + a JPEG → assert JSON contains `sessionId`, correct `pageCount`s.
- `GET /api/file/{id}/qp/1` returns a valid PNG (check bytes header); `page=999` → 404; `type=hack` → 404.
- Browser flow: select two files → Start Mapping → URL changes to `/exams/{id}/processing` (blank/stub page acceptable).
- Oversized (>10MB) upload → clean 413/400 with friendly message, no crash.
- Restart dev server → old session gone (expected; confirms in-memory semantics).

## Logging / debugging notes
- Log per-file: name, bytes, detected MIME, pageCount, rasterize ms — this pinpoints whether future extraction failures stem from ingestion or the model.
- Log and mask any filesystem errors on `/tmp` writes (Windows dev uses `%TEMP%`; ensure code uses `os.tmpdir()`, never literal `/tmp`).

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | lib/session.ts store + helpers | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | lib/raster.ts (PDF+image → page PNGs w/ dims) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | POST /api/upload route | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | GET /api/file/[id]/[type]/[page] route | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | Wire button → POST → navigate | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 6 | Round-trip manual tests incl. failure cases | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- **Vercel serverless:** `/tmp` + memory don't survive across invocations/instances. Mitigation per PRD §4: document limitation, keep demo sessions short-lived; revisit if evaluator needs durability.
- Large multi-page PDFs may exceed serverless limits — cap pages (e.g. 20) with clear error.
