/**
 * Harness to run extractAnswers against synthetic or session data
 * Usage:
 *   npx tsx scripts/run-extract-answers.ts --synthetic
 *   npx tsx scripts/run-extract-answers.ts --session <id>
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import sharp from "sharp";
import { extractAnswers, PageInput } from "../lib/pipeline/extractAnswers";
import { getAsDir } from "../lib/session";
import { terminateOcrWorker } from "../lib/ocrFallback";

function hasGroqKey() {
  const k = process.env.GROQ_API_KEY;
  return !!k && k !== "your_groq_api_key_here" && k.trim() !== "";
}

async function generateSyntheticAnswerPages(): Promise<PageInput[]> {
  const w = 1200, h = 1600;
  const p1 = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="80" y="120" font-family="Arial" font-size="24" fill="black">Q3 First part of long answer...</text><text x="80" y="500" font-family="Arial" font-size="24" fill="black">Q1 Paris is capital</text></svg>`;
  const p2 = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="80" y="120" font-family="Arial" font-size="24" fill="black">Q3 continued ...</text><text x="80" y="600" font-family="Arial" font-size="24" fill="black">Q2 Newton...</text></svg>`;
  const p3 = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="80" y="120" font-family="Arial" font-size="24" fill="black">Q3 continued final</text></svg>`;
  return [
    { buffer: await sharp(Buffer.from(p1)).png().toBuffer(), pageNumber: 1 },
    { buffer: await sharp(Buffer.from(p2)).png().toBuffer(), pageNumber: 2 },
    { buffer: await sharp(Buffer.from(p3)).png().toBuffer(), pageNumber: 3 },
  ];
}

async function loadFromSession(sessionId: string): Promise<PageInput[]> {
  const dir = getAsDir(sessionId);
  const files = await fs.readdir(dir).catch(() => []);
  const pngs = files.filter((f) => f.startsWith("page-") && f.endsWith(".png")).sort((a, b) => {
    const na = parseInt(a.match(/page-(\d+)/)?.[1] ?? "0", 10);
    const nb = parseInt(b.match(/page-(\d+)/)?.[1] ?? "0", 10);
    return na - nb;
  });
  if (pngs.length === 0) throw new Error(`No pages in ${dir}`);
  const pages: PageInput[] = [];
  for (const fn of pngs) {
    const n = parseInt(fn.match(/page-(\d+)/)?.[1] ?? "0", 10);
    const buf = await fs.readFile(path.join(dir, fn));
    pages.push({ buffer: buf, pageNumber: n });
  }
  return pages;
}

async function main() {
  const args = process.argv.slice(2);
  const sessIdx = args.indexOf("--session");
  let pages: PageInput[] = [];
  let sessionId: string | undefined;
  if (sessIdx !== -1) {
    sessionId = args[sessIdx + 1];
    if (!sessionId) throw new Error("--session requires id");
    pages = await loadFromSession(sessionId);
    console.log(`[harness] loaded ${pages.length} pages from session ${sessionId}`);
  } else {
    pages = await generateSyntheticAnswerPages();
    sessionId = `synthetic-ans-${Date.now()}`;
    const tmpDir = path.join(os.tmpdir(), "vedaai", sessionId, "as");
    await fs.mkdir(tmpDir, { recursive: true });
    for (const p of pages) await fs.writeFile(path.join(tmpDir, `page-${p.pageNumber}.png`), p.buffer);
    console.log(`[harness] synthetic ${pages.length} pages session=${sessionId}`);
  }

  const useMock = process.env.MOCK_GROQ === "1" || !hasGroqKey();
  if (useMock) {
    if (!hasGroqKey()) process.env.GROQ_API_KEY = "mock-key";
    console.log("[harness] MOCK_GROQ active");
    const origFetch = global.fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/models")) return new Response(JSON.stringify({ data: [{ id: "meta-llama/llama-4-maverick-17b-128e-instruct" }] }), { status: 200 });
      if (url.includes("/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const txt = JSON.stringify(body.messages);
        let drafts: unknown[] = [];
        if (txt.includes("page 1 of 3")) drafts = [{ rawText: "Q3 First part", detectedLabel: "Q3", box: { x: 50, y: 50, w: 900, h: 200 } }, { rawText: "Q1 Paris is capital", detectedLabel: "Q1", box: { x: 50, y: 300, w: 900, h: 200 } }];
        else if (txt.includes("page 2 of 3")) drafts = [{ rawText: "Q3 continued ...", detectedLabel: "Q3", box: { x: 50, y: 50, w: 900, h: 200 } }, { rawText: "Q2 Newton...", detectedLabel: "Q2", box: { x: 50, y: 350, w: 900, h: 200 } }];
        else if (txt.includes("page 3 of 3")) drafts = [{ rawText: "Q3 continued final", detectedLabel: "Q3", box: { x: 50, y: 50, w: 900, h: 200 } }];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(drafts) } }], usage: {} }), { status: 200 });
      }
      return (origFetch as unknown as typeof fetch)(input, init);
    };
  }

  console.time("extractAnswers");
  const answers = await extractAnswers(pages, sessionId);
  console.timeEnd("extractAnswers");
  console.log(`\n=== Extracted ${answers.length} answer blocks ===`);
  console.log(JSON.stringify(answers, null, 2));
  const out = path.join(os.tmpdir(), "vedaai", sessionId!, `answers-${Date.now()}.json`);
  await fs.writeFile(out, JSON.stringify(answers, null, 2));
  console.log(`\nDumped to ${out}`);
  console.log(`Debug: ${path.join(os.tmpdir(), "vedaai", sessionId!, "debug")}`);
  console.log(`View: /exams/debug-bbox?session=${sessionId}&type=as&page=1`);

  await terminateOcrWorker().catch(() => {});
  // ensure process exits (tesseract worker keeps event loop alive)
  setTimeout(() => process.exit(0), 500);
}

main().catch((e) => { console.error(e); process.exit(1); });
