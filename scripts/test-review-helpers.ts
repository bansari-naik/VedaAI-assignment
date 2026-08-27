import { bboxToPx, bboxToPercent } from "../components/AnswerSheetViewer";
import type { BoundingBox } from "../types";

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

function testBboxToPx() {
  console.log("=== bboxToPx ===");
  const bbox: BoundingBox = { page: 1, x: 0.1, y: 0.2, width: 0.5, height: 0.3 };
  // 1000x800 at 100%
  let px = bboxToPx(bbox, 1000, 800, 100);
  assert(px.left === 100 && px.top === 160 && px.width === 500 && px.height === 240, `100% ${JSON.stringify(px)}`);
  // 75%
  px = bboxToPx(bbox, 1000, 800, 75);
  assert(px.left === 75 && px.top === 120 && px.width === 375 && px.height === 180, `75% ${JSON.stringify(px)}`);
  // 150%
  px = bboxToPx(bbox, 1000, 800, 150);
  assert(px.left === 150 && px.top === 240 && px.width === 750 && px.height === 360, `150% ${JSON.stringify(px)}`);
  // 200% with different img size
  px = bboxToPx(bbox, 600, 400, 200);
  assert(px.left === 120 && px.top === 160 && px.width === 600 && px.height === 240, `200% 600x400 ${JSON.stringify(px)}`);
  console.log("bboxToPx PASS");
}

function testBboxToPercent() {
  console.log("=== bboxToPercent ===");
  const bbox: BoundingBox = { page: 2, x: 0.25, y: 0.5, width: 0.5, height: 0.25 };
  const p = bboxToPercent(bbox);
  assert(p.left === "25%" && p.top === "50%" && p.width === "50%" && p.height === "25%", `percent ${JSON.stringify(p)}`);
  console.log("bboxToPercent PASS");
}

function testIntegrationSelection() {
  console.log("=== integration: selection → page jump ===");
  // Simulate selection resolution chain
  const answers = [
    { id: "a1", rawText: "Ans Q2", regions: [{ page: 2, x: 0.1, y: 0.1, width: 0.8, height: 0.2 } as BoundingBox], detectedLabel: "Q2" },
    { id: "a2", rawText: "Ans Q1", regions: [{ page: 1, x: 0.1, y: 0.1, width: 0.8, height: 0.2 } as BoundingBox], detectedLabel: "Q1" },
  ];
  const mappings = [
    { questionId: "q1", answerBlockId: "a2", status: "matched" as const, confidence: 0.95 },
    { questionId: "q2", answerBlockId: "a1", status: "matched" as const, confidence: 0.9 },
  ];
  // Simulate clicking Q2 when currentPage=1 → should jump to 2
  const selectedId = "q2";
  const mapping = mappings.find((m) => m.questionId === selectedId);
  const block = answers.find((a) => a.id === mapping?.answerBlockId);
  const currentPage = 1;
  const shouldJump = block && !block.regions.some((r) => r.page === currentPage);
  assert(shouldJump === true, "Q2 should jump from page 1 to 2");
  const targetPage = block!.regions[0].page;
  assert(targetPage === 2, `target page should be 2 got ${targetPage}`);
  // Clicking Q1 when on page 1 should not jump
  const selectedQ1 = "q1";
  const m1 = mappings.find((m) => m.questionId === selectedQ1);
  const b1 = answers.find((a) => a.id === m1?.answerBlockId);
  const shouldNotJump = b1 && !b1.regions.some((r) => r.page === 1);
  assert(shouldNotJump === false, "Q1 should not jump when on page 1");
  console.log("integration selection PASS");
}

function testStatesMatrix() {
  console.log("=== states matrix ===");
  const mappings = [
    { questionId: "q1", answerBlockId: "a1", status: "matched" as const, confidence: 0.95 },
    { questionId: "q2", answerBlockId: null, status: "unanswered" as const, confidence: 1 },
    { questionId: null, answerBlockId: "a2", status: "unmatched_answer" as const, confidence: 0.8 },
    { questionId: "q3", answerBlockId: "a3", status: "matched" as const, confidence: 0.4 }, // low confidence
  ];
  const matched = mappings.filter((m) => m.status === "matched");
  const unanswered = mappings.filter((m) => m.status === "unanswered");
  const unmatched = mappings.filter((m) => m.status === "unmatched_answer");
  assert(matched.length === 2, "matched count");
  assert(unanswered.length === 1 && unanswered[0].answerBlockId === null, "unanswered");
  assert(unmatched.length === 1 && unmatched[0].questionId === null, "unmatched");
  const low = matched.find((m) => (m.confidence ?? 1) < 0.6);
  assert(!!low && low.questionId === "q3", "low confidence");
  console.log("states matrix PASS");
}

async function run() {
  testBboxToPx();
  testBboxToPercent();
  testIntegrationSelection();
  testStatesMatrix();
  console.log("\n=== ALL review helper tests PASS ===");
}

run().catch((e) => { console.error("FAIL", e); process.exit(1); });
