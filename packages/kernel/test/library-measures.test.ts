import { afterEach, describe, expect, it } from "vitest";
import type { MediaFacts } from "@gt/domain/library";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import type { IndexContext, LibraryEntry } from "../src/library/core.ts";
import { libraryDetail } from "../src/library/detail.ts";
import { measuresByItem, measuresMissing, putAudioMeasures, withMeasure, type AudioMeasureRow } from "../src/library/measures.ts";
import { libraryMigrations } from "../src/library/schema.ts";
import { putMediaFacts, upsertItems } from "../src/library/write.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

// Audio measures beside the media facts (Phase 6, L60): which blobs the measure pass is owed,
// the row's door, the Library detail reading the measure over what the take carried, and the
// v2 migration clearing the audio facts so the existing shelf is measured once.

const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});
function store(): Store {
  const k = must(openKernel(":memory:"));
  open.push(k);
  return k.store;
}

type Measured = { tempoBpm: number | null; key: string | null; durationS: number | null; lufs: number | null; truePeakDb: number | null; energy: number | null };
const SHA = (c: string): string => c.repeat(64);
const AT = "2026-10-17T00:00:00.000Z";
const CTX: IndexContext = { styleOf: () => undefined };

function take(id: string, sha: string, type: "music" | "sfx", over: { readonly peaks?: number[]; readonly measured?: Measured | null } = {}): LibraryEntry {
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
      vocabulary: { type, genre: ["ambient"], mood: [], instrument: [], provider: "suno", durationS: 30 },
      media: { sha256: sha, bytes: 10, mime: "audio/wav" },
    } as LibraryItemInput,
    meta: "30 s",
    extras: {
      audio: {
        prompt: "p",
        reasons: [],
        facts: { asked: { tempoBpm: 120, key: "A minor", durationS: 30 }, measured: over.measured ?? null },
        peaks: over.peaks ?? [],
        src: null,
      },
    },
    feed: "test",
  };
}
const facts = (sha: string, over: Partial<MediaFacts> = {}): MediaFacts => ({ sha, decodable: true, mime: "audio/wav", w: null, h: null, durationS: 30, posterSha: null, meanLuma: null, nearBlack: false, probedAt: AT, error: null, ...over });
const measure = (sha: string, over: Partial<AudioMeasureRow> = {}): AudioMeasureRow => ({ sha, peaks: [0.5, 1], energy: 0.12, durationS: 29.9, tempoBpm: 118, key: "A minor", measuredAt: AT, error: null, ...over });

describe("which audio blobs are owed a measure", () => {
  it("only a decodable audio blob with no measure; music when a music take points at it", () => {
    const s = store();
    must(upsertItems(s, [take("audio:m", SHA("a"), "music"), take("audio:s", SHA("b"), "sfx"), take("audio:x", SHA("c"), "music"), take("audio:u", SHA("d"), "music")], CTX));
    must(putMediaFacts(s, [facts(SHA("a")), facts(SHA("b")), facts(SHA("c"), { decodable: false, error: "invalid data", durationS: null })]));
    const owed = must(measuresMissing(s, 50));
    expect(owed.map((w) => [w.sha.slice(0, 1), w.music]).sort()).toEqual([
      ["a", true],
      ["b", false],
    ]);
    must(putAudioMeasures(s, [measure(SHA("a")), measure(SHA("b"), { tempoBpm: null, key: null })]));
    expect(must(measuresMissing(s, 50))).toEqual([]);
  });

  it("a failed measure is a row too, so it is not decoded again", () => {
    const s = store();
    must(upsertItems(s, [take("audio:m", SHA("a"), "music")], CTX));
    must(putMediaFacts(s, [facts(SHA("a"))]));
    must(putAudioMeasures(s, [measure(SHA("a"), { peaks: [], energy: null, durationS: null, tempoBpm: null, key: null, error: "ffmpeg decode: moov atom not found" })]));
    expect(must(measuresMissing(s, 50))).toEqual([]);
  });

  it("the door refuses a figure outside its unit", () => {
    const s = store();
    expect(putAudioMeasures(s, [measure(SHA("a"), { energy: 1.4 })]).ok).toBe(false);
    expect(putAudioMeasures(s, [measure(SHA("a"), { peaks: [2] })]).ok).toBe(false);
  });
});

describe("the detail reads the measure over what the take carried", () => {
  it("peaks and the measured figures come from the bytes; loudness stays the take's", () => {
    const s = store();
    must(upsertItems(s, [take("audio:m", SHA("a"), "music", { measured: { tempoBpm: 60, key: "C major", durationS: 31, lufs: -14, truePeakDb: -1, energy: null } })], CTX));
    must(putMediaFacts(s, [facts(SHA("a"))]));
    must(putAudioMeasures(s, [measure(SHA("a"))]));
    const d = must(libraryDetail(s, "audio:m"));
    expect(d.extras.audio?.peaks).toEqual([0.5, 1]);
    expect(d.extras.audio?.facts.measured).toEqual({ tempoBpm: 118, key: "A minor", durationS: 29.9, lufs: -14, truePeakDb: -1, energy: 0.12 });
    expect(must(measuresByItem(s, ["audio:m", "audio:none"])).get("audio:m")?.tempoBpm).toBe(118);
  });

  it("a failed or absent measure leaves the panel as the take wrote it", () => {
    const panel = { peaks: [0.3], facts: { asked: {}, measured: null } };
    expect(withMeasure(panel, null)).toBe(panel);
    expect(withMeasure(panel, measure(SHA("a"), { error: "no stream", peaks: [] }))).toBe(panel);
    expect(withMeasure(panel, measure(SHA("a"), { peaks: [] })).peaks).toEqual([0.3]);
  });
});

describe("the v2 migration", () => {
  it("clears the audio facts (so the job re-probes and measures them) and keeps every other fact", () => {
    const tmp = scratch("measures-mig");
    try {
      const s = must(openStore(`${tmp.dir}/k.sqlite`));
      const v1 = { module: "library", steps: libraryMigrations.steps.slice(0, 1) };
      must(migrate(s, [v1], { snapshotDir: tmp.dir }));
      must(putMediaFacts(s, [facts(SHA("a")), facts(SHA("b"), { mime: "image/png", w: 4, h: 4, durationS: null, meanLuma: 120 })]));
      const report = must(migrate(s, [libraryMigrations], { snapshotDir: tmp.dir }));
      expect(report.applied).toEqual([{ module: "library", version: 2 }]);
      const left = must(s.read((r) => r.all("SELECT mime FROM media_facts ORDER BY mime").map((x) => String(x["mime"]))));
      expect(left).toEqual(["image/png"]);
      s.close();
    } finally {
      tmp.dispose();
    }
  });
});
