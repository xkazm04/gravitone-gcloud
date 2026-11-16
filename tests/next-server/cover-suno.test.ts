// A COVER'S SUNO SEND, END TO END (spark suno-covers WP1) over a temp sound store and a temp kernel: the launch's receipt
// and confirm (five lines, one cloud.suno job, its request event beside it, a second press the same send), the refusals in
// words, and the job driven through a FAKE Suno API (a stand-in: no network, the global fetch throws) - the winner
// uploaded once across two sends, two covers with their idempotency keys, two free reads, the credits spent read off the
// account; a 4xx on cover-2 failing the send with Suno's sentence on the take and the send; a resumed job skipping its
// booked steps.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cover-suno-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  delete process.env["GRAVITONE_DRY_ONLY"];
  return dir;
});

import { rmSync } from "node:fs";
import path from "node:path";

import { coverSunoJobId, sunoSendInFlight, type CoverSunoPlan } from "@gt/domain/cover.suno";
import { err, ok } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { get, loadOutputs } from "@gt/kernel/job";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { COVER_SUNO_REQUEST, coverSunoPlan } from "@gt/producers/cover-suno/define";

import { coverSunoRequestOf, driveCoverSuno, launchCoverSuno } from "../../lib/producers/coverSuno.ts";
import type { CoverSunoEngines, SunoActsApi } from "../../lib/producers/coverSunoActs.ts";
import { BOUND } from "../../lib/producers/registry.ts";
import { createCover, mutateCover, readCover, writeCoverFile } from "../../lib/sound/cover/store.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const OP = { kind: "operator" as const, id: "op" };
const REFUSED = "Suno: the lyrics contain a protected artist's name";

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeProcessKernel();
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function store(): Store {
  const k = processKernel(LOC);
  if (!k.ok) throw k.error;
  return k.value.store;
}

type FakeOpts = { readonly refuseTake?: 1 | 2; readonly refuseWith?: { readonly code: "invalid" | "unavailable"; readonly message: string }; readonly readRefused?: boolean; readonly noUsage?: boolean };

/** A Suno that answers from memory: every cover costs five credits and is complete on its second look. */
function fakeSuno(o: FakeOpts = {}) {
  const calls: string[] = [];
  const covers: { readonly clip: string; readonly body: Record<string, unknown> }[] = [];
  const looks = new Map<string, number>();
  let credits = 100;
  let sessions = 0;
  const clip = (id: string, status: string) => ({ id, status, title: `${id} title`, song_url: `https://suno.com/song/${id}`, metadata: { duration: 187.5 } });
  const api: SunoActsApi = {
    usage: async () => (o.noUsage === true ? err("unavailable", "usage down") : ok({ allowed_models: [], features: [], metered_features: {}, suno_account: { credits_remaining: credits } })),
    uploadSession: async (title) => {
      sessions++;
      calls.push(`session:${title}`);
      return ok({ id: `up-${sessions}`, upload_url: `https://s3.example/put/${sessions}` });
    },
    putUpload: async (url, bytes, mime) => {
      calls.push(`put:${url}:${bytes.byteLength}:${mime}`);
      return ok(undefined);
    },
    completeUpload: async (id) => ok(clip(id, "submitted") as never),
    getClip: async (id) => {
      const n = (looks.get(id) ?? 0) + 1;
      looks.set(id, n);
      return ok(clip(id, n < 2 && !id.startsWith("up-") ? "streaming" : "complete") as never);
    },
    cover: async (upload, body) => {
      const take = Number(/-(\d)$/.exec(body.idempotency_key)?.[1]);
      calls.push(`cover:${upload}:${body.idempotency_key}`);
      if (take === o.refuseTake) return err(o.refuseWith?.code ?? "invalid", o.refuseWith?.message ?? REFUSED);
      const id = `clip-${body.idempotency_key}`;
      covers.push({ clip: id, body: body as never });
      credits -= 5;
      return ok({ clipIds: [id], clips: [] });
    },
    analysis: async (id) => (o.readRefused === true ? err("refused", "suno: analysis is not on this plan") : ok({ audio_id: id, status: "complete", bpm: 100, key: "A minor", time_signature: 4 } as never)),
    alignment: async (id) => ok({ audio_id: id, status: "complete", words: [] } as never),
    listen: async () => ok({ id: "listen-1", status: "complete", answer: "A dark song with synths." } as never),
    listenRead: async () => ok({ id: "listen-1", status: "complete", answer: "A dark song with synths." } as never),
  };
  return { api, calls, covers, sessions: () => sessions, credits: () => credits };
}

function engines(api: SunoActsApi): CoverSunoEngines {
  let t = 0;
  return { api, now: () => t, sleep: async (ms) => void (t += ms) };
}

const fast = { backoffMs: () => 0 };

/** A cover picked with a winner file: the state a send needs. */
async function pickedCover(title = "Tears") {
  const c = await createCover({ title, rights: "own", source: { bytes: new Uint8Array([0x49, 0x44, 0x33, 4]), mime: "audio/mpeg", name: "tears.mp3", durationS: 200 } });
  await writeCoverFile(c.id, "winner.mp3", new Uint8Array([0xff, 0xfb, 1, 2, 3, 4, 5, 6]));
  await mutateCover(c.id, (x) => ({ ...x, state: "picked", winnerSeed: 1, exportFile: "winner.mp3" }));
  return c;
}

const planOf = (id: string, o: Partial<CoverSunoPlan> = {}): CoverSunoPlan => ({ id, style: "Dark synthwave, 100 BPM", lyrics: "", model: "v6", ...o });

async function launched(id: string, o: Partial<CoverSunoPlan> = {}): Promise<string> {
  const s = store();
  const r = await launchCoverSuno(s, planOf(id, o), { actor: OP, dryOnly: false });
  if (!r.ok || r.value.kind !== "receipt") throw new Error(`no receipt: ${JSON.stringify(r)}`);
  const c = await launchCoverSuno(s, planOf(id, o), { actor: OP, dryOnly: false, token: r.value.receipt.token });
  if (!c.ok || c.value.kind !== "launched") throw new Error(`not launched: ${JSON.stringify(c)}`);
  return c.value.jobId;
}

describe("the send's launch", () => {
  it("no token answers a five-line receipt (credits unpriced, the rest free) and queues nothing", async () => {
    const c = await pickedCover();
    const s = store();
    const r = await launchCoverSuno(s, planOf(c.id), { actor: OP, dryOnly: false });
    expect(r.ok && r.value.kind).toBe("receipt");
    if (!r.ok || r.value.kind !== "receipt") return;
    const lines = r.value.receipt.lines;
    expect(lines.map((l) => [l.key.split("/")[1], l.lane, l.usd, l.unpricedReason !== undefined])).toEqual([
      ["upload", "cloud.suno", 0, false],
      ["cover-1", "cloud.suno", null, true],
      ["cover-2", "cloud.suno", null, true],
      ["read-1", "cloud.suno", 0, false],
      ["read-2", "cloud.suno", 0, false],
    ]);
    expect(lines[1]?.unpricedReason).toBe("Suno bills subscription credits, not dollars; the driver reads the credits left, never a price");
    expect(r.value.receipt.totals.unpriced).toBe(2);
    expect(get(s, coverSunoJobId(c.id, 1) as never).ok).toBe(false);
    expect((await readCover(c.id))?.suno).toBeUndefined();
  });

  it("the token enqueues job:cover-suno:<id>:1 on cloud.suno with its request event and a queued send; a second press is the same send", async () => {
    const c = await pickedCover();
    const jobId = await launched(c.id, { lyrics: "[Verse]\nla", controls: { weirdness: 0, variety: 2 } });
    const s = store();
    expect(jobId).toBe(`job:cover-suno:${c.id}:1`);
    const j = get(s, jobId as never);
    expect(j.ok && [j.value.job.producer, j.value.job.lane, j.value.job.of, j.value.job.mode.kind]).toEqual(["cover-suno", "cloud.suno", { kind: "run", id: `cover:${c.id}` }, "live"]);
    const ev = queryEvents(s, { type: [COVER_SUNO_REQUEST], subject: { kind: "job", id: jobId }, limit: 5 });
    expect(ev.ok && ev.value.events.length).toBe(1);
    expect(ev.ok && ev.value.events[0]?.data).toMatchObject({ coverId: c.id, n: 1, style: "Dark synthwave, 100 BPM", lyrics: "[Verse]\nla", model: "v6", controls: { weirdness: 0, variety: 2 }, takes: 2, by: "op" });
    const rec = await readCover(c.id);
    expect(rec?.suno?.sends).toEqual([expect.objectContaining({ n: 1, jobId, state: "queued", takes: [{ take: 1, state: "pending" }, { take: 2, state: "pending" }] })]);
    expect(sunoSendInFlight(rec?.suno)).toBe(true);
    const r = await launchCoverSuno(s, planOf(c.id, { lyrics: "[Verse]\nla", controls: { weirdness: 0, variety: 2 } }), { actor: OP, dryOnly: false });
    expect(r.ok && r.value).toEqual({ kind: "existing", jobId });
    expect(BOUND.some((b) => b.name === "cover-suno")).toBe(true);
  });

  it("a changed plan is stale, with the fresh receipt", async () => {
    const c = await pickedCover();
    const s = store();
    const r = await launchCoverSuno(s, planOf(c.id), { actor: OP, dryOnly: false });
    if (!r.ok || r.value.kind !== "receipt") throw new Error("no receipt");
    const stale = await launchCoverSuno(s, planOf(c.id, { style: "Warm bossa nova" }), { actor: OP, dryOnly: false, token: r.value.receipt.token });
    expect(stale.ok && stale.value.kind).toBe("stale");
    expect(stale.ok && stale.value.kind === "stale" && stale.value.fresh.token).not.toBe(r.value.receipt.token);
    expect(get(s, coverSunoJobId(c.id, 1) as never).ok).toBe(false);
  });

  it("under GRAVITONE_DRY_ONLY the confirm is armLive's refusal and nothing is queued", async () => {
    const c = await pickedCover();
    const s = store();
    const r = await launchCoverSuno(s, planOf(c.id), { actor: OP, dryOnly: true });
    if (!r.ok || r.value.kind !== "receipt") throw new Error("no receipt");
    const dry = await launchCoverSuno(s, planOf(c.id), { actor: OP, dryOnly: true, token: r.value.receipt.token });
    expect(!dry.ok && dry.error.message).toBe("live is refused: GRAVITONE_DRY_ONLY=1 - this process may only run dry");
    expect(get(s, coverSunoJobId(c.id, 1) as never).ok).toBe(false);
    expect((await readCover(c.id))?.suno).toBeUndefined();
  });

  it("refuses a cover that is not picked, and one that does not exist, in words", async () => {
    const draft = await createCover({ title: "Raw", rights: "own", source: { bytes: new Uint8Array([1]), mime: "audio/mpeg", name: "raw.mp3", durationS: 100 } });
    const s = store();
    const r = await launchCoverSuno(s, planOf(draft.id), { actor: OP, dryOnly: false });
    expect(!r.ok && r.error.message).toBe(`cover ${draft.id} is draft; a send to Suno follows a picked winner`);
    const none = await launchCoverSuno(s, planOf("cov-000000000000"), { actor: OP, dryOnly: false });
    expect(!none.ok && none.error.message).toBe("no cover cov-000000000000");
  });

  it("a third-party-uncleared source is not refused: the receipt answers", async () => {
    const c = await createCover({ title: "Theirs", rights: "third-party-uncleared", source: { bytes: new Uint8Array([1]), mime: "audio/mpeg", name: "theirs.mp3", durationS: 100 } });
    await writeCoverFile(c.id, "winner.mp3", new Uint8Array([1, 2]));
    await mutateCover(c.id, (x) => ({ ...x, state: "picked", winnerSeed: 1, exportFile: "winner.mp3" }));
    const r = await launchCoverSuno(store(), planOf(c.id), { actor: OP, dryOnly: false });
    expect(r.ok && r.value.kind).toBe("receipt");
  });
});

describe("the send job", () => {
  it("uploads once across two sends, covers twice with its idempotency keys, reads both and settles done with the credits spent", async () => {
    const c = await pickedCover();
    const fake = fakeSuno();
    const jobId = await launched(c.id, { lyrics: "[Verse]\nla", negativeStyle: "country", durationS: 120, controls: { audioInfluence: 0.4, styleInfluence: 0, variety: 3 } });
    const d = await driveCoverSuno(store(), LOC, jobId, { dryOnly: false, engines: engines(fake.api), run: fast });
    expect(d.ok && d.value.outcome).toBe("done");
    expect(fake.sessions()).toBe(1);
    expect(fake.calls[0]).toBe("session:Tears");
    expect(fake.calls[1]).toBe("put:https://s3.example/put/1:8:audio/mpeg");
    expect(fake.calls.filter((x) => x.startsWith("cover:"))).toEqual([`cover:up-1:gt-cover-${c.id}-1-1`, `cover:up-1:gt-cover-${c.id}-1-2`]);
    expect(fake.covers[0]?.body).toEqual({
      style: "Dark synthwave, 100 BPM",
      lyrics: "[Verse]\nla",
      title: "Tears (suno 1)",
      duration: 120,
      model: "v6",
      negative_style: "country",
      controls: { audio_influence: 0.4, style_influence: 0, variety: 3 },
      idempotency_key: `gt-cover-${c.id}-1-1`,
    });
    const rec = await readCover(c.id);
    const send = rec?.suno?.sends[0];
    expect(rec?.suno?.uploadClipId).toBe("up-1");
    expect(send).toMatchObject({ n: 1, state: "done", creditsSpent: 10 });
    expect(send?.takes.map((t) => [t.take, t.state, t.clipId, t.songUrl, t.durationS, t.read?.status, t.read?.bpm])).toEqual([
      [1, "complete", `clip-gt-cover-${c.id}-1-1`, `https://suno.com/song/clip-gt-cover-${c.id}-1-1`, 187.5, "complete", 100],
      [2, "complete", `clip-gt-cover-${c.id}-1-2`, `https://suno.com/song/clip-gt-cover-${c.id}-1-2`, 187.5, "complete", 100],
    ]);
    expect(sunoSendInFlight(rec?.suno)).toBe(false);
    const j = get(store(), jobId as never);
    expect(j.ok && j.value.job.progress.done).toBe(5);

    // The second send: the upload is reused, never made again.
    const again = await launched(c.id, { style: "Warm bossa nova" });
    expect(again).toBe(`job:cover-suno:${c.id}:2`);
    const d2 = await driveCoverSuno(store(), LOC, again, { dryOnly: false, engines: engines(fake.api), run: fast });
    expect(d2.ok && d2.value.outcome).toBe("done");
    expect(fake.sessions()).toBe(1);
    expect(fake.calls.filter((x) => x.startsWith("cover:")).slice(2)).toEqual([`cover:up-1:gt-cover-${c.id}-2-1`, `cover:up-1:gt-cover-${c.id}-2-2`]);
    const after = await readCover(c.id);
    expect(after?.suno?.sends.map((x) => [x.n, x.state])).toEqual([[1, "done"], [2, "done"]]);
    const out = get(store(), again as never);
    expect(out.ok && out.value.job.state).toBe("done");
  });

  it("a 4xx on cover-2 fails the send with Suno's sentence on take 2 and the send; take 1 stays complete", async () => {
    const c = await pickedCover();
    const fake = fakeSuno({ refuseTake: 2 });
    const jobId = await launched(c.id);
    const d = await driveCoverSuno(store(), LOC, jobId, { dryOnly: false, engines: engines(fake.api), run: fast });
    expect(d.ok && d.value.outcome).toBe("failed");
    // Never retried around: one POST for take 2.
    expect(fake.calls.filter((x) => x.endsWith("-1-2"))).toHaveLength(1);
    const send = (await readCover(c.id))?.suno?.sends[0];
    expect(send?.state).toBe("failed");
    expect(send?.error).toBe(REFUSED);
    expect(send?.takes.find((t) => t.take === 2)).toMatchObject({ state: "failed", error: REFUSED });
    expect(send?.takes.find((t) => t.take === 1)?.state).toBe("complete");
    expect(sunoSendInFlight((await readCover(c.id))?.suno)).toBe(false);
  });

  it("a refused read is kept verbatim on the take and never fails the send", async () => {
    const c = await pickedCover();
    const fake = fakeSuno({ readRefused: true });
    const jobId = await launched(c.id);
    const d = await driveCoverSuno(store(), LOC, jobId, { dryOnly: false, engines: engines(fake.api), run: fast });
    expect(d.ok && d.value.outcome).toBe("done");
    const send = (await readCover(c.id))?.suno?.sends[0];
    expect(send?.state).toBe("done");
    expect(send?.takes.map((t) => [t.state, t.readRefused, t.read])).toEqual([
      ["complete", "suno: analysis is not on this plan", undefined],
      ["complete", "suno: analysis is not on this plan", undefined],
    ]);
  });

  it("a send whose usage read failed keeps no creditsSpent", async () => {
    const c = await pickedCover();
    const fake = fakeSuno({ noUsage: true });
    const jobId = await launched(c.id);
    const d = await driveCoverSuno(store(), LOC, jobId, { dryOnly: false, engines: engines(fake.api), run: fast });
    expect(d.ok && d.value.outcome).toBe("done");
    expect((await readCover(c.id))?.suno?.sends[0]?.creditsSpent).toBeUndefined();
  });

  it("a resumed job skips the steps it booked: cover-1 is not bought again", async () => {
    const c = await pickedCover();
    const fake = fakeSuno({ refuseTake: 2, refuseWith: { code: "unavailable", message: "suno answered 503" } });
    const jobId = await launched(c.id);
    // The first drive: upload and cover-1 booked, cover-2 an outage the breaker will not pass on the first try.
    const d1 = await driveCoverSuno(store(), LOC, jobId, { dryOnly: false, engines: engines(fake.api), run: { ...fast, deadlineMs: 1, now: () => (fake.calls.some((x) => x.endsWith("-1-2")) ? 2 : 0) } });
    expect(d1.ok).toBe(true);
    const booked = store().read((r) => loadOutputs(r, jobId as never));
    if (!booked.ok) throw booked.error;
    expect([...booked.value.keys()]).toEqual(["upload", "cover-1"]);
    const parsed = coverSunoRequestOf(store(), jobId);
    if (!parsed.ok) throw parsed.error;
    expect(coverSunoPlan(parsed.value, booked.value).map((s) => s.name)).toEqual(["cover-2", "read-1", "read-2"]);
    // The second drive: Suno is back; cover-1 and the upload are not asked again.
    const again = fakeSuno();
    const d2 = await driveCoverSuno(store(), LOC, jobId, { dryOnly: false, engines: engines(again.api), run: fast });
    expect(d2.ok && d2.value.outcome).toBe("done");
    expect(again.sessions()).toBe(0);
    expect(again.calls.filter((x) => x.startsWith("cover:"))).toEqual([`cover:up-1:gt-cover-${c.id}-1-2`]);
  });
});
