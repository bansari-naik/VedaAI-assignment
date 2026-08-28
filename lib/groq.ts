/**
 * Groq client — strict JSON + retries + model discovery
 * PRD §4 mandates querying /models at implementation time to pick vision model.
 * Fallback pinned: llama models available as of 2026-08 on Groq.
 */

const GROQ_BASE = "https://api.groq.com/openai/v1";

// Priority lists — queried against /models to pick first available.
// Vision-capable models on Groq (Scout/Maverick + legacy vision preview)
// Updated 2026-08-28: Groq catalog now serves qwen vision (blocked on this org) + gpt-oss for text.
// Keep qwen at top for vision when enabled, fallback to llama for legacy.
export const VISION_MODEL_PRIORITY = [
  "qwen/qwen3.8-27b",
  "qwen/qwen3.6-27b",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
];

// Fast text models for merge/mapping/grading reasoning
// Updated 2026-08-28: gpt-oss models are the only reliably available text models on this Groq org.
export const TEXT_MODEL_PRIORITY = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "groq/compound",
  "groq/compound-mini",
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
  "llama3-70b-8192",
  "llama3-8b-8192",
];

export const DEFAULT_VISION_MODEL = VISION_MODEL_PRIORITY[0];
export const DEFAULT_TEXT_MODEL = TEXT_MODEL_PRIORITY[0];

function getApiKey(): string {
  const k = process.env.GROQ_API_KEY;
  if (!k || k === "your_groq_api_key_here" || k.trim() === "") {
    throw new Error(
      "GROQ_API_KEY is missing. Set it in .env.local (see .env.example). Get a key at https://console.groq.com/keys"
    );
  }
  return k;
}

// ---------------------------------------------------------------------------
// Model discovery: query /models and pick first available from priority list
// ---------------------------------------------------------------------------
let cachedVisionModel: string | null = null;
let cachedTextModel: string | null = null;
let cachedModels: string[] | null = null;

export async function fetchGroqModels(): Promise<string[]> {
  if (cachedModels) return cachedModels;
  const key = getApiKey();
  const res = await fetch(`${GROQ_BASE}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn(`[groq] /models fetch failed ${res.status}: ${txt.slice(0,200)} — using fallback lists`);
    cachedModels = [];
    return cachedModels;
  }
  const data = (await res.json()) as { data?: { id: string }[] };
  const ids = (data.data ?? []).map((m) => m.id);
  cachedModels = ids;
  console.log(`[groq] discovered ${ids.length} models`, ids.slice(0,10));
  return ids;
}

export async function pickVisionModel(): Promise<string> {
  if (cachedVisionModel) return cachedVisionModel;
  const available = await fetchGroqModels().catch(() => [] as string[]);
  for (const cand of VISION_MODEL_PRIORITY) {
    if (available.length === 0 || available.includes(cand)) {
      // if /models failed, just pick first priority as fallback
      cachedVisionModel = cand;
      console.log(`[groq] picked vision model: ${cand}`);
      return cand;
    }
  }
  cachedVisionModel = DEFAULT_VISION_MODEL;
  return cachedVisionModel;
}

export async function pickTextModel(): Promise<string> {
  if (cachedTextModel) return cachedTextModel;
  const available = await fetchGroqModels().catch(() => [] as string[]);
  for (const cand of TEXT_MODEL_PRIORITY) {
    if (available.length === 0 || available.includes(cand)) {
      cachedTextModel = cand;
      console.log(`[groq] picked text model: ${cand}`);
      return cand;
    }
  }
  cachedTextModel = DEFAULT_TEXT_MODEL;
  return cachedTextModel;
}

// For tests / sync callers that don't want async discovery
export function getVisionModelSync(): string {
  return cachedVisionModel ?? DEFAULT_VISION_MODEL;
}
export function getTextModelSync(): string {
  return cachedTextModel ?? DEFAULT_TEXT_MODEL;
}

// ---------------------------------------------------------------------------
// chatJSON — strict JSON with fence-stripping + single re-ask on parse fail
// + exponential backoff retry on 429/5xx
// ---------------------------------------------------------------------------
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export interface ChatJSONOptions {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number; // for 429/5xx backoff, default 1 retry
}

function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  // ```json ... ``` or ``` ... ```
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) return fence[1].trim();
  return trimmed;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function chatJSON<T>(
  messages: ChatMessage[],
  opts: ChatJSONOptions = {}
): Promise<{ data: T; raw: string; model: string; latencyMs: number; usage?: unknown }> {
  const apiKey = getApiKey();
  const model = opts.model ?? (await pickTextModel().catch(() => DEFAULT_TEXT_MODEL));
  const temperature = opts.temperature ?? 0.2;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxRetries = opts.maxRetries ?? 1;

  const body = {
    model,
    messages,
    temperature,
    response_format: { type: "json_object" as const },
  };

  let lastError: Error | null = null;
  let attempt = 0;

  // Outer retry for 429/5xx transport errors
  while (attempt <= maxRetries) {
    const start = Date.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(t);
      lastError = e as Error;
      if (attempt < maxRetries) {
        const backoff = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`[groq] fetch exception attempt ${attempt + 1}/${maxRetries + 1}: ${lastError.message} — backoff ${Math.round(backoff)}ms`);
        await sleep(backoff);
        attempt++;
        continue;
      }
      throw lastError;
    }
    clearTimeout(t);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const isRetryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      console.warn(`[groq] ${model} HTTP ${res.status} ${txt.slice(0,500)}`);
      if (isRetryable && attempt < maxRetries) {
        const backoff = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        // Respect Retry-After if present
        const ra = res.headers.get("retry-after");
        const raMs = ra ? parseInt(ra, 10) * 1000 : 0;
        const wait = raMs > 0 ? raMs : backoff;
        console.warn(`[groq] retryable ${res.status}, backoff ${Math.round(wait)}ms`);
        await sleep(wait);
        attempt++;
        continue;
      }
      throw new Error(`Groq chat failed ${res.status}: ${txt.slice(0,800)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: unknown;
    };
    const rawContent = json.choices?.[0]?.message?.content ?? "";
    const latencyMs = Date.now() - start;
    const usage = json.usage;
    console.log(`[groq] ${model} ok latency=${latencyMs}ms rawLen=${rawContent.length} usage=${JSON.stringify(usage ?? {})}`);

    // Try parse with fence-stripping
    const stripped = stripCodeFences(rawContent);
    try {
      const data = JSON.parse(stripped) as T;
      return { data, raw: rawContent, model, latencyMs, usage };
    } catch (parseErr) {
      const perr = parseErr as Error;
      console.warn(`[groq] JSON parse failed for ${model}: ${perr.message} — raw head: ${rawContent.slice(0,200).replace(/\n/g," ")}`);
      // Single re-ask with error appended (recovery path)
      if (attempt === 0) {
        const fixMessages: ChatMessage[] = [
          ...messages,
          { role: "assistant", content: rawContent },
          {
            role: "user",
            content: `Your previous output was not valid JSON. Parse error: ${perr.message}. The raw output (first 800 chars) was: ${rawContent.slice(0,800)}. Please output ONLY valid JSON matching the requested schema. No markdown, no code fences, no explanation.`,
          },
        ];
        // Recursive single retry for parse fix — avoid infinite loop by bumping attempt
        // We do it by re-entering the outer loop with fixMessages
        // Instead of recursion, just re-assign messages and continue loop once
        // To keep simple, perform one immediate re-call without backoff increment
        const fixStart = Date.now();
        const fixController = new AbortController();
        const fixTimer = setTimeout(() => fixController.abort(), timeoutMs);
        try {
          const fixRes = await fetch(`${GROQ_BASE}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: fixMessages, temperature: 0.1, response_format: { type: "json_object" } }),
            signal: fixController.signal,
          });
          clearTimeout(fixTimer);
          if (!fixRes.ok) {
            const ftxt = await fixRes.text().catch(() => "");
            throw new Error(`Fix re-ask failed ${fixRes.status}: ${ftxt.slice(0,500)}`);
          }
          const fixJson = (await fixRes.json()) as { choices?: { message?: { content?: string } }[]; usage?: unknown };
          const fixRaw = fixJson.choices?.[0]?.message?.content ?? "";
          const fixStripped = stripCodeFences(fixRaw);
          const fixData = JSON.parse(fixStripped) as T;
          const fixLatency = Date.now() - fixStart;
          console.log(`[groq] ${model} fix re-ask ok latency=${fixLatency}ms rawLen=${fixRaw.length}`);
          return { data: fixData, raw: fixRaw, model, latencyMs: fixLatency, usage: fixJson.usage };
        } catch (fixErr) {
          clearTimeout(fixTimer);
          console.error(`[groq] fix re-ask failed: ${(fixErr as Error).message}`);
          // Fall through to throw original parse error
          throw new Error(`JSON parse failed after re-ask: ${perr.message} — raw: ${rawContent.slice(0,500)}`);
        }
      }
      throw new Error(`JSON parse failed: ${perr.message} — raw: ${rawContent.slice(0,500)}`);
    }
  }

  throw lastError ?? new Error("chatJSON exhausted retries");
}

// Export helper for tests to unit-test fence stripping
export const _testHelpers = { stripCodeFences };
