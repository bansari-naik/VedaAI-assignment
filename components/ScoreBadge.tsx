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
  if (ratio >= 0.8) tier = "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800";
  else if (ratio >= 0.4) tier = "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800";
  else tier = "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800";

  // isCorrect could also influence, but ratio is primary per spec
  return (
    <span className={`badge-pill ${tier} font-semibold text-xs ${className ?? ""}`}>
      {score}/{maxScore}
    </span>
  );
}
