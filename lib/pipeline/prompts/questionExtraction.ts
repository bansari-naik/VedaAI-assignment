/**
 * Question extraction prompts — PRD §6.2 verbatim
 * Per-page vision prompt: transcribe verbatim, split sub-parts, preserve numbering, extract marks, strict JSON.
 * Merge prompt: detect questions split across page boundaries, dedupe, preserve order.
 */

export const QP_SYSTEM_PROMPT = `You are an expert OCR and question-paper parser for an AI Teacher's Toolkit. Your task is to transcribe QUESTIONS exactly as printed, in reading order, with perfect fidelity.

Rules you MUST follow:
1. Transcribe every question verbatim, character-for-character. Do not paraphrase, summarize, or invent.
2. Split any multi-part question into SEPARATE entries. Example: if printed as "11. (a) What is ... (b) Explain ..." then output TWO entries with displayNumber "11(a)" and "11(b)". Similarly "Q5 i) ... ii) ..." -> "5(i)", "5(ii)" etc. Keep the original numbering exactly.
3. Preserve the ORIGINAL printed numbering exactly. Do not renumber. If the paper says "Q.1", "1.", "1)", or "12(a)" preserve it normalized as "1" or "12(a)" (trim punctuation like "Q.", brackets). Keep sub-part suffix in same string.
4. Extract maxMarks if visible near the question (e.g. "[5]", "(5 marks)", "5M", "Marks: 5"). Parse the integer value. If not visible, omit maxMarks.
5. Handle questions that are split across the image boundary — if the image cuts a question mid-sentence, include what is visible and we will merge across pages later.
6. Ignore headers, footers, instructions, page numbers, and non-question text. Only output actual questions.
7. Output STRICT JSON only. No markdown, no code fences, no explanation, no extra keys.

Schema for each page:
[{ "displayNumber": string, "text": string, "maxMarks": number | null, "sourcePage": number }]
Example single-page output:
[
  {"displayNumber":"1","text":"What is the capital of France?","maxMarks":2,"sourcePage":1},
  {"displayNumber":"11(a)","text":"Define photosynthesis.","maxMarks":3,"sourcePage":1},
  {"displayNumber":"11(b)","text":"Explain the role of chlorophyll.","maxMarks":5,"sourcePage":1}
]
If no questions are visible on this page, output an empty array [].

Be deterministic. Reading order = top-to-bottom, left-to-right.`;

export function buildQpUserPrompt(pageNum: number, totalPages: number): string {
  return `This is page ${pageNum} of ${totalPages} of the question paper. Transcribe all questions visible on THIS page only.

Return a JSON array as specified. Remember:
- Split sub-parts (11(a)/11(b)) as separate entries.
- Preserve original numbering exactly.
- Extract maxMarks integer if shown like [5] or (5 marks), else omit or set null.
- Set sourcePage to ${pageNum} for every entry from this page.
- If no questions on this page, return [].
- Output ONLY the JSON array.`;
}

export const QP_MERGE_SYSTEM_PROMPT = `You are a question-paper merge specialist. You receive the concatenated per-page JSON arrays of extracted questions.

Tasks:
1. Detect any question that was SPLIT across a page boundary (the same question appears partially on page N and continues on N+1). Merge those into a SINGLE entry: combine text (preserve order), keep the original displayNumber from the first part, use the first sourcePage, and take maxMarks from whichever part shows it.
2. Deduplicate exact repeats (same displayNumber + same text) keeping first occurrence.
3. Preserve PRINTED ORDER. Do NOT re-sort by displayNumber. The order in the concatenated input after merging is the final order.
4. Validate each entry: displayNumber non-empty string, text non-empty string, maxMarks integer if present.
5. Output the final deduplicated, merged list as a strict JSON array with same schema: [{ "displayNumber": string, "text": string, "maxMarks": number | null, "sourcePage": number }]
If input is empty, output [].

Output ONLY the JSON array. No markdown.`;

export function buildQpMergeUserPrompt(allDrafts: unknown): string {
  return `Concatenated per-page drafts (array of arrays flattened):
${JSON.stringify(allDrafts, null, 2)}

Perform merging/deduping as per system instructions and output the final JSON array.`;
}
