import { afterEach, describe, expect, it } from "vitest";
import type { SongScores } from "@gt/domain/audio.yue2";
import { libraryMigrations } from "../src/library/schema.ts";
import { putSongScores, readSongScores, songScoresFor } from "../src/library/songScores.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

// The YuE2 song scorer's figures beside the measures (kernel library v6, spark yue2-song-lab WP2):
// the migration on a fresh store and over a v5 store that already holds triage rows, the table's
// shape pinned column by column, the row's door, the key - (bytes, scorer version) - and the read:
// newest scorer per sha, a NULL figure an absent key, a sha never scored absent.

const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});
function store(): Store {
  const k = must(openKernel(":memory:"));
  open.push(k);
  return k.store;
}

const SHA = (c: string): string => c.repeat(64);
const AT = "2026-11-04T13:12:05";

const full: SongScores = {
  sha: SHA("a"),
  scorerVersion: 1,
  wer: 0.0385,
  werSd: 0.0385,
  per: 0.0222,
  songEval: { coherence: 4.02, musicality: 3.75, memorability: 4.15, clarity: 3.76, naturalness: 3.77 },
  aesthetics: { ce: 7.357, cu: 7.914, pc: 5.802, pq: 8.227 },
  buzzIdx: 6.03,
  transcript: "early morning city humming under concrete skies",
  scoredAt: AT,
};

describe("the v6 migration", () => {
  it("a fresh store carries audio_song_scores keyed by (sha, scorer_version)", () => {
    const s = store();
    const cols = must(s.read((r) => r.all("SELECT name, type, pk, \"notnull\" AS nn FROM pragma_table_info('audio_song_scores') ORDER BY cid")));
    expect(cols.map((c) => [c["name"], c["type"], c["pk"], c["nn"]])).toEqual([
      ["sha", "TEXT", 1, 1],
      ["scorer_version", "INTEGER", 2, 1],
      ["wer", "REAL", 0, 0],
      ["wer_sd", "REAL", 0, 0],
      ["per", "REAL", 0, 0],
      ["se_coherence", "REAL", 0, 0],
      ["se_musicality", "REAL", 0, 0],
      ["se_memorability", "REAL", 0, 0],
      ["se_clarity", "REAL", 0, 0],
      ["se_naturalness", "REAL", 0, 0],
      ["ae_ce", "REAL", 0, 0],
      ["ae_cu", "REAL", 0, 0],
      ["ae_pc", "REAL", 0, 0],
      ["ae_pq", "REAL", 0, 0],
      ["buzz_idx", "REAL", 0, 0],
      ["transcript", "TEXT", 0, 0],
      ["scored_at", "TEXT", 0, 1],
    ]);
  });

  it("over a v5 store: applies v6 alone and keeps every triage row", () => {
    const tmp = scratch("song-scores-mig");
    try {
      const s = must(openStore(`${tmp.dir}/k.sqlite`));
      must(migrate(s, [{ module: "library", steps: libraryMigrations.steps.slice(0, 5) }], { snapshotDir: tmp.dir }));
      must(s.tx((t) => t.run("INSERT INTO audio_triage (sha, context_digest, version, findings, flagged, at) VALUES (?, ?, 1, '[]', 0, ?)", SHA("a"), SHA("d"), AT)));
      const report = must(migrate(s, [libraryMigrations], { snapshotDir: tmp.dir }));
      expect(report.applied).toEqual([{ module: "library", version: 6 }]);
      expect(must(s.read((r) => r.all("SELECT sha FROM audio_triage")))).toEqual([{ sha: SHA("a") }]);
      expect(must(s.read((r) => r.all("SELECT * FROM audio_song_scores")))).toEqual([]);
      s.close();
    } finally {
      tmp.dispose();
    }
  });
});

describe("the row and its key", () => {
  it("reads back exactly what was written", () => {
    const s = store();
    expect(must(putSongScores(s, [full]))).toBe(1);
    expect(must(s.read((r) => readSongScores(r, [SHA("a")])))).toEqual({ [SHA("a")]: full });
  });

  it("a metric the scorer could not compute is NULL in the table and absent in the read, never 0", () => {
    const s = store();
    const partial: SongScores = { sha: SHA("b"), scorerVersion: 1, wer: 0.2, scoredAt: AT };
    must(putSongScores(s, [partial]));
    expect(must(s.read((r) => r.get("SELECT per, se_coherence, ae_ce, buzz_idx, transcript FROM audio_song_scores WHERE sha = ?", SHA("b"))))).toEqual({ per: null, se_coherence: null, ae_ce: null, buzz_idx: null, transcript: null });
    const back = must(s.read((r) => readSongScores(r, [SHA("b")])))[SHA("b")];
    expect(back).toEqual(partial);
    expect(Object.keys(back ?? {})).not.toContain("per");
  });

  it("a half-filled SongEval group in the table reads as no SongEval", () => {
    const s = store();
    must(s.tx((t) => t.run("INSERT INTO audio_song_scores (sha, scorer_version, se_coherence, scored_at) VALUES (?, 1, 4.0, ?)", SHA("c"), AT)));
    expect(must(s.read((r) => readSongScores(r, [SHA("c")])))[SHA("c")]).toEqual({ sha: SHA("c"), scorerVersion: 1, scoredAt: AT });
  });

  it("a second write of the same (sha, version) replaces, never duplicates", () => {
    const s = store();
    must(putSongScores(s, [full]));
    const { transcript: _dropped, ...rest } = full;
    must(putSongScores(s, [{ ...rest, wer: 0.5 }]));
    const rows = must(s.read((r) => r.all("SELECT wer, transcript FROM audio_song_scores")));
    expect(rows).toEqual([{ wer: 0.5, transcript: null }]);
  });

  it("the read answers the newest scorer version per sha, and a sha never scored is absent", () => {
    const s = store();
    must(putSongScores(s, [full, { ...full, scorerVersion: 2, wer: 0.9 }, { ...full, sha: SHA("e"), wer: 0.1 }]));
    const read = must(s.read((r) => readSongScores(r, [SHA("a"), SHA("e"), SHA("f")], 2)));
    expect(read[SHA("a")]?.scorerVersion).toBe(2);
    expect(read[SHA("a")]?.wer).toBe(0.9);
    expect(read[SHA("e")]?.wer).toBe(0.1);
    expect(SHA("f") in read).toBe(false);
    // An older build (the running scorer is version 1) does not read the newer scorer's row.
    expect(must(s.read((r) => readSongScores(r, [SHA("a")])))[SHA("a")]?.wer).toBe(0.0385);
  });

  it("the door refuses a row outside the contract, and one bad row writes none", () => {
    const s = store();
    expect(putSongScores(s, [{ ...full, sha: "not-a-sha" }]).ok).toBe(false);
    expect(putSongScores(s, [{ ...full, wer: -0.1 }]).ok).toBe(false);
    expect(putSongScores(s, [{ ...full, scorerVersion: 0 }]).ok).toBe(false);
    expect(putSongScores(s, [{ ...full, sha: SHA("b") }, { ...full, aesthetics: { ce: 7, cu: 7, pc: Number.NaN, pq: 7 } }]).ok).toBe(false);
    expect(must(s.read((r) => r.all("SELECT sha FROM audio_song_scores")))).toEqual([]);
  });

  it("an empty ask reads nothing and needs no transaction", () => {
    expect(must(songScoresFor(store(), []))).toEqual({});
  });
});
