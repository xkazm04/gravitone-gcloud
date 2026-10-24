// THE TRIAGE PASS OF THE MEDIA-FACTS JOB (spark audio-triage WP3, lib/sound/measureRun.ts
// `triageTakes`): literal takes over blobs in a temp blob store, indexed in an in-memory kernel and
// probed decodable, judged by a FAKE sidecar port that counts what it was asked. A take is triaged
// once; a second run asks nothing; a take whose brief changed is triaged again under its new
// digest; a sidecar that is not installed writes no row and fails nothing; a file the sidecar fails
// on writes no row and is counted. The brief each file is judged against is the take's own
// (lib/sound/triageContext.ts), absent keys omitted. Nothing in the real stores is touched, and no
// Python is spawned.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { TRIAGE_VERSION, type Triage, type TriageContext } from "@gt/domain/audio.triage";
import { err, ok, type Result } from "@gt/domain/errors";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readTriage, triageDigest } from "@gt/kernel/library/triage";
import { putMediaFacts, upsertItems } from "@gt/kernel/library/write";

import { triageTakes, type Triager } from "../../lib/sound/measureRun.ts";
import { triageContextOf } from "../../lib/sound/triageContext.ts";
import type { SoundTake } from "../../lib/sound/types.ts";

const dir = mkdtempSync(path.join(tmpdir(), "gt-triage-pass-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const AT = () => new Date("2026-10-24T00:00:00.000Z");
const T0 = "2026-10-24T00:00:00.000Z";

const take = (id: string, over: Partial<SoundTake> = {}): SoundTake => ({
  id,
  kind: "music",
  title: `Take ${id}`,
  provider: "elevenlabs",
  op: "compose",
  origin: "lab",
  technique: [],
  prompt: "p",
  negative: null,
  terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
  durationS: 30,
  loop: null,
  file: { path: `files/${id}.wav`, mime: "audio/wav", bytes: 4 },
  peaks: null,
  measured: null,
  ratings: {},
  verdict: "unjudged",
  reasons: [],
  note: null,
  stage: null,
  group: null,
  label: null,
  parentId: null,
  huntId: null,
  nodeId: null,
  songId: null,
  plan: null,
  referenceTrackId: null,
  promptRound: null,
  draftId: null,
  variation: null,
  editModes: null,
  fileName: null,
  projectId: null,
  cueId: null,
  createdAt: T0,
  judgedAt: null,
  finalizedAt: null,
  ...over,
});

const item = (id: string, sha: string): LibraryItemInput => ({
  kind: "audio",
  id,
  title: id,
  state: "unjudged",
  collections: [],
  origin: "elevenlabs",
  rights: { use: "publishable" },
  source: "real",
  lineage: [],
  vocabulary: { type: "music", genre: [], mood: [], instrument: [], provider: "elevenlabs", durationS: 30 },
  media: { sha256: sha, bytes: 4, mime: "audio/wav" },
});

const FLAGGED: Triage = { version: TRIAGE_VERSION, findings: [{ check: "clipping", verdict: "flag", value: 12, threshold: 3, unit: "samples" }], flagged: 1 };

/** A sidecar that answers FLAGGED for every file and records the brief it was handed. */
function fake(opts: { readonly ready?: Result<unknown>; readonly fail?: (file: string) => string | null } = {}): Triager & { readonly asked: { file: string; context: TriageContext }[]; doctor: number } {
  const asked: { file: string; context: TriageContext }[] = [];
  const port = {
    asked,
    doctor: 0,
    ready: async () => {
      port.doctor += 1;
      return opts.ready ?? ok(null);
    },
    triage: async (file: string, context: TriageContext): Promise<Result<Triage>> => {
      asked.push({ file, context });
      const why = opts.fail?.(file) ?? null;
      return why === null ? ok(FLAGGED) : err("unavailable", why);
    },
  };
  return port;
}

let k: Kernel;
let blobs: BlobStore;
const shas = new Map<string, string>();

beforeEach(async () => {
  k?.close();
  const opened = openKernel(":memory:");
  if (!opened.ok) throw opened.error;
  k = opened.value;
  blobs = blobStore(path.join(dir, "blobs"));
  for (const id of ["st-a", "st-b"]) {
    const ref = await blobs.put(new TextEncoder().encode(`RIFF${id}`), "audio/wav");
    if (!ref.ok) throw ref.error;
    shas.set(id, ref.value.sha256);
  }
  const up = upsertItems(k.store, [...shas].map(([id, sha]) => ({ item: item(`audio:${id}`, sha), meta: "", extras: {}, feed: "takes" })), { styleOf: () => undefined });
  if (!up.ok) throw up.error;
  const facts = putMediaFacts(k.store, [...shas.values()].map((sha) => ({ sha, decodable: true, mime: "audio/wav", w: null, h: null, durationS: 30, posterSha: null, meanLuma: null, nearBlack: false, probedAt: T0, error: null })));
  if (!facts.ok) throw facts.error;
});
afterAll(() => k.close());

function rows(): number {
  const n = k.store.read((r) => Number(r.get("SELECT count(*) AS n FROM audio_triage")?.["n"]));
  if (!n.ok) throw n.error;
  return n.value;
}
const of = (takes: readonly SoundTake[]) => async () => takes;
const run = (takes: readonly SoundTake[], port: Triager) => triageTakes(k.store, blobs, of(takes), port, { limit: 50, now: AT });

describe("the triage pass", () => {
  it("triages a take's blob once against its own brief; a second run asks nothing and writes nothing", async () => {
    const takes = [take("st-a", { tempoBpm: 120 }), take("st-nofile", { file: null })];
    const port = fake();
    const first = await run(takes, port);
    expect(first.ok && first.value).toEqual({ triaged: 1, errors: 0, failed: [] });
    expect(port.asked).toHaveLength(1);
    expect(port.asked[0]?.context).toEqual({ kind: "music", durationS: 30, tempoBpm: 120 });
    const sha = shas.get("st-a") ?? "";
    const digest = triageDigest(triageContextOf(takes[0] as SoundTake));
    expect(k.store.read((r) => readTriage(r, sha, digest))).toEqual({ ok: true, value: FLAGGED });
    const second = await run(takes, port);
    expect(second.ok && second.value).toEqual({ triaged: 0, errors: 0, failed: [] });
    expect(port.asked).toHaveLength(1);
    // Nothing owed: the doctor was not spawned the second time.
    expect(port.doctor).toBe(1);
    expect(rows()).toBe(1);
  });

  it("re-triages when the take's brief changes - a new digest - and keeps the old row unread", async () => {
    const port = fake();
    await run([take("st-a")], port);
    const moved = take("st-a", { kind: "sfx", loop: true, durationS: 8 });
    const r = await run([moved], port);
    expect(r.ok && r.value.triaged).toBe(1);
    expect(port.asked.map((a) => a.context)).toEqual([{ kind: "music", durationS: 30 }, { kind: "sfx", durationS: 8, loop: true }]);
    expect(rows()).toBe(2);
  });

  it("reads the plan's chunks as sections on the take's clock, named by their [tag]", async () => {
    const plan = { chunks: [{ text: "[Intro] soft", duration_ms: 8000, positive_styles: [], negative_styles: [] }, { song_id: "s1", range: { start_ms: 8000, end_ms: 20000 } }, { text: "outro", duration_ms: 10000, positive_styles: [], negative_styles: [] }] };
    expect(triageContextOf(take("st-a", { plan, loop: false }))).toEqual({
      kind: "music",
      durationS: 30,
      loop: false,
      sections: [
        { name: "Intro", startMs: 0, endMs: 8000 },
        { name: "2", startMs: 8000, endMs: 20000 },
        { name: "3", startMs: 20000, endMs: 30000 },
      ],
    });
    expect(triageContextOf(take("st-a", { plan: { chunks: "nope" }, durationS: null, tempoBpm: 0 }))).toEqual({ kind: "music" });
  });

  it("a sidecar that is not installed writes no row and fails nothing", async () => {
    const port = fake({ ready: err("unavailable", "audio sidecar: python is missing scipy (No module named 'scipy')") });
    const r = await run([take("st-a"), take("st-b")], port);
    expect(r.ok && r.value).toEqual({ triaged: 0, errors: 0, failed: [], unavailable: "audio sidecar: python is missing scipy (No module named 'scipy')" });
    expect(port.asked).toHaveLength(0);
    expect(rows()).toBe(0);
  });

  it("a file the sidecar fails on writes no row, is counted, keeps its sentence once, and is owed again", async () => {
    const bad = shas.get("st-b") ?? "";
    const badFile = blobs.pathOf({ sha256: bad, bytes: 0, mime: "audio/wav" });
    if (!badFile.ok) throw badFile.error;
    const port = fake({ fail: (file) => (file === badFile.value ? "audio sidecar triage: could not decode" : null) });
    const r = await run([take("st-a"), take("st-b")], port);
    expect(r.ok && r.value).toEqual({ triaged: 1, errors: 1, failed: [`${bad.slice(0, 12)}: audio sidecar triage: could not decode`] });
    expect(rows()).toBe(1);
    const again = await run([take("st-a"), take("st-b")], port);
    expect(again.ok && again.value.errors).toBe(1);
  });

  it("a sound store that will not read is the pass's error, never a throw", async () => {
    const r = await triageTakes(k.store, blobs, async () => Promise.reject(new Error("takes.json: Unexpected end of JSON input")), fake(), { limit: 50, now: AT });
    expect(r.ok ? "ok" : r.error.message).toBe("sound store: takes.json: Unexpected end of JSON input");
  });
});
