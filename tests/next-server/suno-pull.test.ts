// A TAKE PULLED FROM SUNO, AND READ TWICE (spark suno-api WP3): lib/sound/suno/pull.ts (the clip must be
// complete, its audio URL from the signed-in browser, the bytes from the CDN, then the same measure-
// and-file step an upload goes through), lib/sound/suno/sunoRead.ts (Suno's analysis, alignment and
// listen folded into one read, polled to a cap, resumed by a second press), the facts record that
// keeps both (lib/sound/suno/facts.ts) and the four Server Actions' doors (_live/sunoActs.ts).
//
// Every vendor and the browser are fakes handed in as dependencies: no network, no Chrome, no Suno
// credit. The sound store and the kernel are temp files; the sidecar is a stated analysis.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-suno-pull-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "sound-ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

const who = vi.hoisted(() => ({ refused: false }));
vi.mock("../../app/_server/principal.ts", async () => {
  const { refuse } = await import("../../lib/principal.ts");
  return { principal: async () => (who.refused ? refuse("missing-token") : { kind: "firebase", uid: "u-7", authTime: 0, exp: 0 }) };
});
const reached = vi.hoisted(() => ({ pull: 0, read: 0 }));
vi.mock("../../lib/sound/suno/pull.ts", async (original) => ({
  ...(await original<typeof import("../../lib/sound/suno/pull.ts")>()),
  pullDeps: async () => {
    reached.pull++;
    throw new Error("the action reached the vendor");
  },
}));
vi.mock("../../lib/sound/suno/sunoRead.ts", async (original) => ({
  ...(await original<typeof import("../../lib/sound/suno/sunoRead.ts")>()),
  sunoReadDeps: async () => {
    reached.read++;
    throw new Error("the action reached the vendor");
  },
}));

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { StudioTakeFacts, SunoRead } from "@gt/domain/audio.suno";
import { err, ok } from "@gt/domain/errors";

import { pullSunoTakeAct, readSunoTakeAct, sunoConnectionAct, sunoLibraryAct } from "../../app/(studio)/audio/studio/_live/sunoActs.ts";
import type { AudioAnalysis } from "../../lib/audio/sidecar.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { factsOf, factsOfSunoClip, fileSunoTake, saveSunoRead, sunoFactsPath } from "../../lib/sound/suno/facts.ts";
import { measureAndFile } from "../../lib/sound/suno/measure.ts";
import { audioExtOf, libraryPage, pulledName, pullSunoTake, type PullDeps } from "../../lib/sound/suno/pull.ts";
import { CAP_MS, POLL_MS, readSunoTake, SUNO_LISTEN_QUESTION, type SunoReadDeps } from "../../lib/sound/suno/sunoRead.ts";
import type { Alignment, Analysis, Clip, Listen } from "../../lib/suno/api/wire.ts";

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});
beforeEach(() => {
  who.refused = false;
  reached.pull = 0;
  reached.read = 0;
});

const SESSION = "night-drive";
const CLIP = "fb3b98c4-2c1e-4b8a-9d6f-3e0a1c7d5b21";
const AT = "2026-11-10T09:00:00.000Z";
const URL_ = "https://cdn1.suno.ai/fb3b98c4.mp3";
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);

const ANALYSIS: AudioAnalysis = {
  durationS: 234,
  analysisRate: 22050,
  tempo: { bpm: 100.4, trackerBpm: 100.2, alt: [50.2, 200.8], beats: 390, method: "test" },
  key: { name: "B minor", strength: 0.5, correlation: 0.9, runnerUp: { name: "D major", correlation: 0.8 }, method: "test" },
  measure: { integratedLufs: -9.1, truePeakDb: -0.3, lra: 6, clippedSamples: 0, leadSilenceS: 0, tailSilenceS: 0.2, durationS: 234 },
};

const takesOnDisk = (): number => {
  const file = path.join(ROOT, "sound", "takes.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { takes: unknown[] }).takes.length : 0;
};

const clip = (status = "complete", title: string | null = "Neon Overpass"): Clip => ({ id: CLIP, title, status }) as Clip;

type Seen = { analyzed: string[]; fetched: string[]; resolved: number; got: number; read: string[] };

function pullDepsWith(over: Partial<PullDeps> = {}, seen: Seen = { analyzed: [], fetched: [], resolved: 0, got: 0, read: [] }): { d: PullDeps; seen: Seen } {
  const d: PullDeps = {
    api: {
      getClip: async () => {
        seen.got++;
        return ok(clip());
      },
    },
    resolveAudio: async (ids) => {
      seen.resolved++;
      return new Map(ids.map((id) => [id, URL_]));
    },
    fetchBytes: async (url) => {
      seen.fetched.push(url);
      return MP3;
    },
    // The real step an upload goes through, with the sidecar stated: what it was handed is recorded.
    measureAndFile: (file, from) =>
      measureAndFile(file, from, async (tmp) => {
        seen.analyzed.push(path.extname(tmp));
        expect(new Uint8Array(readFileSync(tmp))).toEqual(MP3);
        return ok(ANALYSIS);
      }),
    held: factsOfSunoClip,
    read: async (takeId) => {
      seen.read.push(takeId);
      return factsOf(takeId);
    },
    ...over,
  };
  return { d, seen };
}

describe("pulling a take from Suno", () => {
  it("refuses a song Suno has not finished, with its status, before the browser is asked or anything filed", async () => {
    const before = takesOnDisk();
    const { d, seen } = pullDepsWith({ api: { getClip: async () => ok(clip("streaming")) } });
    const r = await pullSunoTake({ session: SESSION, clipId: CLIP }, d);
    expect(r.ok ? "" : r.error.message).toBe('suno song "Neon Overpass" is streaming, not complete');
    expect(r.ok ? "" : r.error.code).toBe("conflict");
    expect(seen.resolved).toBe(0);
    expect(takesOnDisk()).toBe(before);
  });

  it("says the API's own refusal verbatim", async () => {
    const { d } = pullDepsWith({ api: { getClip: async () => err("not-found", "audio not found") } });
    const r = await pullSunoTake({ session: SESSION, clipId: CLIP }, d);
    expect(r.ok ? "" : r.error.message).toBe("audio not found");
  });

  it("refuses in the browser driver's own words when it cannot run, and when the page has no audio URL", async () => {
    const before = takesOnDisk();
    const down = pullDepsWith({
      resolveAudio: async () => {
        throw new Error("suno browser not running");
      },
    });
    const r = await pullSunoTake({ session: SESSION, clipId: CLIP }, down.d);
    expect(r.ok ? "" : r.error.message).toBe("suno browser not running");
    expect(down.seen.fetched).toEqual([]);
    const none = pullDepsWith({ resolveAudio: async (ids) => new Map(ids.map((id) => [id, null])) });
    const n = await pullSunoTake({ session: SESSION, clipId: CLIP }, none.d);
    expect(n.ok ? "" : n.error.message).toBe(`the signed-in suno page has no audio URL for "Neon Overpass" (${CLIP})`);
    expect(none.seen.fetched).toEqual([]);
    expect(takesOnDisk()).toBe(before);
  });

  it("says the CDN's refusal and the decoder's, filing nothing", async () => {
    const before = takesOnDisk();
    const cdn = pullDepsWith({
      fetchBytes: async () => {
        throw new Error("the clip's audio at cdn1.suno.ai answered HTTP 403");
      },
    });
    const c = await pullSunoTake({ session: SESSION, clipId: CLIP }, cdn.d);
    expect(c.ok ? "" : c.error.message).toBe("the clip's audio at cdn1.suno.ai answered HTTP 403");
    const bad = pullDepsWith({ measureAndFile: (file, from) => measureAndFile(file, from, async () => err("invalid", "audio sidecar analyze: could not decode")) });
    const b = await pullSunoTake({ session: SESSION, clipId: CLIP }, bad.d);
    expect(b.ok ? "" : b.error.message).toBe("Neon Overpass.mp3 could not be measured: audio sidecar analyze: could not decode");
    expect(takesOnDisk()).toBe(before);
  });

  it("files a complete song as a measured take carrying its Suno id, through the upload's measure step, then reads it", async () => {
    const { d, seen } = pullDepsWith();
    const r = await pullSunoTake({ session: SESSION, clipId: CLIP, promptId: "p1", clip: "a" }, d);
    if (!r.ok) throw r.error;
    expect(seen.fetched).toEqual([URL_]);
    expect(seen.analyzed).toEqual([".mp3"]);
    expect(r.value.readRefused).toBeUndefined();
    expect(r.value.facts).toMatchObject({ name: "Neon Overpass.mp3", promptId: "p1", clip: "a", sunoClipId: CLIP, durationS: 234, measured: { bpm: 100.4, key: "B minor" } });
    expect(seen.read).toEqual([r.value.facts.takeId]);

    // The same song again is the take already held: no second download, no second take.
    const again = pullDepsWith();
    const twice = await pullSunoTake({ session: SESSION, clipId: CLIP }, again.d);
    expect(twice.ok && twice.value.facts.takeId).toBe(r.value.facts.takeId);
    expect(again.seen.got).toBe(0);
    expect(again.seen.fetched).toEqual([]);
  });

  it("keeps the filed take when Suno refuses the read, and says the refusal", async () => {
    const { d } = pullDepsWith({ api: { getClip: async () => ok({ ...clip(), id: "a17c02de" } as Clip) }, read: async () => err("unavailable", "Daily listen limit reached") });
    const r = await pullSunoTake({ session: SESSION, clipId: "a17c02de" }, d);
    if (!r.ok) throw r.error;
    expect(r.value.readRefused).toBe("Daily listen limit reached");
    expect(r.value.facts.sunoClipId).toBe("a17c02de");
  });

  it("names the file after the song, and an untitled one after its id", () => {
    expect(pulledName('Neon: Overpass / "live"', CLIP)).toBe("Neon Overpass live.mp3");
    expect(pulledName(null, CLIP)).toBe(`${CLIP}.mp3`);
    expect(pulledName("   ", CLIP)).toBe(`${CLIP}.mp3`);
    expect(pulledName("Drift", CLIP, ".m4a")).toBe("Drift.m4a");
  });

  it("names the container its URL names: the profile's CloudFront file is an m4a, not an mp3", () => {
    expect(audioExtOf(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${CLIP}.m4a`)).toBe(".m4a");
    expect(audioExtOf("https://cdn.example/a.MP3?sig=1")).toBe(".mp3");
    expect(audioExtOf("https://cdn.example/a.bin")).toBe(".mp3");
    expect(audioExtOf("not a url")).toBe(".mp3");
  });

  it("the upload route measures through the same step", () => {
    const route = readFileSync(path.resolve(import.meta.dirname, "../../app/(studio)/audio/studio/take/route.ts"), "utf8");
    expect(route).toContain("await measureAndFile(");
    expect(route).not.toContain("analyzeFile(");
  });
});

describe("the library page", () => {
  const items = [{ id: "s1", title: "One", status: "complete", created_at: "2026-11-09T21:14:00Z", metadata: { duration: 234 } }, { id: "s2", title: null, status: "streaming" }] as Clip[];
  it("searches when asked, lists otherwise, and drops what it does not hold", async () => {
    const asked: string[] = [];
    const api = {
      listLibrary: async () => (asked.push("list"), ok({ items, next_cursor: "c2" })),
      searchLibrary: async (q: { query: string }) => (asked.push(`search ${q.query}`), ok({ items: [], next_cursor: null })),
    };
    const listed = await libraryPage(api, {});
    expect(listed).toEqual({ ok: true, value: { songs: [{ id: "s1", title: "One", status: "complete", durationS: 234, createdAt: "2026-11-09T21:14:00Z" }, { id: "s2", title: "s2", status: "streaming" }], next: "c2" } });
    expect(await libraryPage(api, { query: " neon " })).toEqual({ ok: true, value: { songs: [] } });
    expect(asked).toEqual(["list", "search neon"]);
  });
});

/** A clock the reads' waits advance, so a 45 s cap runs in no time. Waits side by side share it as
 *  they share the wall clock: the earliest wake goes first, once every waiter has had its turn to wait. */
function fakeTime(): { now: () => Date; sleep: (ms: number) => Promise<void> } {
  let t = Date.parse(AT);
  const waiting: { wake: number; go: () => void }[] = [];
  let due = false;
  const tick = (): void => {
    due = false;
    waiting.sort((a, b) => a.wake - b.wake);
    const next = waiting.shift();
    if (next === undefined) return;
    t = Math.max(t, next.wake);
    next.go();
    if (waiting.length > 0) schedule();
  };
  const schedule = (): void => {
    if (due) return;
    due = true;
    setTimeout(tick, 0);
  };
  return {
    now: () => new Date(t),
    sleep: (ms) =>
      new Promise<void>((go) => {
        waiting.push({ wake: t + ms, go });
        schedule();
      }),
  };
}

const analysis = (status: string): Analysis =>
  ({
    audio_id: CLIP, status,
    ...(status === "complete" ? { bpm: 99.9, key: "B minor", time_signature: 4, duration_s: 234, sections: [{ start_s: 0, end_s: 18.2, label: "A" }, { start_s: 18.2, end_s: 44, label: "B" }], terms: ["song", "piano"], labels: [{ label: "genre:electronic", probability: 0.93 }] } : {}),
  }) as Analysis;
const ANSWER = 'Progressive house music.\n```json\n{"genre": ["progressive house"], "mood": ["driving"], "bpm": 99.9, "vocals": {"heard": false}}\n```';
const listen = (status: string, answer?: string): Listen => ({ id: "ls-1", status, ...(answer !== undefined ? { answer } : {}) }) as Listen;
const UNALIGNED: Alignment = { audio_id: CLIP, status: "unavailable", words: [] } as Alignment;

type Calls = { analysis: number; listen: string[]; listenRead: string[] };

function readDeps(api: Partial<SunoReadDeps["api"]>, calls: Calls): SunoReadDeps {
  return {
    api: {
      analysis: async () => (calls.analysis++, ok(analysis("processing"))),
      alignment: async () => ok(UNALIGNED),
      listen: async (_id, q) => (calls.listen.push(q), ok(listen("processing"))),
      listenRead: async (id) => (calls.listenRead.push(id), ok(listen("processing"))),
      ...api,
    },
    facts: factsOf,
    save: saveSunoRead,
    ...fakeTime(),
  };
}

async function linkedTake(clipId: string): Promise<StudioTakeFacts> {
  const r = await fileSunoTake({ bytes: MP3, mime: "audio/mpeg", name: `${clipId}.mp3` }, { session: SESSION, sunoClipId: clipId }, ANALYSIS);
  if (!r.ok) throw r.error;
  return r.value;
}

describe("Suno's read of a pulled take", () => {
  it("saves what is still out at the cap as processing, and a second press finishes the same listen", async () => {
    const take = await linkedTake("song-cap-0001");
    const calls: Calls = { analysis: 0, listen: [], listenRead: [] };
    const first = await readSunoTake(take.takeId, readDeps({}, calls));
    if (!first.ok) throw first.error;
    expect(first.value.suno).toMatchObject({ status: "processing", listenId: "ls-1", sections: [], terms: [], labels: [] });
    expect(first.value.suno).not.toHaveProperty("words");
    expect(calls.listen).toEqual([SUNO_LISTEN_QUESTION]);
    // One ask, then one every POLL_MS until the next would pass CAP_MS.
    expect(calls.analysis).toBe(1 + Math.floor(CAP_MS / POLL_MS));

    const again: Calls = { analysis: 0, listen: [], listenRead: [] };
    const second = await readSunoTake(take.takeId, readDeps({ analysis: async () => (again.analysis++, ok(analysis("complete"))), listenRead: async (id) => (again.listenRead.push(id), ok(listen("complete", ANSWER))) }, again));
    if (!second.ok) throw second.error;
    expect(again.listen).toEqual([]);
    expect(again.listenRead).toEqual(["ls-1"]);
    const read = second.value.suno as SunoRead;
    expect(read).toEqual({
      at: AT, status: "complete", bpm: 99.9, key: "B minor", timeSignature: 4,
      sections: [{ label: "A", startS: 0, endS: 18.2 }, { label: "B", startS: 18.2, endS: 44 }], terms: ["song", "piano"], labels: [{ label: "genre:electronic", p: 0.93 }],
      answer: ANSWER, genre: ["progressive house"], mood: ["driving"], vocals: { heard: false },
    });
    expect((await factsOf(take.takeId)).ok && (await factsOf(take.takeId))).toMatchObject({ value: { suno: read } });
  });

  it("keeps a garbled answer verbatim with no fields from it, and counts the aligned words", async () => {
    const take = await linkedTake("song-garble-01");
    const calls: Calls = { analysis: 0, listen: [], listenRead: [] };
    const garbled = "House.\n```json\n{bpm: 99\n```";
    const r = await readSunoTake(
      take.takeId,
      readDeps({ analysis: async () => ok(analysis("complete")), listen: async () => ok(listen("complete", garbled)), alignment: async () => ok({ audio_id: CLIP, status: "complete", words: [{ word: "neon" }, { word: "rain" }] } as Alignment) }, calls),
    );
    if (!r.ok) throw r.error;
    expect(r.value.suno).toMatchObject({ status: "complete", answer: garbled, words: 2 });
    expect(r.value.suno).not.toHaveProperty("genre");
    expect(r.value.suno).not.toHaveProperty("listenId");
  });

  it("a refusal is the press's answer in Suno's words and saves nothing over the read already held", async () => {
    const take = await linkedTake("song-refused-1");
    const calls: Calls = { analysis: 0, listen: [], listenRead: [] };
    const held = await readSunoTake(take.takeId, readDeps({ analysis: async () => ok(analysis("complete")), listen: async () => ok(listen("complete", ANSWER)) }, calls));
    if (!held.ok) throw held.error;
    const before = readFileSync(sunoFactsPath(), "utf8");
    const r = await readSunoTake(take.takeId, readDeps({ analysis: async () => err("refused", "This app can't read that song") }, calls));
    expect(r.ok ? "" : r.error.message).toBe("This app can't read that song");
    expect(readFileSync(sunoFactsPath(), "utf8")).toBe(before);
  });

  it("refuses a take that was not pulled from Suno", async () => {
    const plain = await fileSunoTake({ bytes: MP3, mime: "audio/mpeg", name: "made-elsewhere.mp3" }, { session: SESSION }, ANALYSIS);
    if (!plain.ok) throw plain.error;
    const r = await readSunoTake(plain.value.takeId, readDeps({}, { analysis: 0, listen: [], listenRead: [] }));
    expect(r.ok ? "" : r.error.code).toBe("invalid");
    const s = await saveSunoRead(plain.value.takeId, { at: AT, status: "complete", sections: [], terms: [], labels: [] });
    expect(s.ok ? "" : s.error.message).toBe(`take ${plain.value.takeId} was not pulled from suno`);
  });
});

describe("the facts record", () => {
  it("an old record without the new fields still reads, and one with them round-trips", async () => {
    const old = await fileSunoTake({ bytes: MP3, mime: "audio/mpeg", name: "old.mp3" }, { session: SESSION, promptId: "p1" }, ANALYSIS);
    if (!old.ok) throw old.error;
    expect(old.value).not.toHaveProperty("sunoClipId");
    expect(old.value).not.toHaveProperty("suno");
    // A record as WP1 wrote it, before spark suno-api, by hand.
    const file = JSON.parse(readFileSync(sunoFactsPath(), "utf8")) as { facts: Record<string, Record<string, unknown>> };
    const rec = file.facts[old.value.takeId] ?? {};
    file.facts[old.value.takeId] = { session: rec["session"], promptId: "p1", durationS: 234, measured: rec["measured"], analyzedAt: rec["analyzedAt"] };
    writeFileSync(sunoFactsPath(), JSON.stringify(file));
    expect((await factsOf(old.value.takeId)).ok).toBe(true);

    const linked = await linkedTake("song-round-001");
    const read: SunoRead = { at: AT, status: "complete", bpm: 99.9, sections: [], terms: [], labels: [], words: 0 };
    const kept = await saveSunoRead(linked.takeId, read);
    expect(kept.ok && kept.value).toMatchObject({ sunoClipId: "song-round-001", suno: read });
    expect(await factsOf(linked.takeId)).toEqual(kept);
  });
});

describe("the four actions' doors", () => {
  it("refuse a caller with no principal before anything is reached", async () => {
    who.refused = true;
    const r = await pullSunoTakeAct({ session: SESSION, clipId: CLIP });
    expect(r.ok ? "" : r.error.code).toBe("unauthenticated");
    expect((await readSunoTakeAct({ takeId: "st-x" })).ok).toBe(false);
    expect((await sunoLibraryAct({})).ok).toBe(false);
    expect((await sunoConnectionAct()).ok).toBe(false);
    expect(reached).toEqual({ pull: 0, read: 0 });
  });

  it("refuse a song id, session or clip outside the door before anything is reached", async () => {
    for (const bad of [{ session: SESSION, clipId: "../etc" }, { session: "Not A Session!", clipId: CLIP }, { session: SESSION, clipId: CLIP, clip: "c" as "a" }]) {
      const r = await pullSunoTakeAct(bad);
      expect(r.ok ? "" : r.error.code).toBe("invalid");
    }
    expect(reached.pull).toBe(0);
  });

  it("a well-formed pull reaches its dependencies; the connection is read from the token file alone", async () => {
    const r = await pullSunoTakeAct({ session: SESSION, clipId: CLIP, promptId: "p1", clip: "b" });
    expect(r.ok).toBe(false);
    expect(reached.pull).toBe(1);
    expect(await sunoConnectionAct()).toEqual({ ok: true, value: { connected: false, reason: "not connected to suno" } });
  });
});
