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
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const shouldPost = !startedRef.current;
    if (shouldPost) startedRef.current = true;

    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/session/${sessionId}/status?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        if (r.status === 404) {
          try {
            const fr = await fetch(`/api/session/${sessionId}?t=${Date.now()}`, { cache: "no-store" });
            if (fr.ok) {
              const fj = await fr.json();
              if (fj.status === "ready") {
                router.replace(`/exams/${sessionId}/review`);
                window.location.href = `/exams/${sessionId}/review`;
                return;
              }
            }
          } catch {}
          router.replace("/exams/upload");
          return;
        }
        const d = (await r.json()) as { status: Status; error?: string | null };
        if (cancelled) return;
        if (d.status === "ready") {
          router.replace(`/exams/${sessionId}/review`);
          window.location.href = `/exams/${sessionId}/review`;
          return;
        }
        if (d.status === "error") {
          setError(d.error ?? "Pipeline failed");
          return;
        }
        if (d.error) setError(d.error);
      } catch (e) {
        console.warn("[processing] poll error", e);
      }
      if (!cancelled) timerRef.current = setTimeout(poll, 1500);
    }

    async function startAndPoll() {
      if (shouldPost) {
        try {
          const res = await fetch(`/api/session/${sessionId}/start`, { method: "POST" });
          if (res.status === 404) {
            router.replace("/exams/upload");
            return;
          }
          if (res.status === 409) {
            console.log("[processing] start 409, already running");
          } else if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error || `Start failed ${res.status}`);
            return;
          }
        } catch (e) {
          setError((e as Error).message);
          return;
        }
      }
      poll();
    }

    startAndPoll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sessionId, router]);

  const handleRetry = async () => {
    setError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      const res = await fetch(`/api/session/${sessionId}/start`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Retry failed ${res.status}`);
        return;
      }
      startedRef.current = true;
      const pollRetry = async () => {
        try {
          const r = await fetch(`/api/session/${sessionId}/status?t=${Date.now()}`, { cache: "no-store" });
          const d = (await r.json()) as { status: Status; error?: string | null };
          if (d.status === "ready") {
            router.replace(`/exams/${sessionId}/review`);
            window.location.href = `/exams/${sessionId}/review`;
            return;
          }
          if (d.status === "error") {
            setError(d.error ?? "Pipeline failed");
            return;
          }
        } catch {}
        timerRef.current = setTimeout(pollRetry, 1500);
      };
      pollRetry();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F5F7]">
        <Sidebar collapsed onToggleCollapse={() => {}} />
        <div className="pl-16">
          <TopBar />
          <main className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-red-600 mb-6 max-w-md break-words">{error}</p>
            <div className="flex gap-3">
              <button onClick={handleRetry} className="px-4 py-2 rounded-full bg-zinc-900 text-white text-sm">Retry</button>
              <button onClick={() => router.push("/exams/upload")} className="px-4 py-2 rounded-full border bg-white text-sm">Back to upload</button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <Sidebar collapsed onToggleCollapse={() => {}} />
      <div className="pl-16">
        <TopBar />
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#FFF1E6] flex items-center justify-center mb-6 animate-pulse">
            <svg className="w-8 h-8 text-[#F97316]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z"/>
              <circle cx="4" cy="4" r="1.5"/>
              <circle cx="20" cy="4" r="1"/>
              <circle cx="21" cy="19" r="1.2"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Extracting{dots}</h1>
          <p className="text-zinc-500">This may take a while</p>
        </main>
      </div>
    </div>
  );
}
