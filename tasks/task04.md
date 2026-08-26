# Task 04 — Groq Client & Question Extraction (PRD Phase 3)

## Title
Build the Groq wrapper (strict-JSON prompting + parse-with-retry) and implement question extraction across all question-paper pages with sub-part splitting and order preservation.

## Goal
Given a rasterized question paper, `extractQuestions()` fills `SessionState.questions` where every printed question appears exactly once, sub-parts like `11(a)`/`11(b)` are separate entries with original numbering preserved, printed order is respected, and marks are parsed into `maxMarks` when visible.

## Scope
- In: `lib/groq.ts` (client, model discovery helper, strict-JSON helper, retry/backoff), `lib/pipeline/extractQuestions.ts`, per-page vision prompts, cross-page merge pass, unit-testable prompt fixtures.
- Out: answer-side extraction (task05).

## Assumptions
- Vision model chosen at implementation time by querying Groq `/models` (PRD §4 mandate); store names in one config const. Fast text model (Llama-3.x 70B-class) used only for the merge pass.
- LLM returns JSON matching PRD §5 minus `id`/`orderIndex`; server assigns uuids and monotonic indices.
- One Groq call per QP page, run with concurrency limiter (≤3 parallel, PRD §6.6).

## Relevant files
To be created:
| File | Purpose |
|---|---|
| `lib/groq.ts` | `chatJSON<T>(messages, schemaHint)` — OpenAI-compatible call to `https://api.groq.com/openai/v1/chat/completions`, strips code fences, retries parse once, then re-asks with error appended; `pickModels()` querying `/models` |
| `lib/pipeline/extractQuestions.ts` | `extractQuestions(pages: PageImage[]): Promise<ExtractedQuestion[]>` — per-page vision calls → concat → merge pass → assign id/orderIndex/sourcePage |
| `lib/pipeline/prompts/questionExtraction.ts` (or inline consts) | verbatim-transcription prompt w/ sub-part split rules, "preserve numbering", marks capture, strict-JSON-only instruction |

Existing reused: `lib/session.ts` (write results), `types.ts`.

## File-by-file / function-by-function audit
- `groq.ts`: env check (`GROQ_API_KEY` missing → throw early w/ clear message); timeout per call; single retry w/ exponential backoff on 429/5xx (PRD §6.6).
- Merge pass input: concatenated per-page JSON list; instruction: detect questions split across page boundaries, dedupe repeats, output final ordered list. Output still strict JSON.
- Post-processing guards (deterministic, not LLM): drop empty-text entries; coerce `maxMarks` strings like `[5]` → number 5; validate `displayNumber` is non-empty string.
- Order preservation is enforced by array position from the merge pass, never by re-sorting heuristics (PRD Req #2).

## Backend dataflow
QP page PNGs (from `/tmp` via task03 paths) → base64 → Groq vision chat completion per page (concurrency 3) → per-page `ExtractedQuestionDraft[]` → text-model merge pass → deterministic sanitize → `SessionState.questions` updated, status stays `"extracting"` until answers done (task05 completes step B before mapping starts in task06/07 orchestration).

## Database impact
None — results written only into in-memory `SessionState.questions`.

## Neo4j impact
None.

## Frontend impact
None directly yet; consumed indirectly by review screen (task08) — question cards render in `orderIndex` order with `displayNumber` circles.

## API endpoints involved
None new. Downstream consumer: `POST /api/session/[id]/start` (task07) will invoke this function inside the async pipeline.

## Implementation plan
1. Query `https://api.groq.com/openai/v1/models`, shortlist vision-capable models available today; hardcode pick + fallback in `groq.ts` config block.
2. Implement `chatJSON` with fence-stripping, first-parse-failure re-ask (append assistant's broken output + error to messages), backoff retry.
3. Write question-extraction prompt implementing PRD §6.2 bullets verbatim (transcribe verbatim, split sub-parts, preserve numbering, extract marks, strict JSON array).
4. Implement `extractQuestions` with concurrency-3 page fan-out + merge pass + sanitization + id/orderIndex assignment.
5. Create a small script or temp route to run it against a bundled sample paper and dump JSON.
6. Verify against a paper containing at least one multi-part question (`11(a)`,`11(b)`) and marks annotations.

## Test plan
- Fixture A (typed/digital PDF): ≥10 questions incl. one multi-part → assert count, `displayNumber === "11(a)"` & `"11(b)"` present, `orderIndex` strictly increasing matching print order, `sourcePage` correct.
- Marks fixture `[5 marks]` → `maxMarks === 5`.
- Malformed-LLM simulation: feed truncated/fenced JSON to parser helper → assert recovery path works (unit test on `chatJSON` with mocked fetch).
- Rate-limit resilience: mock 429 once → assert single backoff retry succeeds.

## Logging / debugging notes
- Log: model id used, per-call latency, token usage, raw response length, and (on parse failure) first 200 chars of raw output — essential for prompt iteration.
- Persist last N raw responses to `/tmp/{sessionId}/debug/qp-page-N.json` for offline inspection.

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | Model discovery + config in groq.ts | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | chatJSON strict-JSON helper + retries | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | Question-extraction prompt | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | extractQuestions (fan-out + merge + sanitize) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | Sample-paper harness + debug dump | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 6 | Fixtures A/marks/malformed tests pass | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- Groq model lineup churns (PRD §4 warns) — the `/models` query step is mandatory, not optional; pin fallback model id.
- Vision models may paraphrase instead of transcribe verbatim → strengthen prompt with "copy character-for-character" and spot-check fixtures.
