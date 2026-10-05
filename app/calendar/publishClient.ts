// The /calendar page's only way to the publishing engine: the /api/publish/*
// seams of the HTTP contract (.vault/Spark/briefs/platform-consolidation/
// 00-brief.md, "Data & API"). Thin on purpose — the engine decides; this file
// only turns a response into a typed result the UI can draw honestly.
//
// Every call resolves (never throws) to one of three shapes:
//   ok           the data
//   unavailable  the route does not exist (a Next 404 with no `{ error }` body):
//                the engine is not deployed here
//   refused      the route answered with a 4xx/5xx `{ error }`, or the network
//                failed (status 0) — the message is the work, shown verbatim
//
// THERE IS NO FIXTURE FALLBACK ANY MORE. One stood in while the engine (WP4)
// and this UI (WP5) were built in parallel; once both shipped in one build a
// missing route stopped being a state this page can meet, and the fixture's
// channel rows — spelling the server-only env var NAMES — tripped
// `npm run check:bundle` from a browser chunk even behind a dynamic import.

import { accessHeader } from "@/lib/imagingClient";
import type {
  ChannelId,
  ChannelReadiness,
  ExportRef,
  MetricSnapshot,
  Publication,
  ScheduleSlot,
} from "@/lib/publish/types";


export type Fetched<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "unavailable" | "refused"; status: number; error: string; path: string };


export interface ScheduleList {
  slots: ScheduleSlot[];
  now: string;
}
export interface ChannelList {
  channels: ChannelReadiness[];
  mode: "dry" | "live";
}
export interface ExportList {
  exports: ExportRef[];
}
export interface MetricsList {
  publications: Publication[];
  snapshots: MetricSnapshot[];
}
export interface RefreshResult {
  refreshed: number;
  note: string | null;
}
export interface NewSlot {
  projectId: string;
  exportId: string;
  channelId: ChannelId;
  publishAt: string;
  title: string;
  description: string;
  tags: string[];
}
export interface SlotPatch {
  publishAt?: string;
  status?: "scheduled" | "cancelled";
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
    return { ok: false, kind: "refused", status: 0, error: "the studio server could not be reached", path };
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
  const routed = json !== null && typeof json === "object";
  if (res.ok && routed) return { ok: true, data: json as T };
  // A Next 404 for a route that does not exist renders an HTML page, so it has
  // no JSON `{ error }` body. A route that exists and 404s an unknown id does.
  const missing = res.status === 404 && !(routed && typeof json.error === "string");
  if (missing) {
    return { ok: false, kind: "unavailable", status: 404, error: `${path} 404`, path };
  }
  const error = routed && typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
  return { ok: false, kind: "refused", status: res.status, error, path };
}

const slotPath = (id: string) => `/api/publish/schedule/${encodeURIComponent(id)}`;

export const getSchedule = () => call<ScheduleList>("/api/publish/schedule");
export const getChannels = () => call<ChannelList>("/api/publish/channels");
export const getExports = () => call<ExportList>("/api/publish/exports");
export const getMetrics = () => call<MetricsList>("/api/publish/metrics");

export const createSlot = (body: NewSlot) =>
  call<{ slot: ScheduleSlot }>("/api/publish/schedule", { method: "POST", body: JSON.stringify(body) });

export const patchSlot = (id: string, body: SlotPatch) =>
  call<{ slot: ScheduleSlot }>(slotPath(id), { method: "PATCH", body: JSON.stringify(body) });

export const cancelSlot = (id: string) => call<{ slot: ScheduleSlot }>(slotPath(id), { method: "DELETE" });

export const refreshMetrics = () => call<RefreshResult>("/api/publish/metrics/refresh", { method: "POST" });
