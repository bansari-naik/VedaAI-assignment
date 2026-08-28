"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import * as React from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import UploadCard from "@/components/UploadCard";
import studentAnimation from "@/public/lottie-student.json";

const LuminaAvatar = dynamic(
  () => import("lumina-ui").then((mod) => ({ default: mod.Avatar }) as unknown as { default: React.ComponentType<Record<string, unknown>> }),
  { ssr: false },
) as unknown as React.ComponentType<{
  firstName: string;
  lastName: string;
  imageUrl?: string;
  size: number;
  fontSizeChange: boolean;
}>;

export default function UploadPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [qpFile, setQpFile] = useState<File | null>(null);
  const [asFile, setAsFile] = useState<File | null>(null);
  const [qpError, setQpError] = useState<string | null>(null);
  const [asError, setAsError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [LottieComp, setLottieComp] = useState<React.ComponentType<{ animationData: unknown; loop?: boolean; autoplay?: boolean; className?: string }> | null>(null);

  useEffect(() => {
    import("lottie-react").then((mod) => setLottieComp(() => (mod as unknown as { Lottie: React.ComponentType<{ animationData: unknown; loop?: boolean; autoplay?: boolean; className?: string }> }).Lottie));
  }, []);

  const handleStartMapping = async () => {
    if (!qpFile || !asFile) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("questionPaper", qpFile);
      fd.append("answerSheet", asFile);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || `Upload failed (${res.status})`;
        setUploadError(msg);
        return;
      }
      router.push(`/exams/${data.sessionId}/processing`);
    } catch (e) {
      setUploadError((e as Error).message || "Upload failed. Check console.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className={`transition-all duration-200 ${sidebarCollapsed ? "pl-16 lg:pl-16" : "pl-16 lg:pl-64"}`}>
        <TopBar />
        <main className="px-4 md:px-8 lg:px-12 py-6 flex flex-col items-center justify-center min-h-[calc(100vh-72px)]">
          <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
            {/* Page Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl md:text-[28px] font-extrabold tracking-tight">
                <span className="text-zinc-900">Upload</span>{" "}
                <span className="bg-[#FFE9E0] text-[#F97316] px-2.5 py-1 rounded-lg font-bold">Question Paper & Answer Sheets</span>
              </h1>
              <p className="text-sm text-zinc-500 mt-3">Upload both files to get started</p>
            </div>

            {/* Mascot - student avatar with Lumina UI + LottieFiles */}
            <div className="flex justify-center mb-8">
              <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-white border-[3px] border-[#F97316]/30 shadow-sm flex items-center justify-center p-1 overflow-hidden">
                <LuminaAvatar firstName="Student" lastName="Avatar" imageUrl="/mascot.svg" size={112} fontSizeChange={false} />
                {/* Decorative LottieFiles - small floating book */}
                {LottieComp && (
                  <div className="absolute -top-1 -right-1 w-10 h-10 bg-white rounded-full shadow-md border border-[#FFE9E0] p-1.5 flex items-center justify-center">
                    <LottieComp animationData={studentAnimation} loop autoplay className="w-full h-full" />
                  </div>
                )}
              </div>
            </div>

            {/* Upload Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl mb-6">
              <UploadCard
                label="Upload Question Paper"
                labelOrange="Question Paper"
                file={qpFile}
                onFile={setQpFile}
                onRemove={() => { setQpFile(null); setQpError(null); setUploadError(null); }}
                error={qpError}
              />
              <UploadCard
                label="Upload Answer Sheet"
                labelOrange="Answer Sheet"
                file={asFile}
                onFile={setAsFile}
                onRemove={() => { setAsFile(null); setAsError(null); setUploadError(null); }}
                error={asError}
              />
            </div>

            {/* Helper text + Button */}
            <div className="flex flex-col items-center gap-4 w-full max-w-3xl">
              <button
                onClick={handleStartMapping}
                disabled={!(qpFile && asFile) || isUploading}
                className={`inline-flex items-center justify-center px-6 py-2.5 rounded-full font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 ${
                  !(qpFile && asFile) || isUploading
                    ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                    : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm"
                }`}
              >
                {isUploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin mr-2" aria-hidden="true" />
                    Uploading...
                  </>
                ) : (
                  "Start Mapping  →"
                )}
              </button>
              <p className="text-xs text-zinc-400 text-center">
                Once both files are uploaded, you&apos;ll able to map answers with questions
              </p>
              {uploadError && (
                <div className="w-full max-w-xl p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 text-center" role="alert">
                  {uploadError}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
