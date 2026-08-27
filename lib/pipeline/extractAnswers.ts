import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { chatJSON, pickVisionModel } from "@/lib/groq";
import { AS_SYSTEM_PROMPT, buildAsUserPrompt } from "./prompts/answerExtraction";
import { getOcrBlocksForPage, isDegenerateBox, clampBox, detectLabel as ocrDetectLabel } from "@/lib/ocrFallback";
import type { ExtractedAnswerBlock, BoundingBox } from "@/types";

// ---------------------------------------------------------------------------
// Spike verdict documented in ocrFallback.ts — OCR owns geometry, LLM owns text
// ---------------------------------------------------------------------------

export interface PageInput {
  buffer: Buffer;
  pageNumber: number; // 1-indexed
  width?: number;
  height?: number;
}

type LlmDraft = {
  rawText: string;
  detectedLabel?: string | null;
  box: { x: number; y: number; w: number; h: number };
};

function normalizeGridBox(
  b: { x: number; y: number; w: number; h: number },
  page: number
): BoundingBox {
  // grid 0–1000 → 0–1
  const x = b.x / 1000;
  const y = b.y / 1000;
  const w = b.w / 1000;
  const h = b.h / 1000;
  return clampBox({ page, x, y, width: w, height: h });
}

function isGridDegenerate(b: { x: number; y: number; w: number; h: number }): boolean {
  if (b.w <= 10 || b.h <= 10) return true;
  if (b.w >= 990 || b.h >= 990) return true;
  return false;
}

function center(b: BoundingBox) {
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

function distance(a: BoundingBox, b: BoundingBox): number {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.cx - cb.cx, ca.cy - cb.cy);
}

function overlapRatio(a: BoundingBox, b: BoundingBox): number {
  const ax1 = a.x + a.width;
  const ay1 = a.y + a.height;
  const bx1 = b.x + b.width;
  const by1 = b.y + b.height;
  const ix0 = Math.max(a.x, b.x);
  const iy0 = Math.max(a.y, b.y);
  const ix1 = Math.min(ax1, bx1);
  const iy1 = Math.min(ay1, by1);
  if (ix1 <= ix0 || iy1 <= iy0) return 0;
  const inter = (ix1 - ix0) * (iy1 - iy0);
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const minArea = Math.min(aArea, bArea);
  return minArea > 0 ? inter / minArea : 0;
}

// Simple concurrency limiter ≤3
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const cur = next++;
      if (cur >= items.length) break;
      results[cur] = await fn(items[cur], cur);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function persistDebug(sessionId: string | undefined, page: number | string, payload: unknown) {
  if (!sessionId) return;
  const dir = path.join(os.tmpdir(), "vedaai", sessionId, "debug");
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(dir, `as-page-${page}.json`), JSON.stringify(payload, null, 2)).catch(() => {});
}

function normalizeLabel(l?: string | null): string | undefined {
  if (!l) return undefined;
  const t = l.trim();
  if (!t) return undefined;
  // normalize: remove trailing . or ) etc? Keep as is but lower for compare
  return t;
}

function shouldMerge(prev: ExtractedAnswerBlock, curr: { detectedLabel?: string; rawText: string; region: BoundingBox }): boolean {
  const prevLabel = normalizeLabel(prev.detectedLabel)?.toLowerCase();
  const currLabel = normalizeLabel(curr.detectedLabel)?.toLowerCase();
  const prevLastPage = prev.regions[prev.regions.length - 1]?.page ?? -1;
  const currPage = curr.region.page;

  // Only consider consecutive pages or same page continuation (but cross-page is page+1)
  const isNextPage = currPage === prevLastPage + 1;

  if (prevLabel && currLabel && prevLabel === currLabel && isNextPage) {
    return true;
  }
  // Explicit continuation text
  const prevText = prev.rawText.toLowerCase();
  const currText = curr.rawText.toLowerCase().trim();
  const contMarkers = ["continued", "contd", "p.t.o", "p t o", "next page", "overleaf"];
  const prevHasCont = contMarkers.some((m) => prevText.includes(m));
  const currStartsCont = contMarkers.some((m) => currText.startsWith(m));
  if ((prevHasCont || currStartsCont) && isNextPage) {
    // If curr has no new label or same label, treat as continuation
    if (!currLabel || currLabel === prevLabel) return true;
  }
  // Also: if curr has no label and prev has label and is next page and curr is near top of page (y <0.3) — heuristic
  if (!currLabel && prevLabel && isNextPage && curr.region.y < 0.25) {
    return true;
  }
  return false;
}

export async function extractAnswers(
  pages: PageInput[],
  sessionId?: string
): Promise<ExtractedAnswerBlock[]> {
  if (pages.length === 0) return [];

  // Ensure width/height known
  for (const p of pages) {
    if (!p.width || !p.height) {
      const meta = await sharp(p.buffer).metadata();
      p.width = meta.width ?? 1200;
      p.height = meta.height ?? 1600;
    }
  }

  const visionModel = await pickVisionModel().catch(() => "meta-llama/llama-4-maverick-17b-128e-instruct");
  console.log(`[extractAnswers] start visionModel=${visionModel} pages=${pages.length} session=${sessionId ?? "-"}`);

  type PerPageBlocks = Array<{ rawText: string; detectedLabel?: string; region: BoundingBox; source: "llm" | "ocr" | "llm+ocr" }>;

  const perPageBlocks = await runWithConcurrency(pages, 3, async (pg) => {
    const b64 = pg.buffer.toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;
    const messages = [
      { role: "system" as const, content: AS_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: buildAsUserPrompt(pg.pageNumber, pages.length) },
          { type: "image_url" as const, image_url: { url: dataUrl } },
        ],
      },
    ];

    let llmDrafts: LlmDraft[] = [];
    let llmRaw = "";
    try {
      const { data, raw } = await chatJSON<LlmDraft[] | { blocks: LlmDraft[] }>(messages, {
        model: visionModel,
        temperature: 0.2,
      });
      llmRaw = raw;
      if (Array.isArray(data)) llmDrafts = data as LlmDraft[];
      else if (data && typeof data === "object" && "blocks" in (data as Record<string, unknown>)) llmDrafts = (data as { blocks: LlmDraft[] }).blocks ?? [];
      console.log(`[extractAnswers] page ${pg.pageNumber} LLM drafts=${llmDrafts.length}`);
    } catch (e) {
      console.warn(`[extractAnswers] page ${pg.pageNumber} LLM failed ${(e as Error).message} — will rely on OCR`);
      llmRaw = `LLM_ERROR: ${(e as Error).message}`;
    }

    // OCR fallback in parallel (or after LLM, but we can run concurrently — already inside per-page, so just run)
    let ocrBlocks: Awaited<ReturnType<typeof getOcrBlocksForPage>> = [];
    try {
      ocrBlocks = await getOcrBlocksForPage(pg.buffer, pg.pageNumber);
      console.log(`[extractAnswers] page ${pg.pageNumber} OCR blocks=${ocrBlocks.length}`);
    } catch (e) {
      console.warn(`[extractAnswers] page ${pg.pageNumber} OCR failed ${(e as Error).message}`);
    }

    // Reconciliation per LLM draft
    const reconciled: PerPageBlocks = [];
    if (llmDrafts.length === 0 && ocrBlocks.length > 0) {
      // No LLM blocks — use OCR directly
      for (const ocr of ocrBlocks) {
        reconciled.push({
          rawText: ocr.rawText,
          detectedLabel: ocr.detectedLabel,
          region: ocr.bbox,
          source: "ocr",
        });
      }
      console.log(`[extractAnswers] page ${pg.pageNumber} using OCR only (${reconciled.length})`);
    } else {
      for (const draft of llmDrafts) {
        const rawText = typeof draft.rawText === "string" ? draft.rawText.trim() : "";
        if (!rawText) {
          console.warn(`[extractAnswers] page ${pg.pageNumber} dropping empty rawText draft`);
          continue;
        }
        const llmLabel = normalizeLabel(draft.detectedLabel);
        const ocrLabelFallback = ocrDetectLabel(rawText);
        const detectedLabel = llmLabel || ocrLabelFallback;

        let region: BoundingBox;
        let source: "llm" | "ocr" | "llm+ocr" = "llm";
        const gridDeg = isGridDegenerate(draft.box);
        const llmBox = normalizeGridBox(draft.box, pg.pageNumber);
        const degenerate = gridDeg || isDegenerateBox(llmBox);

        if (degenerate) {
          // find nearest OCR block by center distance
          let nearest: typeof ocrBlocks[0] | undefined;
          let bestDist = Infinity;
          for (const ocr of ocrBlocks) {
            const d = distance(llmBox, ocr.bbox);
            if (d < bestDist) {
              bestDist = d;
              nearest = ocr;
            }
          }
          if (nearest && bestDist < 0.5) {
            region = nearest.bbox;
            source = "ocr";
            console.log(`[extractAnswers] page ${pg.pageNumber} box degenerate w=${draft.box.w} h=${draft.box.h} → OCR fallback dist=${bestDist.toFixed(3)}`);
          } else {
            // if no near OCR, keep LLM but clamp (maybe still degenerate — fallback to full page inner rect)
            if (nearest) {
              region = nearest.bbox;
              source = "ocr";
            } else {
              // fallback: use LLM box clamped but log
              region = llmBox;
              console.warn(`[extractAnswers] page ${pg.pageNumber} degenerate box but no OCR near — keeping LLM`);
            }
          }
        } else {
          region = llmBox;
          // Optionally tighten with OCR if OCR box is significantly tighter and nearby
          // Find nearest OCR and if area ratio <0.7 and dist <0.2, prefer OCR geometry but keep LLM text
          let nearest: typeof ocrBlocks[0] | undefined;
          let bestDist = Infinity;
          for (const ocr of ocrBlocks) {
            const d = distance(llmBox, ocr.bbox);
            if (d < bestDist) {
              bestDist = d;
              nearest = ocr;
            }
          }
          if (nearest && bestDist < 0.1) {
            const llmArea = llmBox.width * llmBox.height;
            const ocrArea = nearest.bbox.width * nearest.bbox.height;
            if (ocrArea < llmArea * 0.85 && ocrArea > 0.005) {
              // OCR tighter
              region = nearest.bbox;
              source = "llm+ocr";
              console.log(`[extractAnswers] page ${pg.pageNumber} tightening LLM box with OCR tighter area ${llmArea.toFixed(4)}→${ocrArea.toFixed(4)} dist=${bestDist.toFixed(3)}`);
            }
          }
        }

        reconciled.push({ rawText, detectedLabel, region, source });
      }

      // Also consider orphan OCR blocks that have no matching LLM (e.g., doodle or extra answer LLM missed)
      // If OCR block doesn't significantly overlap any LLM region, keep it as additional block
      if (ocrBlocks.length > 0 && llmDrafts.length > 0) {
        for (const ocr of ocrBlocks) {
          const near = reconciled.some((r) => overlapRatio(r.region, ocr.bbox) > 0.3 || distance(r.region, ocr.bbox) < 0.15);
          if (!near) {
            // OCR-only extra block — likely doodle or missed answer; keep but mark
            // Heuristic: if ocr rawText length is very short (<10) or area tiny, skip as noise
            if (ocr.rawText.trim().length < 10 && ocr.bbox.width * ocr.bbox.height < 0.01) continue;
            reconciled.push({
              rawText: ocr.rawText,
              detectedLabel: ocr.detectedLabel,
              region: ocr.bbox,
              source: "ocr",
            });
            console.log(`[extractAnswers] page ${pg.pageNumber} adding OCR-only extra block label=${ocr.detectedLabel ?? "-"} dist far`);
          }
        }
      }
    }

    await persistDebug(sessionId, pg.pageNumber, { llmDrafts, llmRaw, ocrBlocks: ocrBlocks.map((o) => ({ rawText: o.rawText.slice(0,80), bbox: o.bbox, label: o.detectedLabel })), reconciled });

    // Sort reconciled by y then x for reading order
    reconciled.sort((a, b) => {
      if (Math.abs(a.region.y - b.region.y) > 0.02) return a.region.y - b.region.y;
      return a.region.x - b.region.x;
    });

    return reconciled;
  });

  // Flatten per-page into single list
  const flat = perPageBlocks.flat();
  console.log(`[extractAnswers] flat reconciled ${flat.length} blocks before cross-page merge`);

  // Convert to ExtractedAnswerBlock with single region each, then merge
  const initialBlocks: ExtractedAnswerBlock[] = flat.map((b) => ({
    id: uuidv4(),
    rawText: b.rawText,
    regions: [b.region],
    detectedLabel: b.detectedLabel,
  }));

  // Cross-page merge — search back for same label on previous page (handles out-of-order interleaving)
  const merged: ExtractedAnswerBlock[] = [];
  for (const curr of initialBlocks) {
    const currRegion = curr.regions[0];
    const currEntry = { detectedLabel: curr.detectedLabel, rawText: curr.rawText, region: currRegion };
    // find candidate to merge with: same label, last region page == currPage -1
    let mergedInto: ExtractedAnswerBlock | null = null;
    // First try to find same-label candidate on immediately previous page
    for (let i = merged.length - 1; i >= 0; i--) {
      const cand = merged[i];
      const candLabel = normalizeLabel(cand.detectedLabel)?.toLowerCase();
      const currLabel = normalizeLabel(curr.detectedLabel)?.toLowerCase();
      if (candLabel && currLabel && candLabel === currLabel) {
        const lastPage = cand.regions[cand.regions.length - 1].page;
        if (currRegion.page === lastPage + 1) {
          mergedInto = cand;
          break;
        }
      }
    }
    // If not found by label, try continuation heuristic against any recent block on previous page
    if (!mergedInto) {
      for (let i = merged.length - 1; i >= 0; i--) {
        const cand = merged[i];
        if (shouldMerge(cand, currEntry)) {
          mergedInto = cand;
          break;
        }
      }
    }

    if (mergedInto) {
      mergedInto.regions.push(currRegion);
      mergedInto.rawText = `${mergedInto.rawText}\n\n[continued p.${currRegion.page}]\n${curr.rawText}`;
      mergedInto.regions.sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        if (Math.abs(a.y - b.y) > 0.02) return a.y - b.y;
        return a.x - b.x;
      });
      console.log(`[extractAnswers] merged page ${currRegion.page} label=${curr.detectedLabel ?? "-"} into block ${mergedInto.detectedLabel ?? "-"} (now ${mergedInto.regions.length} regions)`);
    } else {
      merged.push(curr);
    }
  }

  console.log(`[extractAnswers] merged ${initialBlocks.length} → ${merged.length} blocks (multi-region: ${merged.filter((m) => m.regions.length>1).length})`);

  // Final sanitize: ensure all coords ∈[0,1], clamp, sort regions
  for (const b of merged) {
    b.regions = b.regions.map((r) => clampBox(r)).sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (Math.abs(a.y - b.y) > 0.02) return a.y - b.y;
      return a.x - b.x;
    });
  }

  // Dump final
  if (sessionId) {
    const dir = path.join(os.tmpdir(), "vedaai", sessionId, "debug");
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    await fs.writeFile(path.join(dir, `answers.json`), JSON.stringify(merged, null, 2)).catch(() => {});
  }

  return merged;
}
