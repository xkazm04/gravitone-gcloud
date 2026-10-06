// THE CLIENT DOOR FOR TURNS — the one place a browser starts, watches, lists
// or cancels a server-owned AI turn (AIO-A, stage 2).
//
// Why one door: the turn routes are gated, and every gated client call has to
// carry `accessHeader()`. The recalibrate fetch once went out without it, the
// gate answered 401 the moment IMAGING_ACCESS_SECRET was set, and the client
// turned that 401 into a silently staged "Simulated instead" candidate
// (client-api-auth.probe). A rule spread across call sites is a rule some call
// site forgets, so the calls live here and nowhere else —
// tests/golden-path/turn-recalibrate.probe.spec.ts walks app/, components/ and
// lib/ and fails on any raw fetch of /api/recalibrate or /api/turns outside
// this file.
//
// NOT SERVER CODE, AND IT IMPORTS NONE: lib/turns/ledger.ts pulls node:fs and
// node:crypto, so only its TYPES come across. The live-status set is restated
// below rather than imported for the same reason.

import { accessHeader } from "@/lib/imagingClient";

import type { TurnRecord, TurnStatus } from "./ledger";

export type { TurnRecord, TurnStatus };

/** A record as the list answers it: everything but `result`, which only the
 *  single-turn read carries (a plan is the creator's work, and a list that
 *  polls every few seconds has no use for it). */
export type TurnSummary = Omit<TurnRecord, "result">;

const LIVE_STATUSES: ReadonlySet<TurnStatus> = new Set(["accepted", "running"]);
export const isLiveTurn = (s: TurnStatus): boolean => LIVE_STATUSES.has(s);

export type StartOutcome =
  | { ok: true; turnId: string }
  | { ok: false; status: number; detail: string; code?: string; holder?: string };

const JSON_HEADERS = { "content-type": "application/json" } as const;

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function refusedOf(res: Response, json: Record<string, unknown>): StartOutcome {
  return {
    ok: false,
    status: res.status,
    detail: typeof json.detail === "string" ? json.detail : "",
    ...(typeof json.code === "string" ? { code: json.code } : {}),
    ...(typeof json.holder === "string" ? { holder: json.holder } : {}),
  };
}

/** Start a recalibration. The route keeps the prompt assembly and its
 *  refusals (413 too large, 400 no notes); a 202 means the record is written
 *  and the engine is the server's business from here. 409 names the turn that
 *  already holds this project's slot. */
export async function startRecalibrate(projectId: string, body: Record<string, unknown>): Promise<StartOutcome> {
  const res = await fetch("/api/recalibrate", {
    method: "POST",
    headers: { ...JSON_HEADERS, ...accessHeader() },
    body: JSON.stringify({ ...body, projectId }),
  });
  const json = await bodyOf(res);
  if (res.status === 202 && typeof json.turnId === "string") return { ok: true, turnId: json.turnId };
  return refusedOf(res, json);
}

/** Start any registered turn kind through the generic door. */
export async function startTurn(kind: string, projectId: string, input: unknown): Promise<StartOutcome> {
  const res = await fetch("/api/turns", {
    method: "POST",
    headers: { ...JSON_HEADERS, ...accessHeader() },
    body: JSON.stringify({ kind, projectId, input }),
  });
  const json = await bodyOf(res);
  if (res.status === 202 && typeof json.turnId === "string") return { ok: true, turnId: json.turnId };
  return refusedOf(res, json);
}

export class TurnClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TurnClientError";
  }
}

/** One turn as the ledger holds it now, `result` included. Null when the
 *  ledger has no such turn. */
export async function getTurn(id: string): Promise<TurnRecord | null> {
  const res = await fetch(`/api/turns/${encodeURIComponent(id)}`, { headers: { ...accessHeader() } });
  if (res.status === 404) return null;
  const json = await bodyOf(res);
  if (!res.ok) throw new TurnClientError(typeof json.detail === "string" ? json.detail : `turn read failed (${res.status})`, res.status);
  return json.turn as TurnRecord;
}

export type CancelOutcome =
  | { ok: true; turn: TurnSummary }
  | { ok: false; status: number; detail: string; turn?: TurnSummary };

/** Stop a live turn and its engine. A 409 is a turn that already ended (its
 *  record comes back as it is) or one another server process holds. */
export async function cancelTurn(id: string): Promise<CancelOutcome> {
  const res = await fetch(`/api/turns/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { ...accessHeader() },
  });
  const json = await bodyOf(res);
  const turn = json.turn as TurnSummary | undefined;
  if (res.ok && turn) return { ok: true, turn };
  return { ok: false, status: res.status, detail: typeof json.detail === "string" ? json.detail : "", ...(turn ? { turn } : {}) };
}

/** This project's turns, newest first, without results. */
export async function listTurns(projectId: string, kind?: string): Promise<TurnSummary[]> {
  const q = new URLSearchParams({ projectId });
  if (kind) q.set("kind", kind);
  const res = await fetch(`/api/turns?${q.toString()}`, { headers: { ...accessHeader() } });
  const json = await bodyOf(res);
  if (!res.ok) throw new TurnClientError(typeof json.detail === "string" ? json.detail : `turn list failed (${res.status})`, res.status);
  return Array.isArray(json.turns) ? (json.turns as TurnSummary[]) : [];
}

/** What a surface that just mounted should do about its project's newest turn
 *  of one kind:
 *   · `watch` — it is still running; show it and offer the cancel.
 *   · `land`  — it ended `done` or `failed` and this surface has not taken it
 *               yet (`consumed` is the last turn id it took); here is the
 *               whole record, result included. Taken at most once, because the
 *               caller records the id it consumed.
 *   · `none`  — nothing new: no turn, the one it already took, or one that was
 *               cancelled or orphaned (nothing to stage from either). */
export type Landing =
  | { action: "watch"; turn: TurnSummary }
  | { action: "land"; turn: TurnRecord }
  | { action: "none"; turn?: TurnSummary };

export async function resumeTurn(projectId: string, kind: string, consumed: string | null): Promise<Landing> {
  const [latest] = await listTurns(projectId, kind);
  if (!latest) return { action: "none" };
  if (isLiveTurn(latest.status)) return { action: "watch", turn: latest };
  if (latest.id === consumed || (latest.status !== "done" && latest.status !== "failed")) return { action: "none", turn: latest };
  const full = await getTurn(latest.id);
  return full ? { action: "land", turn: full } : { action: "none", turn: latest };
}
