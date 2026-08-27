"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

type Status = "uploaded" | "extracting" | "mapping" | "grading" | "ready" | "error";

export default function ProcessingPage() {
  const params = useParams() as { id?: string };
  const router = useRouter();
  const sessionId = params?.id ?? "";
  const [dots, setDots] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const startedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // dots animation
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 500);
    return () => clearInterval(t);
  }, []);

  // Kick off pipeline once on mount (StrictMode safe)
  useEffect(() => {
    if (!sessionId) return;
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    async function startAndPoll() {
      // POST /start
      try {
        const res = await fetch(`/api/session/${sessionId}/start`, { method: "POST" });
        if (res.status === 404) {
          router.replace("/exams/upload");
          return;
        }
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          console.log("[processing] start 409, already running:", data);
          // continue polling
        } else if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Start failed ${res.status}`);
          setStatus("error");
          return;
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus(data.status ?? "extracting");
        }
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
        return;
      }

      // Poll every 1.5s
      timerRef.current = setInterval(async () => {
        if (cancelled) return;
        try {
          const r = await fetch(`/api/session/${sessionId}/status`, { cache: "no-store" });
          if (r.status === 404) {
            router.replace("/exams/upload");
            return;
          }
          const d = (await r.json()) as { status: Status; error?: string | null };
          setStatus(d.status);
          if (d.error) setError(d.error);
          setPollCount((c) => c + 1);
          // Log sparsely
          if (pollCount % 5 === 0) console.log(`[processing] poll status=${d.status}`);

          if (d.status === "ready") {
            if (timerRef.current) clearInterval(timerRef.current);
            router.replace(`/exams/${sessionId}/review`);
          } else if (d.status === "error") {
            if (timerRef.current) clearInterval(timerRef.current);
            setError(d.error ?? "Pipeline failed");
          }
        } catch (e) {
          console.warn("[processing] poll error", e);
        }
      }, 1500);
    }

    startAndPoll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleRetry = async () => {
    setError(null);
    setStatus("extracting");
    startedRef.current = false; // allow re-start
    // Re-trigger effect by toggling startedRef and calling start again
    // Simpler: directly POST /start again
    try {
      const res = await fetch(`/api/session/${sessionId}/start`, { method: "POST" });
      if (res.ok) {
        startedRef.current = true;
        setStatus("extracting");
        // restart polling
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(async () => {
          try {
            const r = await fetch(`/api/session/${sessionId}/status`, { cache: "no-store" });
            const d = (await r.json()) as { status: Status; error?: string | null };
            setStatus(d.status);
            if (d.error) setError(d.error);
            if (d.status === "ready") {
              if (timerRef.current) clearInterval(timerRef.current);
              router.replace(`/exams/${sessionId}/review`);
            } else if (d.status === "error") {
              if (timerRef.current) clearInterval(timerRef.current);
              setError(d.error ?? "Pipeline failed");
            }
          } catch {}
        }, 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Retry failed ${res.status}`);
        setStatus("error");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Status text mapping for display
  const statusLabel =
    status === "extracting"
      ? "Extracting"
      : status === "mapping"
        ? "Mapping"
        : status === "grading"
          ? "Grading"
          : status === "ready"
            ? "Ready"
            : status === "error"
              ? "Error"
              : "Extracting";

  if (error && status === "error") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Sidebar collapsed onToggleCollapse={() => {}} />
        <div className="pl-16">
          <TopBar />
          <main className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-red-600 dark:text-red-400 mb-6 max-w-md break-words">{error}</p>
            <div className="flex gap-3">
              <button onClick={handleRetry} className="btn-primary">
                Retry
              </button>
              <button onClick={() => router.push("/exams/upload")} className="btn-secondary">
                Back to upload
              </button>
            </div>
            {sessionId && <p className="text-xs text-zinc-400 mt-6 break-all">Session: {sessionId}</p>}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar collapsed onToggleCollapse={() => {}} />
      <div className="pl-16">
        <TopBar />
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 animate-pulse">
            <svg className="w-8 h-8 text-accent" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            {statusLabel}
            {dots}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mb-2">This may take a while</p>
          {status && status !== "extracting" && (
            <p className="text-xs text-zinc-400 mb-6">Status: {status} {pollCount > 0 && `(poll #${pollCount})`}</p>
          )}
          {sessionId && <p className="text-xs text-zinc-400 break-all">Session: {sessionId}</p>}
          <p className="text-xs text-zinc-400 mt-4">Pipeline: extracting → mapping → grading → ready</p>
        </main>
      </div>
    </div>
  );
}
