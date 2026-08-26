# PRD: AI Assessment Extraction & Answer Mapping (VedaAI Exams Module)

## 0. How to use this document
This PRD is written for an autonomous coding agent (e.g. opencode, Claude Code) to implement end‑to‑end with minimal back‑and‑forth. It is organized so the agent can work top‑to‑bottom: read architecture → data model → pipeline → screens → build in phases → deploy. Each phase in Section 10 ends in a working, demoable state. Do not skip ahead to polish before a phase's functional core works.

---

## 1. Product Summary

Build a Next.js web app where a teacher uploads **one question paper** and **one student's handwritten answer sheet** (PDF or images). The system:

1. Extracts every question from the question paper, in printed order, with sub‑parts (`11(a)`, `11(b)`) as separate entries.
2. Extracts the student's answers from the (possibly messy, out‑of‑order, multi‑page) handwritten answer sheet.
3. Maps each answer to its question — including answers that span multiple pages, answers written out of order, questions left unanswered, and answer content that doesn't match any known question.
4. Lets the teacher click a question and see the **exact region** of the answer sheet highlighted (bounding box overlay on the page image, not just "go to page X").
5. Optionally grades each answer (score, correct/incorrect, AI feedback) and shows a grading summary.

Core flow (matches the assignment brief exactly):
```
Upload → Question Extraction → Answer Extraction → Answer Mapping → Grading/Feedback → Review UI
```

This app is called **"AI Teacher's Toolkit"** inside a broader "VedaAI" shell (sidebar has Home / My Classroom / Assignments / Exams / My Library — only **Exams** needs to be functional; other nav items can be static/disabled).

---

## 2. Reference Screens (from provided screenshots — treat as source of truth over verbal description)

### Screen 1 — Upload (empty state)
- Left sidebar: VedaAI logo, "AI Teacher's Toolkit" pill (active/highlighted), nav list (Home, My Classroom, Assignments, Exams[active], My Library), Settings, school card footer (school name + location).
- Top bar: back arrow, breadcrumb "Exams", right side: help (?), notification bell (with red dot), sparkle/AI icon, user avatar + name + chevron.
- Page heading: **"Upload"** + highlighted pill text **"Question Paper & Answer Sheets"** (orange background, rounded).
- Subheading: "Upload both files to get started".
- Center: circular mascot/avatar illustration with orange ring + small orange dot accents (decorative — can be a simple illustrated SVG/avatar, not core functionality; a static asset is fine).
- Two side‑by‑side dashed upload cards:
  - **Upload Question Paper** — "Max 10MB", upload icon.
  - **Upload Answer Sheet** — "Max 10MB", upload icon.
- Below cards: **"Start Mapping →"** button (disabled/grey until both files are uploaded), helper text: "Once both files are uploaded, you'll be able to map answers with questions."

### Screen 2 — Upload (filled state)
- Same layout; each upload card now shows a small red PDF icon, filename, file size + page count (e.g. "2MB • 2 Pages"), and an "×" remove button in the corner.
- "Start Mapping →" button is now enabled (dark/active).

### Screen 3 — Extracting (processing state)
- Left sidebar collapses to icon‑only rail (logo, sparkle/AI icon highlighted, grid, image, doc, clipboard, clock icons, school icon, collapse chevron at bottom).
- Main content is centered, mostly blank, with an animated sparkle icon, **"Extracting..."** heading, and **"This may take a while"** subtext.
- This is a full‑screen loading/progress state while both extraction jobs run.

### Screen 4 — Question–Answer Mapping screen (the core screen)
- Same collapsed icon sidebar as Screen 3.
- Two‑pane layout below the top bar:
  - **Left pane — "Extracted Questions (from question paper)"** header + "Expand All" control.
    - A vertical list of question cards, each showing:
      - Numbered circle (question index, 1, 2, 3…)
      - Question text (can wrap multiple lines)
      - A **score/fraction badge** on the right, e.g. `2/3`, `0/2`, `6/6` — colored (green for full/near‑full marks, orange/amber for low or partial, presumably red for zero — infer a 3‑tier or gradient color scale from score ratio).
      - A chevron/expand affordance for some rows.
    - One card is shown **selected/expanded** (orange left border + light orange background) with an **"AI Feedback"** sub‑block underneath showing feedback text, e.g. "Excellent work! You correctly identified the chloroplast as the organelle responsible for..." with a "Read it up" link.
  - **Right pane — "Answer Sheet"** header with zoom controls (`− 100% +`) and page navigator (`Page 1 of 4` with prev/next arrows).
    - Renders the answer sheet as a scrollable image/PDF page view (scanned notebook page look).
    - The answer region corresponding to the **currently selected question** is **highlighted with a colored bounding box** drawn directly over the handwriting (green box around one answer block, blue box around another in the screenshot — implies each mapped Q&A pair gets a highlight color, and the active one may be emphasized, e.g. green = selected/correct, blue = another mapped region visible in view).
    - A small green tag/label near the box shows which question it corresponds to (e.g. "Q2:" label above the highlighted block).

**Design takeaway for the agent:** the right pane must support rendering a raster image of a PDF page with an absolutely‑positioned overlay box (in %, or px scaled to the rendered image size) derived from bounding box coordinates returned by the extraction pipeline — this is the single hardest engineering requirement in this assignment and should be treated as the critical path.

---

## 3. Functional Requirements (verbatim from brief, expanded)

| # | Requirement | Implementation implication |
|---|---|---|
| 1 | Upload both files, show processing progress | File upload UI (Screen 1/2) → background job → progress UI (Screen 3) |
| 2 | Extract every question in correct printed order | Ordered array output from LLM, preserve source order, don't let LLM resort |
| 3 | Treat labelled sub‑parts as separate entries (`11(a)`, `11(b)`) | Question extraction prompt must explicitly instruct splitting sub‑parts, each gets its own id/number string |
| 4 | Preserve original question numbering | Store `displayNumber` as a string (`"11(a)"`), not just an integer index |
| 5 | Handle answers out of order | Mapping step must match by content/semantics, not by page position or sequence |
| 6 | Handle unanswered questions | Mapping output allows `answerRegion: null`; UI shows "Not answered" state |
| 7 | Handle answers that don't match any question | Track "orphan" answer blocks separately; surface them in UI (e.g. an "Unmatched Answers" section) |
| 8 | Highlight exact answer region on the sheet | Bounding‑box based highlight overlay per §6 |
| 9 | Allow answers spanning multiple pages | An answer's region is an **array** of `{page, bbox}` segments, not a single box |

---

## 4. Tech Stack (constraints from brief)

- **Framework:** Next.js (App Router, TypeScript). Deployed to **Vercel** (free tier) for the live URL requirement.
- **AI provider:** **Groq API only** — no Anthropic/OpenAI keys. Use `GROQ_API_KEY` env var.
  - Groq's OpenAI‑compatible SDK/endpoint: `https://api.groq.com/openai/v1/chat/completions`.
  - Use a **vision‑capable Groq model** for reading images (question paper pages + handwritten answer pages), e.g. a Llama‑4 Scout/Maverick multimodal model available on Groq at build time — **the agent must query Groq's `/models` endpoint or current docs at implementation time to pick the current best available vision model**, since Groq's model lineup changes. Fall back gracefully to a text‑only model + separate OCR if no vision model is available.
  - Use a fast text model (e.g. Llama 3.x 70B/8B class on Groq) for the semantic mapping/grading reasoning step once OCR text + coordinates are already extracted.
- **PDF → image rendering:** `pdfjs-dist` (client‑side canvas render) or `pdf-to-img` / `pdf-lib` + `sharp` (server‑side) to rasterize each PDF page to PNG at a known DPI. This is required both to (a) feed page images to the vision model and (b) render the answer‑sheet viewer with overlays.
- **Storage:** In‑memory only (per brief — "no database required"). Use a simple server‑side module‑level `Map` (Node process memory) keyed by a generated `sessionId`, holding uploaded file buffers/paths (in `/tmp` or Vercel's writable `/tmp`), extraction results, and mapping results. **Caveat to flag to the user:** serverless functions on Vercel don't share memory/instances reliably — for a robust "live URL" demo, prefer storing session state as a **single JSON blob written to `/tmp` and also returned to the client**, with the client re‑sending the full session state (or a session id) on each request; or run on a platform with a persistent Node server (e.g. Vercel with a single long‑lived route + `globalThis` cache, acceptable for a demo/eval since traffic is low and no DB is required). Document this tradeoff in code comments.
- **Styling:** Tailwind CSS, matching the visual language in the screenshots (rounded‑2xl cards, soft shadows, orange accent `#F97316`‑ish, dark navy/near‑black sidebar text, pill badges).
- **State management:** React state + Context for the mapping screen (selected question, zoom, page); no external state lib needed.

---

## 5. Data Model

```ts
// types.ts

export interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;       // application/pdf | image/png | image/jpeg
  sizeBytes: number;
  pageCount: number;
  pageImages: string[];   // URLs/paths to rasterized page images, index 0 = page 1
}

export interface BoundingBox {
  page: number;            // 1-indexed page number within the answer sheet
  x: number; y: number;    // top-left, normalized 0-1 relative to page image width/height
  width: number; height: number; // normalized 0-1
}

export interface ExtractedQuestion {
  id: string;               // stable uuid
  displayNumber: string;    // "1", "11(a)", "11(b)"
  orderIndex: number;       // printed order, 0-based
  text: string;             // full question text (may include multi-line, OCR'd from paper)
  maxMarks?: number;        // if inferable from paper (e.g. "[5]" or "(5 marks)"), else undefined
  sourcePage: number;       // page in question paper this came from
}

export interface ExtractedAnswerBlock {
  id: string;
  rawText: string;              // OCR/transcribed handwritten text
  regions: BoundingBox[];       // one or more segments; multiple = spans pages/blocks
  detectedLabel?: string;       // if student wrote "Q2" / "Ans 2" near it, capture it as a hint
}

export type MappingStatus = "matched" | "unanswered" | "unmatched_answer";

export interface QuestionAnswerMapping {
  questionId: string | null;      // null only for orphan "unmatched_answer" entries
  answerBlockId: string | null;   // null for "unanswered"
  status: MappingStatus;
  confidence: number;             // 0-1, LLM-reported or heuristic
}

export interface GradingResult {
  questionId: string;
  score: number;
  maxScore: number;
  isCorrect: boolean | "partial";
  feedback: string;               // short AI feedback shown in UI
}

export interface SessionState {
  sessionId: string;
  questionPaper: UploadedFile;
  answerSheet: UploadedFile;
  questions: ExtractedQuestion[];
  answers: ExtractedAnswerBlock[];
  mappings: QuestionAnswerMapping[];
  grading: GradingResult[];
  status: "uploaded" | "extracting" | "mapping" | "grading" | "ready" | "error";
  error?: string;
}
```

---

## 6. Pipeline Design (the hard part)

### 6.1 Ingestion
1. User uploads question paper + answer sheet (PDF or images) via `POST /api/upload`.
2. Server rasterizes every page of both files to PNG (e.g. 150–200 DPI) and stores them under `/tmp/{sessionId}/qp/page-N.png` and `/tmp/{sessionId}/as/page-N.png`, also served statically via an API route (`GET /api/file/[sessionId]/[type]/[page]`).
3. Create a `SessionState` with `status: "uploaded"`, return `sessionId` to client.

### 6.2 Question Extraction (`status: "extracting"`, step A)
- For each question‑paper page image, call the Groq vision model with a prompt instructing it to:
  - Transcribe all questions verbatim, in reading order.
  - Split any multi‑part question into separate entries with numbering like `11(a)`, `11(b)`.
  - Preserve the original printed numbering exactly (don't renumber).
  - Extract marks if shown (e.g. `[5 marks]`) into `maxMarks`.
  - Return **strict JSON** matching `ExtractedQuestion[]` (minus `id`, which the server assigns).
- Concatenate results across pages, then run one more LLM pass over the *combined* list to detect and merge any question that got split across a page boundary, and to assign a single monotonic `orderIndex`.
- Store into `SessionState.questions`.

### 6.3 Answer Extraction + Localization (step B) — **critical**
- For each answer‑sheet page image, call the Groq vision model with a prompt that asks it to:
  - Identify distinct "answer blocks" (a block = one continuous chunk of handwriting the student intended as one answer, which may include diagrams).
  - Transcribe the handwritten text/description of diagrams as best as possible.
  - If the student labeled it (e.g. wrote "Q2", "Ans. 3", "3." in the margin), capture that as `detectedLabel`.
  - **Return a bounding box in normalized 0–1 coordinates** for each block (`x, y, width, height`) relative to that page image. Prompt the model explicitly to reason in a grid (e.g. "imagine the page divided into a 0–1000 x 0–1000 grid, top-left origin") since raw pixel coordinates from a vision LLM are unreliable — normalize after.
  - If a vision model that reliably returns coordinates is unavailable on Groq, implement a **fallback layout pass**: run a lightweight local heuristic (e.g. OCR via `tesseract.js` server-side to get word-level bounding boxes + line clustering) to build blocks and boxes, then send the *extracted text only* (no coordinates needed from the LLM) to Groq purely for transcription cleanup/labeling. This fallback must be built regardless, both as a safety net and because it materially improves bounding‑box accuracy over asking an LLM to "guess" pixel coordinates.
- If a block's content continues visually onto the next page (e.g. student writes "continued on next page" or the same question label reappears on the next page with no new number), merge them into one `ExtractedAnswerBlock` with multiple `regions` entries — this satisfies the "answers spanning multiple pages" requirement.
- Store into `SessionState.answers`.

### 6.4 Answer Mapping (step C)
- Send the LLM (text model is fine here) the full list of `questions` (number + text) and `answers` (id + rawText + detectedLabel) and ask it to produce a JSON mapping array (`QuestionAnswerMapping[]`) using semantic matching, **not** relying on order:
  - Prefer `detectedLabel` match when present and it maps to a real question number.
  - Otherwise use topical/content similarity between the answer text and question text.
  - Any question with no matching answer → `status: "unanswered"`, `answerBlockId: null`.
  - Any answer block that doesn't correspond to any known question (garbage, doodles, a rough‑work section, or a labeled number that doesn't exist in the paper) → `status: "unmatched_answer"`, `questionId: null`.
  - Include a `confidence` (0–1) per mapping so the UI can flag low‑confidence matches for teacher review (e.g. render with a dashed border or a "verify" icon below some confidence threshold, e.g. 0.6).
- Store into `SessionState.mappings`.

### 6.5 Grading (step D, in scope per "Important (Scope)")
- For each `matched` mapping, call the LLM once (batchable) with the question text, `maxMarks` (default to something reasonable like 5 if not extracted), and the answer's transcribed text, and ask for `{score, maxScore, isCorrect, feedback}` in strict JSON. Feedback should be 1–3 sentences, encouraging but honest, matching the tone in Screen 4's example ("Excellent work! You correctly identified...").
- `unanswered` questions automatically get `score: 0`, `isCorrect: false`, `feedback: "Not attempted."`
- Store into `SessionState.grading`; compute an overall summary (total score / total max) for a summary bar/header if time allows.
- `status: "ready"`.

### 6.6 Error handling across the pipeline
- Any Groq call failure → retry once with backoff; if still failing, mark `SessionState.status = "error"` with a human‑readable `error`, and let the UI show a retry button rather than a silent hang on the "Extracting…" screen.
- Cap total pipeline time; if a single page's vision call is slow, run page calls **in parallel** (`Promise.all`, respecting Groq rate limits with a small concurrency limiter, e.g. 3 at a time) rather than sequentially, since "This may take a while" should still resolve in a reasonable demo time.

---

## 7. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/upload` | POST (multipart) | Accepts question paper + answer sheet, rasterizes pages, creates session, returns `sessionId` + basic file metadata (name, size, pageCount) for Screen 2 |
| `/api/session/[id]/start` | POST | Kicks off the async pipeline (6.2 → 6.5), returns immediately; client polls status |
| `/api/session/[id]/status` | GET | Returns `SessionState.status` (+ error if any) — powers Screen 3 polling |
| `/api/session/[id]` | GET | Returns full `SessionState` (questions, answers, mappings, grading) once `status === "ready"` — powers Screen 4 |
| `/api/file/[id]/[type]/[page]` | GET | Serves a rasterized page image (`type` = `qp` \| `as`) |

Use simple polling (every 1–2s) from Screen 3 rather than websockets — sufficient for this scope and simplest to implement reliably on Vercel serverless.

---

## 8. UI Implementation Notes

- **Screen 1/2 (`/exams/upload`, or a single page with local state):**
  - Two `<UploadCard>` components (drag‑and‑drop + click‑to‑browse), accept `.pdf,.png,.jpg,.jpeg`, enforce 10MB client‑side with a friendly error toast.
  - On both files present, enable "Start Mapping" → `POST /api/upload` → navigate to `/exams/[sessionId]/processing`.
- **Screen 3 (`/exams/[sessionId]/processing`):**
  - On mount, call `/start`, then poll `/status` until `ready` or `error`; on `ready`, route to `/exams/[sessionId]/review`.
  - Sidebar switches to the collapsed icon rail variant (reuse one `<Sidebar collapsed={boolean} />` component for both variants across screens 1–2 vs 3–4).
- **Screen 4 (`/exams/[sessionId]/review`):**
  - `<QuestionList>` left pane: renders `questions` joined with `mappings`/`grading` for the score badge; clicking a row sets `selectedQuestionId` in shared state/context, expands it, and shows its `feedback` block if graded.
  - Score badge color scale: e.g. `>=80%` green, `40–79%` amber, `<40%` red, unanswered = grey "Not answered" badge.
  - `<AnswerSheetViewer>` right pane:
    - Renders the current page image (`<img>` or `<canvas>`) at natural size × zoom%.
    - Overlays absolutely‑positioned `<div>` boxes for the `regions` belonging to the currently selected question's mapped answer block (convert normalized bbox → pixel offsets based on rendered image dimensions, recompute on resize/zoom).
    - If the selected question is `unanswered`, show an inline "Not answered" message in the pane instead of a highlight, and don't force a page jump.
    - If a region is on a different page than currently shown, auto‑navigate the page selector to it when the question is selected.
    - Zoom controls simply scale the rendered image + recompute overlay pixel positions (recommended: keep bbox in normalized coords always, only the render/scale step is zoom‑dependent, so overlays never drift).
  - Add an **"Unmatched Answers"** affordance (e.g. small section or badge count near the header) surfacing `mappings` with `status: "unmatched_answer"`, since the brief explicitly requires handling this case and it doesn't otherwise appear in the reference screenshots — a reasonable place is a collapsible panel below the question list or a small tab.

---

## 9. Non‑Goals / Explicitly Out of Scope

- Authentication, multi‑user accounts, persistence across server restarts, database setup.
- Editing/re‑grading questions manually (nice‑to‑have, not required).
- Supporting more than one student answer sheet per session (brief says "one student handwritten answer sheet").
- Perfect handwriting OCR — grade the pipeline on reasonable accuracy for typical legible student handwriting, not adversarial cases.
- Other sidebar sections (Home, My Classroom, Assignments, My Library) — static/non-functional placeholders are acceptable.

---

## 10. Step‑by‑Step Build Plan (phased, for the coding agent)

**Phase 0 — Project setup**
- `npx create-next-app@latest` (TypeScript, App Router, Tailwind).
- Install: `pdfjs-dist` or `pdf-to-img`, `sharp`, `tesseract.js` (fallback OCR), `uuid`, `groq-sdk` (or plain `fetch` to Groq's OpenAI-compatible endpoint).
- Set up `.env.local` with `GROQ_API_KEY`, add `.env.example`.
- Scaffold `types.ts` from Section 5.

**Phase 1 — Upload flow (Screens 1 & 2), static only**
- Build `<Sidebar>`, `<TopBar>`, `<UploadCard>` matching the screenshots (colors, spacing, pill badge).
- Local state only, no backend yet: selecting files shows filled state + enables button.
- Get pixel‑level layout right before wiring logic — this de‑risks the visual evaluation criterion early.

**Phase 2 — Upload API + rasterization**
- `POST /api/upload`: parse multipart form, save files to `/tmp/{sessionId}/`, rasterize every page to PNG via `sharp`/`pdfjs-dist` at server side, store `SessionState` in an in‑memory `Map`.
- `GET /api/file/[id]/[type]/[page]`: stream back a page PNG.
- Wire Screen 1/2 button to actually call this and navigate with the returned `sessionId`.

**Phase 3 — Question extraction**
- Implement Groq client wrapper with strict‑JSON prompting + JSON‑parse‑with‑retry (strip code fences, re‑ask on parse failure).
- Implement 6.2 end‑to‑end; log/verify against a sample question paper that sub‑parts split correctly and order is preserved.

**Phase 4 — Answer extraction + bounding boxes**
- Implement 6.3, including the OCR fallback path. This is the riskiest phase — timebox an early spike to confirm whether the chosen Groq vision model returns usable coordinates; if not, commit to the OCR‑based bbox approach immediately rather than fighting the LLM for pixel accuracy.
- Build a tiny debug route/page that renders a page image with all extracted `regions` boxes drawn (any color) so bbox accuracy can be visually sanity‑checked before building the real UI.

**Phase 5 — Mapping + grading**
- Implement 6.4 and 6.5. Unit‑test the JSON contract with a couple of hand‑written fixture inputs (a question list + answer list with an intentionally out‑of‑order, an intentionally unanswered, and an intentionally orphan answer) to confirm the three `MappingStatus` cases are all reachable and correctly classified.

**Phase 6 — Processing screen + polling**
- Build Screen 3 exactly, wire `/start` + `/status` polling, route to review on completion, show error state on failure.

**Phase 7 — Review screen (Screen 4)**
- Build `<QuestionList>` and `<AnswerSheetViewer>` per Section 8, wire to `GET /api/session/[id]`.
- Get click‑to‑highlight working first with a single static region per question, then layer in: multi‑page regions, zoom scaling, unanswered state, unmatched‑answers panel, low‑confidence indicator.

**Phase 8 — Polish pass**
- Match spacing/colors/icons closely to screenshots; add empty/loading/error states everywhere; responsive check (design is desktop‑oriented, but avoid outright breakage on smaller widths).

**Phase 9 — Deploy**
- Push to GitHub, deploy to Vercel, set `GROQ_API_KEY` in project env vars, verify the live URL end‑to‑end with a real sample question paper + handwritten answer sheet (photograph a real notebook page if no scan is available — this is the most realistic eval condition).
- Note in README: any known limitation of serverless in‑memory state (e.g. cold starts clearing sessions) and how to reproduce a demo session reliably (don't let a session sit idle too long before showing it to an evaluator).

---

## 11. Suggested Repo Structure

```
/app
  /exams
    /upload/page.tsx
    /[sessionId]/processing/page.tsx
    /[sessionId]/review/page.tsx
  /api
    upload/route.ts
    session/[id]/start/route.ts
    session/[id]/status/route.ts
    session/[id]/route.ts
    file/[id]/[type]/[page]/route.ts
/components
  Sidebar.tsx
  TopBar.tsx
  UploadCard.tsx
  QuestionList.tsx
  QuestionRow.tsx
  AnswerSheetViewer.tsx
  ScoreBadge.tsx
/lib
  groq.ts            // Groq client + strict-JSON helper
  raster.ts           // PDF/image -> page PNG conversion
  ocrFallback.ts       // tesseract.js bbox extraction
  session.ts           // in-memory session store
  pipeline
    extractQuestions.ts
    extractAnswers.ts
    mapAnswers.ts
    grade.ts
/types.ts
```

---

## 12. Evaluation Checklist (self‑check before calling it done)

- [ ] Sub‑parts like `11(a)`/`11(b)` appear as distinct entries with original numbering intact.
- [ ] Question order in UI matches printed order exactly.
- [ ] At least one deliberately out‑of‑order handwritten answer maps to the correct question.
- [ ] At least one deliberately skipped question shows as "unanswered" in the UI.
- [ ] At least one deliberately irrelevant/garbage handwriting block shows up as an unmatched answer, not force‑mapped to a question.
- [ ] Clicking a question draws a highlight box tightly around the correct handwriting, on the correct page, and switches pages automatically if needed.
- [ ] An answer that runs onto a second page highlights regions on both pages.
- [ ] Grading shows a score badge + AI feedback per question, matching the visual style of Screen 4.
- [ ] Upload → Processing → Review flow visually matches the four reference screenshots (sidebar states, top bar, colors, badges, zoom/page controls).
- [ ] App is deployed and the live URL works from a fresh browser session with no local setup.
