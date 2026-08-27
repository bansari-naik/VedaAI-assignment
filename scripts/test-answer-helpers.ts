import { LABEL_REGEX, detectLabel, isDegenerateBox, clampBox, pxToNormalized } from "../lib/ocrFallback";
import type { BoundingBox } from "../types";

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

async function testLabelRegex() {
  console.log("=== label regex ===");
  const cases: Array<[string, string | undefined]> = [
    ["Q2 The answer", "Q2"],
    ["Q. 3(a) hello", "Q. 3(a)"],
    ["Ans 3 is", "Ans 3"],
    ["Ans. 12 continued", "Ans. 12"],
    ["2) Some text", "2)"],
    ["3. hello", "3."],
    ["no label here", undefined],
    ["Question without label", undefined],
  ];
  for (const [inp, exp] of cases) {
    const got = detectLabel(inp);
    if (exp === undefined) {
      assert(got === undefined, `expected undefined for ${inp} got ${got}`);
    } else {
      assert(got !== undefined && got.toLowerCase().replace(/\s/g,"").includes(exp.toLowerCase().replace(/\s/g,"").slice(0,2)), `label for ${inp} got ${got} exp ${exp}`);
    }
  }
  // direct regex
  assert(LABEL_REGEX.test("Q3"), "Q3 should match");
  assert(LABEL_REGEX.test("Ans 2"), "Ans 2 should match");
  console.log("label regex PASS");
}

async function testDegenerate() {
  console.log("=== degenerate box ===");
  const cases: Array<[BoundingBox, boolean]> = [
    [{ page: 1, x: 0.1, y: 0.1, width: 0.005, height: 0.2 }, true],
    [{ page: 1, x: 0.1, y: 0.1, width: 0.99, height: 0.99 }, true],
    [{ page: 1, x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, false],
    [{ page: 1, x: 0, y: 0, width: 1, height: 1 }, true],
  ];
  for (const [b, exp] of cases) {
    const got = isDegenerateBox(b);
    assert(got === exp, `degenerate ${JSON.stringify(b)} exp ${exp} got ${got}`);
  }
  console.log("degenerate PASS");
}

async function testNormalize() {
  console.log("=== px to normalized ===");
  const b = pxToNormalized({ x0: 100, y0: 200, x1: 300, y1: 400 }, 1000, 1000, 2);
  assert(Math.abs(b.x - 0.1) < 1e-6 && Math.abs(b.y - 0.2) < 1e-6, "px normalize");
  assert(b.page === 2, "page");
  const clamped = clampBox({ page: 1, x: -0.1, y: 1.2, width: 2, height: 0.5 });
  assert(clamped.x === 0 && clamped.y === 1 && clamped.width === 1, "clamp");
  console.log("normalize PASS");
}

async function testClusteringAndFixture() {
  console.log("=== fixture: synthetic answer sheet multi-page ===");
  // We will test extractAnswers with mocked Groq + synthetic OCR bypass
  // Import extractAnswers with mock
  const { extractAnswers } = await import("../lib/pipeline/extractAnswers");
  const sharp = (await import("sharp")).default;
  const w = 1200, h = 1600;

  // Create 3-page synthetic answer sheet:
  // Page1: Q3 (top), Q1 (middle out-of-order), doodle at bottom
  // Page2: Q3 continued + Q2
  // Page3: Q3 continued second page (so Q3 spans 2-3)
  // We will mock Groq to return these blocks with grid coords

  const pages = [
    { buffer: await sharp(Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="80" y="120" font-family="Arial" font-size="24" fill="black">Q3 Photosynthesis is ...</text><text x="80" y="500" font-family="Arial" font-size="24" fill="black">Q1 Capital is Paris</text><text x="80" y="1200" font-family="Arial" font-size="24" fill="black">Doodle ~~~</text></svg>`)).png().toBuffer(), pageNumber: 1 },
    { buffer: await sharp(Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="80" y="120" font-family="Arial" font-size="24" fill="black">Q3 continued ... more text</text><text x="80" y="600" font-family="Arial" font-size="24" fill="black">Q2 Newton laws ...</text></svg>`)).png().toBuffer(), pageNumber: 2 },
    { buffer: await sharp(Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="80" y="120" font-family="Arial" font-size="24" fill="black">Q3 continued again final part</text></svg>`)).png().toBuffer(), pageNumber: 3 },
  ];

  // Mock fetch for Groq vision + OCR (we will mock OCR to return empty to test LLM path, and also test merge)
  process.env.GROQ_API_KEY = "mock-key";
  const origFetch = global.fetch;
  // we need to also mock getOcrBlocksForPage to avoid real tesseract (slow). We'll monkey-patch via dynamic import manipulation?
  // Simpler: let real OCR run but it will be fast on synthetic white images (will produce 0 words, so 0 blocks). That's okay — LLM path will dominate.
  // So we just mock Groq responses.

  (global as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/models")) {
      return new Response(JSON.stringify({ data: [{ id: "meta-llama/llama-4-maverick-17b-128e-instruct" }] }), { status: 200 });
    }
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const msgs = JSON.stringify(body.messages);
      const isPage1 = msgs.includes("page 1 of 3");
      const isPage2 = msgs.includes("page 2 of 3");
      const isPage3 = msgs.includes("page 3 of 3");
      let drafts: unknown[] = [];
      if (isPage1) {
        drafts = [
          { rawText: "Q3 Photosynthesis is ...", detectedLabel: "Q3", box: { x: 50, y: 50, w: 900, h: 200 } },
          { rawText: "Q1 Capital is Paris", detectedLabel: "Q1", box: { x: 50, y: 300, w: 900, h: 200 } },
          { rawText: "Doodle ~~~", detectedLabel: null, box: { x: 50, y: 700, w: 900, h: 200 } },
        ];
      } else if (isPage2) {
        drafts = [
          { rawText: "Q3 continued ... more text", detectedLabel: "Q3", box: { x: 50, y: 50, w: 900, h: 200 } },
          { rawText: "Q2 Newton laws ...", detectedLabel: "Q2", box: { x: 50, y: 350, w: 900, h: 200 } },
        ];
      } else if (isPage3) {
        drafts = [
          { rawText: "Q3 continued again final part", detectedLabel: "Q3", box: { x: 50, y: 50, w: 900, h: 200 } },
        ];
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(drafts) } }], usage: {} }), { status: 200 });
    }
    return (origFetch as unknown as typeof fetch)(input, init);
  };

  const sessionId = `test-answers-${Date.now()}`;
  const blocks = await extractAnswers(pages as never, sessionId);

  // Restore fetch
  (global as unknown as { fetch: typeof fetch }).fetch = origFetch as unknown as typeof fetch;

  console.log("extracted blocks", JSON.stringify(blocks, null, 2));

  // Assertions per test plan
  assert(blocks.length >= 4, `expected >=4 blocks got ${blocks.length}`);
  // Q3 should have 3 regions (pages 1,2,3) due to merge? Actually our fixture has Q3 on 1,2,3 — should merge into 1 block with 3 regions
  const q3 = blocks.find((b) => b.detectedLabel === "Q3" || b.detectedLabel === "Q3");
  assert(!!q3, "Q3 block missing");
  // Check multi-page: Q3 should have 3 regions if merge worked across 1-2-3, or at least 2 regions for pages 2-3 case per spec (we designed 2-3 as separate but also page1 Q3)
  // Our merge logic merges same label consecutive pages: 1→2 merges, then 2→3 merges, so 3 regions
  assert(q3!.regions.length === 3, `Q3 should have 3 regions got ${q3!.regions.length}`);
  assert(q3!.regions[0].page === 1 && q3!.regions[1].page === 2 && q3!.regions[2].page === 3, "Q3 regions pages 1,2,3");
  // All coords ∈[0,1]
  for (const b of blocks) {
    for (const r of b.regions) {
      assert(r.x >= 0 && r.x <= 1 && r.y >= 0 && r.y <= 1 && r.width > 0 && r.width <= 1 && r.height > 0 && r.height <= 1, `coords out of [0,1] ${JSON.stringify(r)}`);
      assert(!isDegenerateBox(r), `degenerate box survived ${JSON.stringify(r)}`);
    }
  }
  // Q1 out-of-order should exist
  assert(blocks.some((b) => b.detectedLabel === "Q1"), "Q1 out-of-order missing");
  // Doodle garbage should be present as separate block (maybe)
  // Check detectedLabel === "Q3" captured
  assert(q3!.detectedLabel === "Q3", `Q3 label ${q3!.detectedLabel}`);

  console.log("fixture PASS");
}

async function run() {
  await testLabelRegex();
  await testDegenerate();
  await testNormalize();
  await testClusteringAndFixture();
  console.log("\n=== ALL answer helper tests PASS ===");
  try {
    const { terminateOcrWorker } = await import("../lib/ocrFallback");
    await terminateOcrWorker();
  } catch {}
  setTimeout(() => process.exit(0), 500);
}

run().catch((e) => { console.error("FAIL", e); process.exit(1); });
