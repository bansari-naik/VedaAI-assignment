# Task 01 — Project Setup & Scaffolding (PRD Phase 0)

## Title
Initialize the Next.js project with all dependencies, environment config, shared types, and repo hygiene so every later task has a stable foundation.

## Goal
A runnable `npm run dev` app (Next.js App Router + TypeScript + Tailwind) with `pdfjs-dist`/`pdf-to-img`, `sharp`, `tesseract.js`, `uuid`, Groq access configured, and `/types.ts` compiling exactly to PRD §5.

## Scope
- In: scaffold, dependency install, env files, `types.ts`, base folder structure per PRD §11, `.gitignore`, README stub.
- Out: any UI screens, API routes, pipeline logic (later tasks).

## Assumptions
- Node 18+ available locally; no git repo initialized yet (workspace is not a git repo today).
- `GROQ_API_KEY` will be provided by the user; we only create `.env.local` placeholder + `.env.example`.
- Model selection is deferred to task04 — this task only sets up the client plumbing file as a stub-free skeleton (`lib/groq.ts` gets real logic in task04).

## Relevant files
All **to be created** (none exist):
| File | Purpose |
|---|---|
| `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `next.config.ts` | created by create-next-app |
| `app/layout.tsx`, `app/globals.css`, `app/page.tsx` | root shell; `page.tsx` will redirect to `/exams/upload` |
| `types.ts` | PRD §5 data model, verbatim |
| `.env.local` / `.env.example` | `GROQ_API_KEY=` |
| `.gitignore` | node_modules, .next, .env*.local |
| `README.md` | build/run notes (expanded at deploy time) |

## File-by-file / function-by-function audit
- `types.ts` must export exactly (PRD §5): `UploadedFile`, `BoundingBox` (`page` 1-indexed, x/y/width/height normalized 0–1), `ExtractedQuestion` (`displayNumber: string`, `orderIndex: number`, `maxMarks?`, `sourcePage`), `ExtractedAnswerBlock` (`rawText`, `regions: BoundingBox[]`, `detectedLabel?`), `MappingStatus = "matched" | "unanswered" | "unmatched_answer"`, `QuestionAnswerMapping` (`questionId: string | null`, `answerBlockId: string | null`, `confidence: number`), `GradingResult` (`isCorrect: boolean | "partial"`), `SessionState` with `status: "uploaded" | "extracting" | "mapping" | "grading" | "ready" | "error"`.
- No existing code to reuse — greenfield. Do not invent extra abstractions beyond §11.

## Backend dataflow
None yet. This task establishes the module boundaries the later dataflow runs through (`lib/session.ts`, `lib/pipeline/*` folders are created empty-ready).

## Database impact
None — PRD mandates in-memory storage only ("no database required", PRD §4/§9). Sessions live in a server-side Map (task03) and files under OS `/tmp`.

## Neo4j impact
None — no graph database anywhere in this project's scope.

## Frontend impact
Only the empty App Router shell; Tailwind theme tokens (orange accent `#F97316`-ish, rounded-2xl, pill badges per PRD §4) set up in `globals.css` for reuse by task02.

## API endpoints involved
None yet.

## Implementation plan
1. Run `npx create-next-app@latest . --typescript --app --tailwind --eslint` in workspace root (folder name has spaces — verify it scaffolds in place).
2. Install deps: `npm i pdf-to-img sharp tesseract.js uuid groq-sdk` (pick `pdf-to-img`; add `pdfjs-dist` only if client-side rendering is needed later).
3. Create `.env.example` (`GROQ_API_KEY=`) and `.env.local` with placeholder; confirm both are gitignored.
4. Write `types.ts` exactly per PRD §5.
5. Create empty dir skeletons: `components/`, `lib/pipeline/`, `app/exams/…`, `app/api/…` (folders materialize with first files in later tasks).
6. Point `app/page.tsx` → redirect to `/exams/upload`.
7. Verify: `npm run dev` boots; `npx tsc --noEmit` passes.

## Test plan
- `npm run dev` serves the default page at localhost:3000 without errors.
- `tsc --noEmit` clean.
- `import type { SessionState } from "../types"` resolves from a throwaway test file (delete after check), or simply rely on tsc pass.
- `sharp` loads on Windows: `node -e "require('sharp')"` sanity check (native binary).

## Logging / debugging notes
- Log scaffold/deps failures verbatim; sharp/tesseract native-module issues on Windows are the most likely failure point here.

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | create-next-app scaffold | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | install deps (pdf-to-img, sharp, tesseract.js, uuid, groq-sdk) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | .env.example + .env.local + gitignore | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | types.ts per PRD §5 | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | folder skeletons + root redirect to /exams/upload | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 6 | dev boot + tsc clean verification | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- **Windows native modules:** `sharp`/`tesseract.js` may need build tools if prebuilt binaries fail — prefer prebuilds.
- OneDrive path with spaces can trip some CLIs; if create-next-app misbehaves, scaffold into a temp dir under `C:\Users\HP\AppData\Local\Temp\opencode` and copy back.
