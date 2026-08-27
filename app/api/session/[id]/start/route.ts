import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/session";
import { runPipeline } from "@/lib/pipeline/runPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Guard against double-start: only allow uploaded or error
  if (session.status !== "uploaded" && session.status !== "error") {
    return NextResponse.json(
      { error: `Session already in status "${session.status}" — cannot start`, status: session.status },
      { status: 409 }
    );
  }

  // Flip to extracting and fire-and-forget
  updateSession(id, { status: "extracting", error: undefined });
  console.log(`[api/start] session=${id} → extracting, kicking off pipeline`);

  // Fire-and-forget: don't await beyond kick-off (PRD §7 polling design)
  // Use setImmediate to ensure response returns immediately
  setImmediate(() => {
    runPipeline(id).catch((e) => {
      console.error(`[api/start] runPipeline unhandled for ${id}:`, e);
    });
  });

  return NextResponse.json({ status: "extracting", sessionId: id });
}
