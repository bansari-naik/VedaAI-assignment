import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs/promises";
import * as path from "path";
import { rasterizeToPages } from "@/lib/raster";
import {
  createSession,
  getOrigDir,
  getQpDir,
  getAsDir,
  getPageImageUrl,
} from "@/lib/session";
import type { SessionState, UploadedFile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);
const ALLOWED_EXTS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

function getExt(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

function isAllowedFile(file: File): boolean {
  const ext = getExt(file.name);
  const mimeOk = ALLOWED_MIMES.has(file.type);
  const extOk = ALLOWED_EXTS.has(ext);
  // Windows may report odd MIME, so allow if ext is ok
  return mimeOk || extOk;
}

function normalizeMime(file: File): string {
  if (ALLOWED_MIMES.has(file.type)) return file.type;
  const ext = getExt(file.name);
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return file.type || "application/octet-stream";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const qpRaw = formData.get("questionPaper");
    const asRaw = formData.get("answerSheet");

    if (!(qpRaw instanceof File) || !(asRaw instanceof File)) {
      return NextResponse.json(
        { error: "Both questionPaper and answerSheet files are required." },
        { status: 400 }
      );
    }

    const qpFile: File = qpRaw;
    const asFile: File = asRaw;

    // Size guard (server-side)
    for (const f of [qpFile, asFile]) {
      if (f.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `File "${f.name}" exceeds 10MB limit.` },
          { status: 413 }
        );
      }
      if (!isAllowedFile(f)) {
        return NextResponse.json(
          { error: `File "${f.name}" type not allowed. Use PDF, PNG, JPG, JPEG.` },
          { status: 400 }
        );
      }
    }

    const sessionId = uuidv4();
    console.log(`[upload] new session ${sessionId} qp=${qpFile.name} (${qpFile.size} bytes, ${qpFile.type}) as=${asFile.name} (${asFile.size} bytes, ${asFile.type})`);

    // Prepare dirs
    const origDir = getOrigDir(sessionId);
    const qpDir = getQpDir(sessionId);
    const asDir = getAsDir(sessionId);
    await fs.mkdir(origDir, { recursive: true });
    await fs.mkdir(qpDir, { recursive: true });
    await fs.mkdir(asDir, { recursive: true });

    // Save originals for debugging / future re-rasterization
    const qpBuffer = Buffer.from(await qpFile.arrayBuffer());
    const asBuffer = Buffer.from(await asFile.arrayBuffer());
    const qpMime = normalizeMime(qpFile);
    const asMime = normalizeMime(asFile);

    const qpOrigPath = path.join(origDir, `qp${getExt(qpFile.name) || ".bin"}`);
    const asOrigPath = path.join(origDir, `as${getExt(asFile.name) || ".bin"}`);
    await fs.writeFile(qpOrigPath, qpBuffer);
    await fs.writeFile(asOrigPath, asBuffer);
    console.log(`[upload] saved originals to ${origDir}`);

    // Rasterize
    let qpPages, asPages;
    try {
      const t0 = Date.now();
      qpPages = await rasterizeToPages(qpBuffer, qpMime);
      console.log(`[upload] qp rasterized ${qpPages.length} pages in ${Date.now() - t0}ms`);
    } catch (e) {
      console.error("[upload] qp rasterize failed", e);
      return NextResponse.json({ error: `Failed to rasterize question paper: ${(e as Error).message}` }, { status: 422 });
    }

    try {
      const t0 = Date.now();
      asPages = await rasterizeToPages(asBuffer, asMime);
      console.log(`[upload] as rasterized ${asPages.length} pages in ${Date.now() - t0}ms`);
    } catch (e) {
      console.error("[upload] as rasterize failed", e);
      return NextResponse.json({ error: `Failed to rasterize answer sheet: ${(e as Error).message}` }, { status: 422 });
    }

    // Write PNGs to qp/as dirs
    for (let i = 0; i < qpPages.length; i++) {
      const p = path.join(qpDir, `page-${i + 1}.png`);
      await fs.writeFile(p, qpPages[i].buffer);
    }
    for (let i = 0; i < asPages.length; i++) {
      const p = path.join(asDir, `page-${i + 1}.png`);
      await fs.writeFile(p, asPages[i].buffer);
    }
    console.log(`[upload] wrote ${qpPages.length} qp PNGs to ${qpDir}, ${asPages.length} as PNGs to ${asDir}`);

    const qpUploaded: UploadedFile = {
      id: uuidv4(),
      originalName: qpFile.name,
      mimeType: qpMime,
      sizeBytes: qpFile.size,
      pageCount: qpPages.length,
      pageImages: qpPages.map((_, i) => getPageImageUrl(sessionId, "qp", i + 1)),
    };

    const asUploaded: UploadedFile = {
      id: uuidv4(),
      originalName: asFile.name,
      mimeType: asMime,
      sizeBytes: asFile.size,
      pageCount: asPages.length,
      pageImages: asPages.map((_, i) => getPageImageUrl(sessionId, "as", i + 1)),
    };

    const state: SessionState = {
      sessionId,
      questionPaper: qpUploaded,
      answerSheet: asUploaded,
      questions: [],
      answers: [],
      mappings: [],
      grading: [],
      status: "uploaded",
    };

    createSession(state);
    console.log(`[upload] session ${sessionId} stored status=uploaded`);

    return NextResponse.json({
      sessionId,
      questionPaper: {
        name: qpUploaded.originalName,
        size: qpUploaded.sizeBytes,
        pageCount: qpUploaded.pageCount,
        pageImages: qpUploaded.pageImages,
      },
      answerSheet: {
        name: asUploaded.originalName,
        size: asUploaded.sizeBytes,
        pageCount: asUploaded.pageCount,
        pageImages: asUploaded.pageImages,
      },
      status: state.status,
    });
  } catch (err) {
    console.error("[upload] unexpected error", err);
    // Avoid leaking filesystem details
    return NextResponse.json({ error: "Internal server error during upload." }, { status: 500 });
  }
}
