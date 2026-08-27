import * as os from "os";
import * as path from "path";
import type { SessionState } from "@/types";

// ---------------------------------------------------------------------------
// In-memory store on globalThis so dev hot-reload doesn't wipe sessions.
// Caveat: Vercel serverless functions don't share memory across instances;
// /tmp files are also ephemeral. For a demo with low traffic this is
// acceptable (brief PRD §4). For durability move to Redis / blob store.
// ---------------------------------------------------------------------------

export const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min sweep stub

declare global {
  var __vedaai_sessions: Map<string, SessionState> | undefined;
  var __vedaai_sessions_meta: Map<string, number> | undefined; // last access timestamp
}

function getStore(): Map<string, SessionState> {
  if (!globalThis.__vedaai_sessions) {
    globalThis.__vedaai_sessions = new Map<string, SessionState>();
  }
  return globalThis.__vedaai_sessions;
}

function getMetaStore(): Map<string, number> {
  if (!globalThis.__vedaai_sessions_meta) {
    globalThis.__vedaai_sessions_meta = new Map<string, number>();
  }
  return globalThis.__vedaai_sessions_meta;
}

export function createSession(state: SessionState): void {
  const store = getStore();
  const meta = getMetaStore();
  store.set(state.sessionId, state);
  meta.set(state.sessionId, Date.now());
}

export function getSession(id: string): SessionState | undefined {
  const s = getStore().get(id);
  if (s) getMetaStore().set(id, Date.now());
  return s;
}

export function updateSession(id: string, patch: Partial<SessionState>): SessionState | undefined {
  const store = getStore();
  const existing = store.get(id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch } as SessionState;
  store.set(id, next);
  getMetaStore().set(id, Date.now());
  return next;
}

export function deleteSession(id: string): void {
  getStore().delete(id);
  getMetaStore().delete(id);
}

export function listSessionIds(): string[] {
  return [...getStore().keys()];
}

// ---------------------------------------------------------------------------
// Path helpers — always use os.tmpdir() so Windows (%TEMP%) works.
// Layout:  os.tmpdir()/vedaai/{sessionId}/orig/qp.*|as.*
//          os.tmpdir()/vedaai/{sessionId}/qp/page-N.png
//          os.tmpdir()/vedaai/{sessionId}/as/page-N.png
// ---------------------------------------------------------------------------

export function getSessionDir(sessionId: string): string {
  return path.join(os.tmpdir(), "vedaai", sessionId);
}

export function getOrigDir(sessionId: string): string {
  return path.join(getSessionDir(sessionId), "orig");
}

export function getQpDir(sessionId: string): string {
  return path.join(getSessionDir(sessionId), "qp");
}

export function getAsDir(sessionId: string): string {
  return path.join(getSessionDir(sessionId), "as");
}

export function getQpPagePath(sessionId: string, page: number): string {
  return path.join(getQpDir(sessionId), `page-${page}.png`);
}

export function getAsPagePath(sessionId: string, page: number): string {
  return path.join(getAsDir(sessionId), `page-${page}.png`);
}

export function getPageImageUrl(sessionId: string, type: "qp" | "as", page: number): string {
  return `/api/file/${sessionId}/${type}/${page}`;
}

// Optional sweep (not scheduled automatically; call manually if needed)
export function sweepExpiredSessions(): string[] {
  const now = Date.now();
  const meta = getMetaStore();
  const store = getStore();
  const expired: string[] = [];
  for (const [id, ts] of meta.entries()) {
    if (now - ts > SESSION_TTL_MS) {
      store.delete(id);
      meta.delete(id);
      expired.push(id);
    }
  }
  return expired;
}
