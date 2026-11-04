import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { err, ok, type Result } from "@gt/domain/errors";

import { filePathAbs, soundFailure } from "../sound/store.ts";
import type { SoundTake } from "../sound/types.ts";

// A TAKE'S SHA (spark yue2-song-lab, Director amendment to WP3): the sha256 hex of the take's stored
// file bytes, resolved inside the sound store (lib/sound/store.ts filePathAbs). The one key the song
// lab's derived rows read by: `audio_song_scores` (lib/yue2/scores.ts) and the blind desk's gate
// (lib/yue2/ab.ts). Bytes, not a path: a file re-filed under another name keeps its scores.

export async function takeSha(take: SoundTake): Promise<Result<string>> {
  if (take.file === null) return err("invalid", `take ${take.id} has no audio file`);
  try {
    return ok(createHash("sha256").update(await readFile(filePathAbs(take.file.path))).digest("hex"));
  } catch (e) {
    return soundFailure(e);
  }
}
