import "server-only";

import { createHash } from "node:crypto";

// ONE LYRIC SHEET, ONE DIGEST (spark yue2-song-lab WP2): `Yue2TakeFacts.lyricsDigest` groups the takes
// rendered from one sheet (best-of-N and across-conditions pairs are drawn within a sheet), so two
// copies of the same words must digest alike however a file or a form carried them. The normal form:
// Unicode NFC, line endings to \n, each line trimmed, runs of blank lines collapsed to one, the whole
// trimmed. Case, punctuation and the [Verse]/[Chorus] tags are KEPT: they are what the model was
// given, and a sheet that changed them is another sheet.

/** The sheet in its normal form. */
export function normaliseLyrics(lyrics: string): string {
  return lyrics
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** sha1 of the normalised sheet, first 16 hex. */
export function lyricsDigest(lyrics: string): string {
  return createHash("sha1").update(normaliseLyrics(lyrics), "utf8").digest("hex").slice(0, 16);
}
