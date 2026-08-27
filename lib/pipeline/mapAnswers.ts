import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { chatJSON, pickTextModel } from "@/lib/groq";
import { MAPPING_SYSTEM_PROMPT, buildMappingUserPrompt } from "./prompts/mapping";
import type { ExtractedQuestion, ExtractedAnswerBlock, QuestionAnswerMapping } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCore(s: string): string | null {
  const lower = s.toLowerCase().trim();
  // match number + optional letter + optional (letter)
  // e.g. "11(a)" -> "11(a)", "3" -> "3", "2b" -> "2b", "q11(a)" -> "11(a)"
  const m = lower.match(/(\d+[a-z]?(?:\([a-z]\))?)/i);
  return m ? m[1].toLowerCase() : null;
}

function normalizeForCompare(s: string): string {
  const c = extractCore(s);
  return c ? c.replace(/\s/g, "") : s.toLowerCase().trim();
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Label pre-pass
// ---------------------------------------------------------------------------
export interface PrePassResult {
  mappings: QuestionAnswerMapping[];
  remainingQuestions: ExtractedQuestion[];
  remainingAnswers: ExtractedAnswerBlock[];
}

export function labelPrePass(
  questions: ExtractedQuestion[],
  answers: ExtractedAnswerBlock[]
): PrePassResult {
  const coreToQ = new Map<string, ExtractedQuestion>();
  for (const q of questions) {
    const core = normalizeForCompare(q.displayNumber);
    if (!coreToQ.has(core)) coreToQ.set(core, q);
  }

  const usedQ = new Set<string>();
  const usedA = new Set<string>();
  const mappings: QuestionAnswerMapping[] = [];

  for (const ans of answers) {
    if (!ans.detectedLabel) continue;
    const core = normalizeForCompare(ans.detectedLabel);
    const q = coreToQ.get(core);
    if (q && !usedQ.has(q.id) && !usedA.has(ans.id)) {
      mappings.push({
        questionId: q.id,
        answerBlockId: ans.id,
        status: "matched",
        confidence: 0.95,
      });
      usedQ.add(q.id);
      usedA.add(ans.id);
      console.log(`[mapAnswers] label pre-pass: answer ${ans.id} label="${ans.detectedLabel}" → question ${q.displayNumber} (${q.id})`);
    }
  }

  const remainingQuestions = questions.filter((q) => !usedQ.has(q.id));
  const remainingAnswers = answers.filter((a) => !usedA.has(a.id));

  console.log(`[mapAnswers] pre-pass matched ${mappings.length}, remaining Q=${remainingQuestions.length} A=${remainingAnswers.length}`);
  return { mappings, remainingQuestions, remainingAnswers };
}

// ---------------------------------------------------------------------------
// Repair / invariant enforcement
// ---------------------------------------------------------------------------
export function repairMappings(
  rawMappings: QuestionAnswerMapping[],
  questions: ExtractedQuestion[],
  answers: ExtractedAnswerBlock[]
): QuestionAnswerMapping[] {
  const qIds = new Set(questions.map((q) => q.id));
  const aIds = new Set(answers.map((a) => a.id));

  // Step 1: filter/dedupe and fix statuses
  const seen = new Set<string>();
  const cleaned: QuestionAnswerMapping[] = [];

  for (const m of rawMappings) {
    let { questionId, answerBlockId, confidence } = m;
    const { status } = m;
    confidence = clamp01(confidence);

    // Validate ids
    if (questionId !== null && !qIds.has(questionId)) {
      console.warn(`[mapAnswers] repair: unknown questionId ${questionId} → dropping`);
      continue;
    }
    if (answerBlockId !== null && !aIds.has(answerBlockId)) {
      console.warn(`[mapAnswers] repair: unknown answerBlockId ${answerBlockId} → dropping`);
      continue;
    }

    // Fix status vs ids
    if (status === "matched") {
      if (questionId === null || answerBlockId === null) {
        console.warn(`[mapAnswers] repair: matched with null id → dropping ${JSON.stringify(m)}`);
        continue;
      }
    } else if (status === "unanswered") {
      if (answerBlockId !== null) {
        console.warn(`[mapAnswers] repair: unanswered with answerBlockId not null → fixing to null`);
        answerBlockId = null;
      }
      if (questionId === null) {
        console.warn(`[mapAnswers] repair: unanswered with questionId null → dropping`);
        continue;
      }
    } else if (status === "unmatched_answer") {
      if (questionId !== null) {
        console.warn(`[mapAnswers] repair: unmatched_answer with questionId not null → fixing to null`);
        questionId = null;
      }
      if (answerBlockId === null) {
        console.warn(`[mapAnswers] repair: unmatched_answer with answerBlockId null → dropping`);
        continue;
      }
    } else {
      console.warn(`[mapAnswers] repair: unknown status ${status} → dropping`);
      continue;
    }

    const key = `${questionId ?? "null"}|${answerBlockId ?? "null"}|${status}`;
    if (seen.has(key)) {
      console.warn(`[mapAnswers] repair: duplicate mapping ${key} → dropping`);
      continue;
    }
    seen.add(key);
    cleaned.push({ questionId, answerBlockId, status, confidence });
  }

  // Step 2: ensure every question appears
  const coveredQ = new Set(cleaned.filter((m) => m.questionId !== null).map((m) => m.questionId as string));
  for (const q of questions) {
    if (!coveredQ.has(q.id)) {
      cleaned.push({
        questionId: q.id,
        answerBlockId: null,
        status: "unanswered",
        confidence: 1,
      });
      console.log(`[mapAnswers] repair: synthesized unanswered for question ${q.displayNumber} (${q.id})`);
    }
  }

  // Step 3: ensure every answer appears
  const coveredA = new Set(cleaned.filter((m) => m.answerBlockId !== null).map((m) => m.answerBlockId as string));
  for (const a of answers) {
    if (!coveredA.has(a.id)) {
      cleaned.push({
        questionId: null,
        answerBlockId: a.id,
        status: "unmatched_answer",
        confidence: 0.85,
      });
      console.log(`[mapAnswers] repair: synthesized unmatched_answer for answer ${a.id} label=${a.detectedLabel ?? "-"}`);
    }
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export async function mapAnswers(
  questions: ExtractedQuestion[],
  answers: ExtractedAnswerBlock[],
  sessionId?: string
): Promise<QuestionAnswerMapping[]> {
  if (questions.length === 0 && answers.length === 0) return [];

  // Pre-pass
  const pre = labelPrePass(questions, answers);
  let llmMappings: QuestionAnswerMapping[] = [];

  if (pre.remainingQuestions.length > 0 && pre.remainingAnswers.length > 0) {
    const model = await pickTextModel().catch(() => "llama-3.3-70b-versatile");
    console.log(`[mapAnswers] LLM mapping model=${model} Q=${pre.remainingQuestions.length} A=${pre.remainingAnswers.length}`);

    const qForPrompt = pre.remainingQuestions.map((q) => ({ id: q.id, displayNumber: q.displayNumber, text: q.text }));
    const aForPrompt = pre.remainingAnswers.map((a) => ({ id: a.id, rawText: a.rawText.slice(0, 800), detectedLabel: a.detectedLabel ?? null }));

    const messages = [
      { role: "system" as const, content: MAPPING_SYSTEM_PROMPT },
      { role: "user" as const, content: buildMappingUserPrompt(qForPrompt, aForPrompt) },
    ];

    try {
      const { data, raw } = await chatJSON<QuestionAnswerMapping[] | { mappings: QuestionAnswerMapping[] }>(messages, {
        model,
        temperature: 0.2,
      });
      let parsed: QuestionAnswerMapping[] = [];
      if (Array.isArray(data)) parsed = data as QuestionAnswerMapping[];
      else if (data && typeof data === "object" && "mappings" in (data as Record<string, unknown>)) parsed = (data as { mappings: QuestionAnswerMapping[] }).mappings ?? [];

      console.log(`[mapAnswers] LLM returned ${parsed.length} mappings`);
      // Persist debug
      if (sessionId) {
        const dir = path.join(os.tmpdir(), "vedaai", sessionId, "debug");
        await fs.mkdir(dir, { recursive: true }).catch(() => {});
        await fs.writeFile(path.join(dir, "mapping-llm.json"), JSON.stringify({ raw, parsed }, null, 2)).catch(() => {});
      }
      llmMappings = parsed;
    } catch (e) {
      console.warn(`[mapAnswers] LLM mapping failed ${(e as Error).message} — will rely on repair to synthesize`);
      llmMappings = [];
    }
  } else {
    console.log("[mapAnswers] LLM mapping skipped — pre-pass covered all or one side empty");
  }

  const combined = [...pre.mappings, ...llmMappings];
  console.log(`[mapAnswers] combined ${combined.length} before repair (pre=${pre.mappings.length} llm=${llmMappings.length})`);

  const repaired = repairMappings(combined, questions, answers);

  // Log table
  console.log("[mapAnswers] final mapping table:");
  for (const m of repaired) {
    const qDisp = m.questionId ? questions.find((q) => q.id === m.questionId)?.displayNumber ?? m.questionId.slice(0, 6) : "null";
    const aLabel = m.answerBlockId ? answers.find((a) => a.id === m.answerBlockId)?.detectedLabel ?? m.answerBlockId.slice(0, 6) : "null";
    console.log(`  ${m.status.padEnd(17)} Q=${String(qDisp).padEnd(8)} A=${String(aLabel).padEnd(8)} conf=${m.confidence.toFixed(2)}`);
  }

  if (sessionId) {
    const dir = path.join(os.tmpdir(), "vedaai", sessionId, "debug");
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    await fs.writeFile(path.join(dir, "mapping-final.json"), JSON.stringify(repaired, null, 2)).catch(() => {});
  }

  return repaired;
}

// For tests
export const _testHelpers = { extractCore, normalizeForCompare, clamp01 };
