"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import QuestionList from "@/components/QuestionList";
import AnswerSheetViewer from "@/components/AnswerSheetViewer";
import { ReviewContext } from "@/components/ReviewContext";
import type { SessionState } from "@/types";

export default function ReviewPage() {
  const params = useParams() as { id?: string };
  const router = useRouter();
  const sessionId = params?.id ?? "";
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/session/${sessionId}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) {
          router.replace("/exams/upload");
          return null;
        }
        if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setSession(data as SessionState);
        if (data.questions?.length > 0) {
          const sorted = [...data.questions].sort((a: { orderIndex: number }, b: { orderIndex: number }) => a.orderIndex - b.orderIndex);
          setSelectedQuestionId(sorted[0].id);
        }
        if (data.answerSheet?.pageCount) {
          setCurrentPage(1);
        }
        if (data.status !== "ready") {
          console.warn(`[review] session status is ${data.status}, expected ready`);
        }
      })
      .catch((e) => setError((e as Error).message));
  }, [sessionId, router]);

  const totalPages = session?.answerSheet.pageCount ?? 1;

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F5F7]">
        <Sidebar collapsed onToggleCollapse={() => {}} />
        <div className="pl-16">
          <TopBar />
          <main className="p-8 text-center">
            <p className="text-red-600">{error}</p>
            <button onClick={() => router.push("/exams/upload")} className="mt-4 px-4 py-2 rounded-full bg-zinc-900 text-white text-sm">Back to upload</button>
          </main>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#F5F5F7]">
        <Sidebar collapsed onToggleCollapse={() => {}} />
        <div className="pl-16">
          <TopBar />
          <main className="flex items-center justify-center min-h-[calc(100vh-64px)]">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Loading review…</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (session.status !== "ready") {
    return (
      <div className="min-h-screen bg-[#F5F5F7]">
        <Sidebar collapsed onToggleCollapse={() => {}} />
        <div className="pl-16">
          <TopBar />
          <main className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <span className="text-amber-600 text-xl">!</span>
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">Session not ready</h2>
            <p className="text-sm text-zinc-500 mb-1">Status: <span className="font-mono bg-zinc-100 px-1 rounded">{session.status}</span></p>
            {session.error && <p className="text-sm text-red-600 mb-4 max-w-md">{session.error}</p>}
            <div className="flex gap-3">
              <button onClick={() => router.push(`/exams/${sessionId}/processing`)} className="px-4 py-2 rounded-full bg-zinc-900 text-white text-sm">Go to processing</button>
              <button onClick={() => router.push("/exams/upload")} className="px-4 py-2 rounded-full border bg-white text-sm">Back to upload</button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <ReviewContext.Provider
      value={{
        session,
        selectedQuestionId,
        setSelectedQuestionId,
        currentPage,
        setCurrentPage: (n) => setCurrentPage(Math.max(1, Math.min(totalPages, n))),
        zoom,
        setZoom,
        totalPages,
      }}
    >
      <div className="min-h-screen bg-[#F5F5F7]">
        <Sidebar collapsed onToggleCollapse={() => {}} />
        <div className="pl-16 flex flex-col min-h-screen">
          <TopBar />
          <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 lg:p-6 min-h-0">
            <div className="lg:w-[420px] xl:w-[460px] shrink-0 bg-white rounded-2xl border border-zinc-200 p-4 flex flex-col min-h-[400px] lg:min-h-0 lg:h-[calc(100vh-88px)]">
              <QuestionList questions={session.questions} mappings={session.mappings} grading={session.grading} answers={session.answers} />
            </div>
            <div className="flex-1 min-h-[500px] lg:min-h-0 lg:h-[calc(100vh-88px)]">
              <AnswerSheetViewer />
            </div>
          </div>
        </div>
      </div>
    </ReviewContext.Provider>
  );
}
