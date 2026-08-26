# Task 07 — Session Lifecycle APIs & Processing Screen (PRD Phase 6)

## Title
Implement `/start`, `/status`, and full-session endpoints plus the async pipeline orchestrator, and build Screen 3 ("Extracting…") with 1–2s polling and error/retry handling.

## Goal
Visiting `/exams/{sessionId}/processing` fires the full pipeline (extract questions → extract answers → map → grade), polls status until `ready` then routes to `/exams/{sessionId}/review`; on failure shows a human-readable error with a Retry button instead of hanging.

## Scope
- In: `app/api/session/[id]/start/route.ts`, `.../status/route.ts`, `.../route.ts` (full state), pipeline orchestrator (`lib/pipeline/runPipeline.ts` or equivalent inside start route), processing page UI (sparkle animation, collapsed sidebar usage).
- Out: review screen content (task08).

## Assumptions
- Fire-and-forget async execution: `/start` returns immediately; work continues in the same Node process (acceptable per PRD §7 polling design + §4 serverless caveat documented in task03).
- Polling interval 1.5s; client stops on `ready` | `error`.
- Status enum order drives progress display: extracting → mapping → grading → ready.

## Relevant files
To be created:
| File | Purpose |
|---|---|
| `app/api/session/[id]/start/route.ts` | validates session exists & status==="uploaded"; sets `"extracting"`; kicks off orchestrator (not awaited beyond kick-off); 409 if already running/done |
| `lib/pipeline/runPipeline.ts` | sequential orchestration: extractQuestions → extractAnswers → updateSession(status mapping) → mapAnswers → grade → status "ready"; try/catch ⇒ status "error" + `error` message |
| `app/api/session/[id]/status/route.ts` | `{status, error?}` only — lightweight poll target |
| `app/api/session/[id]/route.ts` | full `SessionState` JSON for review screen |
| `app/exams/[sessionId]/processing/page.tsx` | Screen 3: centered sparkle animation, "Extracting…" heading, "This may take a while" subtext, collapsed `<Sidebar>` from task02 |

Existing reused: all four pipeline functions (tasks 04–06), Sidebar collapsed variant (task02), session store (task03).

## File-by-file / function-by-function audit
- `runPipeline.ts` is the single place status transitions happen; each stage wrapped so partial failures produce specific messages ("Question extraction failed: …").
- Guard against double-start: if status ∉ {"uploaded","error"}, return current state w/ 409.
- Processing page: `useEffect` on mount → POST /start once (StrictMode double-invoke safe via ref flag) → setInterval poll /status → cleanup clears timer; on `ready` → `router.replace(/exams/${id}/review)`; on `error` → render error card + Retry (re-POSTs /start after resetting store status to allow rerun).

## Backend dataflow
Client POST /start → route flips status & schedules `runPipeline(sessionId)` → pipeline reads page images from `/tmp` (paths stored by task03) → tasks 04/05/06 functions mutate SessionState through statuses → client GET /status every 1.5s sees progression → final GET /session/[id] returns everything for Screen 4.

## Database impact
None — all state in-memory Map + /tmp files.

## Neo4j impact
None.

## Frontend impact
First dynamic route page (`[sessionId]`); establishes the loading-state pattern and collapsed-sidebar context reused by review screen.

## API endpoints involved
- `POST /api/session/[id]/start` — new
- `GET /api/session/[id]/status` — new
- `GET /api/session/[id]` — new

## Implementation plan
1. Implement runPipeline with staged status writes + error capture.
2. Implement three routes (start/status/full) with id validation.
3. Build processing page (animation, texts, collapsed sidebar) + polling hook.
4. Add retry path (reset status → re-start) and unknown-id handling (redirect to upload).
5. End-to-end manual run with real sample docs; watch network tab timing.

## Test plan
- Happy path E2E (local): upload → auto-navigate → observe Extracting screen → lands on review stub within acceptable time; `/status` shows each stage at least once for a multi-page pair.
- Double-start: two rapid POST /start calls ⇒ one 409; StrictMode double-mount doesn't double-run pipeline (assert via logs/single status transition sequence).
- Error injection: temporarily point GROQ_API_KEY to invalid value → status becomes "error" w/ message, UI shows retry, retry path recovers when key restored.
- Unknown sessionId on all three routes ⇒ 404; processing page redirects gracefully.

## Logging / debugging notes
- Stage-transition logs with elapsed ms per stage (`[pipeline] extractAnswers done in 8.2s`) — primary demo-day debugging tool.
- Log poll requests sparsely (every Nth) to avoid noise.

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | runPipeline orchestrator + status stages | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | /start, /status, /session/[id] routes | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | Processing page UI + sparkle animation | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | Polling hook + ready/error routing | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | Retry + unknown-id handling | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 6 | E2E happy-path + failure-injection tests | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- Serverless background-work limits (Vercel function duration): if a full run exceeds limits on deploy, mitigation = keep demo papers small (few pages) and/or move execution into the polled request chain; document in task10.
- Client tab sleep throttling can stretch polls — harmless (server continues), just note it.
