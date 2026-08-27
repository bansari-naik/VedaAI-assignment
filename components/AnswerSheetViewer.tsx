"use client";

import { useEffect, useMemo, useState } from "react";
import { useReview } from "./ReviewContext";
import type { BoundingBox } from "@/types";

// Pure helper — unit tested
export function bboxToPx(bbox: BoundingBox, imgW: number, imgH: number, zoom: number) {
  const scale = zoom / 100;
  return {
    left: bbox.x * imgW * scale,
    top: bbox.y * imgH * scale,
    width: bbox.width * imgW * scale,
    height: bbox.height * imgH * scale,
  };
}

// For % based rendering (simpler, zoom handled via container width)
export function bboxToPercent(bbox: BoundingBox) {
  return {
    left: `${bbox.x * 100}%`,
    top: `${bbox.y * 100}%`,
    width: `${bbox.width * 100}%`,
    height: `${bbox.height * 100}%`,
  };
}

export default function AnswerSheetViewer() {
  const { session, selectedQuestionId, currentPage, setCurrentPage, zoom, setZoom } = useReview();
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading URLSearchParams after mount to avoid hydration mismatch
    setDebug(new URLSearchParams(window.location.search).get("debug") === "1");
  }, []);

  const totalPages = session?.answerSheet.pageCount ?? 1;
  const sessionId = session?.sessionId ?? "";

  // Resolve selected mapping → answer block → regions
  const selectedData = useMemo(() => {
    if (!session || !selectedQuestionId) return null;
    const mapping = session.mappings.find((m) => m.questionId === selectedQuestionId);
    if (!mapping) return null;
    if (mapping.status === "unanswered") return { status: "unanswered" as const, mapping };
    if (mapping.status === "matched" && mapping.answerBlockId) {
      const block = session.answers.find((a) => a.id === mapping.answerBlockId);
      if (!block) return { status: "missing" as const, mapping };
      return { status: "matched" as const, mapping, block };
    }
    return null;
  }, [session, selectedQuestionId]);

  // Auto page-jump when selection changes and region not on current page
  useEffect(() => {
    if (!selectedData || selectedData.status !== "matched") return;
    const block = (selectedData as { block: { regions: BoundingBox[] } }).block;
    const pages = block.regions.map((r) => r.page);
    if (!pages.includes(currentPage) && pages.length > 0) {
      setCurrentPage(pages[0]);
    }
  }, [selectedData, currentPage, setCurrentPage]);

  const pageRegions = useMemo(() => {
    if (!session) return [];
    // All regions for current page
    return session.answers.flatMap((b, bi) =>
      b.regions.filter((r) => r.page === currentPage).map((r) => ({ block: b, blockIdx: bi, region: r }))
    );
  }, [session, currentPage]);

  const activeRegions = useMemo(() => {
    if (!selectedData || selectedData.status !== "matched") return [];
    return (selectedData as { block: { regions: BoundingBox[] } }).block.regions.filter((r) => r.page === currentPage);
  }, [selectedData, currentPage]);

  const otherRegions = useMemo(() => {
    if (!selectedData || selectedData.status !== "matched") return pageRegions;
    const activeIds = new Set(activeRegions.map((r) => `${r.page}-${r.x}-${r.y}`));
    return pageRegions.filter(({ region }) => !activeIds.has(`${region.page}-${region.x}-${region.y}`));
  }, [pageRegions, activeRegions, selectedData]);

  const imgSrc = sessionId ? `/api/file/${sessionId}/as/${currentPage}` : "";

  const handleZoom = (delta: number) => {
    setZoom(Math.max(50, Math.min(200, zoom + delta)));
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Answer Sheet</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-1">
            <button onClick={() => handleZoom(-25)} className="w-6 h-6 rounded-full hover:bg-white dark:hover:bg-zinc-700 flex items-center justify-center text-sm" aria-label="Zoom out">−</button>
            <span className="text-xs font-mono w-10 text-center">{zoom}%</span>
            <button onClick={() => handleZoom(25)} className="w-6 h-6 rounded-full hover:bg-white dark:hover:bg-zinc-700 flex items-center justify-center text-sm" aria-label="Zoom in">+</button>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              aria-label="Prev page"
            >
              ◀
            </button>
            <span className="font-mono">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              aria-label="Next page"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950 p-4">
        {!session ? (
          <div className="p-8 text-center text-zinc-500">Loading session…</div>
        ) : selectedData?.status === "unanswered" ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Not answered — no answer block found for this question.</p>
            <p className="text-xs text-zinc-400 mt-2">The student left this question blank.</p>
          </div>
        ) : (
          <div
            className="relative mx-auto bg-white shadow rounded-xl overflow-hidden"
            style={{ width: `${Math.min(100, zoom)}%`, maxWidth: "900px" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt={`Answer page ${currentPage}`}
              className="w-full h-auto block"
            />
            {/* Overlay layer */}
            <div className="absolute inset-0">
              {/* Other regions (blue, lighter) */}
              {!debug &&
                otherRegions.map(({ block, region }) => {
                  const p = bboxToPercent(region);
                  return (
                    <div
                      key={`other-${block.id}-${region.x}-${region.y}`}
                      className="absolute border-2 border-blue-400 bg-blue-400/10"
                      style={{ left: p.left, top: p.top, width: p.width, height: p.height }}
                      title={block.detectedLabel ?? block.rawText.slice(0, 40)}
                    />
                  );
                })}
              {/* Active regions (green, selected) */}
              {activeRegions.map((region, idx) => {
                const p = bboxToPercent(region);
                const label = selectedData && "block" in selectedData ? (selectedData as { block: { detectedLabel?: string } }).block.detectedLabel ?? `Q` : "Q";
                return (
                  <div
                    key={`active-${idx}-${region.x}-${region.y}`}
                    className="absolute border-2 border-emerald-500 bg-emerald-500/20"
                    style={{ left: p.left, top: p.top, width: p.width, height: p.height }}
                  >
                    <span className="absolute -top-6 left-0 text-xs font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                      {label}:
                    </span>
                  </div>
                );
              })}
              {/* Debug: show all */}
              {debug &&
                pageRegions.map(({ block, region }) => {
                  const p = bboxToPercent(region);
                  return (
                    <div
                      key={`debug-${block.id}-${region.x}`}
                      className="absolute border border-red-500 bg-red-500/5"
                      style={{ left: p.left, top: p.top, width: p.width, height: p.height }}
                    >
                      <span className="text-[8px] bg-red-600 text-white px-1">{block.detectedLabel ?? block.id.slice(0, 4)}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        {/* Summary bar if data allows */}
        {session && session.grading.length > 0 && (
          <div className="mt-4 flex justify-center">
            <div className="bg-white dark:bg-zinc-900 rounded-full px-4 py-2 shadow text-sm border border-zinc-200 dark:border-zinc-800">
              Total: {session.grading.reduce((a, g) => a + g.score, 0)} / {session.grading.reduce((a, g) => a + g.maxScore, 0)} — {session.grading.filter((g) => g.isCorrect === true).length} correct
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
