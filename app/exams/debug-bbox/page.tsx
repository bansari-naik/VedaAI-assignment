"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SessionState, ExtractedAnswerBlock } from "@/types";

const COLORS = [
  "border-emerald-500 bg-emerald-500/20",
  "border-blue-500 bg-blue-500/20",
  "border-orange-500 bg-orange-500/20",
  "border-purple-500 bg-purple-500/20",
  "border-red-500 bg-red-500/20",
  "border-teal-500 bg-teal-500/20",
  "border-pink-500 bg-pink-500/20",
  "border-amber-500 bg-amber-500/20",
];

function DebugInner() {
  const sp = useSearchParams();
  const sessionId = sp.get("session") ?? sp.get("id") ?? "";
  const type = (sp.get("type") as "qp" | "as") ?? "as";
  const pageParam = parseInt(sp.get("page") ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/session/${sessionId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Session fetch ${r.status}`);
        return r.json();
      })
      .then(setSession)
      .catch((e) => setError((e as Error).message));
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="min-h-screen p-8 bg-zinc-50 dark:bg-zinc-950">
        <h1 className="text-xl font-bold mb-4">Debug BBox — missing session</h1>
        <p className="text-zinc-600">Usage: <code>/exams/debug-bbox?session=SESSION_ID&type=as&page=1</code></p>
        <p className="text-sm text-zinc-500 mt-2">type can be qp|as, page is 1-indexed. Session must exist via upload + extraction.</p>
      </div>
    );
  }

  const answers: ExtractedAnswerBlock[] = session?.answers ?? [];
  const pageRegions = answers.flatMap((b, bi) =>
    b.regions
      .filter((r) => r.page === page)
      .map((r) => ({ block: b, blockIdx: bi, region: r }))
  );

  const imgSrc = `/api/file/${sessionId}/${type}/${page}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">Debug BBox Overlay</h1>
        <p className="text-sm text-zinc-500 mb-4">
          session <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{sessionId}</code> type={type} page={page} — blocks on this page: {pageRegions.length} / total {answers.length}
          {session && ` (status=${session.status})`}
        </p>
        {error && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow overflow-hidden border border-zinc-200 dark:border-zinc-800">
              {!imgError ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc}
                    alt={`Page ${page}`}
                    className="w-full h-auto"
                    onError={() => setImgError(true)}
                  />
                  {pageRegions.map(({ block, blockIdx, region }) => {
                    const color = COLORS[blockIdx % COLORS.length];
                    const left = `${region.x * 100}%`;
                    const top = `${region.y * 100}%`;
                    const width = `${region.width * 100}%`;
                    const height = `${region.height * 100}%`;
                    return (
                      <div
                        key={`${block.id}-${region.page}-${region.x}`}
                        className={`absolute border-2 ${color}`}
                        style={{ left, top, width, height }}
                        title={`${block.detectedLabel ?? "no label"} — ${block.rawText.slice(0,80)}`}
                      >
                        <span className="absolute -top-5 left-0 text-[10px] font-bold px-1 rounded bg-black/70 text-white whitespace-nowrap">
                          {block.detectedLabel ?? `#${blockIdx + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-red-500">Image load failed: {imgSrc}</div>
              )}
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <a className="px-3 py-1 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300" href={`/exams/debug-bbox?session=${sessionId}&type=${type}&page=${Math.max(1, page - 1)}`}>Prev</a>
              <a className="px-3 py-1 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300" href={`/exams/debug-bbox?session=${sessionId}&type=${type}&page=${page + 1}`}>Next</a>
              <span className="ml-2 text-zinc-500">Check coords ∈[0,1] • degenerate boxes rejected</span>
            </div>
          </div>

          <div className="lg:w-[380px] shrink-0">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
              <h2 className="font-semibold mb-3">Blocks ({answers.length})</h2>
              <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
                {answers.length === 0 && <p className="text-sm text-zinc-500">No answers yet — run extraction.</p>}
                {answers.map((b, idx) => {
                  const onThisPage = b.regions.some((r) => r.page === page);
                  return (
                    <div key={b.id} className={`p-3 rounded-xl border ${onThisPage ? "border-accent bg-accent-light/30 dark:bg-accent/10" : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${COLORS[idx % COLORS.length].split(" ")[0].replace("border-","bg-")} text-white`}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-mono bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded">{b.detectedLabel ?? "no label"}</span>
                        <span className="text-xs text-zinc-500">{b.regions.length} region{b.regions.length>1?"s":""} — pages {b.regions.map((r)=>r.page).join(",")}</span>
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3">{b.rawText || "(empty)"}</p>
                      <div className="mt-1 text-[10px] font-mono text-zinc-500">
                        {b.regions.map((r) => `p${r.page}: x${r.x.toFixed(3)} y${r.y.toFixed(3)} w${r.width.toFixed(3)} h${r.height.toFixed(3)}`).join(" | ")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DebugBboxPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-8 bg-zinc-50 dark:bg-zinc-950">Loading debug overlay…</div>}>
      <DebugInner />
    </Suspense>
  );
}
