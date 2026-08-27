"use client";

import { useState } from "react";
import QuestionRow from "./QuestionRow";
import type { ExtractedQuestion, QuestionAnswerMapping, GradingResult, ExtractedAnswerBlock } from "@/types";
import { useReview } from "./ReviewContext";

interface QuestionListProps {
  questions: ExtractedQuestion[];
  mappings: QuestionAnswerMapping[];
  grading: GradingResult[];
  answers: ExtractedAnswerBlock[];
}

export default function QuestionList({ questions, mappings, grading }: QuestionListProps) {
  const { selectedQuestionId, setSelectedQuestionId } = useReview();
  const [expandedAll, setExpandedAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    if (expandedAll) setExpandedIds(new Set());
    else setExpandedIds(new Set(questions.map((q) => q.id)));
    setExpandedAll(!expandedAll);
  };

  const handleSelect = (q: ExtractedQuestion) => {
    setSelectedQuestionId(q.id);
    // Auto-jump logic will be handled in AnswerSheetViewer via effect, but we also try to set page here if needed
    // Find mapping for this question
    const m = mappings.find((mm) => mm.questionId === q.id);
    if (m?.status === "matched" && m.answerBlockId) {
      // The viewer will handle page jump; we optimistically could set page, but we need answer block regions
      // We'll let viewer handle via effect that watches selectedQuestionId
    }
    // Ensure expanded
    setExpandedIds((prev) => new Set(prev).add(q.id));
  };

  // Sort questions by orderIndex
  const sorted = [...questions].sort((a, b) => a.orderIndex - b.orderIndex);

  // Unmatched answers count
  const unmatchedCount = mappings.filter((m) => m.status === "unmatched_answer").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Extracted Questions (from question paper)</h2>
        <button onClick={handleExpandAll} className="text-xs text-accent hover:underline">
          {expandedAll ? "Collapse All" : "Expand All"}
        </button>
      </div>
      <div className="flex-1 overflow-auto space-y-3 pr-1">
        {sorted.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-2xl">
            <p className="text-sm text-zinc-500">No questions extracted yet.</p>
            <p className="text-xs text-zinc-400 mt-1">Check the question paper or re-upload.</p>
          </div>
        ) : (
          sorted.map((q, idx) => {
          const m = mappings.find((mm) => mm.questionId === q.id);
          const g = grading.find((gg) => gg.questionId === q.id);
          const isSelected = selectedQuestionId === q.id;
          const isExpanded = expandedIds.has(q.id) || isSelected;
          return (
            <QuestionRow
              key={q.id}
              question={q}
              index={idx}
              mapping={m}
              grading={g}
              isSelected={isSelected}
              isExpanded={isExpanded}
              onSelect={() => handleSelect(q)}
              onToggleExpand={() => toggleExpand(q.id)}
            />
          );
          })
        )}
        {unmatchedCount > 0 && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Unmatched Answers ({unmatchedCount})</h3>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">These answer blocks did not match any question. Review manually.</p>
          </div>
        )}
      </div>
    </div>
  );
}
