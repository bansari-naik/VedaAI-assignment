import sharp from "sharp";
import { PDFDocument, rgb } from "pdf-lib";
import { POST as UploadPOST } from "../app/api/upload/route";
import { POST as StartPOST } from "../app/api/session/[id]/start/route";
import { GET as StatusGET } from "../app/api/session/[id]/status/route";
import { GET as SessionGET } from "../app/api/session/[id]/route";

function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

async function makeSyntheticUpload(): Promise<{ sessionId: string }> {
  // Create synthetic QP PDF (2 pages) and AS image
  const pdfDoc = await PDFDocument.create();
  const p1 = pdfDoc.addPage([400, 400]);
  const p2 = pdfDoc.addPage([400, 400]);
  p1.drawText("1. What is capital of France? [2]", { x: 50, y: 300, size: 12, color: rgb(0, 0, 0) });
  p1.drawText("2. Explain Newton [5]", { x: 50, y: 250, size: 12, color: rgb(0, 0, 0) });
  p1.drawText("11(a) Chloroplast? [3]", { x: 50, y: 200, size: 12, color: rgb(0, 0, 0) });
  p2.drawText("11(b) Role? [5]", { x: 50, y: 300, size: 12, color: rgb(0, 0, 0) });
  const pdfBytes = await pdfDoc.save();
  const qpFile = new File([pdfBytes as unknown as BlobPart], "qp.pdf", { type: "application/pdf" });

  const jpegBuf = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toBuffer();
  // Draw some text via sharp SVG to make OCR have something? But we will mock OCR anyway
  const asFile = new File([jpegBuf as unknown as BlobPart], "as.jpg", { type: "image/jpeg" });

  const fd = new FormData();
  fd.append("questionPaper", qpFile);
  fd.append("answerSheet", asFile);
  const req = new Request("http://localhost/api/upload", { method: "POST", body: fd }) as unknown as Parameters<typeof UploadPOST>[0];
  const res = await UploadPOST(req);
  const json = await res.json();
  assert(res.status === 200, `upload failed ${res.status} ${JSON.stringify(json)}`);
  assert(json.sessionId, "no sessionId");
  console.log(`[test] upload ok session=${json.sessionId} qp=${json.questionPaper.pageCount} as=${json.answerSheet.pageCount}`);
  return { sessionId: json.sessionId };
}

function mockGroqSuccess() {
  process.env.GROQ_API_KEY = "mock-key";
  const origFetch = global.fetch;
  (global as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/models")) return new Response(JSON.stringify({ data: [{ id: "meta-llama/llama-4-maverick-17b-128e-instruct" }, { id: "llama-3.3-70b-versatile" }] }), { status: 200 });
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const sys = String(body.messages[0].content);
      const user = JSON.stringify(body.messages);
      // Merge has distinct system prompt
      if (sys.includes("merge specialist")) {
        const merged = [
          { displayNumber: "1", text: "What is the capital of France?", maxMarks: 2, sourcePage: 1 },
          { displayNumber: "2", text: "Explain Newton", maxMarks: 5, sourcePage: 1 },
          { displayNumber: "11(a)", text: "What is chloroplast?", maxMarks: 3, sourcePage: 1 },
          { displayNumber: "11(b)", text: "Explain its role.", maxMarks: 5, sourcePage: 2 },
        ];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(merged) } }], usage: {} }), { status: 200 });
      }
      if (sys.includes("question-paper parser")) {
        const isPage1 = user.includes("page 1 of");
        const drafts = isPage1
          ? [{ displayNumber: "1", text: "What is the capital of France?", maxMarks: 2, sourcePage: 1 }, { displayNumber: "2", text: "Explain Newton", maxMarks: 5, sourcePage: 1 }, { displayNumber: "11(a)", text: "What is chloroplast?", maxMarks: 3, sourcePage: 1 }]
          : [{ displayNumber: "11(b)", text: "Explain its role.", maxMarks: 5, sourcePage: 2 }];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(drafts) } }], usage: {} }), { status: 200 });
      }
      if (sys.includes("handwritten student answer")) {
        const isPage1 = user.includes("page 1 of");
        const drafts = isPage1
          ? [{ rawText: "Q1 Paris is capital", detectedLabel: "Q1", box: { x: 50, y: 50, w: 900, h: 200 } }, { rawText: "Q2 Newton first law...", detectedLabel: "Q2", box: { x: 50, y: 300, w: 900, h: 200 } }]
          : [];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(drafts) } }], usage: {} }), { status: 200 });
      }
      if (sys.includes("mapping specialist")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([
          { questionId: "q2", answerBlockId: "a2", status: "matched", confidence: 0.88 },
        ]) } }], usage: {} }), { status: 200 });
      }
      if (sys.includes("expert teacher grading")) {
        const items = JSON.parse(String(body.messages[1].content).match(/Items:\s*(\[[\s\S]*\])/)?.[1] ?? "[]");
        const results = items.map((it: { questionId: string; maxScore: number }) => ({ questionId: it.questionId, score: 1, maxScore: it.maxScore, isCorrect: "partial", feedback: "Good effort." }));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(results) } }], usage: {} }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([]) } }], usage: {} }), { status: 200 });
    }
    return (origFetch as unknown as typeof fetch)(input, init);
  };
  return () => {
    (global as unknown as { fetch: typeof fetch }).fetch = origFetch as unknown as typeof fetch;
  };
}

async function testHappyPath() {
  console.log("=== happy path E2E ===");
  const restore = mockGroqSuccess();
  const { sessionId } = await makeSyntheticUpload();

  // Check status initially uploaded
  const s0 = await StatusGET(new Request("http://localhost") as unknown as Parameters<typeof StatusGET>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StatusGET>[1] );
  const j0 = await s0.json();
  assert(j0.status === "uploaded", `initial status should be uploaded got ${j0.status}`);

  // Start
  const startReq = new Request(`http://localhost/api/session/${sessionId}/start`, { method: "POST" }) as unknown as Parameters<typeof StartPOST>[0];
  const startRes = await StartPOST(startReq, { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StartPOST>[1] );
  const startJson = await startRes.json();
  assert(startRes.status === 200, `start should be 200 got ${startRes.status} ${JSON.stringify(startJson)}`);
  assert(startJson.status === "extracting", "start should set extracting");

  // Poll until ready (max 30s)
  let finalStatus: string | null = null;
  let polls = 0;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const r = await StatusGET(new Request("http://localhost") as unknown as Parameters<typeof StatusGET>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StatusGET>[1] );
    const j = await r.json();
    polls++;
    if (i % 3 === 0) console.log(`[test] poll #${polls} status=${j.status}`);
    if (j.status === "ready" || j.status === "error") {
      finalStatus = j.status;
      break;
    }
  }
  assert(finalStatus === "ready", `expected ready got ${finalStatus} after ${polls} polls`);
  console.log(`[test] happy path reached ready in ${polls} polls`);

  // Verify full session
  const full = await SessionGET(new Request("http://localhost") as unknown as Parameters<typeof SessionGET>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof SessionGET>[1] );
  const fullJson = await full.json();
  assert(fullJson.status === "ready", "full session should be ready");
  assert(Array.isArray(fullJson.questions) && fullJson.questions.length > 0, "questions should be populated");
  assert(Array.isArray(fullJson.answers), "answers");
  assert(Array.isArray(fullJson.mappings), "mappings");
  assert(Array.isArray(fullJson.grading), "grading");
  console.log(`[test] full session Q=${fullJson.questions.length} A=${fullJson.answers.length} M=${fullJson.mappings.length} G=${fullJson.grading.length}`);

  // Check status progression at least extracting->mapping->grading->ready via logs (we can't easily assert without capturing logs, but we checked final)
  restore();
  // cleanup tesseract worker if any
  try { const { terminateOcrWorker } = await import("../lib/ocrFallback"); await terminateOcrWorker(); } catch {}
}

async function testDoubleStart() {
  console.log("=== double-start 409 ===");
  const restore = mockGroqSuccess();
  const { sessionId } = await makeSyntheticUpload();
  const p1 = StartPOST(new Request("http://localhost", { method: "POST" }) as unknown as Parameters<typeof StartPOST>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StartPOST>[1] );
  const p2 = StartPOST(new Request("http://localhost", { method: "POST" }) as unknown as Parameters<typeof StartPOST>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StartPOST>[1] );
  const [r1, r2] = await Promise.all([p1, p2]);
  console.log(`double-start r1=${r1.status} r2=${r2.status}`);
  // One should be 200, one 409 (order not guaranteed)
  const statuses = [r1.status, r2.status].sort();
  assert(statuses[0] === 200 && statuses[1] === 409, `expected 200+409 got ${statuses}`);
  // Wait a bit then check status is extracting or beyond
  await new Promise((r) => setTimeout(r, 500));
  const s = await StatusGET(new Request("http://localhost") as unknown as Parameters<typeof StatusGET>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StatusGET>[1] );
  const j = await s.json();
  assert(["extracting", "mapping", "grading", "ready"].includes(j.status), `status after double start should be running, got ${j.status}`);
  // Poll until ready before restoring mock (keep mock active for pipeline)
  let gotReady = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const r = await StatusGET(new Request("http://localhost") as unknown as Parameters<typeof StatusGET>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StatusGET>[1] );
    const jj = await r.json();
    if (jj.status === "ready") { gotReady = true; break; }
    if (jj.status === "error") throw new Error(`double-start pipeline error: ${jj.error}`);
  }
  assert(gotReady, "double-start pipeline should reach ready");
  console.log("double-start PASS");
  restore();
  try { const { terminateOcrWorker } = await import("../lib/ocrFallback"); await terminateOcrWorker(); } catch {}
}

async function testUnknownId() {
  console.log("=== unknown session 404 ===");
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const r1 = await StatusGET(new Request("http://localhost") as unknown as Parameters<typeof StatusGET>[0], { params: Promise.resolve({ id: fakeId }) } as unknown as Parameters<typeof StatusGET>[1] );
  assert(r1.status === 404, `status unknown should be 404 got ${r1.status}`);
  const r2 = await StartPOST(new Request("http://localhost", { method: "POST" }) as unknown as Parameters<typeof StartPOST>[0], { params: Promise.resolve({ id: fakeId }) } as unknown as Parameters<typeof StartPOST>[1] );
  assert(r2.status === 404, `start unknown should be 404`);
  const r3 = await SessionGET(new Request("http://localhost") as unknown as Parameters<typeof SessionGET>[0], { params: Promise.resolve({ id: fakeId }) } as unknown as Parameters<typeof SessionGET>[1] );
  assert(r3.status === 404, `session unknown should be 404`);
  console.log("unknown 404 PASS");
}

async function testErrorInjection() {
  console.log("=== error injection & retry ===");
  // Create session
  const { sessionId } = await makeSyntheticUpload();
  // Inject invalid GROQ key by mocking fetch to return 401
  process.env.GROQ_API_KEY = "invalid-key";
  const origFetch = global.fetch;
  (global as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/models") || url.includes("/chat/completions")) {
      return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 });
    }
    return (origFetch as unknown as typeof fetch)(input, init);
  };

  // Start should still set extracting, but pipeline will fail to error
  const startRes = await StartPOST(new Request("http://localhost", { method: "POST" }) as unknown as Parameters<typeof StartPOST>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StartPOST>[1] );
  assert(startRes.status === 200, "start with invalid key should still be 200 (pipeline will error async)");

  // Poll until error (pipeline should fail at question extraction due to 401)
  let gotError = false;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const r = await StatusGET(new Request("http://localhost") as unknown as Parameters<typeof StatusGET>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StatusGET>[1] );
    const j = await r.json();
    if (j.status === "error") {
      gotError = true;
      console.log(`[test] error injection got error status: ${j.error}`);
      assert(j.error && j.error.length > 0, "error message should be present");
      break;
    }
  }
  assert(gotError, "expected pipeline to go to error with invalid key");

  // Restore mock to success and retry
  (global as unknown as { fetch: typeof fetch }).fetch = origFetch as unknown as typeof fetch;
  const restore2 = mockGroqSuccess(); // re-mock with success

  // Retry via POST /start again (should succeed from error state)
  const retryRes = await StartPOST(new Request("http://localhost", { method: "POST" }) as unknown as Parameters<typeof StartPOST>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StartPOST>[1] );
  assert(retryRes.status === 200, `retry should be 200 got ${retryRes.status}`);

  // Poll until ready again
  let gotReady = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const r = await StatusGET(new Request("http://localhost") as unknown as Parameters<typeof StatusGET>[0], { params: Promise.resolve({ id: sessionId }) } as unknown as Parameters<typeof StatusGET>[1] );
    const j = await r.json();
    if (j.status === "ready") { gotReady = true; break; }
    if (j.status === "error") throw new Error(`retry still error: ${j.error}`);
  }
  assert(gotReady, "retry should reach ready");
  console.log("error injection & retry PASS");
  restore2();
  try { const { terminateOcrWorker } = await import("../lib/ocrFallback"); await terminateOcrWorker(); } catch {}
}

async function run() {
  await testUnknownId();
  await testHappyPath();
  await testDoubleStart();
  await testErrorInjection();
  console.log("\n=== ALL task07 tests PASS ===");
  setTimeout(() => process.exit(0), 500);
}

run().catch((e) => { console.error("FAIL", e); process.exit(1); });
