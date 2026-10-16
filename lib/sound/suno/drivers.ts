// THE SUNO DRIVERS - the real browser driver (lib/suno/driver) and its fake
// (./fakeDriver.ts) behind one interface. Server-only by use.
//
// Apart from ./queue.ts so the library import (./library.ts) and the bound
// producer (lib/producers/suno.ts) can name a driver without pulling the queue,
// and with it the kernel, into their import graph: the library route stays a
// plain v1 store route.

import { createSunoTracks as realCreate, listSunoLibrary as realList, probeSuno as realProbe } from "@/lib/suno/driver";
import type { SunoClipRef, SunoDriverHealth, SunoFields, SunoLibraryClip, SunoModel, SunoPhase } from "@/lib/suno/types";

import { fakeCreateSunoTracks, fakeListSunoLibrary, fakeProbeSuno } from "./fakeDriver";

export interface SunoDriver {
  probe(): Promise<SunoDriverHealth>;
  create(fields: SunoFields, model: SunoModel, onPhase: (phase: SunoPhase) => void): Promise<SunoClipRef[]>;
  /** The operator's Suno library, read-only (./library.ts). */
  listLibrary(onPage?: (n: number, total: number | null) => void): Promise<SunoLibraryClip[]>;
}

export const REAL_SUNO: SunoDriver = { probe: realProbe, create: realCreate, listLibrary: realList };
export const FAKE_SUNO_DRIVER: SunoDriver = { probe: fakeProbeSuno, create: fakeCreateSunoTracks, listLibrary: fakeListSunoLibrary };

/** Read per call, so a probe can switch it after import (SUNO_DRIVER=fake). The
 *  queue's jobs no longer read it to run dry - a job's mode does that - but the
 *  library import and a drive with no driver bound still do. */
export const sunoDriver = (): SunoDriver => (process.env.SUNO_DRIVER?.trim() === "fake" ? FAKE_SUNO_DRIVER : REAL_SUNO);
