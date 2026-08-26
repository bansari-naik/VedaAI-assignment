// types.ts — PRD §5 data model, verbatim

export interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;       // application/pdf | image/png | image/jpeg
  sizeBytes: number;
  pageCount: number;
  pageImages: string[];   // URLs/paths to rasterized page images, index 0 = page 1
}

export interface BoundingBox {
  page: number;            // 1-indexed page number within the answer sheet
  x: number; y: number;    // top-left, normalized 0-1 relative to page image width/height
  width: number; height: number; // normalized 0-1
}

export interface ExtractedQuestion {
  id: string;               // stable uuid
  displayNumber: string;    // "1", "11(a)", "11(b)"
  orderIndex: number;       // printed order, 0-based
  text: string;             // full question text (may include multi-line, OCR'd from paper)
  maxMarks?: number;        // if inferable from paper (e.g. "[5]" or "(5 marks)"), else undefined
  sourcePage: number;       // page in question paper this came from
}

export interface ExtractedAnswerBlock {
  id: string;
  rawText: string;              // OCR/transcribed handwritten text
  regions: BoundingBox[];       // one or more segments; multiple = spans pages/blocks
  detectedLabel?: string;       // if student wrote "Q2" / "Ans 2" near it, capture it as a hint
}

export type MappingStatus = "matched" | "unanswered" | "unmatched_answer";

export interface QuestionAnswerMapping {
  questionId: string | null;      // null only for orphan "unmatched_answer" entries
  answerBlockId: string | null;   // null for "unanswered"
  status: MappingStatus;
  confidence: number;             // 0-1, LLM-reported or heuristic
}

export interface GradingResult {
  questionId: string;
  score: number;
  maxScore: number;
  isCorrect: boolean | "partial";
  feedback: string;               // short AI feedback shown in UI
}

export interface SessionState {
  sessionId: string;
  questionPaper: UploadedFile;
  answerSheet: UploadedFile;
  questions: ExtractedQuestion[];
  answers: ExtractedAnswerBlock[];
  mappings: QuestionAnswerMapping[];
  grading: GradingResult[];
  status: "uploaded" | "extracting" | "mapping" | "grading" | "ready" | "error";
  error?: string;
}