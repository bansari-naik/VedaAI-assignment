# Task 05 — Answer Extraction & Bounding Boxes (PRD Phase 4) — CRITICAL PATH

## Title
Extract handwritten answer blocks with transcription, labels, and normalized bounding-box regions — including multi-page answers — plus the tesseract.js OCR fallback and a visual debug overlay page.

## Goal
For each answer-sheet page, produce `ExtractedAnswerBlock`s: `rawText` transcription, optional `detectedLabel` ("Q2", "Ans 3"), and `regions: BoundingBox[]` in normalized 0–1 coords; blocks continuing across pages merge into one block with multiple regions. A debug page renders every box over the page image for accuracy checking.

## Scope
- In: `lib/pipeline/extractAnswers.ts`, `lib/ocrFallback.ts`, cross-page continuation merging, `/exams/debug-bbox/page.tsx` (dev-only), coordinate normalization utilities.
- Out: mapping answers→questions (task06), production viewer overlays (task08).

## Assumptions
- PRD §6.3 mandates the OCR fallback **regardless**: vision-LLM coordinates are unreliable, so primary path = try Groq vision boxes; then always run tesseract.js word-level bbox + line clustering to refine/validate; if LLM boxes are unusable (spike fails per PRD §10 Phase 4 timebox), commit fully to OCR-derived boxes with LLM used only for text cleanup/labeling.
- Grid trick per PRD §6.3: prompt model to reason on a 0–1000×0–1000 top-left-origin grid, normalize ÷1000 afterwards.
- Page images have known pixel dimensions from task03's raster step.

## Relevant files
To be created:
| File | Purpose |
|---|---|
| `lib/pipeline/extractAnswers.ts` | per-page fan-out → draft blocks w/ grid-coord boxes → OCR refine pass → cross-page merge → assign ids → write to session |
| `lib/ocrFallback.ts` | tesseract.js recognize() per page → word bboxes in px → line clustering into blocks → union rects → normalized `BoundingBox`; label regex (`/^(Q\.?\s*\d+|\d+[\).]|Ans\.?\s*\d+)/i`) for `detectedLabel` |
| `app/exams/debug-bbox/page.tsx` | dev-only: pick sessionId/type/page via query params, `<img>` page + absolutely-positioned colored divs for all regions |
| coordinate helpers (in extractAnswers or small `lib/bbox.ts`) | clamp 0–1, sanity checks (area > ~1%, aspect sane), px↔normalized conversion |

Existing reused: `lib/groq.ts` chatJSON (task04), `lib/raster.ts` dims (task03).

## File-by-file / function-by-function audit
- Vision prompt must demand: distinct answer blocks, verbatim transcription incl. diagram description, margin-label capture, strict JSON array of `{rawText, detectedLabel?, box:{x,y,w,h}}` on the 0–1000 grid.
- Merge rule (PRD §6.3): same `detectedLabel` reappearing next page with no new number, or explicit "continued…" text → append new region to prior block instead of new block.
- Sanity gate: reject any box with width or height ≤ 0.01 or ≥ 0.99 of full page unless rawText is empty (likely model degeneracy) — fall back to OCR box for that block.
- Multi-region blocks keep `regions` ordered by (page, y, x) so the viewer can highlight segments in reading order.

## Backend dataflow
AS page PNGs → two parallel tracks: (A) Groq vision per page (grid-coordinate JSON), (B) tesseract.js local bbox extraction → reconcile per block (prefer tighter/more plausible rect; OCR wins when LLM box fails gates) → cross-page continuation merge → `SessionState.answers` populated; status still `"extracting"` until both steps A(QP)/B(AS) complete.

## Database impact
None — in-memory session only.

## Neo4j impact
None.

## Frontend impact
Debug page only (dev tool). Production impact lands in task08 which consumes these exact `regions`. This task de-risks the hardest requirement (PRD §2 "single hardest engineering requirement").

## API endpoints involved
None new (debug page reads existing `GET /api/file/[id]/as/[page]` images + needs session JSON — reuse `GET /api/session/[id]` from task07 if available by then, else read store directly server-side in the dev page).

## Implementation plan
1. Spike first (timeboxed, PRD §10): send one sample handwritten page to chosen vision model with grid prompt; draw returned box on debug page; judge usability.
2. Implement `ocrFallback.ts` (tesseract worker init once, per-page recognize, clustering, union rects, label regex).
3. Implement vision path + reconciliation logic in `extractAnswers.ts`.
4. Implement cross-page merge rules.
5. Build `/exams/debug-bbox` overlay renderer.
6. Iterate prompts/thresholds against 2–3 real notebook photos until boxes visually hug handwriting.

## Test plan
- Fixture sheet with 4 blocks (one labeled out-of-order, one garbage doodle region, one spanning pages 2–3):
  - every intended block yields ≥1 region;
  - multi-page answer has exactly 2 regions on pages 2 & 3;
  - all coords ∈ [0,1]; no rejected-degeneracy boxes survive without fallback replacement;
  - `detectedLabel === "Q3"` captured where written.
- Debug page eyeball check: boxes align within tolerance (~5% page dimension).
- Unit tests on pure helpers: normalization math, degenerate-box rejection, label regex, merge predicate.

## Logging / debugging notes
- Log per page: blocks found by LLM vs OCR, which source won each box, rejection reasons — this log is how you'll tune accuracy quickly.
- Dump final `answers[]` JSON to `/tmp/{sessionId}/debug/answers.json`.

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | Vision-coordinate spike + verdict | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | ocrFallback.ts (tesseract + clustering) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | extractAnswers.ts (LLM path + reconcile) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | Cross-page merge into multi-region blocks | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | /exams/debug-bbox overlay page | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 6 | Fixture suite passes + visual QA | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- Highest-risk phase per PRD §10 — do not let the spike overrun its timebox; OCR fallback is a sanctioned, pre-approved plan B.
- tesseract.js accuracy on cursive handwriting is weak for *text* but fine for *geometry* — that division of labor is intentional; never grade from OCR text alone.
- Photo (vs scan) skew can break line clustering — consider mild deskew later only if demo material demands it.
