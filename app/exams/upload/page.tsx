"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import UploadCard from "@/components/UploadCard";

export default function UploadPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [qpFile, setQpFile] = useState<File | null>(null);
  const [asFile, setAsFile] = useState<File | null>(null);
  const [qpError, setQpError] = useState<string | null>(null);
  const [asError, setAsError] = useState<string | null>(null);

  const handleStartMapping = () => {
    if (qpFile && asFile) {
      console.log("Start Mapping clicked", { qpFile: qpFile.name, asFile: asFile.name });
      // TODO: Wire to API in task03
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      <div className={`transition-all duration-200 ${sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"}`}>
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
                <img 
                  src="/mascot.svg" 
                  alt="VedaAI mascot" 
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Upload Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <UploadCard
                label="Upload Question Paper"
                file={qpFile}
                onFile={setQpFile}
                onRemove={() => { setQpFile(null); setQpError(null); }}
                error={qpError}
              />
              <UploadCard
                label="Upload Answer Sheet"
                file={asFile}
                onFile={setAsFile}
                onRemove={() => { setAsFile(null); setAsError(null); }}
                error={asError}
              />
            </div>

            {/* Helper text */}
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Once both files are uploaded, you&apos;ll be able to map answers with questions.
            </p>

            {/* Start Mapping Button */}
            <div className="flex justify-center">
              <button
                onClick={handleStartMapping}
                disabled={!(qpFile && asFile)}
                className={`btn-primary w-full md:w-[280px] ${!(qpFile && asFile) 
                  ? "opacity-50 cursor-not-allowed bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400" 
                  : ""}`}
              >
                Start Mapping →
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}