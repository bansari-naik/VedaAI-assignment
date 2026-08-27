import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { getSession, getQpDir, getAsDir } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["qp", "as"]);

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; type: string; page: string }> }
) {
  const { id, type, page } = await ctx.params;

  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 404 });
  }

  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    return NextResponse.json({ error: "Invalid page" }, { status: 404 });
  }

  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const expectedCount =
    type === "qp" ? session.questionPaper.pageCount : session.answerSheet.pageCount;

  if (pageNum > expectedCount) {
    return NextResponse.json({ error: "Page out of range" }, { status: 404 });
  }

  const dir = type === "qp" ? getQpDir(id) : getAsDir(id);
  const filePath = path.join(dir, `page-${pageNum}.png`);

  try {
    const buf = await fs.readFile(filePath);
    // Basic PNG magic check
    if (buf.length < 8 || buf[0] !== 0x89) {
      console.warn(`[file] ${filePath} does not look like PNG`);
    }
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(buf.length),
      },
    });
  } catch (e) {
    console.error(`[file] read failed ${filePath}:`, e);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
