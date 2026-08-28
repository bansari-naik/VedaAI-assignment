import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { chatJSON, pickVisionModel, pickTextModel } from "@/lib/groq";
import { QP_SYSTEM_PROMPT, buildQpUserPrompt, QP_MERGE_SYSTEM_PROMPT, buildQpMergeUserPrompt } from "./prompts/questionExtraction";
import type { ExtractedQuestion } from "@/types";

export interface PageInput {
  buffer: Buffer;
  pageNumber: number; // 1-indexed
}

type Draft = {
  displayNumber: string;
  text: string;
  maxMarks?: number | null | string;
  sourcePage: number;
};

// Simple concurrency limiter ≤3
async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const cur = nextIdx++;
      if (cur >= items.length) break;
      results[cur] = await fn(items[cur], cur);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function coerceMaxMarks(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    // handle "[5]", "(5 marks)", "5M", "Marks: 5", "5.0"
    const m = v.match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n)) return Math.round(n);
    }
  }
  return undefined;
}

function sanitizeDrafts(drafts: Draft[]): Draft[] {
  // drop empty-text entries; validate displayNumber non-empty; coerce maxMarks
  const out: Draft[] = [];
  for (const d of drafts) {
    const text = typeof d.text === "string" ? d.text.trim() : "";
    const dn = typeof d.displayNumber === "string" ? d.displayNumber.trim() : "";
    if (!text || !dn) {
      if (!text) console.warn(`[extractQuestions] dropping empty text entry dn=${dn}`);
      if (!dn) console.warn(`[extractQuestions] dropping empty displayNumber text=${text.slice(0,30)}`);
      continue;
    }
    const mm = coerceMaxMarks(d.maxMarks);
    // Normalize displayNumber: trim and remove trailing . or ) if orphan?
    // Keep as-is but ensure no surrounding whitespace
    out.push({
      displayNumber: dn,
      text,
      maxMarks: mm ?? null,
      sourcePage: Number.isFinite(d.sourcePage) ? d.sourcePage : 1,
    });
  }
  return out;
}

async function persistDebug(sessionId: string | undefined, pageNum: number, raw: string, parsed: unknown) {
  if (!sessionId) return;
  const dir = path.join(os.tmpdir(), "vedaai", sessionId, "debug");
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  const payload = { raw, parsed, ts: new Date().toISOString() };
  await fs.writeFile(path.join(dir, `qp-page-${pageNum}.json`), JSON.stringify(payload, null, 2)).catch((e) => console.warn(`[extractQuestions] debug write failed ${e}`));
}

/**
 * Extract questions from rasterized QP pages.
 * PRD §6.2: per-page vision calls (concurrency 3) → concat → merge pass → sanitize → assign ids/orderIndex.
 */
async function ocrFallbackDrafts(pg: PageInput, total: number, sessionId: string | undefined): Promise<{ drafts: Draft[]; raw: string }> {
  try {
    let ocrText = "";
    // Try fast PDF text extraction via mupdf from original file (printed PDFs) before heavy OCR
    if (sessionId) {
      try {
        const origDir = path.join(os.tmpdir(), "vedaai", sessionId, "orig");
        const files = await fs.readdir(origDir).catch(() => [] as string[]);
        const qpFile = files.find((f) => f.startsWith("qp"));
        if (qpFile && qpFile.toLowerCase().endsWith(".pdf")) {
          const pdfBuf = await fs.readFile(path.join(origDir, qpFile)).catch(() => null);
          if (pdfBuf) {
            const mupdf = (await import("mupdf")).default;
            const doc = mupdf.Document.openDocument(pdfBuf, "application/pdf");
            if (pg.pageNumber <= doc.countPages()) {
              const page = doc.loadPage(pg.pageNumber - 1);
              const txt = (page.toStructuredText("preserve-whitespace") as unknown as { asText: () => string }).asText?.() ?? "";
              if (txt && txt.trim().length > 20) {
                ocrText = txt.trim();
                console.log(`[extractQuestions] mupdf text extraction page ${pg.pageNumber} len=${ocrText.length} (fast path)`);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[extractQuestions] mupdf fallback failed page ${pg.pageNumber}: ${(e as Error).message}`);
      }
    }
    if (!ocrText) {
      const { getOcrText } = await import("@/lib/ocrFallback");
      ocrText = await getOcrText(pg.buffer);
    }
    console.log(`[extractQuestions] OCR fallback page ${pg.pageNumber} ocrTextLen=${ocrText.length} head=${ocrText.slice(0,120).replace(/\n/g," ")}`);
    if (!ocrText || ocrText.length < 10) {
      console.warn(`[extractQuestions] OCR fallback page ${pg.pageNumber} produced empty/short text, returning []`);
      await persistDebug(sessionId, pg.pageNumber, `OCR_EMPTY: ${ocrText}`, []);
      return { drafts: [], raw: `OCR_EMPTY` };
    }
    const textModel = await pickTextModel().catch(() => "openai/gpt-oss-120b");
    const ocrMessages = [
      { role: "system" as const, content: QP_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `This is page ${pg.pageNumber} of ${total} of the question paper — OCR transcription (may have minor errors). Parse questions from this TEXT only (no image). OCR Text:\n"""${ocrText.slice(0,4000)}"""\n\nReturn JSON array as specified. Set sourcePage to ${pg.pageNumber} for every entry. Output ONLY the JSON array.`,
      },
    ];
    const { data, raw } = await chatJSON<Draft[] | { questions: Draft[] }>(ocrMessages, {
      model: textModel,
      temperature: 0.1,
    });
    let drafts: Draft[] = [];
    if (Array.isArray(data)) drafts = data as Draft[];
    else if (data && typeof data === "object" && "questions" in (data as Record<string, unknown>)) drafts = (data as { questions: Draft[] }).questions ?? [];
    console.log(`[extractQuestions] OCR fallback page ${pg.pageNumber} got ${drafts.length} drafts via text model ${textModel}`);
    await persistDebug(sessionId, pg.pageNumber, `OCR_FALLBACK rawText=${ocrText.slice(0,300)} || LLM raw=${raw.slice(0,500)}`, drafts);
    return { drafts, raw: `OCR_FALLBACK:${raw}` };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    // Auth errors (401/403) should propagate to pipeline error, not silent empty, so tests and UI show proper error
    if (msg.includes("401") || msg.includes("Invalid API key") || msg.includes("invalid_request_error") && msg.includes("401")) {
      console.warn(`[extractQuestions] OCR fallback auth failure page ${pg.pageNumber}, propagating to pipeline error`);
      await persistDebug(sessionId, pg.pageNumber, `OCR_FALLBACK_AUTH_ERROR: ${msg}`, []);
      throw new Error(`Question extraction failed: ${msg}`);
    }
    console.warn(`[extractQuestions] OCR fallback failed page ${pg.pageNumber}: ${msg}`);
    await persistDebug(sessionId, pg.pageNumber, `OCR_FALLBACK_ERROR: ${msg}`, []);
    return { drafts: [], raw: `OCR_FALLBACK_ERROR` };
  }
}

export async function extractQuestions(pages: PageInput[], sessionId?: string): Promise<ExtractedQuestion[]> {
  if (pages.length === 0) return [];

  const visionModel = await pickVisionModel().catch(() => {
    console.warn("[extractQuestions] pickVisionModel failed, using default");
    return "qwen/qwen3.8-27b";
  });
  const total = pages.length;
  console.log(`[extractQuestions] start visionModel=${visionModel} pages=${total} session=${sessionId ?? "-"}`);

  type PerPageResult = { drafts: Draft[]; raw: string };
  const perPage = await runWithConcurrency(pages, 3, async (pg) => {
    const b64 = pg.buffer.toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;
    const messages = [
      { role: "system" as const, content: QP_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: buildQpUserPrompt(pg.pageNumber, total) },
          { type: "image_url" as const, image_url: { url: dataUrl } },
        ],
      },
    ];

    try {
      const { data, raw, latencyMs } = await chatJSON<Draft[] | { questions: Draft[] }>(messages, {
        model: visionModel,
        temperature: 0.1,
      });
      let drafts: Draft[] = [];
      if (Array.isArray(data)) drafts = data as Draft[];
      else if (data && typeof data === "object" && "questions" in (data as Record<string, unknown>) && Array.isArray((data as { questions: Draft[] }).questions)) {
        drafts = (data as { questions: Draft[] }).questions;
      } else {
        console.warn(`[extractQuestions] page ${pg.pageNumber} unexpected JSON shape`, JSON.stringify(data).slice(0,300));
        drafts = [];
      }
      console.log(`[extractQuestions] page ${pg.pageNumber} got ${drafts.length} drafts latency=${latencyMs}ms`);
      await persistDebug(sessionId, pg.pageNumber, raw, drafts);
      return { drafts, raw } as PerPageResult;
    } catch (visionErr) {
      const msg = (visionErr as Error).message ?? String(visionErr);
      const isVisionModelError = msg.includes("model_not_found") || msg.includes("model_permission_blocked") || msg.includes("404") || msg.includes("403") || msg.includes("does not exist") || msg.includes("blocked");
      console.warn(`[extractQuestions] page ${pg.pageNumber} vision failed (${msg.slice(0,200)}) — trying OCR fallback isVisionError=${isVisionModelError}`);
      // Always fallback via OCR for printed QPs — handwriting fallback not needed for questions
      return await ocrFallbackDrafts(pg, total, sessionId);
    }
  });

  const concatenated = perPage.flatMap((r) => r.drafts);
  console.log(`[extractQuestions] concatenated ${concatenated.length} drafts before merge`);

  if (concatenated.length === 0) {
    console.warn("[extractQuestions] no drafts from any page, returning []");
    return [];
  }

  // Merge pass with text model
  const textModel = await pickTextModel().catch(() => "llama-3.3-70b-versatile");
  console.log(`[extractQuestions] merge pass textModel=${textModel} input=${concatenated.length}`);
  const mergeMessages = [
    { role: "system" as const, content: QP_MERGE_SYSTEM_PROMPT },
    { role: "user" as const, content: buildQpMergeUserPrompt(concatenated) },
  ];

  let merged: Draft[] = concatenated;
  try {
    const { data: mergeData, raw: mergeRaw } = await chatJSON<Draft[] | { questions: Draft[] }>(mergeMessages, {
      model: textModel,
      temperature: 0.1,
    });
    let mDrafts: Draft[] = [];
    if (Array.isArray(mergeData)) mDrafts = mergeData as Draft[];
    else if (mergeData && typeof mergeData === "object" && "questions" in (mergeData as Record<string, unknown>)) mDrafts = (mergeData as { questions: Draft[] }).questions;
    else mDrafts = concatenated;

    if (mDrafts.length > 0) {
      merged = mDrafts;
      console.log(`[extractQuestions] merge produced ${merged.length} drafts`);
      await persistDebug(sessionId, 0, mergeRaw, merged); // 0 = merge debug
    } else {
      console.warn("[extractQuestions] merge returned 0, keeping concatenated");
    }
  } catch (e) {
    console.warn(`[extractQuestions] merge pass failed ${(e as Error).message}, keeping concatenated`);
  }

  // Deterministic sanitization
  const sanitized = sanitizeDrafts(merged);
  console.log(`[extractQuestions] sanitized ${sanitized.length} (from ${merged.length})`);

  // Assign stable ids + monotonic orderIndex (array position = printed order)
  const questions: ExtractedQuestion[] = sanitized.map((d, idx) => ({
    id: uuidv4(),
    displayNumber: d.displayNumber,
    orderIndex: idx,
    text: d.text,
    maxMarks: d.maxMarks !== null && d.maxMarks !== undefined ? (typeof d.maxMarks === "number" ? d.maxMarks : coerceMaxMarks(d.maxMarks)) : undefined,
    sourcePage: d.sourcePage,
  }));

  // Final guard: drop any remaining empty after mapping (should be none)
  const final = questions.filter((q) => q.text.trim().length > 0 && q.displayNumber.trim().length > 0);
  console.log(`[extractQuestions] done final=${final.length} order preserved session=${sessionId ?? "-"}`);
  return final;
}
