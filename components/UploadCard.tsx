"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

interface UploadCardProps {
  label: string;
  labelOrange?: string;
  hint?: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onRemove: () => void;
  error?: string | null;
}

export default function UploadCard({ label, labelOrange, hint = "Max 10MB", file, onFile, onRemove, error }: UploadCardProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File): string | null => {
    // Check extension as fallback (Windows may report odd MIME types)
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    const hasValidExt = ACCEPTED_EXTENSIONS.includes(ext);
    const hasValidType = ACCEPTED_TYPES.includes(f.type);
    
    if (!hasValidExt && !hasValidType) {
      return "Only PDF, PNG, JPG, or JPEG files are allowed.";
    }
    if (f.size > MAX_SIZE) {
      return `File size must be less than 10MB. Current: ${(f.size / (1024 * 1024)).toFixed(1)}MB`;
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((f: File | null) => {
    if (!f) {
      onFile(null);
      setLocalError(null);
      return;
    }
    console.debug("[UploadCard] File selected:", f.name, f.size, f.type);
    
    const validationError = validateFile(f);
    if (validationError) {
      setLocalError(validationError);
      onFile(null);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    
    setLocalError(null);
    onFile(f);
  }, [onFile, validateFile]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items[0]?.kind === "file") {
      setIsDragActive(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  }, [handleFileSelect]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const displayError = error || localError;

  if (file) {
    // Filled state
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm relative group">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={handleInputChange}
          className="hidden"
          aria-label={`Replace ${label}`}
        />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-2 rounded-full text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-200"
          aria-label={`Remove ${label}`}
        >
          <XIcon className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 flex-shrink-0 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
            <FileIcon className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="font-medium text-zinc-900 dark:text-white truncate">{file.name}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{formatSize(file.size)}</p>
          </div>
        </div>
        {displayError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{displayError}</p>
        )}
      </div>
    );
  }

  // Empty state - drop zone
  const baseLabel = labelOrange ? label.replace(labelOrange, "").trim() : label;
  const orangePart = labelOrange ?? "";
  return (
    <div className={`bg-white rounded-2xl border-2 border-dashed ${isDragActive ? "border-[#F97316] bg-[#FFF7ED]/50" : "border-zinc-200"} p-6 text-center shadow-sm transition-colors relative group`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleInputChange}
        className="hidden"
        aria-label={`Upload ${label}`}
      />
      <div
        className="w-full"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); }}}
        aria-label={`Upload ${label}`}
        aria-describedby={`${label.toLowerCase().replace(/\s+/g, "-")}-hint`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
            <UploadIcon className="w-5 h-5 text-zinc-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-900">
              {baseLabel} {orangePart && <span className="text-[#F97316]">{orangePart}</span>}
            </p>
            <p id={`${label.toLowerCase().replace(/\s+/g, "-")}-hint`} className="text-xs text-zinc-400 mt-1">{hint}</p>
          </div>
        </div>
      </div>
      {displayError && (
        <p className="mt-3 text-sm text-red-600 text-center" role="alert">{displayError}</p>
      )}
    </div>
  );
}