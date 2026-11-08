import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { err, ok, type Result } from "@gt/domain/errors";

import { filePathAbs, soundFailure } from "../sound/store.ts";
import type { SoundTake } from "../sound/types.ts";
import { readYue2Facts } from "./facts.ts";

// A TAKE'S SHA (spark yue2-song-lab, Director amendment to WP3): the sha256 hex of the take's stored
// file bytes, resolved inside the sound store (lib/sound/store.ts filePathAbs). The one key the song
// lab's derived rows read by: `audio_song_scores` (lib/yue2/scores.ts) and the blind desk's gate
// (lib/yue2/ab.ts). Bytes, not a path: a file re-filed under another name keeps its scores.
//
// CACHED AT FILING (S2): lib/yue2/facts.ts fileYue2Take (and so the backfill) stores the sha of the
// bytes it files as `facts.sha`. takeSha answers from those facts, read through ./facts.ts
// readYue2Facts (the one reader of yue2-facts.json), and hashes the stored file only when the take
// has no facts, its facts carry no sha (filed before S2), or the facts cannot be read.

/** The ports takeSha reads through: the take's facts, and the stored bytes for the fallback. */
export type TakeShaPorts = {
  readonly facts: (takeIds: readonly string[]) => Promise<Result<Readonly<Record<string, Yue2TakeFacts>>>>;
  readonly readBytes: (abs: string) => Promise<Uint8Array>;
};

/** takeSha over its ports (tests inject a counting reader); the export below is it over the real ones. */
export function takeShaWith(ports: TakeShaPorts): (take: SoundTake) => Promise<Result<string>> {
  return async (take) => {
    if (take.file === null) return err("invalid", `take ${take.id} has no audio file`);
    const facts = await ports.facts([take.id]);
    const cached = facts.ok ? facts.value[take.id]?.sha : undefined;
    if (cached !== undefined) return ok(cached);
    try {
      return ok(createHash("sha256").update(await ports.readBytes(filePathAbs(take.file.path))).digest("hex"));
    } catch (e) {
      return soundFailure(e);
    }
  };
}

const realTakeSha = takeShaWith({ facts: readYue2Facts, readBytes: async (abs) => new Uint8Array(await readFile(abs)) });

export async function takeSha(take: SoundTake): Promise<Result<string>> {
  return realTakeSha(take);
}
