import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  // Lightweight poll target — only status + error
  // Log sparsely to avoid noise (every ~5th poll would be ideal, but we just log at debug level)
  return NextResponse.json({ status: session.status, error: session.error ?? null });
}
