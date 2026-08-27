import { _testHelpers, chatJSON } from "../lib/groq";

async function testStrip() {
  console.log("=== test stripCodeFences ===");
  const cases: Array<[string,string]> = [
    ["```json\n[{\"a\":1}]```", '[{"a":1}]'],
    ["```\n{\"x\":2}\n```", '{"x":2}'],
    ['  {"y":3}  ', '{"y":3}'],
  ];
  for (const [inp, exp] of cases) {
    const out = _testHelpers.stripCodeFences(inp);
    if (out !== exp) throw new Error(`strip failed: got ${out} exp ${exp}`);
  }
  console.log("strip PASS");
}

async function testFencedParsing() {
  console.log("=== test chatJSON with fenced JSON ===");
  process.env.GROQ_API_KEY = "mock-key";
  const orig = global.fetch;
  let called = 0;
  (global as unknown as { fetch: typeof fetch }).fetch = async () => {
    called++;
    return new Response(JSON.stringify({ choices: [{ message: { content: "```json\n[{\"displayNumber\":\"1\",\"text\":\"Q1\",\"sourcePage\":1}]```" } }], usage: {} }), { status: 200 });
  };
  try {
    const res = await chatJSON([{ role: "user", content: "hi" }], { model: "mock-model" });
    if (!Array.isArray(res.data) || (res.data as unknown[]).length !== 1) throw new Error("fenced parse failed");
    console.log("fenced parsing PASS", res.data);
  } finally { global.fetch = orig; }
  if (called !== 1) throw new Error("fetch count wrong");
}

async function testMalformedRecovery() {
  console.log("=== test malformed LLM recovery (truncated JSON) ===");
  process.env.GROQ_API_KEY = "mock-key";
  const orig = global.fetch;
  let call = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (global as unknown as { fetch: typeof fetch }).fetch = async (_url: RequestInfo | URL, _init?: RequestInit) => {
    call++;
    if (call === 1) {
      // first response is truncated invalid JSON
      return new Response(JSON.stringify({ choices: [{ message: { content: '[{"displayNumber":"1","text":"Q' } }], usage: {} }), { status: 200 });
    } else {
      // second is fix re-ask response — valid JSON
      return new Response(JSON.stringify({ choices: [{ message: { content: '[{"displayNumber":"1","text":"Q1 fixed","sourcePage":1}]' } }], usage: {} }), { status: 200 });
    }
  };
  try {
    const res = await chatJSON([{ role: "user", content: "hi" }], { model: "mock-model" });
    console.log("malformed recovery PASS", res.data);
    if (call !== 2) throw new Error(`expected 2 calls got ${call}`);
  } finally { global.fetch = orig; }
}

async function test429Retry() {
  console.log("=== test 429 backoff retry ===");
  process.env.GROQ_API_KEY = "mock-key";
  const orig = global.fetch;
  let call = 0;
  (global as unknown as { fetch: typeof fetch }).fetch = async () => {
    call++;
    if (call === 1) {
      return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: {} }), { status: 200 });
  };
  try {
    const start = Date.now();
    const res = await chatJSON<{ok:boolean}>([{ role: "user", content: "hi" }], { model: "mock-model", maxRetries: 1 });
    const elapsed = Date.now() - start;
    console.log(`429 retry PASS elapsed=${elapsed}ms data=`, res.data);
    if (!res.data.ok) throw new Error("429 retry data wrong");
    if (call !== 2) throw new Error("expected 2 calls for 429");
  } finally { global.fetch = orig; }
}

async function run() {
  await testStrip();
  await testFencedParsing();
  await testMalformedRecovery();
  await test429Retry();
  console.log("\n=== ALL groq helper tests PASS ===");
}

run().catch((e)=>{ console.error("FAIL", e); process.exit(1); });
