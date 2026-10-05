// The /calendar page's only way to the publishing engine: the /api/publish/*
// seams of the HTTP contract (.vault/Spark/briefs/platform-consolidation/
// 00-brief.md, "Data & API"). Thin on purpose — the engine decides; this file
// only turns a response into a typed result the UI can draw honestly.
//
// Every call resolves (never throws) to one of three shapes:
//   ok           the data, and where it came from (`api` or `fixture`)
//   unavailable  the route does not exist (a Next 404 with no `{ error }` body):
//                the engine has not landed, or is not deployed here
//   refused      the route answered with a 4xx/5xx `{ error }`, or the network
//                failed (status 0) — the message is the work, shown verbatim
//
// The fixture fallback (./fixtures.ts) is taken ONLY for `unavailable` and only
// outside production. A route that exists and refuses is never papered over with
// a fixture: that would hide the engine's own answer.

import { accessHeader } from "@/lib/imagingClient";
import type {
  ChannelId,
  ChannelReadiness,
  ExportRef,
  MetricSnapshot,
  Publication,
  ScheduleSlot,
} from "@/lib/publish/types";

import * as fx from "./fixtures";

export type Source = "api" | "fixture";

export type Fetched<T> =
  | { ok: true; data: T; source: Source }
  | { ok: false; kind: "unavailable" | "refused"; status: number; error: string; path: string };

export const FIXTURE_ALLOWED = process.env.NODE_ENV !== "production";

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

async function call<T>(path: string, init: RequestInit, fixture: () => T): Promise<Fetched<T>> {
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
  if (res.ok && routed) return { ok: true, data: json as T, source: "api" };
  // A Next 404 for a route that does not exist renders an HTML page, so it has
  // no JSON `{ error }` body. A route that exists and 404s an unknown id does.
  const missing = res.status === 404 && !(routed && typeof json.error === "string");
  if (missing) {
    if (FIXTURE_ALLOWED) {
      try {
        return { ok: true, data: fixture(), source: "fixture" };
      } catch (e) {
        const f = e as fx.FixtureRefusal;
        return { ok: false, kind: "refused", status: f.status ?? 500, error: f.message, path };
      }
    }
    return { ok: false, kind: "unavailable", status: 404, error: `${path} 404`, path };
  }
  const error = routed && typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
  return { ok: false, kind: "refused", status: res.status, error, path };
}

/** A mutation follows the source its list came from: a fixture list is changed
 *  in the fixture, an engine list through the engine. Mixing the two would
 *  schedule a real slot from a fabricated export. */
async function mutate<T>(path: string, init: RequestInit, source: Source, fixture: () => T): Promise<Fetched<T>> {
  if (source === "fixture") {
    try {
      return { ok: true, data: fixture(), source: "fixture" };
    } catch (e) {
      const f = e as fx.FixtureRefusal;
      return { ok: false, kind: "refused", status: f.status ?? 500, error: f.message, path };
    }
  }
  return call(path, init, () => {
    throw new fx.FixtureRefusal(`${path} 404`, 404);
  });
}

const slotPath = (id: string) => `/api/publish/schedule/${encodeURIComponent(id)}`;

export const getSchedule = () => call<ScheduleList>("/api/publish/schedule", {}, fx.fxSchedule);
export const getChannels = () => call<ChannelList>("/api/publish/channels", {}, fx.fxChannels);
export const getExports = () => call<ExportList>("/api/publish/exports", {}, fx.fxExports);
export const getMetrics = () => call<MetricsList>("/api/publish/metrics", {}, fx.fxMetrics);

export const createSlot = (body: NewSlot, source: Source) =>
  mutate<{ slot: ScheduleSlot }>(
    "/api/publish/schedule",
    { method: "POST", body: JSON.stringify(body) },
    source,
    () => fx.fxCreate(body),
  );

export const patchSlot = (id: string, body: SlotPatch, source: Source) =>
  mutate<{ slot: ScheduleSlot }>(slotPath(id), { method: "PATCH", body: JSON.stringify(body) }, source, () =>
    fx.fxPatch(id, body),
  );

export const cancelSlot = (id: string, source: Source) =>
  mutate<{ slot: ScheduleSlot }>(slotPath(id), { method: "DELETE" }, source, () => fx.fxDelete(id));

export const refreshMetrics = (source: Source) =>
  mutate<RefreshResult>("/api/publish/metrics/refresh", { method: "POST" }, source, fx.fxRefresh);
