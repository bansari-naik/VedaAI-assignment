import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { chatJSON, pickTextModel } from "@/lib/groq";
import { GRADING_SYSTEM_PROMPT, buildGradingUserPrompt } from "./prompts/grading";
import type { ExtractedQuestion, ExtractedAnswerBlock, QuestionAnswerMapping, GradingResult } from "@/types";

const DEFAULT_MAX = 5;
const BATCH_SIZE = 5;

function clampScore(score: number, maxScore: number): number {
  if (!Number.isFinite(score)) return 0;
  const s = Math.round(score);
  return Math.max(0, Math.min(maxScore, s));
}

function tierIsCorrect(score: number, maxScore: number): boolean | "partial" {
  if (maxScore <= 0) return score > 0 ? true : false;
  const ratio = score / maxScore;
  if (ratio >= 0.8) return true;
  if (score === 0) return false;
  return "partial";
}

function defaultMax(q: ExtractedQuestion): number {
  return typeof q.maxMarks === "number" && Number.isFinite(q.maxMarks) && q.maxMarks > 0 ? q.maxMarks : DEFAULT_MAX;
}

export function computeTotals(grading: GradingResult[]): { earned: number; possible: number } {
  let earned = 0, possible = 0;
  for (const g of grading) {
    earned += g.score;
    possible += g.maxScore;
  }
  return { earned, possible };
}

export async function grade(
  questions: ExtractedQuestion[],
  answers: ExtractedAnswerBlock[],
  mappings: QuestionAnswerMapping[],
  sessionId?: string
): Promise<GradingResult[]> {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const aById = new Map(answers.map((a) => [a.id, a]));

  const matched = mappings.filter((m) => m.status === "matched" && m.questionId && m.answerBlockId);
  const unansweredQs = mappings.filter((m) => m.status === "unanswered" && m.questionId);

  console.log(`[grade] start matched=${matched.length} unanswered=${unansweredQs.length} totalQ=${questions.length}`);

  // Auto-fill unanswered grades
  const results: GradingResult[] = [];
  for (const m of unansweredQs) {
    const q = qById.get(m.questionId as string);
    if (!q) continue;
    const maxScore = defaultMax(q);
    results.push({
      questionId: q.id,
      score: 0,
      maxScore,
      isCorrect: false,
      feedback: "Not attempted.",
    });
  }

  if (matched.length === 0) {
    console.log("[grade] no matched to grade, returning unanswered only");
    if (sessionId) {
      const dir = path.join(os.tmpdir(), "vedaai", sessionId, "debug");
      await fs.mkdir(dir, { recursive: true }).catch(() => {});
      await fs.writeFile(path.join(dir, "grading.json"), JSON.stringify(results, null, 2)).catch(() => {});
    }
    return results;
  }

  // Prepare items for LLM
  const items = matched.map((m) => {
    const q = qById.get(m.questionId as string)!;
    const a = aById.get(m.answerBlockId as string)!;
    return {
      questionId: q.id,
      questionText: q.text,
      maxScore: defaultMax(q),
      answerText: a.rawText.slice(0, 2000),
    };
  });

  const model = await pickTextModel().catch(() => "llama-3.3-70b-versatile");
  console.log(`[grade] LLM grading model=${model} batches=${Math.ceil(items.length / BATCH_SIZE)}`);

  const batches: GradingResult[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const messages = [
      { role: "system" as const, content: GRADING_SYSTEM_PROMPT },
      { role: "user" as const, content: buildGradingUserPrompt(batch) },
    ];
    console.log(`[grade] batch ${Math.floor(i / BATCH_SIZE) + 1} size=${batch.length}`);
    try {
      const { data, raw } = await chatJSON<GradingResult[] | { results: GradingResult[] }>(messages, {
        model,
        temperature: 0.3,
      });
      let parsed: GradingResult[] = [];
      if (Array.isArray(data)) parsed = data as GradingResult[];
      else if (data && typeof data === "object" && "results" in (data as Record<string, unknown>)) parsed = (data as { results: GradingResult[] }).results ?? [];
      console.log(`[grade] batch ${Math.floor(i / BATCH_SIZE) + 1} parsed ${parsed.length}`);

      // Validate and clamp each
      const validated: GradingResult[] = [];
      for (const r of parsed) {
        const q = qById.get(r.questionId);
        if (!q) {
          console.warn(`[grade] unknown questionId ${r.questionId} → dropping`);
          continue;
        }
        const maxScore = defaultMax(q);
        const score = clampScore(r.score, maxScore);
        const isCorrect = tierIsCorrect(score, maxScore);
        // Feedback should be 1–3 sentences, but we trust LLM; clamp length?
        let feedback = typeof r.feedback === "string" ? r.feedback.trim() : "";
        if (!feedback) feedback = score === maxScore ? "Great job!" : score === 0 ? "Needs improvement. Review the topic." : "Partially correct — good effort, check details.";
        // Ensure feedback is not too long (optional truncate)
        validated.push({
          questionId: r.questionId,
          score,
          maxScore,
          isCorrect,
          feedback,
        });
      }
      batches.push(validated);

      if (sessionId) {
        const dir = path.join(os.tmpdir(), "vedaai", sessionId, "debug");
        await fs.mkdir(dir, { recursive: true }).catch(() => {});
        await fs.writeFile(path.join(dir, `grading-batch-${Math.floor(i / BATCH_SIZE) + 1}.json`), JSON.stringify({ raw, parsed: validated }, null, 2)).catch(() => {});
      }
    } catch (e) {
      console.warn(`[grade] batch ${Math.floor(i / BATCH_SIZE) + 1} failed ${(e as Error).message} — falling back to per-item`);
      // Fallback per-item for this batch
      for (const item of batch) {
        const singleMessages = [
          { role: "system" as const, content: GRADING_SYSTEM_PROMPT },
          { role: "user" as const, content: buildGradingUserPrompt([item]) },
        ];
        try {
          const { data } = await chatJSON<GradingResult[] | { results: GradingResult[] }>(singleMessages, { model, temperature: 0.3 });
          let parsed: GradingResult[] = [];
          if (Array.isArray(data)) parsed = data as GradingResult[];
          else if (data && typeof data === "object" && "results" in (data as Record<string, unknown>)) parsed = (data as { results: GradingResult[] }).results ?? [];
          for (const r of parsed) {
            const q = qById.get(r.questionId);
            if (!q) continue;
            const maxScore = defaultMax(q);
            const score = clampScore(r.score, maxScore);
            const isCorrect = tierIsCorrect(score, maxScore);
            batches.push([{
              questionId: r.questionId,
              score,
              maxScore,
              isCorrect,
              feedback: (r.feedback ?? "").toString().trim() || "Graded.",
            }]);
          }
        } catch (perErr) {
          console.warn(`[grade] per-item fallback also failed for ${item.questionId}: ${(perErr as Error).message}`);
          const q = qById.get(item.questionId)!;
          const maxScore = defaultMax(q);
          // Heuristic fallback: give 0 with feedback
          batches.push([{
            questionId: item.questionId,
            score: 0,
            maxScore,
            isCorrect: false,
            feedback: "Unable to grade — please review manually.",
          }]);
        }
      }
    }
  }

  const flat = batches.flat();
  // Ensure every matched question has a grade (if batch missed some, synthesize)
  const gradedQIds = new Set(flat.map((g) => g.questionId));
  for (const m of matched) {
    if (!gradedQIds.has(m.questionId as string)) {
      const q = qById.get(m.questionId as string)!;
      const maxScore = defaultMax(q);
      flat.push({
        questionId: q.id,
        score: 0,
        maxScore,
        isCorrect: false,
        feedback: "Not graded — manual review needed.",
      });
      console.warn(`[grade] synthesized missing grade for ${q.displayNumber}`);
    }
  }

  results.push(...flat);

  // Log grading table
  console.log("[grade] final grading:");
  for (const g of results) {
    const qDisp = qById.get(g.questionId)?.displayNumber ?? g.questionId.slice(0,6);
    console.log(`  Q${qDisp} ${g.score}/${g.maxScore} ${String(g.isCorrect).padEnd(7)} "${g.feedback.slice(0,60)}"`);
  }
  const totals = computeTotals(results);
  console.log(`[grade] totals earned=${totals.earned} possible=${totals.possible}`);

  if (sessionId) {
    const dir = path.join(os.tmpdir(), "vedaai", sessionId, "debug");
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    await fs.writeFile(path.join(dir, "grading-final.json"), JSON.stringify(results, null, 2)).catch(() => {});
  }

  return results;
}

export const _testHelpers = { clampScore, tierIsCorrect, computeTotals, defaultMax };
