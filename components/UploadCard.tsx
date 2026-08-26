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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

interface UploadCardProps {
  label: string;
  hint?: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onRemove: () => void;
  error?: string | null;
}

export default function UploadCard({ label, hint = "Max 10MB", file, onFile, onRemove, error }: UploadCardProps) {
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
      <div className="upload-card-filled relative group">
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
          className="absolute top-2 right-2 p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          aria-label={`Remove ${label}`}
        >
          <XIcon className="w-5 h-5" />
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
  return (
    <div className="upload-card relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleInputChange}
        className="hidden"
        aria-label={`Upload ${label}`}
      />
      <div
        className={`relative w-full ${isDragActive ? "border-accent bg-accent-light/50" : ""}`}
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
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center transition-colors group-hover:border-accent">
            <UploadIcon className="w-8 h-8 text-zinc-400 dark:text-zinc-500 group-hover:text-accent transition-colors" />
          </div>
          <div className="text-center">
            <p className="font-medium text-zinc-900 dark:text-white">{label}</p>
            <p id={`${label.toLowerCase().replace(/\s+/g, "-")}-hint`} className="text-sm text-zinc-500 dark:text-zinc-400">{hint}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Drag & drop or click to browse</p>
          </div>
        </div>
      </div>
      {displayError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400 text-center" role="alert">{displayError}</p>
      )}
    </div>
  );
}