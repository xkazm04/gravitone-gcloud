import { errorMessage } from "@gt/domain/errors";
import { startedEpisodes } from "@gt/kernel/productions/store";

import { kernel } from "../../kernelProcess.ts";

// AN EPISODE THE OPERATOR STARTED AS A PRODUCTION IS TAKEN (spark concept-casting-stages S1): `episodesDue` and the
// storyboard door read the kernel's production record here, and neither the channel file nor a night has to know.
//
// A shell that moved the channel store and named no kernel store (a test, a rehearsal) gets no started episode: it
// must not open the operator's store just to answer this, the channels.ts channelsDir rule said for the kernel.

export type EpisodeTaken = () => ReadonlySet<string> | Promise<ReadonlySet<string>>;

const NONE: ReadonlySet<string> = new Set();

function fromKernel(): ReadonlySet<string> {
  const moved = (process.env["SCOUT_CHANNELS_DIR"]?.trim() ?? "") !== "" || (process.env["SCOUT_STORE_DIR"]?.trim() ?? "") !== "";
  if (moved && (process.env["GRAVITONE_STORE_PATH"]?.trim() ?? "") === "") return NONE;
  const k = kernel();
  if (!k.ok) throw new Error(`the kernel store did not read: ${k.error.message}`);
  const r = k.value.store.read((x) => startedEpisodes(x));
  if (!r.ok) throw new Error(`the kernel store did not read: ${errorMessage(r.error)}`);
  return r.value;
}

let taken: EpisodeTaken = fromKernel;

/** The episode ids a production holds. A store that cannot be read throws: it never reads as "none taken". */
export const takenEpisodes = async (): Promise<ReadonlySet<string>> => taken();

/** A test's taken set in place of the kernel's; null restores it. */
export function setEpisodeTakenForTests(t: EpisodeTaken | null): void {
  taken = t ?? fromKernel;
}
