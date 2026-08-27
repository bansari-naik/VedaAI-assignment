/**
 * Harness to run extractQuestions against a sample paper.
 * Usage:
 *   GROQ_API_KEY=xxx npx tsx scripts/run-extract-questions.ts --session <id>
 *   or: npx tsx scripts/run-extract-questions.ts --synthetic
 *
 * --session: reads qp pages from /tmp/vedaai/<id>/qp/page-*.png (created by task03 upload)
 * --synthetic: generates synthetic question-paper images with multi-part + marks and runs extraction
 * Without args, defaults to synthetic demo with mocked Groq if GROQ_API_KEY missing.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import sharp from "sharp";
import { extractQuestions, PageInput } from "../lib/pipeline/extractQuestions";
import { getQpDir } from "../lib/session";

function hasGroqKey(): boolean {
  const k = process.env.GROQ_API_KEY;
  return !!k && k !== "your_groq_api_key_here" && k.trim() !== "";
}

async function generateSyntheticPages(): Promise<PageInput[]> {
  // Create 2-page synthetic question paper with multi-part and marks
  const w = 1200, h = 1600;
  const page1Svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <text x="60" y="100" font-family="Arial" font-size="28" fill="#0f172a" font-weight="bold">Sample Question Paper</text>
    <text x="60" y="180" font-family="Arial" font-size="22" fill="black">1. What is the capital of France? [2]</text>
    <text x="60" y="240" font-family="Arial" font-size="22" fill="black">2. Explain Newton's laws of motion. (5 marks)</text>
    <text x="60" y="300" font-family="Arial" font-size="22" fill="black">3. Define photosynthesis. [3]</text>
    <text x="60" y="360" font-family="Arial" font-size="22" fill="black">11(a) What is the chloroplast? [3]</text>
    <text x="60" y="420" font-family="Arial" font-size="22" fill="black">11(b) Explain its role in photosynthesis. (5 marks)</text>
    <text x="60" y="480" font-family="Arial" font-size="22" fill="black">4. Solve: 2x + 5 = 15 [2]</text>
    <text x="60" y="540" font-family="Arial" font-size="22" fill="black">5. What is 2+2?</text>
    <text x="60" y="600" font-family="Arial" font-size="22" fill="black">6. Describe water cycle.</text>
    <text x="60" y="660" font-family="Arial" font-size="22" fill="black">7. What is gravity?</text>
    <text x="60" y="720" font-family="Arial" font-size="22" fill="black">8. Name the planets.</text>
  </svg>`;
  const page2Svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <text x="60" y="100" font-family="Arial" font-size="22" fill="black">9. What is evolution? [4]</text>
    <text x="60" y="160" font-family="Arial" font-size="22" fill="black">10. Explain democracy. (6 marks)</text>
    <text x="60" y="220" font-family="Arial" font-size="22" fill="black">12. What is the speed of light? [2]</text>
  </svg>`;
  const buf1 = await sharp(Buffer.from(page1Svg)).png().toBuffer();
  const buf2 = await sharp(Buffer.from(page2Svg)).png().toBuffer();
  return [
    { buffer: buf1, pageNumber: 1 },
    { buffer: buf2, pageNumber: 2 },
  ];
}

async function loadFromSession(sessionId: string): Promise<PageInput[]> {
  const dir = getQpDir(sessionId);
  const pages: PageInput[] = [];
  // Read page-*.png files sorted
  const files = await fs.readdir(dir).catch(() => []);
  const pngs = files.filter((f) => f.startsWith("page-") && f.endsWith(".png")).sort((a,b)=> {
    const na = parseInt(a.match(/page-(\d+)/)?.[1] ?? "0",10);
    const nb = parseInt(b.match(/page-(\d+)/)?.[1] ?? "0",10);
    return na-nb;
  });
  if (pngs.length === 0) throw new Error(`No pages found in ${dir} — did you run upload for session ${sessionId}?`);
  for (const fn of pngs) {
    const n = parseInt(fn.match(/page-(\d+)/)?.[1] ?? "0",10);
    const buf = await fs.readFile(path.join(dir, fn));
    pages.push({ buffer: buf, pageNumber: n });
  }
  return pages;
}

async function main() {
  const args = process.argv.slice(2);
  const sessionIdx = args.indexOf("--session");
  const synthetic = args.includes("--synthetic") || args.length === 0;

  let pages: PageInput[] = [];
  let sessionId: string | undefined;

  if (sessionIdx !== -1) {
    sessionId = args[sessionIdx + 1];
    if (!sessionId) throw new Error("--session requires an ID");
    pages = await loadFromSession(sessionId);
    console.log(`[harness] loaded ${pages.length} pages from session ${sessionId}`);
  } else if (synthetic) {
    pages = await generateSyntheticPages();
    sessionId = `synthetic-${Date.now()}`;
    // also write to tmp for debug dump path visibility
    const tmpDir = path.join(os.tmpdir(), "vedaai", sessionId, "qp");
    await fs.mkdir(tmpDir, { recursive: true });
    for (const p of pages) await fs.writeFile(path.join(tmpDir, `page-${p.pageNumber}.png`), p.buffer);
    console.log(`[harness] generated ${pages.length} synthetic pages session=${sessionId}`);
  } else {
    throw new Error("Provide --session <id> or --synthetic");
  }

  console.log(`[harness] hasGroqKey=${hasGroqKey()} — if false, will fail with clear error (expected). Mock mode not enabled by default.`);
  // Allow mocking via env MOCK_GROQ=1 to avoid real API call
  const useMock = process.env.MOCK_GROQ === "1" || !hasGroqKey();
  if (useMock) {
    if (!hasGroqKey()) process.env.GROQ_API_KEY = "mock-test-key";
    console.log("[harness] MOCK_GROQ: simulating Groq responses without network");
    // Install a fetch mock that returns fixture JSON
    const originalFetch = global.fetch;
    // @ts-expect-error mock fetch override for harness
    global.fetch = async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/models")) {
        return new Response(JSON.stringify({ data: [{ id: "meta-llama/llama-4-maverick-17b-128e-instruct" }, { id: "llama-3.3-70b-versatile" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (u.includes("/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const isMerge = (body.messages?.[0]?.content ?? "").includes("merge specialist");
        if (isMerge) {
          const merged = [
            { displayNumber: "1", text: "What is the capital of France?", maxMarks: 2, sourcePage: 1 },
            { displayNumber: "2", text: "Explain Newton's laws of motion.", maxMarks: 5, sourcePage: 1 },
            { displayNumber: "3", text: "Define photosynthesis.", maxMarks: 3, sourcePage: 1 },
            { displayNumber: "11(a)", text: "What is the chloroplast?", maxMarks: 3, sourcePage: 1 },
            { displayNumber: "11(b)", text: "Explain its role in photosynthesis.", maxMarks: 5, sourcePage: 1 },
            { displayNumber: "4", text: "Solve: 2x + 5 = 15", maxMarks: 2, sourcePage: 1 },
            { displayNumber: "5", text: "What is 2+2?", maxMarks: null, sourcePage: 1 },
            { displayNumber: "6", text: "Describe water cycle.", maxMarks: null, sourcePage: 1 },
            { displayNumber: "7", text: "What is gravity?", maxMarks: null, sourcePage: 1 },
            { displayNumber: "8", text: "Name the planets.", maxMarks: null, sourcePage: 1 },
            { displayNumber: "9", text: "What is evolution?", maxMarks: 4, sourcePage: 2 },
            { displayNumber: "10", text: "Explain democracy.", maxMarks: 6, sourcePage: 2 },
            { displayNumber: "12", text: "What is the speed of light?", maxMarks: 2, sourcePage: 2 },
          ];
          return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(merged) } }], usage: { total_tokens: 100 } }), { status: 200, headers: { "Content-Type": "application/json" } });
        } else {
          // per-page: return subset based on page detection via user prompt text
          const userText = JSON.stringify(body.messages);
          const isPage1 = userText.includes("page 1");
          const drafts = isPage1
            ? [
                { displayNumber: "1", text: "What is the capital of France?", maxMarks: 2, sourcePage: 1 },
                { displayNumber: "2", text: "Explain Newton's laws of motion.", maxMarks: 5, sourcePage: 1 },
                { displayNumber: "3", text: "Define photosynthesis.", maxMarks: 3, sourcePage: 1 },
                { displayNumber: "11(a)", text: "What is the chloroplast?", maxMarks: 3, sourcePage: 1 },
                { displayNumber: "11(b)", text: "Explain its role in photosynthesis.", maxMarks: 5, sourcePage: 1 },
                { displayNumber: "4", text: "Solve: 2x + 5 = 15", maxMarks: 2, sourcePage: 1 },
                { displayNumber: "5", text: "What is 2+2?", maxMarks: null, sourcePage: 1 },
                { displayNumber: "6", text: "Describe water cycle.", maxMarks: null, sourcePage: 1 },
                { displayNumber: "7", text: "What is gravity?", maxMarks: null, sourcePage: 1 },
                { displayNumber: "8", text: "Name the planets.", maxMarks: null, sourcePage: 1 },
              ]
            : [
                { displayNumber: "9", text: "What is evolution?", maxMarks: 4, sourcePage: 2 },
                { displayNumber: "10", text: "Explain democracy.", maxMarks: 6, sourcePage: 2 },
                { displayNumber: "12", text: "What is the speed of light?", maxMarks: 2, sourcePage: 2 },
              ];
          // Simulate fenced JSON on first call occasionally? Not needed
          return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(drafts) } }], usage: { total_tokens: 100 } }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return originalFetch(url as unknown as string, init);
    };
  }

  console.time("extractQuestions");
  const questions = await extractQuestions(pages, sessionId);
  console.timeEnd("extractQuestions");

  console.log(`\n=== Extracted ${questions.length} questions ===`);
  console.log(JSON.stringify(questions, null, 2));

  const outPath = path.join(os.tmpdir(), "vedaai", sessionId!, `questions-${Date.now()}.json`);
  await fs.writeFile(outPath, JSON.stringify(questions, null, 2));
  console.log(`\nDumped to ${outPath}`);
  console.log(`Debug dumps in ${path.join(os.tmpdir(), "vedaai", sessionId!, "debug")}`);

  // Basic assertions for harness self-check
  const has11a = questions.some((q) => q.displayNumber === "11(a)");
  const has11b = questions.some((q) => q.displayNumber === "11(b)");
  console.log(`\nChecks: has 11(a)=${has11a} has 11(b)=${has11b} order preserved=${questions.every((q,i)=> q.orderIndex===i)}`);
  if (!has11a || !has11b) console.warn("WARN: expected multi-part 11(a)/11(b) not found — prompt may need tuning");
}

main().catch((e) => { console.error(e); process.exit(1); });
