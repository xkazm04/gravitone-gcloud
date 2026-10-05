// The /articles pages' only way to the article engine: the /api/articles/*
// routes (docs/articles.md, "For the routes and the /articles surface"). Thin
// on purpose — the engine decides; this file turns a response into a typed
// result the page can draw honestly.
//
// CLIENT-SAFE BY CONSTRUCTION. It imports lib/articles/types.ts and nothing
// else from lib/articles/: every other module there is server-only and reads
// server-side configuration, and a client chunk must not even spell it.
//
// Every call resolves (never throws) to one of three shapes, as
// app/calendar/publishClient.ts does:
//   ok           the data
//   unavailable  the route does not exist here (a Next 404 with no `{ error }`)
//   refused      the route answered 4xx/5xx `{ error, code }`, or the network
//                failed (status 0) — the message is the work, shown verbatim

import { accessHeader } from "@/lib/imagingClient";
import type { ArticleRun, ArticleRunDetail, CreateRunInput } from "@/lib/articles/types";

export type Fetched<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "unavailable" | "refused"; status: number; error: string; code: string | null };

export interface RunList {
  runs: ArticleRun[];
  /** Run directories whose manifest could not be read. Named, never hidden. */
  damaged: string[];
  /** Ids a live process is driving right now. */
  driving: string[];
}

export interface AgentReceipt {
  turn: string;
  outcome: string;
  turns?: number;
  durationMs?: number;
  costUsd?: number;
  errors: string[];
}

/** GET /api/articles/<id>: the engine's detail plus what the route reads off
 *  the run directory (app/api/articles/[runId]/route.ts). Absent = no file. */
export interface RunDetail extends ArticleRunDetail {
  driving: boolean;
  agent: Partial<Record<"research" | "outline" | "draft", AgentReceipt>>;
  refused?: { reason: string; target: string | null; id: string | null }[];
  landingLog?: string;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<Fetched<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", ...accessHeader(), ...(init.headers ?? {}) },
    });
  } catch {
    return { ok: false, kind: "refused", status: 0, error: "the studio server could not be reached", code: null };
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: unknown; detail?: unknown; code?: unknown }) | null;
  const routed = json !== null && typeof json === "object";
  if (res.ok && routed) return { ok: true, data: json as T };
  // The engine's routes answer `{ error }`; lib/apiAuth.ts's doors answer
  // `{ detail }` (a 401 names the variable the operator has to set).
  const said = routed ? (typeof json.error === "string" ? json.error : typeof json.detail === "string" ? json.detail : null) : null;
  if (res.status === 404 && said === null) {
    return { ok: false, kind: "unavailable", status: 404, error: `${path} 404`, code: null };
  }
  return {
    ok: false,
    kind: "refused",
    status: res.status,
    error: said ?? `HTTP ${res.status}`,
    code: routed && typeof json.code === "string" ? json.code : null,
  };
}

const runPath = (id: string) => `/api/articles/${encodeURIComponent(id)}`;

export const listRuns = () => call<RunList>("/api/articles");
export const getRun = (id: string) => call<RunDetail>(runPath(id));
export const createRun = (body: CreateRunInput) => call<{ run: ArticleRun }>("/api/articles", { method: "POST", body: JSON.stringify(body) });
export const approveRun = (id: string, patches: string[]) =>
  call<{ run: ArticleRun }>(`${runPath(id)}/approve`, { method: "POST", body: JSON.stringify({ patches }) });
export const rejectRun = (id: string, note: string) =>
  call<{ run: ArticleRun }>(`${runPath(id)}/reject`, { method: "POST", body: JSON.stringify({ note }) });
export const resumeRun = (id: string) => call<{ run: ArticleRun }>(`${runPath(id)}/resume`, { method: "POST" });

/** A run file as a URL an <iframe> or <img> can load: the secret rides as `k`
 *  because neither can send a header (app/api/articles/[runId]/file). */
export function runFileUrl(id: string, rel: string): string {
  const k = process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET?.trim();
  const at = rel.split("/").map(encodeURIComponent).join("/");
  return `${runPath(id)}/file/${at}${k ? `?k=${encodeURIComponent(k)}` : ""}`;
}
