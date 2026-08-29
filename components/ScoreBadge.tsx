"use client";

interface ScoreBadgeProps {
  score?: number;
  maxScore?: number;
  status: "matched" | "unanswered" | "unmatched_answer";
  isCorrect?: boolean | "partial";
  className?: string;
}

export default function ScoreBadge({ score, maxScore, status, className }: ScoreBadgeProps) {
  if (status === "unanswered") {
    return <span className={`badge-pill bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 text-xs ${className ?? ""}`}>Not answered</span>;
  }
  if (status === "unmatched_answer") {
    return <span className="badge-pill bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">Unmatched</span>;
  }
  if (score === undefined || maxScore === undefined || maxScore === 0) {
    return <span className="badge-pill bg-zinc-100 text-zinc-500 text-xs">—</span>;
  }
  const ratio = score / maxScore;
  let tier = "bg-zinc-100 text-zinc-600";
  if (ratio >= 0.8) tier = "bg-green-100 text-green-800 border border-green-300";
  else tier = "bg-red-100 text-red-700 border border-red-300";

  // isCorrect could also influence, but ratio is primary per spec
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full font-bold text-sm ${tier} ${className ?? ""}`}>
      {score}/{maxScore}
    </span>
  );
}
