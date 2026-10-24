import { afterEach, describe, expect, it } from "vitest";
import { TRIAGE_VERSION, type Triage } from "@gt/domain/audio.triage";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import type { IndexContext, LibraryEntry } from "../src/library/core.ts";
import { libraryMigrations } from "../src/library/schema.ts";
import { putTriage, readTriage, triageDigest, triageMissing } from "../src/library/triage.ts";
import { putMediaFacts, upsertItems } from "../src/library/write.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

// The audio sidecar's triage beside the measures (kernel library v5, spark audio-triage WP3): the
// migration on a fresh store and over a v4 store that already holds measures, the table's shape
// pinned column by column, the row's door, the key - (bytes, brief digest, detector version) -
// and the owed query a media-facts run reads: decodable audio only, owed again when the brief
// moves, owed once for two items over the same bytes and brief.

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
const AT = "2026-10-24T00:00:00.000Z";
const CTX: IndexContext = { styleOf: () => undefined };
const BRIEF = { kind: "music" as const, durationS: 30, tempoBpm: 120 };

const clipped: Triage = {
  version: TRIAGE_VERSION,
  findings: [
    { check: "clipping", verdict: "flag", value: 12, threshold: 3, unit: "samples", atS: 4.2 },
    { check: "loop-seam", defect: "loop-seam", verdict: "skip", value: null, threshold: null, unit: "dB", note: "not briefed as a loop" },
  ],
  flagged: 1,
};

function take(id: string, sha: string, mime = "audio/wav"): LibraryEntry {
  return {
    item: {
      kind: "audio",
      id,
      title: `Take ${id}`,
      state: "unjudged",
      collections: [],
      origin: "elevenlabs",
      rights: { use: "publishable" },
      source: "real",
      lineage: [],
      vocabulary: { type: "music", genre: [], mood: [], instrument: [], provider: "elevenlabs", durationS: 30 },
      media: { sha256: sha, bytes: 10, mime },
    } as LibraryItemInput,
    meta: "30 s",
    extras: {},
    feed: "takes",
  };
}

const facts = (sha: string, decodable = true, mime = "audio/wav") => ({ sha, decodable, mime, w: null, h: null, durationS: 30, posterSha: null, meanLuma: null, nearBlack: false, probedAt: AT, error: decodable ? null : "ffprobe: no stream" });

describe("the v5 migration", () => {
  it("a fresh store carries audio_triage keyed by (sha, context_digest, version)", () => {
    const s = store();
    const cols = must(s.read((r) => r.all("SELECT name, type, pk FROM pragma_table_info('audio_triage') ORDER BY cid")));
    expect(cols).toEqual([
      { name: "sha", type: "TEXT", pk: 1 },
      { name: "context_digest", type: "TEXT", pk: 2 },
      { name: "version", type: "INTEGER", pk: 3 },
      { name: "findings", type: "TEXT", pk: 0 },
      { name: "flagged", type: "INTEGER", pk: 0 },
      { name: "at", type: "TEXT", pk: 0 },
    ]);
  });

  it("over a v4 store: applies v5 alone and keeps every measure", () => {
    const tmp = scratch("triage-mig");
    try {
      const s = must(openStore(`${tmp.dir}/k.sqlite`));
      must(migrate(s, [{ module: "library", steps: libraryMigrations.steps.slice(0, 4) }], { snapshotDir: tmp.dir }));
      must(s.tx((t) => t.run("INSERT INTO audio_measures (sha, peaks, energy, duration_s, tempo_bpm, music_key, measured_at, error) VALUES (?, '[0.5]', 0.2, 12, NULL, NULL, ?, NULL)", SHA("a"), AT)));
      const report = must(migrate(s, [libraryMigrations], { snapshotDir: tmp.dir }));
      expect(report.applied).toEqual([{ module: "library", version: 5 }]);
      expect(must(s.read((r) => r.all("SELECT sha FROM audio_measures")))).toEqual([{ sha: SHA("a") }]);
      expect(must(s.read((r) => r.all("SELECT * FROM audio_triage")))).toEqual([]);
      s.close();
    } finally {
      tmp.dispose();
    }
  });
});

describe("the row and its key", () => {
  it("reads back what was written, for the same bytes and brief only", () => {
    const s = store();
    const d = triageDigest(BRIEF);
    must(putTriage(s, [{ sha: SHA("a"), contextDigest: d, triage: clipped, at: AT }]));
    expect(must(s.read((r) => readTriage(r, SHA("a"), d)))).toEqual(clipped);
    expect(must(s.read((r) => readTriage(r, SHA("a"), triageDigest({ ...BRIEF, loop: true }))))).toBeNull();
    expect(must(s.read((r) => readTriage(r, SHA("b"), d)))).toBeNull();
  });

  it("a row of another detector version is not this version's triage", () => {
    const s = store();
    const d = triageDigest(BRIEF);
    must(s.tx((t) => t.run("INSERT INTO audio_triage (sha, context_digest, version, findings, flagged, at) VALUES (?, ?, ?, '[]', 0, ?)", SHA("a"), d, TRIAGE_VERSION + 1, AT)));
    expect(must(s.read((r) => readTriage(r, SHA("a"), d)))).toBeNull();
  });

  it("a second write of the same key replaces, never duplicates", () => {
    const s = store();
    const d = triageDigest(BRIEF);
    must(putTriage(s, [{ sha: SHA("a"), contextDigest: d, triage: clipped, at: AT }]));
    must(putTriage(s, [{ sha: SHA("a"), contextDigest: d, triage: { version: TRIAGE_VERSION, findings: [], flagged: 0 }, at: AT }]));
    expect(must(s.read((r) => r.all("SELECT flagged FROM audio_triage")))).toEqual([{ flagged: 0 }]);
  });

  it("the door refuses a row outside the contract", () => {
    const s = store();
    const row = { sha: SHA("a"), contextDigest: triageDigest(BRIEF), triage: clipped, at: AT };
    expect(putTriage(s, [{ ...row, triage: { ...clipped, flagged: -1 } }]).ok).toBe(false);
    expect(putTriage(s, [{ ...row, triage: { ...clipped, findings: [{ check: "clipping", verdict: "flag", value: 12, threshold: 3, unit: "samples", atS: -1 }] } }]).ok).toBe(false);
    expect(putTriage(s, [{ ...row, contextDigest: "not-a-digest" }]).ok).toBe(false);
    expect(must(s.read((r) => r.all("SELECT sha FROM audio_triage")))).toEqual([]);
  });

  it("the digest is the brief's canonical form: key order does not move it, an added key does", () => {
    expect(triageDigest({ tempoBpm: 120, durationS: 30, kind: "music" })).toBe(triageDigest(BRIEF));
    expect(triageDigest({ ...BRIEF, loop: false })).not.toBe(triageDigest(BRIEF));
    expect(triageDigest(BRIEF)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("what a media-facts run owes", () => {
  it("decodable audio with no row for its brief; a written row settles it; a new brief owes it again", () => {
    const s = store();
    must(upsertItems(s, [take("audio:a", SHA("a")), take("audio:b", SHA("b")), take("audio:c", SHA("c")), take("audio:img", SHA("e"), "image/png")], CTX));
    must(putMediaFacts(s, [facts(SHA("a")), facts(SHA("b"), false), facts(SHA("e"), true, "image/png")]));
    const d = triageDigest(BRIEF);
    const wanted = ["audio:a", "audio:b", "audio:c", "audio:img", "audio:none"].map((itemId) => ({ itemId, contextDigest: d }));
    // b is undecodable, c has no facts yet, img is no audio, none is not in the Library.
    expect(must(triageMissing(s, wanted, 50))).toEqual([{ itemId: "audio:a", contextDigest: d, sha: SHA("a"), mime: "audio/wav" }]);
    must(putTriage(s, [{ sha: SHA("a"), contextDigest: d, triage: clipped, at: AT }]));
    expect(must(triageMissing(s, wanted, 50))).toEqual([]);
    const moved = triageDigest({ ...BRIEF, durationS: 45 });
    expect(must(triageMissing(s, [{ itemId: "audio:a", contextDigest: moved }], 50))).toEqual([{ itemId: "audio:a", contextDigest: moved, sha: SHA("a"), mime: "audio/wav" }]);
  });

  it("two items over the same bytes and brief are owed once, and the limit holds", () => {
    const s = store();
    must(upsertItems(s, [take("audio:a", SHA("a")), take("audio:a2", SHA("a")), take("audio:b", SHA("b"))], CTX));
    must(putMediaFacts(s, [facts(SHA("a")), facts(SHA("b"))]));
    const d = triageDigest(BRIEF);
    const wanted = ["audio:a", "audio:a2", "audio:b"].map((itemId) => ({ itemId, contextDigest: d }));
    expect(must(triageMissing(s, wanted, 50)).map((w) => w.itemId)).toEqual(["audio:a", "audio:b"]);
    expect(must(triageMissing(s, wanted, 1)).map((w) => w.itemId)).toEqual(["audio:a"]);
    expect(must(triageMissing(s, [], 50))).toEqual([]);
  });
});
