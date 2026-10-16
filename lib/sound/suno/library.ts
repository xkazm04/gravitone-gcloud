// THE SUNO LIBRARY IMPORT — server-only. Every finished song in the operator's
// Suno library becomes a SunoClip (origin "library") in the gate's triage, so
// the canvas judges real songs instead of a stub.
//
// FREE AND READ-ONLY: the driver lists the library through the library page's
// own feed query (lib/suno/driver.ts listSunoLibrary) and clicks nothing. The
// list is read OUTSIDE the store lock (it is seconds of network) and merged
// inside it, so a take or a queue write is never held up by Suno.
//
// IDEMPOTENT BY SONG ID, against EVERY clip already in suno.json: a clip our
// queue rendered is in the library too, and is not imported a second time. A
// re-run adds only what is new. An imported clip keeps nothing of ours but an
// id: no job, no verdict, no lane - it lands ungrouped in triage until the
// operator moves it.

import type { SunoClip, SunoImportResult } from "@/lib/suno/types";

import { sunoDriver } from "./drivers";
import { mintSunoId, withSuno } from "./store";

export async function importSunoLibrary(onPage?: (n: number, total: number | null) => void): Promise<SunoImportResult> {
  const list = await sunoDriver().listLibrary(onPage);
  return withSuno((f) => {
    const have = new Set(f.clips.map((c) => c.songId));
    let added = 0;
    // Suno lists newest first; insert oldest first so the file reads in the
    // order the songs were made.
    for (const s of [...list].reverse()) {
      if (have.has(s.songId)) continue;
      have.add(s.songId);
      const clip: SunoClip = {
        id: mintSunoId("sc"),
        origin: "library",
        jobId: null,
        songId: s.songId,
        url: s.url,
        audioUrl: s.audioUrl,
        imageUrl: s.imageUrl,
        title: s.title,
        durationS: s.durationS,
        model: s.model,
        createdAt: s.createdAt,
        verdict: null,
        prompt: { ...s.prompt },
      };
      f.clips.push(clip);
      added++;
    }
    return { added, skipped: list.length - added, total: list.length };
  });
}
