# Task 08 — Review Screen with Bounding-Box Highlights (PRD Phase 7) — CRITICAL PATH

## Title
Build Screen 4: QuestionList (score badges, expandable rows, AI Feedback) + AnswerSheetViewer (page image, zoom, page nav) with click-to-highlight bbox overlays, unanswered/unmatched states, and low-confidence flags.

## Goal
Clicking any question expands its row (orange left border + light orange bg), shows its AI Feedback block, jumps the right pane to the right page, and draws a colored bounding box tightly around that answer's handwriting region — stable under zoom/resize; unanswered questions show grey "Not answered" badges and an inline message without forcing a page jump; unmatched answers appear in an "Unmatched Answers" panel.

## Scope
- In: `components/QuestionList.tsx`, `QuestionRow.tsx`, `ScoreBadge.tsx`, `AnswerSheetViewer.tsx`, review page composition, shared React Context (`selectedQuestionId`, `zoom`, `currentPage`), bbox→px math, auto page-jump, low-confidence styling (<0.6 dashed border), summary bar if data allows.
- Out: backend changes; polish pass details (task09).

## Assumptions
- Coordinates stay normalized until render; overlay px = normalized × rendered-image-size × zoom, recomputed on zoom/resize (PRD §8 — this prevents drift).
- Region colors: green for selected/matched active, blue for other visible mapped regions (per screenshot); tag label like "Q2:" above active box.
- Data source: one `GET /api/session/[id]` fetch on mount; images via existing file route.

## Relevant files
To be created:
| File | Purpose |
|---|---|
| `app/exams/[sessionId]/review/page.tsx` | fetches session, builds ReviewContext provider, two-pane layout |
| `components/ReviewContext.tsx` (or context in page) | `{session, selectedQuestionId, setSelectedQuestionId, currentPage, setCurrentPage, zoom, setZoom}` |
| `components/QuestionList.tsx` | header "Extracted Questions (from question paper)" + "Expand All" control + scrollable cards |
| `components/QuestionRow.tsx` | numbered circle, text wrap, ScoreBadge, chevron, expanded state w/ orange accent + AI Feedback sub-block + "Read it up" link, dashed border if confidence <0.6 |
| `components/ScoreBadge.tsx` | fraction badge w/ tier color: ≥80% green, 40–79% amber, <40% red, unanswered grey "Not answered" (PRD §8) |
| `components/AnswerSheetViewer.tsx` | header w/ zoom (−/100%/+) + Page X of Y prev/next; scrollable image; overlay div layer; "Not answered" inline state |

Existing reused: TopBar/Sidebar-collapsed (task02), all API routes (tasks 03/07), regions data (task05), mappings/grading (task06).

## File-by-file / function-by-function audit
- Selection resolution chain (the core logic): `selectedQuestionId` → find its `QuestionAnswerMapping` → if `matched`: get `answerBlockId` → `ExtractedAnswerBlock.regions` → group regions by page → viewer renders boxes for regions on `currentPage`; if first selection and active region not on current page → `setCurrentPage(firstRegion.page)` (auto-jump). If `unanswered`: no jump, inline message. Unmatched blocks listed separately (collapsible panel below list or tab w/ count badge — PRD §8).
- Overlay math helper (pure, unit-tested): `(bbox, imgW, imgH) => {left,top,width,height}` in px; container uses relative positioning exactly matching the `<img>` box (same wrapper div, image width 100% of wrapper scaled by zoom).
- Zoom: buttons step ±25%, clamp 50–200%; default fit-width.
- Multi-region rendering: all segments of the active answer get boxes on their respective pages; non-active matched answers may render lighter/blue boxes only when their page is visible (matches screenshot showing multiple colored boxes).
- Performance: memoize overlay computation per (questionId, page, zoom).

## Backend dataflow
No new backend. Read-only consumption: `GET /api/session/[id]` (full state) → join client-side: questions ⨝ mappings ⨝ grading ⨝ answers; page PNGs streamed from `GET /api/file/[id]/as/[page]`.

## Database impact
None.

## Neo4j impact
None.

## Frontend impact
This is the product's centerpiece screen and the visual evaluation anchor (PRD §12 items 6–8, 11). All interaction state lives in ReviewContext; no external state lib (PRD §4).

## API endpoints involved
- `GET /api/session/[id]` — consumer
- `GET /api/file/[id]/as/[page]` — consumer

## Implementation plan
1. Review page skeleton + context + data fetch + join helpers.
2. `ScoreBadge` + `QuestionRow` + `QuestionList` (selection + expand + feedback block + low-confidence styling).
3. `AnswerSheetViewer`: image render + zoom + page nav first.
4. Overlay layer: static single-region highlight for selected question (get click-to-highlight working before layering extras — PRD §10 Phase 7).
5. Layer in: multi-page regions, auto page jump, other-mapped-region secondary boxes + "Qn:" tags, unanswered inline state, unmatched panel, expand-all.
6. Manual QA against a processed real sample incl. an answer spanning pages.

## Test plan
- Unit: overlay px math across zoom levels (100%, 75%, 150%) — box stays glued to same handwriting; resize observer triggers recompute.
- Integration: fixture session with known regions → click Q2 ⇒ currentPage becomes region.page and exactly the expected box geometry renders (query DOM styles).
- States matrix: matched / unanswered (no forced jump + grey badge) / unmatched (panel count correct) / low-confidence (dashed border visible).
- E2E visual: screenshots vs reference Screen 4 (badges, colors, zoom controls, page navigator).

## Logging / debugging notes
- Debug flag (`?debug=1` on review) renders bbox outlines for ALL regions permanently + prints computed px values — invaluable for coordinate bugs.
- Log selection resolution chain failures explicitly (e.g., mapping references missing answerBlockId) rather than silently rendering nothing.

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | Review page + ReviewContext + joins | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | ScoreBadge + QuestionRow + QuestionList | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | AnswerSheetViewer base (img/zoom/pages) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | Click-to-highlight single region | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | Multi-page regions + auto-jump + tags | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 6 | Unanswered/unmatched/low-confidence states | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 7 | Math unit tests + integration + visual QA | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- Coordinate drift under zoom is THE classic failure — never store px offsets in state; always derive from normalized × live dimensions.
- Very tall scanned pages may need max-height scrolling wrapper; ensure overlay wrapper scrolls together with image (same container).
