import { SONG_SCORER_VERSION, type SongScores } from "@gt/domain/audio.yue2";
import { parseSongScores } from "@gt/domain/audio.yue2.schema";
import { ok, type Result } from "@gt/domain/errors";
import type { Reader, Row, Store } from "../store.ts";

// A SONG TAKE'S SCORES, BESIDE THE MEASURES (kernel library v6, spark yue2-song-lab WP2) - what the
// YuE2 lab's scorer (pipeline/yue2/score.py) read in one take's bytes: lyric WER by ASR (with and
// without inserted repeats), phoneme error, the five SongEval dimensions, the four Audiobox
// aesthetics, the buzz index and the transcript the WER was read from.
//
// ONE ROW PER (bytes, scorer version). A new scorer bumps SONG_SCORER_VERSION and writes beside the
// old rows; the read answers the NEWEST version that holds a row for a sha, so an old row keeps
// speaking until the new scorer reaches its take. LUFS and true peak are NOT here: they are
// audio_measures' (./measures.ts), measured by the media-facts pass.
//
// DERIVED, like audio_measures and audio_triage: every row is regenerable from the blob by the
// `yue2-score` producer (lib/producers/yue2.ts), which scores a take and writes its row here.
// Dropping the table loses nothing a run of that producer cannot re-derive (the backfill import,
// pipeline/yue2/import.mts, only seeds it from the lab's earlier scores without rescoring). A
// metric the scorer could not compute is NULL here and an ABSENT key in the read, never 0.

export const SONG_SCORES_DDL = `
-- DERIVED: regenerable from blobs by the yue2-score producer (lib/producers/yue2.ts).
-- Key = the bytes and the scorer version. NULL metric = not computed.
CREATE TABLE audio_song_scores (
  sha TEXT NOT NULL,
  scorer_version INTEGER NOT NULL CHECK (scorer_version >= 1),
  wer REAL CHECK (wer IS NULL OR wer >= 0),
  wer_sd REAL CHECK (wer_sd IS NULL OR wer_sd >= 0),
  per REAL CHECK (per IS NULL OR per >= 0),
  se_coherence REAL,
  se_musicality REAL,
  se_memorability REAL,
  se_clarity REAL,
  se_naturalness REAL,
  ae_ce REAL,
  ae_cu REAL,
  ae_pc REAL,
  ae_pq REAL,
  buzz_idx REAL,
  transcript TEXT,
  scored_at TEXT NOT NULL,
  PRIMARY KEY (sha, scorer_version)
) WITHOUT ROWID;`;

const COLUMNS = [
  "sha",
  "scorer_version",
  "wer",
  "wer_sd",
  "per",
  "se_coherence",
  "se_musicality",
  "se_memorability",
  "se_clarity",
  "se_naturalness",
  "ae_ce",
  "ae_cu",
  "ae_pc",
  "ae_pq",
  "buzz_idx",
  "transcript",
  "scored_at",
] as const;

const UPSERT = `INSERT INTO audio_song_scores (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})
  ON CONFLICT (sha, scorer_version) DO UPDATE SET ${COLUMNS.slice(2)
    .map((c) => `${c} = excluded.${c}`)
    .join(", ")}`;

/** Write score rows; the same (sha, scorer version) is replaced, never duplicated. One refused row writes none. */
export function putSongScores(store: Store, rows: readonly SongScores[]): Result<number> {
  const checked: SongScores[] = [];
  for (const r of rows) {
    const p = parseSongScores(r);
    if (!p.ok) return p;
    checked.push(p.value);
  }
  return store.tx((t) => {
    for (const r of checked)
      t.run(
        UPSERT,
        r.sha,
        r.scorerVersion,
        r.wer ?? null,
        r.werSd ?? null,
        r.per ?? null,
        r.songEval?.coherence ?? null,
        r.songEval?.musicality ?? null,
        r.songEval?.memorability ?? null,
        r.songEval?.clarity ?? null,
        r.songEval?.naturalness ?? null,
        r.aesthetics?.ce ?? null,
        r.aesthetics?.cu ?? null,
        r.aesthetics?.pc ?? null,
        r.aesthetics?.pq ?? null,
        r.buzzIdx ?? null,
        r.transcript ?? null,
        r.scoredAt,
      );
    return checked.length;
  });
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** A group is present only when every one of its figures is: a half-scored SongEval is not a SongEval. */
function all<K extends string>(row: Row, cols: Readonly<Record<K, string>>): Record<K, number> | undefined {
  const out = {} as Record<K, number>;
  for (const [k, c] of Object.entries(cols) as [K, string][]) {
    const v = num(row[c]);
    if (v === undefined) return undefined;
    out[k] = v;
  }
  return out;
}

/** One row as the wire type: a NULL column is an absent key. */
export function songScoresOf(row: Row): SongScores {
  const wer = num(row["wer"]);
  const werSd = num(row["wer_sd"]);
  const per = num(row["per"]);
  const buzzIdx = num(row["buzz_idx"]);
  const songEval = all(row, { coherence: "se_coherence", musicality: "se_musicality", memorability: "se_memorability", clarity: "se_clarity", naturalness: "se_naturalness" });
  const aesthetics = all(row, { ce: "ae_ce", cu: "ae_cu", pc: "ae_pc", pq: "ae_pq" });
  const transcript = row["transcript"];
  return {
    sha: String(row["sha"]),
    scorerVersion: Number(row["scorer_version"]),
    ...(wer === undefined ? {} : { wer }),
    ...(werSd === undefined ? {} : { werSd }),
    ...(per === undefined ? {} : { per }),
    ...(songEval === undefined ? {} : { songEval }),
    ...(aesthetics === undefined ? {} : { aesthetics }),
    ...(buzzIdx === undefined ? {} : { buzzIdx }),
    ...(typeof transcript === "string" ? { transcript } : {}),
    scoredAt: String(row["scored_at"]),
  };
}

/** Under SQLite's bound-parameter ceiling. */
const CHUNK = 400;

/**
 * The newest scorer version's row for each sha given (at most `maxVersion`, the running scorer by
 * default, so a row a NEWER scorer wrote is not read by an older build); a sha never scored is absent.
 */
export function readSongScores(r: Reader, shas: readonly string[], maxVersion: number = SONG_SCORER_VERSION): Record<string, SongScores> {
  const want = [...new Set(shas)];
  const out: Record<string, SongScores> = {};
  for (let i = 0; i < want.length; i += CHUNK) {
    const part = want.slice(i, i + CHUNK);
    const rows = r.all(
      `SELECT ${COLUMNS.join(", ")} FROM audio_song_scores WHERE sha IN (${part.map(() => "?").join(", ")}) AND scorer_version <= ? ORDER BY sha, scorer_version DESC`,
      ...part,
      maxVersion,
    );
    for (const row of rows) {
      const sha = String(row["sha"]);
      if (out[sha] === undefined) out[sha] = songScoresOf(row);
    }
  }
  return out;
}

/** The same read as a Result over the store. */
export function songScoresFor(store: Store, shas: readonly string[], maxVersion: number = SONG_SCORER_VERSION): Result<Record<string, SongScores>> {
  if (shas.length === 0) return ok({});
  return store.read((r) => readSongScores(r, shas, maxVersion));
}
