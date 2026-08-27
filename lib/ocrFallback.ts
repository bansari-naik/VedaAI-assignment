// Polyfill window.location for tesseract.js in Node (Next.js server) — prevents
// "Cannot destructure property 'protocol' of 'window.location' as it is undefined."
if (typeof globalThis !== "undefined") {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.window === "undefined") {
    g.window = { location: { protocol: "http:", host: "localhost", pathname: "/", href: "http://localhost/" } } as unknown as Window;
  } else {
    const w = g.window as Record<string, unknown>;
    if (typeof w.location === "undefined" || w.location === null) {
      w.location = { protocol: "http:", host: "localhost", pathname: "/", href: "http://localhost/" } as unknown as Location;
    } else if (typeof (w.location as Record<string, unknown>).protocol === "undefined") {
      (w.location as Record<string, unknown>).protocol = "http:";
    }
  }
  if (typeof g.document === "undefined") {
    g.document = { createElement: () => ({ style: {} }) } as unknown as Document;
  }
  if (typeof g.navigator === "undefined") {
    g.navigator = { userAgent: "node" } as unknown as Navigator;
  }
}

import sharp from "sharp";
import type { BoundingBox } from "@/types";

// ---------------------------------------------------------------------------
// Vision spike verdict (PRD §10 timeboxed):
// Groq vision LLM grid coordinates (0–1000) are coarse and often drift ~5–15%
// vs. handwriting. Per PRD §6.3 the OCR fallback is MANDATORY regardless.
// Strategy: OCR (tesseract word bbox) owns GEOMETRY, LLM owns TEXT/label cleanup.
// Reconciliation prefers OCR when LLM box fails sanity gates.
// ---------------------------------------------------------------------------

export const LABEL_REGEX = /^(Q\.?\s*\d+[a-z]?(?:\([a-z]\))?|\d+\s*[a-z]?[\).]|Ans\.?\s*\d+[a-z]?)/i;

export function detectLabel(text: string): string | undefined {
  const trimmed = text.trim();
  // check first 20 chars or first line
  const firstLine = trimmed.split("\n")[0].slice(0, 30).trim();
  const m = firstLine.match(LABEL_REGEX);
  if (m) return m[0].trim();
  // also try whole text start
  const m2 = trimmed.slice(0, 40).match(LABEL_REGEX);
  return m2 ? m2[0].trim() : undefined;
}

export function isDegenerateBox(b: BoundingBox): boolean {
  // reject ≤1% or ≥99% of page
  if (b.width <= 0.01 || b.height <= 0.01) return true;
  if (b.width >= 0.99 || b.height >= 0.99) return true;
  const area = b.width * b.height;
  if (area < 0.005 || area > 0.95) return true;
  const aspect = b.width / Math.max(b.height, 0.001);
  if (aspect > 20 || aspect < 0.05) return true; // sanity
  return false;
}

export function clampBox(b: BoundingBox): BoundingBox {
  const x = Math.max(0, Math.min(1, b.x));
  const y = Math.max(0, Math.min(1, b.y));
  const w = Math.max(0, Math.min(1 - x, b.width));
  const h = Math.max(0, Math.min(1 - y, b.height));
  return { page: b.page, x, y, width: w, height: h };
}

export function pxToNormalized(
  rect: { x0: number; y0: number; x1: number; y1: number },
  pageW: number,
  pageH: number,
  page: number
): BoundingBox {
  const x = rect.x0 / pageW;
  const y = rect.y0 / pageH;
  const w = (rect.x1 - rect.x0) / pageW;
  const h = (rect.y1 - rect.y0) / pageH;
  return clampBox({ page, x, y, width: w, height: h });
}

function unionRects(rects: Array<{ x0: number; y0: number; x1: number; y1: number }>) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x0);
    y0 = Math.min(y0, r.y0);
    x1 = Math.max(x1, r.x1);
    y1 = Math.max(y1, r.y1);
  }
  return { x0, y0, x1, y1 };
}

// ---------------------------------------------------------------------------
// Tesseract worker singleton — init once, reuse
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workerPromise: Promise<any> | null = null;

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    // dynamic import to avoid bundling issues
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    // Optionally set parameters for better handwriting geometry (not text accuracy)
    // await worker.setParameters({ tessedit_pageseg_mode: "6" } as unknown as Record<string, string>);
    return worker;
  })();
  return workerPromise;
}

export async function terminateOcrWorker() {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch {}
    workerPromise = null;
  }
}

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence?: number;
}

export interface OcrBlock {
  rawText: string;
  bboxPx: { x0: number; y0: number; x1: number; y1: number };
  bbox: BoundingBox;
  detectedLabel?: string;
  wordCount: number;
}

// Recognize page and return words with bboxes
export async function recognizePage(
  buffer: Buffer,
  pageNumber: number
): Promise<{ words: OcrWord[]; width: number; height: number }> {
  const worker = await getWorker();
  // tesseract.js can take Buffer directly
  const ret = await worker.recognize(buffer);
  // ret.data.words may exist in some versions, otherwise parse blocks/lines
  const data = ret.data as {
    words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }> }>;
    text?: string;
  };

  let words: OcrWord[] = [];
  if (data.words && Array.isArray(data.words)) {
    words = data.words.map((w) => ({
      text: w.text,
      bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
      confidence: (w as { confidence?: number }).confidence,
    }));
  } else if (data.blocks) {
    // fallback traverse
    for (const b of data.blocks) {
      for (const p of b.paragraphs ?? []) {
        for (const l of p.lines ?? []) {
          for (const w of l.words ?? []) {
            words.push({ text: w.text, bbox: w.bbox });
          }
        }
      }
    }
  }

  // Filter out empty and low-confidence noise
  words = words.filter((w) => w.text.trim().length > 0);

  // Need image dimensions
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 1000;
  const height = meta.height ?? 1400;
  console.log(`[ocr] page ${pageNumber} words=${words.length} ${width}x${height}`);
  return { words, width, height };
}

function clusterWordsIntoBlocks(
  words: OcrWord[],
  pageW: number,
  pageH: number,
  pageNumber: number
): OcrBlock[] {
  if (words.length === 0) return [];

  // Sort by y then x
  const sorted = [...words].sort((a, b) => {
    const ay = (a.bbox.y0 + a.bbox.y1) / 2;
    const by = (b.bbox.y0 + b.bbox.y1) / 2;
    if (Math.abs(ay - by) > 5) return ay - by;
    return a.bbox.x0 - b.bbox.x0;
  });

  // Step 1: group into lines
  const lines: Array<{ words: OcrWord[]; bbox: { x0: number; y0: number; x1: number; y1: number }; yCenter: number; height: number }> = [];
  for (const w of sorted) {
    const yCenter = (w.bbox.y0 + w.bbox.y1) / 2;
    const h = w.bbox.y1 - w.bbox.y0;
    const last = lines[lines.length - 1];
    if (last && Math.abs(yCenter - last.yCenter) < last.height * 0.6) {
      last.words.push(w);
      last.bbox = unionRects([last.bbox, w.bbox]);
      // update yCenter as weighted avg
      const allY = last.words.map((ww) => (ww.bbox.y0 + ww.bbox.y1) / 2);
      last.yCenter = allY.reduce((a, b) => a + b, 0) / allY.length;
      last.height = (last.bbox.y1 - last.bbox.y0);
    } else {
      lines.push({
        words: [w],
        bbox: { ...w.bbox },
        yCenter,
        height: h,
      });
    }
  }

  // Sort lines by y
  lines.sort((a, b) => a.yCenter - b.yCenter);

  // Step 2: group lines into blocks by vertical gap
  const blocks: Array<{ lines: typeof lines; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    if (last) {
      const gap = line.bbox.y0 - last.bbox.y1;
      const avgH = (last.bbox.y1 - last.bbox.y0) / last.lines.length;
      const threshold = Math.max(avgH * 1.8, pageH * 0.015); // ~1.5-2x line height or 1.5% page
      if (gap < threshold && gap > -avgH) {
        last.lines.push(line);
        last.bbox = unionRects([last.bbox, line.bbox]);
        continue;
      }
    }
    blocks.push({ lines: [line], bbox: { ...line.bbox } });
  }

  // Step 3: build OcrBlock per block
  const result: OcrBlock[] = blocks.map((b) => {
    // rawText: join lines with newline, words with space sorted by x
    const lineTexts = b.lines.map((l) => {
      const ws = [...l.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
      return ws.map((w) => w.text).join(" ");
    });
    const rawText = lineTexts.join("\n");
    // add padding ~2% for visual hug
    const padX = pageW * 0.01;
    const padY = pageH * 0.01;
    const padded = {
      x0: Math.max(0, b.bbox.x0 - padX),
      y0: Math.max(0, b.bbox.y0 - padY),
      x1: Math.min(pageW, b.bbox.x1 + padX),
      y1: Math.min(pageH, b.bbox.y1 + padY),
    };
    const bbox = pxToNormalized(padded, pageW, pageH, pageNumber);
    const detectedLabel = detectLabel(rawText);
    return {
      rawText,
      bboxPx: padded,
      bbox,
      detectedLabel,
      wordCount: b.lines.reduce((acc, l) => acc + l.words.length, 0),
    };
  });

  // Filter tiny blocks (likely noise) — less than 3 words and area <0.5%
  const filtered = result.filter((b) => {
    const area = b.bbox.width * b.bbox.height;
    if (b.wordCount < 3 && area < 0.008) return false;
    if (isDegenerateBox(b.bbox)) return false;
    return true;
  });

  console.log(`[ocr] clustered ${words.length} words → ${lines.length} lines → ${blocks.length} raw blocks → ${filtered.length} filtered`);
  return filtered;
}

export async function getOcrBlocksForPage(
  buffer: Buffer,
  pageNumber: number
): Promise<OcrBlock[]> {
  const { words, width, height } = await recognizePage(buffer, pageNumber);
  if (words.length === 0) return [];
  return clusterWordsIntoBlocks(words, width, height, pageNumber);
}

// Helpers for tests
export const _testHelpers = {
  clusterWordsIntoBlocks,
  unionRects,
  pxToNormalized,
};
