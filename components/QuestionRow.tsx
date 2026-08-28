"use client";

import ScoreBadge from "./ScoreBadge";
import type { ExtractedQuestion, QuestionAnswerMapping, GradingResult } from "@/types";

interface QuestionRowProps {
  question: ExtractedQuestion;
  index: number; // 0-based for circle
  mapping?: QuestionAnswerMapping;
  grading?: GradingResult;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function QuestionRow({ question, index, mapping, grading, isSelected, isExpanded, onSelect, onToggleExpand }: QuestionRowProps) {
  const status = mapping?.status ?? "unanswered";
  const confidence = mapping?.confidence ?? 1;
  const lowConfidence = confidence < 0.6 && status === "matched";

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-2xl border-2 p-4 cursor-pointer transition-all ${
        isSelected
          ? "border-accent bg-[#FFF7ED] border-l-[4px] border-l-accent shadow-sm"
          : "border-zinc-200 bg-white hover:border-zinc-300"
      } ${lowConfidence ? "border-dashed" : ""}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      aria-pressed={isSelected}
    >
      {lowConfidence && (
        <span className="absolute -top-2 -right-2 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full" title="Low confidence — verify">
          !
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? "bg-accent text-white" : "bg-zinc-100 text-zinc-700"}`}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-zinc-900 leading-5">
              <span className="font-mono text-xs text-zinc-500 mr-1">{question.displayNumber}</span>
              {question.text}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              className="p-1 rounded hover:bg-zinc-100 shrink-0"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              <ChevronIcon expanded={isExpanded} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <ScoreBadge score={grading?.score} maxScore={grading?.maxScore} status={status} isCorrect={grading?.isCorrect} />
            {question.maxMarks !== undefined && <span className="text-xs text-zinc-500">max {question.maxMarks}</span>}
            {lowConfidence && <span className="text-xs text-amber-600">verify</span>}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-zinc-200">
          {grading ? (
            <div className="bg-white rounded-xl p-3 border border-zinc-200 shadow-sm">
              <p className="text-xs font-semibold text-zinc-700 mb-1">AI Feedback</p>
              <p className="text-sm text-zinc-600 leading-5">{grading.feedback}</p>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-xs text-accent hover:underline mt-2 inline-block">
                Read it up
              </a>
            </div>
          ) : status === "unanswered" ? (
            <p className="text-sm text-zinc-500 italic">Not answered — no answer block found for this question.</p>
          ) : (
            <p className="text-sm text-zinc-500">No grading available.</p>
          )}
        </div>
      )}
    </div>
  );
}
