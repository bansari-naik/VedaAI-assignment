# Task 02 — App Shell & Upload Screens, Static (PRD Phase 1)

## Title
Build Sidebar, TopBar, and UploadCard components matching reference Screens 1 & 2, wired with local state only (no backend).

## Goal
`/exams/upload` pixel-matches Screens 1 & 2 of PRD §2: selecting two files flips cards to filled state (red PDF icon, name, size • pages, × remove) and enables the dark "Start Mapping →" button.

## Scope
- In: `<Sidebar>` (full + collapsed icon-rail variants via prop), `<TopBar>`, `<UploadCard>`, upload page layout, mascot SVG static asset, client-side validation UI.
- Out: actual POST /api/upload (task03), processing/review screens.

## Assumptions
- Desktop-first design (PRD §9 non-goal: mobile perfection); still avoid outright breakage.
- Page count shown in filled state ("2MB • 2 Pages") is faked/stubbed client-side until task03 returns real counts — render size only for now, page count once known.
- Other nav items (Home / My Classroom / Assignments / My Library) are static/disabled per PRD §1.

## Relevant files
To be created:
| File | Purpose |
|---|---|
| `components/Sidebar.tsx` | full + `collapsed` icon-rail variants (PRD §8: one component reused across all screens) |
| `components/TopBar.tsx` | back arrow, breadcrumb "Exams", help/bell/sparkle/avatar cluster |
| `components/UploadCard.tsx` | dashed drop-zone card, drag-drop + click-browse, accept `.pdf,.png,.jpg,.jpeg`, 10MB guard |
| `app/exams/upload/page.tsx` | Screen 1/2 composition, local `useState` for both files, Start Mapping button enable/disable |
| `public/mascot.svg` (or inline SVG) | decorative circular avatar w/ orange ring (static asset OK per PRD §2) |

Existing to reuse: Tailwind tokens from task01 (`globals.css`); `Sidebar`/`TopBar` get reused by tasks 07/08 unchanged.

## File-by-file / function-by-function audit
- `UploadCard`: props `{ label, hint="Max 10MB", file, onFile, onRemove }`; validates MIME/extension + ≤10 MB client-side, shows friendly error toast/text otherwise (PRD §8).
- `upload/page.tsx`: `const [qpFile, setQpFile] = useState<File|null>(null)` etc.; button `disabled={!(qpFile && asFile)}`; helper text "Once both files are uploaded…" always visible; button onClick is a no-op console log until task03 wires it.
- Score badge / question list intentionally NOT built here (task08 owns `<ScoreBadge>`).

## Backend dataflow
None — purely presentational; file objects stay in React state.

## Database impact
None (in-memory project, nothing persists).

## Neo4j impact
None.

## Frontend impact
This defines the app's visual language everything else reuses: orange accent, rounded-2xl cards, soft shadows, dark navy sidebar, pill badges (PRD §4). Collapsed sidebar variant ships now but is exercised on Screens 3–4 (tasks 07/08).

## API endpoints involved
None yet.

## Implementation plan
1. Build `<Sidebar>` with `collapsed?: boolean` prop; full variant: logo, "AI Teacher's Toolkit" pill, nav list w/ Exams active, Settings, school card footer. Collapsed: icon rail + collapse chevron (PRD Screen 3 spec).
2. Build `<TopBar>`: back arrow, "Exams" breadcrumb, help (?), bell w/ red dot, sparkle icon, avatar+name+chevron.
3. Build `<UploadCard>` with drag-and-drop + click-browse; 10MB/type validation with inline error.
4. Compose `/exams/upload`: heading "Upload" + orange pill "Question Paper & Answer Sheets", subheading, mascot, two cards, Start Mapping button (disabled until both files).
5. Filled-state details: red PDF icon, filename, size text, × remove button.
6. Compare side-by-side against reference screenshots; fix spacing/colors before wiring anything.

## Test plan
- Manual: drag a >10MB file → error message shown, not accepted.
- Manual: remove (×) resets card and disables button again.
- Manual: both files selected → button enabled/dark; zero or one file → grey/disabled.
- Visual diff vs screenshots 1 & 2 (sidebar states, pill, colors).
- `tsc --noEmit` clean; ESLint passes.

## Logging / debugging notes
- `console.debug` file name/size/type on select to catch MIME quirks (Windows may report odd MIME types for .pdf — validate extension as fallback).

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | Sidebar (both variants) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | TopBar | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | UploadCard w/ validation | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | /exams/upload composition + mascot | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | Filled state + button gating | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 6 | Visual QA vs screenshots | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- Exact screenshot fidelity (spacing/icon set) is an explicit evaluation criterion (PRD §12) — budget time here rather than rushing to backend.
- Mascot art: keep it a simple SVG; don't sink time into illustration polish.
