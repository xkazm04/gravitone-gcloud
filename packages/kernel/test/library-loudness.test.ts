import { afterEach, describe, expect, it } from "vitest";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import type { IndexContext, LibraryEntry } from "../src/library/core.ts";
import { libraryDetail } from "../src/library/detail.ts";
import { loudnessMissing, putAudioMeasures, putLoudness, readMeasure, withMeasure, type AudioMeasureRow } from "../src/library/measures.ts";
import { libraryMigrations } from "../src/library/schema.ts";
import { putMediaFacts, upsertItems } from "../src/library/write.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

// The audio sidecar's five beside the ingest measure (kernel library v4, spark
// audio-postproduction-research): the migration on a fresh store and over a v3 store that already
// holds measures (their figures stay NULL, nothing invented), the row's door, the backfill query
// whose marker is `clipped_samples` (a measured silent file has no loudness but has a count), and
// the Library detail preferring the bytes' loudness over what the take carried.

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
const measure = (sha: string, over: Partial<AudioMeasureRow> = {}): AudioMeasureRow => ({ sha, peaks: [0.5, 1], energy: 0.12, durationS: 29.9, tempoBpm: null, key: null, measuredAt: AT, error: null, ...over });
const five = { lufs: -16.2, truePeakDb: -1.4, lra: 6.5, clippedSamples: 0, tailSilenceS: 0.25 };

function take(id: string, sha: string, measured: { lufs: number | null; truePeakDb: number | null } | null): LibraryEntry {
  return {
    item: {
      kind: "audio",
      id,
      title: `Take ${id}`,
      state: "ratified",
      collections: [],
      origin: "suno",
      rights: { use: "publishable" },
      source: "real",
      lineage: [],
      vocabulary: { type: "sfx", genre: [], mood: [], instrument: [], provider: "suno", durationS: 30 },
      media: { sha256: sha, bytes: 10, mime: "audio/wav" },
    } as LibraryItemInput,
    meta: "30 s",
    extras: {
      audio: {
        prompt: "p",
        reasons: [],
        facts: { asked: { tempoBpm: null, key: null, durationS: 30 }, measured: measured === null ? null : { tempoBpm: null, key: null, durationS: 30, energy: null, ...measured } },
        peaks: [],
        src: null,
      },
    },
    feed: "test",
  };
}

describe("the v4 migration", () => {
  it("a fresh store carries the five, and a row written with them reads them back", () => {
    const s = store();
    must(putAudioMeasures(s, [measure(SHA("a"), five)]));
    expect(must(s.read((r) => readMeasure(r, SHA("a"))))).toMatchObject(five);
  });

  it("over a v3 store: applies v4 alone, keeps every measure, and leaves their five NULL", () => {
    const tmp = scratch("loudness-mig");
    try {
      const s = must(openStore(`${tmp.dir}/k.sqlite`));
      must(migrate(s, [{ module: "library", steps: libraryMigrations.steps.slice(0, 3) }], { snapshotDir: tmp.dir }));
      // Written as a v3 store held it: no loudness columns exist yet.
      must(s.tx((t) => t.run("INSERT INTO audio_measures (sha, peaks, energy, duration_s, tempo_bpm, music_key, measured_at, error) VALUES (?, '[0.5]', 0.2, 12, NULL, NULL, ?, NULL)", SHA("a"), AT)));
      const report = must(migrate(s, [libraryMigrations], { snapshotDir: tmp.dir }));
      expect(report.applied).toEqual([{ module: "library", version: 4 }]);
      const m = must(s.read((r) => readMeasure(r, SHA("a"))));
      expect(m).toMatchObject({ peaks: [0.5], durationS: 12, lufs: null, truePeakDb: null, lra: null, clippedSamples: null, tailSilenceS: null });
      s.close();
    } finally {
      tmp.dispose();
    }
  });

  it("the door and the columns refuse a negative range or count", () => {
    const s = store();
    expect(putAudioMeasures(s, [measure(SHA("a"), { lra: -1 })]).ok).toBe(false);
    expect(putAudioMeasures(s, [measure(SHA("a"), { clippedSamples: 1.5 })]).ok).toBe(false);
    expect(putLoudness(s, [{ sha: SHA("a"), ...five, clippedSamples: -1 }]).ok).toBe(false);
  });
});

describe("the backfill: rows the sidecar has not measured", () => {
  it("owes a decoded row with no count, never a failed one, and a written count settles it", () => {
    const s = store();
    must(upsertItems(s, [take("audio:a", SHA("a"), null), take("audio:b", SHA("b"), null), take("audio:c", SHA("c"), null)], CTX));
    must(putAudioMeasures(s, [measure(SHA("a")), measure(SHA("b"), { peaks: [], energy: null, durationS: null, error: "ffmpeg decode: moov atom not found" }), measure(SHA("c"), five)]));
    expect(must(loudnessMissing(s, 50))).toEqual([{ sha: SHA("a"), mime: "audio/wav" }]);
    expect(must(putLoudness(s, [{ sha: SHA("a"), ...five }, { sha: SHA("d"), ...five }]))).toBe(1);
    expect(must(loudnessMissing(s, 50))).toEqual([]);
    expect(must(s.read((r) => readMeasure(r, SHA("d"))))).toBeNull();
  });

  it("a measured SILENT file (no loudness, no peak, a count of 0) is settled, not owed forever", () => {
    const s = store();
    must(upsertItems(s, [take("audio:a", SHA("a"), null)], CTX));
    must(putAudioMeasures(s, [measure(SHA("a"), { lufs: null, truePeakDb: null, lra: null, clippedSamples: 0, tailSilenceS: 2 })]));
    expect(must(loudnessMissing(s, 50))).toEqual([]);
  });
});

describe("the detail prefers the bytes' loudness", () => {
  it("the sidecar's lufs and true peak win over the take's; an unmeasured row keeps the take's", () => {
    const s = store();
    must(upsertItems(s, [take("audio:a", SHA("a"), { lufs: -14, truePeakDb: -1 }), take("audio:b", SHA("b"), { lufs: -14, truePeakDb: -1 })], CTX));
    must(putMediaFacts(s, [SHA("a"), SHA("b")].map((sha) => ({ sha, decodable: true, mime: "audio/wav", w: null, h: null, durationS: 30, posterSha: null, meanLuma: null, nearBlack: false, probedAt: AT, error: null }))));
    must(putAudioMeasures(s, [measure(SHA("a"), five), measure(SHA("b"))]));
    expect(must(libraryDetail(s, "audio:a")).extras.audio?.facts.measured).toMatchObject({ lufs: -16.2, truePeakDb: -1.4 });
    expect(must(libraryDetail(s, "audio:b")).extras.audio?.facts.measured).toMatchObject({ lufs: -14, truePeakDb: -1 });
  });

  it("a take that carried no figures gains them from the measure", () => {
    const panel = { peaks: [], facts: { asked: {}, measured: null } };
    expect(withMeasure(panel, measure(SHA("a"), five)).facts.measured).toMatchObject({ lufs: -16.2, truePeakDb: -1.4, durationS: 29.9 });
  });
});
