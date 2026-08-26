# Task 09 — Polish Pass (PRD Phase 8)

## Title
Visual-fidelity, state-coverage, and responsiveness polish across all four screens to close the gap with the reference screenshots and PRD §12 checklist items.

## Goal
Every screen matches spacing/colors/icons of the reference screenshots; all async surfaces have empty/loading/error states; layout degrades acceptably below desktop widths; no console errors anywhere in the happy path.

## Scope
- In: styling refinements on existing components only, missing-state audits (upload error toast, processing retry, review empty data), favicon/title/metadata, minor a11y (focus states, alt text), responsive spot-fixes.
- Out: new features, backend logic changes, deployment (task10).

## Assumptions
- Desktop-first per PRD §9; "avoid outright breakage" is the bar for narrow viewports.
- All functional behavior already works post-task08 — this task must not change dataflow or APIs.

## Relevant files
Existing files to modify (all created by tasks 02–08):
`components/Sidebar.tsx`, `components/TopBar.tsx`, `components/UploadCard.tsx`, `components/QuestionRow.tsx`, `components/ScoreBadge.tsx`, `components/AnswerSheetViewer.tsx`, `app/exams/upload/page.tsx`, `app/exams/[sessionId]/processing/page.tsx`, `app/exams/[sessionId]/review/page.tsx`, `app/layout.tsx` (metadata), `app/globals.css`.

No new components unless a genuine shared gap emerges (e.g., tiny `<Spinner/>`) — do not invent abstractions.

## File-by-file / function-by-function audit
Checklist-driven audit against PRD §2 + §12:
- Upload: orange pill highlight exact tone/rounding; dashed card borders; mascot ring + dot accents; disabled-vs-enabled button styles (grey vs dark); red PDF icon in filled state; "×" remove affordance hit-area.
- Processing: collapsed icon-rail sidebar active-sparkle highlight; centered sparkle animation timing; heading/subtext typography.
- Review: numbered circles, fraction badge color tiers (green/amber/red/grey-not-answered), expanded card = orange left border + light-orange bg, AI Feedback block + "Read it up", zoom control cluster (`− 100% +`), page navigator ("Page 1 of 4" + arrows), colored region boxes + green "Qn:" tag, unmatched panel styling.
- Global: bell red-dot, avatar chevron, breadcrumb, school footer card; loading skeletons/spinners on fetches; friendly error toasts; empty session fallbacks.

## Backend dataflow
Unchanged. Verification-only touches (e.g., ensuring error JSON shape reaches UI) permitted.

## Database impact
None.

## Neo4j impact
None.

## Frontend impact
Entire task is frontend; success measured visually against screenshots and via state-matrix walkthrough.

## API endpoints involved
None modified; consumed as-is.

## Implementation plan
1. Side-by-side screenshot comparison session per screen; log every delta into this file's tracker before fixing.
2. Fix upload screen deltas → re-screenshot.
3. Fix processing + review deltas → re-screenshot.
4. State audit: simulate empty/error/slow (throttle network) on each fetch surface; add missing spinners/toasts/empty states.
5. Responsive pass at 1280 / 1024 / 768: two-pane layouts stack or scroll without overlap.
6. Metadata pass: title "AI Teacher's Toolkit – Exams", favicon, description.
7. Full happy-path click-through with console open; fix any warnings/errors.

## Test plan
- Visual regression: fresh screenshots vs references for all 4 screens at 1440p.
- State matrix: each endpoint failure mode (404 id, 500, timeout) yields designed UI state, never a blank screen.
- Interaction sweep: expand-all/collapse, remove-file re-disable, zoom clamp boundaries, prev/next page bounds.
- `tsc --noEmit` + ESLint clean; no React key/hydration warnings in console during full flow.

## Logging / debugging notes
- Keep `?debug=1` overlays from task08 available while polishing review alignment.
- Capture before/after screenshots into `/tmp/opencode/polish/` (not repo) for the tracker evidence.

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | Delta audit vs all 4 screenshots | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | Upload screen fixes | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | Processing + review fixes | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | Empty/loading/error state coverage | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | Responsive spot-pass (1280/1024/768) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 6 | Metadata/favicon + clean-console sweep | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- Screenshot fidelity is subjective — when ambiguous, match the screenshot over verbal description (PRD §2 rule).
- Avoid scope creep: resist redesigning anything functional here.
