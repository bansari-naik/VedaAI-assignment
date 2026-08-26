# Tasks — AI Assessment Extraction & Answer Mapping (VedaAI Exams Module)

Master index for implementing `PRD.md` end-to-end. Work through the task files **in order** — each phase ends in a working, demoable state (per PRD §0). Do not start a task before its dependencies are marked done in that file's tracker table.

## Task index

| # | File | Covers PRD phase | Deliverable (demoable state) |
|---|------|------------------|------------------------------|
| 1 | [task01.md](task01.md) | Phase 0 — Project setup | Next.js app scaffolded, deps installed, `types.ts` compiles, env configured |
| 2 | [task02.md](task02.md) | Phase 1 — App shell + Upload screens (static) | Screens 1 & 2 pixel-matched, local-state only |
| 3 | [task03.md](task03.md) | Phase 2 — Upload API + rasterization | Real upload works; page PNGs served; sessionId returned |
| 4 | [task04.md](task04.md) | Phase 3 — Question extraction | Questions extracted in order, sub-parts split (`11(a)`/`11(b)`) |
| 5 | [task05.md](task05.md) | Phase 4 — Answer extraction + bounding boxes | Answer blocks with bbox regions + OCR fallback + debug overlay page |
| 6 | [task06.md](task06.md) | Phase 5 — Mapping + grading | All three `MappingStatus` cases reachable; grading JSON contract verified |
| 7 | [task07.md](task07.md) | Phase 6 — Processing screen + polling | Screen 3 with `/start` + `/status` polling, error/retry states |
| 8 | [task08.md](task08.md) | Phase 7 — Review screen (Screen 4) | Click question → highlight box on correct page, zoom, unanswered/unmatched states |
| 9 | [task09.md](task09.md) | Phase 8 — Polish pass | Visual fidelity vs screenshots, empty/loading/error states, responsive check |
| 10 | [task10.md](task10.md) | Phase 9 — Deploy + E2E validation | Live Vercel URL passing PRD §12 evaluation checklist |

## Critical-path note

PRD §2 calls the bounding-box overlay ("render raster page image + absolutely-positioned overlay derived from extraction coordinates") **the single hardest engineering requirement**. Tasks 05 and 08 are therefore the critical path — timebox the model-coordinate spike in task05 early (PRD §10 Phase 4) and commit immediately to the OCR-fallback approach if Groq vision coordinates are unreliable.

## Global conventions

- **AI provider:** Groq only (`GROQ_API_KEY`). Query `/models` at implementation time to pick the current best vision-capable model; keep the choice in `lib/groq.ts`.
- **Storage:** in-memory only (`lib/session.ts` Map + `/tmp` files). No PostgreSQL, no Neo4j — explicitly out of scope (PRD §9). Every task's Database/Neo4j sections reflect this.
- **Coordinates:** always normalized 0–1 relative to the page image; only the render step converts to pixels (keeps overlays stable across zoom/resize).
- **Status lifecycle:** `"uploaded" → "extracting" → "mapping" → "grading" → "ready"` (or `"error"`), defined once in `types.ts`.
