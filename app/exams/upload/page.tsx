"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import UploadCard from "@/components/UploadCard";

export default function UploadPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [qpFile, setQpFile] = useState<File | null>(null);
  const [asFile, setAsFile] = useState<File | null>(null);
  const [qpError, setQpError] = useState<string | null>(null);
  const [asError, setAsError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleStartMapping = async () => {
    if (!qpFile || !asFile) return;
    setUploadError(null);
    setIsUploading(true);
    console.log("[upload-page] Start Mapping clicked", { qp: qpFile.name, as: asFile.name });
    try {
      const fd = new FormData();
      fd.append("questionPaper", qpFile);
      fd.append("answerSheet", asFile);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || `Upload failed (${res.status})`;
        console.error("[upload-page] upload failed", msg);
        setUploadError(msg);
        return;
      }

      console.log("[upload-page] upload success", data);
      router.push(`/exams/${data.sessionId}/processing`);
    } catch (e) {
      console.error("[upload-page] upload exception", e);
      setUploadError((e as Error).message || "Upload failed. Check console.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      <div className={`transition-all duration-200 ${sidebarCollapsed ? "pl-16 lg:pl-16" : "pl-16 lg:pl-64"}`}>
        <TopBar />
        
        <main className="p-4 md:p-6 lg:p-8">
          <div className="max-w-5xl mx-auto">
            {/* Page Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white">Upload</h1>
                <span className="badge-pill bg-accent/20 text-accent text-sm px-3 py-1">
                  Question Paper & Answer Sheets
                </span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400">Upload both files to get started</p>
            </div>

            {/* Mascot */}
            <div className="flex justify-center mb-8">
              <div className="relative w-32 h-32 md:w-40 md:h-40">
                <Image
                  src="/mascot.svg"
                  alt="VedaAI mascot"
                  width={160}
                  height={160}
                  className="w-full h-full object-contain"
                  priority
                />
              </div>
            </div>

            {/* Upload Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <UploadCard
                label="Upload Question Paper"
                file={qpFile}
                onFile={setQpFile}
                onRemove={() => { setQpFile(null); setQpError(null); setUploadError(null); }}
                error={qpError}
              />
              <UploadCard
                label="Upload Answer Sheet"
                file={asFile}
                onFile={setAsFile}
                onRemove={() => { setAsFile(null); setAsError(null); setUploadError(null); }}
                error={asError}
              />
            </div>

            {/* Helper text */}
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Once both files are uploaded, you&apos;ll be able to map answers with questions.
            </p>

            {uploadError && (
              <div className="max-w-xl mx-auto mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 text-center" role="alert">
                {uploadError}
              </div>
            )}

            {/* Start Mapping Button */}
            <div className="flex justify-center">
              <button
                onClick={handleStartMapping}
                disabled={!(qpFile && asFile) || isUploading}
                className={`inline-flex items-center justify-center w-full md:w-[280px] px-6 py-3 rounded-xl font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 ${
                  !(qpFile && asFile) || isUploading
                    ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                    : "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 shadow-sm"
                }`}
              >
                {isUploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin mr-2" aria-hidden="true" />
                    Uploading...
                  </>
                ) : (
                  "Start Mapping →"
                )}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
