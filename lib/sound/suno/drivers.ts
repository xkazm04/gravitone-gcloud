// THE SUNO DRIVERS - the browser driver (lib/suno/driver), the API driver
// (lib/suno/api/driver, hybrid: the API creates and reads, the browser profile
// hands the audio URL) and the fake (./fakeDriver.ts) behind one interface.
// Server-only by use.
//
// Apart from ./queue.ts so the library import (./library.ts) and the bound
// producer (lib/producers/suno.ts) can name a driver without pulling the queue,
// and with it the kernel, into their import graph: the library route stays a
// plain v1 store route.
//
// SUNO_DRIVER = fake | browser | api; unset = auto. Auto decides PER CALL (the
// worker binds `sunoDriver()` once at module load, lib/producers/registry.ts):
// the API driver while this machine holds a Suno grant (`sunoApiStatus`, the
// token file only), the browser driver otherwise.

import { API_SUNO } from "@/lib/suno/api/driver";
import { sunoApiStatus, type SunoApiStatus } from "@/lib/suno/api/client";
import { createSunoTracks as realCreate, listSunoLibrary as realList, probeSuno as realProbe } from "@/lib/suno/driver";
import type { SunoClipRef, SunoDriverHealth, SunoFields, SunoLibraryClip, SunoModel, SunoPhase } from "@/lib/suno/types";

import { fakeCreateSunoTracks, fakeListSunoLibrary, fakeProbeSuno } from "./fakeDriver";

export interface SunoCreateOptions {
  /** Stable across retries of the same create (the kernel step's `ctx.key`): a driver that can
   *  dedupe on the vendor's side keys on it, so a retry does not pay twice. */
  readonly key?: string;
}

export interface SunoDriver {
  probe(): Promise<SunoDriverHealth>;
  create(fields: SunoFields, model: SunoModel, onPhase: (phase: SunoPhase) => void, opts?: SunoCreateOptions): Promise<SunoClipRef[]>;
  /** The operator's Suno library, read-only (./library.ts). */
  listLibrary(onPage?: (n: number, total: number | null) => void): Promise<SunoLibraryClip[]>;
  /** Credits left on the account, or null when this driver cannot read them (the browser driver has none). */
  credits?(): Promise<number | null>;
}

export type SunoDriverKind = "fake" | "browser" | "api";

/** The browser driver. `create` is wrapped: its fourth parameter is a test observer, not options. */
export const REAL_SUNO: SunoDriver = { probe: realProbe, create: (fields, model, onPhase) => realCreate(fields, model, onPhase), listLibrary: realList };
export const FAKE_SUNO_DRIVER: SunoDriver = { probe: fakeProbeSuno, create: fakeCreateSunoTracks, listLibrary: fakeListSunoLibrary, credits: async () => null };
export { API_SUNO };

export interface AutoSunoDeps {
  readonly status?: () => Promise<SunoApiStatus>;
  readonly api?: SunoDriver;
  readonly browser?: SunoDriver;
}

/** Which of the two real drivers auto picks right now. */
export async function autoSunoKind(status: () => Promise<SunoApiStatus> = sunoApiStatus): Promise<"api" | "browser"> {
  const s = await status().catch(() => ({ connected: false as const, reason: "" }));
  return s.connected ? "api" : "browser";
}

/** The delegating driver: every call asks `autoSunoKind` first, so a grant made or dropped after
 *  the worker bound it is honoured on the next call. */
export function autoSunoDriver(deps: AutoSunoDeps = {}): SunoDriver {
  const status = deps.status ?? sunoApiStatus;
  const pick = async (): Promise<SunoDriver> => ((await autoSunoKind(status)) === "api" ? (deps.api ?? API_SUNO) : (deps.browser ?? REAL_SUNO));
  return {
    probe: async () => (await pick()).probe(),
    create: async (fields, model, onPhase, opts) => (await pick()).create(fields, model, onPhase, opts),
    listLibrary: async (onPage) => (await pick()).listLibrary(onPage),
    credits: async () => {
      const d = await pick();
      return d.credits ? d.credits() : null;
    },
  };
}

export const AUTO_SUNO: SunoDriver = autoSunoDriver();

/** SUNO_DRIVER as written: one of the three kinds, or "auto" (unset or anything else). */
export function sunoDriverSetting(env: NodeJS.ProcessEnv = process.env): SunoDriverKind | "auto" {
  const v = env["SUNO_DRIVER"]?.trim();
  return v === "fake" || v === "browser" || v === "api" ? v : "auto";
}

/** Read per call, so a probe can switch it after import (SUNO_DRIVER=fake). The
 *  queue's jobs no longer read it to run dry - a job's mode does that - but the
 *  library import and a drive with no driver bound still do. */
export function sunoDriver(): SunoDriver {
  const s = sunoDriverSetting();
  return s === "fake" ? FAKE_SUNO_DRIVER : s === "browser" ? REAL_SUNO : s === "api" ? API_SUNO : AUTO_SUNO;
}

/** The driver a call would reach right now, with its kind (auto resolved): the doctor's question. */
export async function selectedSunoDriver(status: () => Promise<SunoApiStatus> = sunoApiStatus): Promise<{ readonly kind: SunoDriverKind; readonly driver: SunoDriver }> {
  const s = sunoDriverSetting();
  if (s === "fake") return { kind: "fake", driver: FAKE_SUNO_DRIVER };
  if (s === "browser") return { kind: "browser", driver: REAL_SUNO };
  if (s === "api") return { kind: "api", driver: API_SUNO };
  return (await autoSunoKind(status)) === "api" ? { kind: "api", driver: API_SUNO } : { kind: "browser", driver: REAL_SUNO };
}
