"use client";

import { createContext, useContext } from "react";
import type { SessionState } from "@/types";

export interface ReviewContextValue {
  session: SessionState | null;
  selectedQuestionId: string | null;
  setSelectedQuestionId: (id: string | null) => void;
  currentPage: number;
  setCurrentPage: (n: number) => void;
  zoom: number;
  setZoom: (n: number) => void;
  totalPages: number;
}

export const ReviewContext = createContext<ReviewContextValue | null>(null);

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReview must be used within ReviewContext Provider");
  return ctx;
}
