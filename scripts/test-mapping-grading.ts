import { mapAnswers, repairMappings, labelPrePass } from "../lib/pipeline/mapAnswers";
import { grade, _testHelpers as gradeHelpers } from "../lib/pipeline/grade";
import type { ExtractedQuestion, ExtractedAnswerBlock, QuestionAnswerMapping } from "../types";

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

function makeQuestions(): ExtractedQuestion[] {
  return [
    { id: "q1", displayNumber: "1", orderIndex: 0, text: "What is the capital of France?", maxMarks: 2, sourcePage: 1 },
    { id: "q2", displayNumber: "2", orderIndex: 1, text: "Explain Newton's first law.", maxMarks: 5, sourcePage: 1 },
    { id: "q3", displayNumber: "3", orderIndex: 2, text: "Define photosynthesis.", maxMarks: 3, sourcePage: 1 },
    { id: "q4", displayNumber: "4", orderIndex: 3, text: "Solve 2x+5=15", maxMarks: 2, sourcePage: 1 },
    { id: "q11a", displayNumber: "11(a)", orderIndex: 4, text: "What is chloroplast?", maxMarks: 3, sourcePage: 1 },
    { id: "q11b", displayNumber: "11(b)", orderIndex: 5, text: "Explain its role.", maxMarks: 5, sourcePage: 1 },
  ];
}

function makeAnswers(): ExtractedAnswerBlock[] {
  return [
    // correct out-of-order labeled answer: Q3 answered as Q3 but placed first, labeled Q3
    { id: "a1", rawText: "Photosynthesis is process by which plants...", regions: [{ page: 1, x: 0.1, y: 0.1, width: 0.8, height: 0.2 }], detectedLabel: "Q3" },
    // content-similar unlabeled answer: answer for Q2 but no label, text similar to Q2
    { id: "a2", rawText: "Newton first law says object stays at rest unless acted upon...", regions: [{ page: 1, x: 0.1, y: 0.3, width: 0.8, height: 0.2 }], detectedLabel: undefined },
    // skipped question: no answer for Q4 (we won't create a4 for Q4)
    // garbage/doodle block
    { id: "a3", rawText: "~~~ doodle ~~~ random scribble", regions: [{ page: 1, x: 0.1, y: 0.6, width: 0.8, height: 0.1 }], detectedLabel: undefined },
    // bogus label "Q99"
    { id: "a4", rawText: "This is bogus answer for Q99", regions: [{ page: 1, x: 0.1, y: 0.8, width: 0.8, height: 0.1 }], detectedLabel: "Q99" },
    // unlabeled answer for 11(a)
    { id: "a5", rawText: "Chloroplast is organelle...", regions: [{ page: 2, x: 0.1, y: 0.1, width: 0.8, height: 0.2 }], detectedLabel: undefined },
    // labeled out-of-order for 1
    { id: "a6", rawText: "Capital of France is Paris", regions: [{ page: 2, x: 0.1, y: 0.3, width: 0.8, height: 0.2 }], detectedLabel: "Q1" },
  ];
}

async function testLabelPrePass() {
  console.log("=== label pre-pass ===");
  const qs = makeQuestions();
  const as = makeAnswers();
  const pre = labelPrePass(qs, as);
  // Should have matched a1->q3 via Q3, a6->q1 via Q1, maybe a4 Q99 should not match (no Q99)
  assert(pre.mappings.some((m) => m.questionId === "q3" && m.answerBlockId === "a1"), "Q3 label pre-pass missing");
  assert(pre.mappings.some((m) => m.questionId === "q1" && m.answerBlockId === "a6"), "Q1 label pre-pass missing");
  assert(!pre.mappings.some((m) => m.answerBlockId === "a4"), "Q99 bogus should not pre-pass");
  console.log("label pre-pass PASS", pre.mappings);
}

async function testFixtureMapping() {
  console.log("=== fixture mapping (3 statuses) ===");
  const qs = makeQuestions();
  const as = makeAnswers();

  // Mock Groq for mapping: we need to mock fetch to return semantic matches for remaining
  // After pre-pass, remaining Qs: q2,q4,q11a,q11b and remaining As: a2,a3,a4,a5
  // We want LLM to map: a2 -> q2 (content similar), a5 -> q11a, a3 -> unmatched, a4 -> unmatched (bogus), q4 & q11b unanswered
  process.env.GROQ_API_KEY = "mock-key";
  const origFetch = global.fetch;
  (global as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/models")) return new Response(JSON.stringify({ data: [{ id: "llama-3.3-70b-versatile" }] }), { status: 200 });
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const isMapping = JSON.stringify(body.messages).includes("mapping specialist");
      if (isMapping) {
        // Return mappings for remaining: a2->q2 matched, a5->q11a matched, a3 unmatched, a4 unmatched, q4/q11b will be synthesized as unanswered by repair
        const mappings = [
          { questionId: "q2", answerBlockId: "a2", status: "matched", confidence: 0.88 },
          { questionId: "q11a", answerBlockId: "a5", status: "matched", confidence: 0.91 },
          // a3 and a4 not returned as matched — repair should synthesize unmatched
          // But we can also explicitly return unmatched for a3
          { questionId: null, answerBlockId: "a3", status: "unmatched_answer", confidence: 0.85 },
        ];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(mappings) } }], usage: {} }), { status: 200 });
      }
      // grading mock fallback
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([]) } }], usage: {} }), { status: 200 });
    }
    return (origFetch as unknown as typeof fetch)(input, init);
  };

  const mappings = await mapAnswers(qs, as, `test-map-${Date.now()}`);
  (global as unknown as { fetch: typeof fetch }).fetch = origFetch as unknown as typeof fetch;

  console.log("mappings", JSON.stringify(mappings, null, 2));

  // Check statuses
  const statuses = new Set(mappings.map((m) => m.status));
  assert(statuses.has("matched"), "should have matched");
  assert(statuses.has("unanswered"), "should have unanswered");
  assert(statuses.has("unmatched_answer"), "should have unmatched_answer");

  // Check specific: q4 unanswered, q11b unanswered
  assert(mappings.some((m) => m.questionId === "q4" && m.status === "unanswered" && m.answerBlockId === null), "q4 unanswered");
  assert(mappings.some((m) => m.questionId === "q11b" && m.status === "unanswered"), "q11b unanswered");
  // a3 and a4 unmatched
  assert(mappings.some((m) => m.answerBlockId === "a3" && m.status === "unmatched_answer"), "a3 unmatched");
  assert(mappings.some((m) => m.answerBlockId === "a4" && m.status === "unmatched_answer"), "a4 unmatched (Q99)");
  // out-of-order: a6->q1 should be via pre-pass
  assert(mappings.some((m) => m.questionId === "q1" && m.answerBlockId === "a6"), "out-of-order Q1");
  // content similar: a2->q2
  assert(mappings.some((m) => m.questionId === "q2" && m.answerBlockId === "a2"), "content similar a2->q2");
  // confidences
  for (const m of mappings) assert(m.confidence >= 0 && m.confidence <= 1, `confidence out of range ${m.confidence}`);

  // Invariants
  for (const q of qs) assert(mappings.some((m) => m.questionId === q.id), `question ${q.displayNumber} not covered`);
  for (const a of as) assert(mappings.some((m) => m.answerBlockId === a.id), `answer ${a.id} not covered`);
  for (const m of mappings) {
    if (m.status === "unanswered") assert(m.answerBlockId === null, "unanswered should have null answer");
    if (m.status === "unmatched_answer") assert(m.questionId === null, "unmatched should have null question");
  }

  console.log("fixture mapping PASS");
  return { qs, as, mappings };
}

async function testInvariantRepair() {
  console.log("=== invariant repair fuzz ===");
  const qs = makeQuestions().slice(0, 3);
  const as = makeAnswers().slice(0, 3);
  // malformed: unknown ids, duplicate, missing rows, wrong statuses
  const malformed: QuestionAnswerMapping[] = [
    { questionId: "q1", answerBlockId: "a1", status: "matched", confidence: 0.9 },
    { questionId: "q1", answerBlockId: "a1", status: "matched", confidence: 0.9 }, // duplicate
    { questionId: "unknown-q", answerBlockId: "a2", status: "matched", confidence: 0.8 }, // unknown q
    { questionId: "q2", answerBlockId: "unknown-a", status: "matched", confidence: 0.7 }, // unknown a
    { questionId: "q2", answerBlockId: "a2", status: "unanswered", confidence: 1 }, // wrong status (should have null answer)
    { questionId: null, answerBlockId: "a3", status: "matched", confidence: 0.5 }, // matched with null question
  ];
  const repaired = repairMappings(malformed, qs, as);
  console.log("repaired", repaired);
  // After repair, should have no unknown ids, no duplicates, every q and a covered
  assert(!repaired.some((m) => m.questionId === "unknown-q" || m.answerBlockId === "unknown-a"), "unknown ids should be dropped");
  // duplicate should be deduped: only one q1-a1
  assert(repaired.filter((m) => m.questionId === "q1" && m.answerBlockId === "a1").length === 1, "duplicate not deduped");
  // every q covered
  for (const q of qs) assert(repaired.some((m) => m.questionId === q.id), `q ${q.id} not covered after repair`);
  for (const a of as) assert(repaired.some((m) => m.answerBlockId === a.id), `a ${a.id} not covered`);
  // status invariants
  for (const m of repaired) {
    if (m.status === "unanswered") assert(m.answerBlockId === null, "unanswered invariant");
    if (m.status === "unmatched_answer") assert(m.questionId === null, "unmatched invariant");
  }
  console.log("invariant repair PASS");
}

async function testGrading() {
  console.log("=== grading fixture ===");
  const qs = makeQuestions();
  const as = makeAnswers();
  // Use mappings from previous fixture: we need a realistic set
  const mappings: QuestionAnswerMapping[] = [
    { questionId: "q1", answerBlockId: "a6", status: "matched", confidence: 0.95 }, // perfect
    { questionId: "q2", answerBlockId: "a2", status: "matched", confidence: 0.88 }, // partial
    { questionId: "q3", answerBlockId: "a1", status: "matched", confidence: 0.9 }, // wrong
    { questionId: "q4", answerBlockId: null, status: "unanswered", confidence: 1 },
    { questionId: "q11a", answerBlockId: "a5", status: "matched", confidence: 0.9 },
    { questionId: "q11b", answerBlockId: null, status: "unanswered", confidence: 1 },
    { questionId: null, answerBlockId: "a3", status: "unmatched_answer", confidence: 0.8 },
    { questionId: null, answerBlockId: "a4", status: "unmatched_answer", confidence: 0.8 },
  ];

  // Mock grading LLM to return deterministic scores
  process.env.GROQ_API_KEY = "mock-key";
  const origFetch = global.fetch;
  (global as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/models")) return new Response(JSON.stringify({ data: [{ id: "llama-3.3-70b-versatile" }] }), { status: 200 });
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const isGrading = JSON.stringify(body.messages).includes("expert teacher grading");
      if (isGrading) {
        const items = JSON.parse(String(body.messages[1].content).match(/Items:\s*(\[[\s\S]*\])/)?.[1] ?? "[]");
        // For test, return perfect for q1, partial for q2, wrong for q3, etc.
        const results = items.map((it: { questionId: string; maxScore: number }) => {
          if (it.questionId === "q1") return { questionId: "q1", score: 2, maxScore: 2, isCorrect: true, feedback: "Perfect! You correctly identified Paris." };
          if (it.questionId === "q2") return { questionId: "q2", score: 3, maxScore: 5, isCorrect: "partial", feedback: "Good start on Newton's laws, but you missed the second law. Keep practicing!" };
          if (it.questionId === "q3") return { questionId: "q3", score: 0, maxScore: 3, isCorrect: false, feedback: "Incorrect — photosynthesis is not what you described. Review the chapter." };
          if (it.questionId === "q11a") return { questionId: "q11a", score: 2, maxScore: 3, isCorrect: "partial", feedback: "Partially correct — you mentioned chloroplast but missed its structure." };
          return { questionId: it.questionId, score: 0, maxScore: it.maxScore, isCorrect: false, feedback: "Not graded" };
        });
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(results) } }], usage: {} }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([]) } }], usage: {} }), { status: 200 });
    }
    return (origFetch as unknown as typeof fetch)(input, init);
  };

  const grading = await grade(qs, as, mappings, `test-grade-${Date.now()}`);
  (global as unknown as { fetch: typeof fetch }).fetch = origFetch as unknown as typeof fetch;

  console.log("grading", grading);

  // Check unanswered
  const g_q4 = grading.find((g) => g.questionId === "q4");
  assert(!!g_q4 && g_q4.score === 0 && g_q4.isCorrect === false && g_q4.feedback === "Not attempted.", "q4 unanswered");
  const g_q11b = grading.find((g) => g.questionId === "q11b");
  assert(!!g_q11b && g_q11b.feedback === "Not attempted.", "q11b unanswered");

  // Check tiers
  const g_q1 = grading.find((g) => g.questionId === "q1");
  assert(g_q1?.isCorrect === true && g_q1?.score === 2, "q1 perfect true");
  const g_q2 = grading.find((g) => g.questionId === "q2");
  assert(g_q2?.isCorrect === "partial", "q2 partial");
  const g_q3 = grading.find((g) => g.questionId === "q3");
  assert(g_q3?.isCorrect === false && g_q3?.score === 0, "q3 wrong false");

  // Clamp test: ensure score not exceed max
  for (const g of grading) assert(g.score >= 0 && g.score <= g.maxScore, `score clamp ${g.questionId}`);

  // Totals
  const { earned, possible } = gradeHelpers.computeTotals(grading);
  console.log(`totals earned=${earned} possible=${possible}`);
  assert(possible > 0, "possible >0");
  // Check that totals helper works

  console.log("grading PASS");
}

async function testTierClamp() {
  console.log("=== tier/clamp unit ===");
  assert(gradeHelpers.clampScore(10, 5) === 5, "clamp high");
  assert(gradeHelpers.clampScore(-1, 5) === 0, "clamp low");
  assert(gradeHelpers.clampScore(2.6, 5) === 3, "round");
  assert(gradeHelpers.tierIsCorrect(5, 5) === true, "tier true");
  assert(gradeHelpers.tierIsCorrect(4, 5) === true, "tier 0.8 true");
  assert(gradeHelpers.tierIsCorrect(0, 5) === false, "tier false");
  assert(gradeHelpers.tierIsCorrect(2, 5) === "partial", "tier partial");
  console.log("tier/clamp PASS");
}

async function run() {
  await testLabelPrePass();
  await testFixtureMapping();
  await testInvariantRepair();
  await testTierClamp();
  await testGrading();
  console.log("\n=== ALL mapping & grading tests PASS ===");
}

run().catch((e) => { console.error("FAIL", e); process.exit(1); });
