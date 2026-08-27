import * as fs from "fs/promises";
import * as path from "path";
import { getSession, updateSession, getQpDir, getAsDir } from "@/lib/session";
import { extractQuestions } from "./extractQuestions";
import { extractAnswers } from "./extractAnswers";
import { mapAnswers } from "./mapAnswers";
import { grade } from "./grade";
import type { PageInput } from "./extractQuestions";

// Helper to load page buffers from /tmp
async function loadPages(dir: string): Promise<PageInput[]> {
  const files = await fs.readdir(dir).catch(() => []);
  const pngs = files
    .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
    .sort((a, b) => {
      const na = parseInt(a.match(/page-(\d+)/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/page-(\d+)/)?.[1] ?? "0", 10);
      return na - nb;
    });
  const pages: PageInput[] = [];
  for (const fn of pngs) {
    const n = parseInt(fn.match(/page-(\d+)/)?.[1] ?? "0", 10);
    const buf = await fs.readFile(path.join(dir, fn));
    pages.push({ buffer: buf, pageNumber: n });
  }
  return pages;
}

/**
 * Sequential orchestrator: extractQuestions → extractAnswers → map → grade
 * Single place where status transitions happen.
 * Each stage wrapped so partial failures produce specific messages.
 */
export async function runPipeline(sessionId: string): Promise<void> {
  const startAll = Date.now();
  console.log(`[pipeline] start session=${sessionId}`);

  const session = getSession(sessionId);
  if (!session) {
    console.error(`[pipeline] session not found ${sessionId}`);
    return;
  }

  try {
    // Stage 1: Question extraction
    {
      const t0 = Date.now();
      console.log(`[pipeline] stage extracting (questions) session=${sessionId}`);
      updateSession(sessionId, { status: "extracting", error: undefined });

      const qpDir = getQpDir(sessionId);
      const qpPages = await loadPages(qpDir);
      if (qpPages.length === 0) throw new Error("No question paper pages found (upload may have failed)");

      const questions = await extractQuestions(qpPages, sessionId).catch((e) => {
        throw new Error(`Question extraction failed: ${(e as Error).message}`);
      });

      updateSession(sessionId, { questions });
      console.log(`[pipeline] extractQuestions done in ${Date.now() - t0}ms, got ${questions.length} questions`);
    }

    // Stage 2: Answer extraction (still "extracting" status)
    {
      const t0 = Date.now();
      console.log(`[pipeline] stage extracting (answers) session=${sessionId}`);
      // keep status extracting

      const asDir = getAsDir(sessionId);
      const asPages = await loadPages(asDir);
      if (asPages.length === 0) throw new Error("No answer sheet pages found");

      // adapt PageInput for extractAnswers (needs buffer, pageNumber, width/height)
      const answers = await extractAnswers(
        asPages.map((p) => ({ buffer: p.buffer, pageNumber: p.pageNumber })),
        sessionId
      ).catch((e) => {
        throw new Error(`Answer extraction failed: ${(e as Error).message}`);
      });

      updateSession(sessionId, { answers });
      console.log(`[pipeline] extractAnswers done in ${Date.now() - t0}ms, got ${answers.length} blocks`);
    }

    // Stage 3: Mapping
    {
      const t0 = Date.now();
      console.log(`[pipeline] stage mapping session=${sessionId}`);
      updateSession(sessionId, { status: "mapping" });

      const sess = getSession(sessionId);
      if (!sess) throw new Error("Session lost before mapping");
      const mappings = await mapAnswers(sess.questions, sess.answers, sessionId).catch((e) => {
        throw new Error(`Mapping failed: ${(e as Error).message}`);
      });

      updateSession(sessionId, { mappings });
      console.log(`[pipeline] mapping done in ${Date.now() - t0}ms, ${mappings.length} mappings`);
    }

    // Stage 4: Grading
    {
      const t0 = Date.now();
      console.log(`[pipeline] stage grading session=${sessionId}`);
      updateSession(sessionId, { status: "grading" });

      const sess = getSession(sessionId);
      if (!sess) throw new Error("Session lost before grading");
      const grading = await grade(sess.questions, sess.answers, sess.mappings, sessionId).catch((e) => {
        throw new Error(`Grading failed: ${(e as Error).message}`);
      });

      updateSession(sessionId, { grading, status: "ready" });
      console.log(`[pipeline] grading done in ${Date.now() - t0}ms, ${grading.length} grades`);
    }

    console.log(`[pipeline] session=${sessionId} READY in ${Date.now() - startAll}ms`);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`[pipeline] session=${sessionId} ERROR after ${Date.now() - startAll}ms: ${msg}`);
    updateSession(sessionId, { status: "error", error: msg });
  }
}
