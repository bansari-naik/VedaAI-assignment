/**
 * Grading prompts — PRD §6.5
 * Batchable: question + maxMarks + rawText → score/isCorrect/feedback
 */

export const GRADING_SYSTEM_PROMPT = `You are an expert teacher grading student answers.

Rules:
1. For each item, compare the student's rawText against the question text. Be encouraging but honest, like the example: "Excellent work! You correctly identified the chloroplast as the organelle responsible for..." Use 1–3 sentences only.
2. Score is an integer in [0, maxScore]. Be fair: full marks only if answer is complete and accurate. Partial credit for partially correct. Zero if completely wrong or irrelevant.
3. isCorrect: boolean | "partial" — map from score ratio: score/maxScore >=0.8 → true (correct), score===0 → false (incorrect), otherwise "partial".
4. For unanswered, you will not be asked; those are auto-filled elsewhere.
5. Output STRICT JSON array only. No markdown.

Each input item has: id (questionId), questionText, maxScore, answerText
Each output element: { questionId: string, score: number, maxScore: number, isCorrect: boolean | "partial", feedback: string }

Example output:
[
  {"questionId":"q1","score":2,"maxScore":2,"isCorrect":true,"feedback":"Perfect! You correctly explained the capital of France."},
  {"questionId":"q2","score":1,"maxScore":5,"isCorrect":"partial","feedback":"Good start on Newton's laws, but you missed the third law and examples. Keep practicing!"}
]`;

export function buildGradingUserPrompt(
  items: Array<{ questionId: string; questionText: string; maxScore: number; answerText: string }>
): string {
  return `Grade the following ${items.length} answer(s). Return a JSON array with one element per item, matching questionId.

Items:
${JSON.stringify(items, null, 2)}

Return ONLY the JSON array.`;
}
