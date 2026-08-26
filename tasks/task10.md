# Task 10 — Deployment & End-to-End Validation (PRD Phase 9)

## Title
Deploy to Vercel with Groq env configured, document serverless limitations, and run the full PRD §12 evaluation checklist against the live URL with realistic demo material.

## Goal
A public Vercel URL where a fresh browser session completes Upload → Extracting → Review end-to-end with real question paper + photographed handwritten sheet, passing every checkbox in PRD §12.

## Scope
- In: git init/push, Vercel project setup, `GROQ_API_KEY` env config, README (run instructions + known limitations + demo repro tips), final E2E validation incl. the §12 checklist, sample demo assets prep.
- Out: feature changes; only trivial deploy-blocking fixes allowed here (anything bigger loops back to its owning task).

## Assumptions
- Vercel free tier suffices; function duration limits are respected by keeping demo documents small (≤ ~6 answer pages) until validated otherwise.
- Serverless in-memory/session caveat documented, not engineered away (per PRD §4 decision).

## Relevant files
To be created/modified:
| File | Purpose |
|---|---|
| `.gitignore` (verify from task01) | excludes .env*.local, node_modules, .next |
| `README.md` | setup, env vars, local dev, deploy steps, limitations section (in-memory sessions & cold starts), how to reproduce a demo session reliably |
| `vercel.json` (only if needed) | e.g., function config tweaks — default to not needing it |

Existing: entire app from tasks 01–09 gets deployed as-is.

## File-by-file / function-by-function audit
- Pre-deploy gate: `npm run build` must succeed locally with zero type/lint errors (Vercel build will fail otherwise).
- Env audit: no secret in code; `GROQ_API_KEY` referenced only via `process.env`; `.env.example` accurate.
- Route audit on prod target: all five API routes respond (200/expected codes) — dynamic route naming `[id]/[type]/[page]` verified against Vercel path handling.

## Backend dataflow
Same as tasks 03–07 but exercised on Vercel serverless runtime; specifically verify `/tmp` writes work per-invocation and pipeline completes within function limits for demo-sized docs.

## Database impact
None (never any DB — confirm no accidental persistence imports crept in).

## Neo4j impact
None.

## Frontend impact
Verify production build renders identically (Tailwind purge/JIT differences occasionally drop classes used only dynamically — check badge tiers & box colors survive the build).

## API endpoints involved
All five, smoke-tested on the deployed URL:
- `POST /api/upload`
- `POST /api/session/[id]/start`
- `GET /api/session/[id]/status`
- `GET /api/session/[id]`
- `GET /api/file/[id]/[type]/[page]`

## Implementation plan
1. `git init`, initial commit, push to GitHub repo.
2. Import repo in Vercel; set `GROQ_API_KEY`; deploy; note URL.
3. Smoke-test all API routes on prod (curl).
4. Prepare demo kit: one printed-style question paper PDF (with multi-part Q + marks) and a genuinely handwritten answer sheet photo set engineered to include: out-of-order answers, one skipped question, one garbage block, one answer continuing onto a second page (PRD §10 Phase 9: photograph a real notebook if no scan exists).
5. Run §12 checklist item-by-item on the live URL from an incognito session; record pass/fail in tracker below.
6. Write README limitations + demo guidance (don't idle a session before presenting; cold start wipes state).
7. Final tag/commit.

## Test plan (final end-to-end validation)
Execute on **production URL**, incognito, recording evidence:
1. Sub-parts `11(a)`/`11(b)` appear distinct w/ original numbering. ☐
2. Question order matches print order exactly. ☐
3. Out-of-order handwritten answer maps to correct question. ☐
4. Skipped question shows "unanswered". ☐
5. Garbage block appears under Unmatched Answers, not force-mapped. ☐
6. Click question → tight highlight on correct handwriting/page + auto page switch. ☐
7. Multi-page answer highlights regions on both pages. ☐
8. Score badges + AI feedback render per Screen 4 style. ☐
9. All four screens visually match references. ☐
10. Fresh-browser live URL works with zero local setup. ☐
Plus API smoke matrix: each endpoint × {happy, bad-id, oversized file} on prod.

## Logging / debugging notes
- Use Vercel function logs during live validation to catch prod-only failures (env missing, /tmp perms, timeouts).
- If a prod-only bug appears: capture function log lines + request IDs before touching code.

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | Local `npm run build` green | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 2 | Git init + GitHub push | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 3 | Vercel import + env + first deploy | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 4 | Prod API smoke matrix | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 5 | Demo kit prepared (QP + engineered AS) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 6 | §12 checklist executed live (10 items) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 7 | README (limitations + demo guide) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

## Open questions / risks
- **Serverless duration/memory:** vision calls × pages can exceed free-tier limits — mitigations: fewer demo pages, concurrency 3 already capped, or move grading into a second polled call if needed (would require small task07 change).
- **Cold starts wipe sessions:** acceptable per PRD; README must say so explicitly (evaluators will hit it).
- Dynamic API route segments occasionally need trailing config on Vercel — validate `[id]/[type]/[page]` early in step 3 rather than at step 6.
