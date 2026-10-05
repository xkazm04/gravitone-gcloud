// The browser's only way to the sound store: typed wrappers over /api/sound/*
// (the HTTP contract in .vault/Spark/briefs/platform-consolidation/30-r4-sound-lab.md).
// Every call resolves — never throws — to `{ ok: true, data }` or
// `{ ok: false, status, error }`, the error being the engine's own words.

import { accessHeader } from "@/lib/imagingClient";

import type {
  GenerateRequest,
  Hunt,
  HuntNode,
  InsightCell,
  Lesson,
  SoundGroups,
  SoundKind,
  SoundTake,
  TakePatch,
  TakeOrigin,
  Verdict,
  Stage,
  ProviderId,
} from "./types";

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  let res: Response;
  try {
    const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
    res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { ...(isForm ? {} : { "content-type": "application/json" }), ...accessHeader(), ...(init.headers ?? {}) },
    });
  } catch {
    return { ok: false, status: 0, error: "the studio server could not be reached" };
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
  if (res.ok && json !== null) return { ok: true, data: json as T };
  const error = json && typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
  return { ok: false, status: res.status, error };
}

const q = (o: Record<string, string | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export interface TakeQuery {
  kind?: SoundKind;
  verdict?: Verdict;
  stage?: Stage;
  provider?: ProviderId;
  origin?: TakeOrigin;
  /** Fixture rows are excluded unless asked for. */
  fixtures?: boolean;
}

/** The file URL for a take's bytes — usable directly as an <audio src>.
 *  An <audio> element cannot send the Authorization header accessHeader()
 *  adds, so the access key rides as `k=` (the file route accepts it, and it is
 *  read off accessHeader() so this module names no environment). Without it every lab
 *  and Library player 401s once the secret is set. */
export const takeFileUrl = (id: string) => {
  const base = `/api/sound/takes/${encodeURIComponent(id)}/file`;
  const auth = accessHeader().authorization;
  const k = auth ? auth.replace(/^Bearer\s+/i, "") : "";
  return k ? `${base}?k=${encodeURIComponent(k)}` : base;
};

export const listTakes = (f: TakeQuery = {}) =>
  call<{ takes: SoundTake[] }>(
    `/api/sound/takes${q({ kind: f.kind, verdict: f.verdict, stage: f.stage, provider: f.provider, origin: f.origin, fixtures: f.fixtures ? "1" : null })}`,
  );

export const patchTake = (id: string, patch: TakePatch) =>
  call<{ take: SoundTake }>(`/api/sound/takes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });

/** Import a file (a Suno return, a manual import, a migrated Library row). `meta`
 *  is a partial SoundTake; the server fills ids, file and timestamps. */
export const uploadTake = (file: Blob, fileName: string, meta: Partial<SoundTake>) => {
  const form = new FormData();
  form.set("file", file, fileName);
  form.set("meta", JSON.stringify(meta));
  return call<{ take: SoundTake }>("/api/sound/takes", { method: "POST", body: form });
};

/** Bills the provider. The response carries the persisted take. */
export const generateTake = (req: GenerateRequest) =>
  call<{ take: SoundTake }>("/api/sound/generate", { method: "POST", body: JSON.stringify(req) });

export const getInsights = (kind: SoundKind) =>
  call<{ cells: InsightCell[]; lessons: Lesson[]; judged: number }>(`/api/sound/insights${q({ kind })}`);

export const listLessons = (kind?: SoundKind) => call<{ lessons: Lesson[] }>(`/api/sound/lessons${q({ kind })}`);

export const addLesson = (lesson: Omit<Lesson, "id" | "confirmedAt">) =>
  call<{ lesson: Lesson }>("/api/sound/lessons", { method: "POST", body: JSON.stringify(lesson) });

export const getGroups = () => call<{ groups: SoundGroups }>("/api/sound/groups");

export const putGroups = (groups: SoundGroups) =>
  call<{ groups: SoundGroups }>("/api/sound/groups", { method: "PUT", body: JSON.stringify({ groups }) });

export const listHunts = (kind?: SoundKind) => call<{ hunts: Hunt[] }>(`/api/sound/hunts${q({ kind })}`);

/** Asks the text engine (lib/text) to draft a map of variants for an idea. */
export const draftHunt = (kind: SoundKind, idea: string) =>
  call<{ hunt: Hunt }>("/api/sound/hunts", { method: "POST", body: JSON.stringify({ kind, idea }) });

export const patchHunt = (id: string, patch: { nodes?: HuntNode[]; lessonId?: string | null }) =>
  call<{ hunt: Hunt }>(`/api/sound/hunts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });

/** Asks the text engine to draft a lesson from a hunt's results. A human confirms it via addLesson. */
export const draftHuntLesson = (id: string) =>
  call<{ draft: Omit<Lesson, "id" | "confirmedAt"> }>(`/api/sound/hunts/${encodeURIComponent(id)}/lesson`, { method: "POST" });

/** Remove every fixture take — the Library's "clear the examples". Fixtures
 *  only: the route refuses any other origin (DELETE /api/sound/takes?origin=fixture).
 *  ADDED BY WP1 (2026-10-05), additive: the contract had no delete, and the
 *  brief's demo chip needs one. */
export const clearFixtures = () => call<{ removed: number }>("/api/sound/takes?origin=fixture", { method: "DELETE" });
