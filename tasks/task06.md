# Task 06 — Answer Mapping & Grading (PRD Phase 5)

## Title
Implement semantic answer→question mapping producing all three `MappingStatus` cases with confidence scores, and grading with score/isCorrect/AI feedback.

## Goal
`mapAnswers()` pairs questions with answer blocks semantically (labels first, content similarity second, never by order), emitting `matched`, `unanswered`, and `unmatched_answer` entries with confidence; `grade()` fills `GradingResult[]` (unanswered ⇒ 0/false/"Not attempted.") and an overall total.

## Scope
- In: `lib/pipeline/mapAnswers.ts`, `lib/pipeline/grade.ts`, hand-written fixture suites proving all three statuses are reachable, summary computation.
- Out: any UI (task08 renders these results); pipeline orchestration (task07).

## Assumptions
- Mapping uses the fast text model (no vision needed — PRD §6.4); one call with full question list + answer list (ids + rawText + detectedLabel).
- Confidence < 0.6 flags teacher-review in UI later (PRD §6.4 threshold).
- Grading batches matched items into as few calls as feasible (PRD §6.5 "batchable") while keeping JSON reliability; fall back to per-item calls if batched parses flake.
- `maxMarks` defaults to 5 when not extracted from the paper (PRD §6.5).

## Relevant files
To be created:
| File | Purpose |
|---|---|
| `lib/pipeline/mapAnswers.ts` | builds mapping prompt → chatJSON → validates ids exist → emits `QuestionAnswerMapping[]` incl. synthesized unanswered rows for every question lacking a match and orphan rows (`questionId:null`) for every unmatched answer block |
| `lib/pipeline/grade.ts` | for each `matched` mapping: question text + maxMarks + rawText → `{score,maxScore,isCorrect,feedback}` strict JSON; auto-fills unanswered; computes totals |

Existing reused: `chatJSON` (task04), types (task01), session store writes (task03).

## File-by-file / function-by-function audit
- `mapAnswers.ts` validation layer is deterministic and critical: LLM-referenced `questionId`s/`answerBlockId`s must resolve to real entities else drop/repair; guarantee invariants — every question appears in ≥1 mapping row; every answerBlock appears in ≥1 row; `status:"unanswered"` ⇔ `answerBlockId===null`; `"unmatched_answer"` ⇔ `questionId===null` (types.ts contract).
- Label-first heuristic pre-pass (cheap, deterministic): if `detectedLabel` normalizes to an existing `displayNumber`, short-circuit that pair at confidence 0.95 before LLM sees it — improves reliability and cost (sanctioned by PRD §6.4 "prefer detectedLabel").
- `grade.ts`: feedback constrained to 1–3 sentences, encouraging-but-honest tone (matches Screen 4 example); clamp score to [0, maxScore]; `isCorrect` boolean|"partial" mapped from ratio thresholds (e.g. ≥0.8 true, >0 false, else "partial" — pick and document).

## Backend dataflow
`questions[]` + `answers[]` → deterministic label pass → LLM semantic mapping → invariant repair → `SessionState.mappings`; then `mappings(matched)` + questions → LLM grading (batched) → merge with auto-unanswered grades → `SessionState.grading` + totals; status advances `"mapping" → "grading" → "ready"`.

## Database impact
None — in-memory arrays on SessionState.

## Neo4j impact
None.

## Frontend impact
Consumed by task08: left-pane score badges (`score/maxScore`), AI Feedback block text, grey "Not answered" badge, "Unmatched Answers" panel count, low-confidence dashed-border flag (<0.6).

## API endpoints involved
None new; results surface through `GET /api/session/[id]` (task07).

## Implementation plan
1. Implement label pre-pass + prompt + `mapAnswers` + invariant repair.
2. Implement `grade` with batching + clamps + tone constraints + unanswered autofill.
3. Write fixtures: Q-list (6 qs incl. `11(a)`/`11(b)`) × answer set containing: correct out-of-order labeled answer, content-similar unlabeled answer, skipped question, garbage/doodle block, bogus label "Q99".
4. Assert all three statuses occur and invariants hold on fixture output.
5. Add totals helper `{earned, possible}` for the future summary bar (PRD §6.5 "if time allows" — cheap now).

## Test plan
- Fixture run (mocked LLM responses AND one live run): out-of-order answer maps to its true question; skipped question ⇒ `unanswered` w/ null answerBlockId; garbage + Q99 ⇒ `unmatched_answer` w/ null questionId; confidences ∈ [0,1].
- Invariant fuzz: feed malformed LLM mapping (unknown ids, duplicate pairs, missing rows) to repair function → assert repaired output satisfies all invariants.
- Grading fixture: perfect/partial/wrong/unanswered → expected score, isCorrect tier, "Not attempted." literal for unanswered.
- Deterministic unit tests, no network, for repair/clamp/tier helpers.

## Logging / debugging notes
- Log mapping table (question ↔ answer ↔ status ↔ confidence) one-line-per-row — fastest way to spot mis-maps during demos.
- Log grading batch sizes + parse-retry counts.

## Tracker table

| # | Step | Code | T1 | T2 | T3 | T4 | T5 | Done |
|---|------|------|----|----|----|----|----|------|
| 1 | mapAnswers (label pass + LLM + repair) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 2 | grade.ts (batched grading + autofill + totals) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 3 | Fixture suite (3 statuses + edge cases) | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 4 | Invariant repair unit tests | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| 5 | Grading tier/clamp unit tests | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

## Open questions / risks
- LLM may force-map garbage to some question (brief explicitly forbids) — mitigate via prompt ("return unmatched_answer rather than guessing") + confidence floor + repair layer.
- Batch-grading long feedback may hit token limits → cap batch size adaptively.
