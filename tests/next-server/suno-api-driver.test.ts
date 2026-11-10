// THE API SUNO DRIVER (lib/suno/api/driver.ts) and the selection (lib/sound/suno/drivers.ts) over an
// injected fake client and a fake resolver: no network, no Chrome, no credits. Pinned: the create body
// (instrumental, exclude, model, idempotency key), polling to `complete`, the 6-min cap returning
// `streaming` clips, a resolver that rejects keeps the paid refs with null audio, the library's paging,
// dedupe and complete-only, the probe's sentences, and auto selection flipping per call.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { err, ok, type Result } from "@gt/domain/errors";

import type { SunoApi, SunoApiStatus } from "../../lib/suno/api/client.ts";
import { apiSunoDriver, idempotencyKey } from "../../lib/suno/api/driver.ts";
import type { Clip, Created, LibraryPage } from "../../lib/suno/api/wire.ts";
import { API_SUNO, autoSunoDriver, FAKE_SUNO_DRIVER, REAL_SUNO, sunoDriver, sunoDriverSetting, type SunoDriver } from "../../lib/sound/suno/drivers.ts";
import type { SunoPhase } from "../../lib/suno/types.ts";

const CONNECTED: SunoApiStatus = { connected: true, scope: "api:v0", expiresAt: Date.now() + 3_600_000 };
const NOT: SunoApiStatus = { connected: false, reason: "not connected to suno" };

const clip = (id: string, status: string, extra: Partial<Clip> = {}): Clip => ({
  id,
  status,
  title: `Song ${id}`,
  song_url: `https://suno.com/song/${id}`,
  cover_image_url: `https://cdn2.suno.ai/image_${id}.jpeg`,
  cover_image_large_url: `https://cdn2.suno.ai/image_large_${id}.jpeg`,
  metadata: { duration: 120, style: "dub, melodica" },
  ...extra,
});

type Fake = { api: SunoApi; created: unknown[]; gets: string[]; pages: (string | undefined)[] };

function fakeApi(o: {
  credits?: number;
  create?: () => Result<Created>;
  clipAt?: (id: string, n: number) => Clip;
  pages?: Record<string, LibraryPage>;
  usage?: () => Result<never> | null;
}): Fake {
  const created: unknown[] = [];
  const gets: string[] = [];
  const pages: (string | undefined)[] = [];
  const seen = new Map<string, number>();
  const unused = async () => err("invalid", "unused in this test");
  const api: SunoApi = {
    usage: async () => o.usage?.() ?? ok({ allowed_models: [], features: [], metered_features: {}, suno_account: { credits_remaining: o.credits ?? 500 } }),
    me: unused,
    getClip: async (id) => {
      gets.push(id);
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      return ok((o.clipAt ?? ((i) => clip(i, "complete")))(id, n));
    },
    listLibrary: async (p = {}) => {
      pages.push(p.cursor);
      const page = o.pages?.[p.cursor ?? ""];
      return page ? ok(page) : err("not-found", "no such page");
    },
    searchLibrary: unused,
    download: unused,
    create: async (body) => {
      created.push(body);
      return o.create?.() ?? ok({ clipIds: ["a", "b"], clips: [] });
    },
    analysis: unused,
    listen: unused,
    listenRead: unused,
    alignment: unused,
    stream: unused,
  };
  return { api, created, gets, pages };
}

function driverOf(fake: Fake, o: { status?: SunoApiStatus; resolve?: (ids: readonly string[]) => Promise<Map<string, string | null>>; clock?: { t: number } } = {}) {
  const clock = o.clock ?? { t: 1_000_000 };
  return apiSunoDriver({
    api: () => fake.api,
    status: async () => o.status ?? CONNECTED,
    resolve: o.resolve ?? (async (ids) => new Map(ids.map((id) => [id, `https://cdn1.suno.ai/${id}.m4a`]))),
    now: () => clock.t,
    sleep: async (ms) => void (clock.t += ms),
  });
}

describe("the API driver's create", () => {
  it("maps an instrumental with an exclude to the body, and keys it on (fields, model, caller key)", async () => {
    const fake = fakeApi({});
    const phases: SunoPhase[] = [];
    const fields = { title: " Night Bus ", style: "roots dub, melodica", lyrics: "[Instrumental]", exclude: "vocals" };
    const refs = await driverOf(fake).create(fields, "v6-wild", (p) => phases.push(p), { key: "job:run:suno.sj-1/create:v6-wild" });
    expect(phases).toEqual(["attaching", "composing", "creating", "rendering", "collecting"]);
    expect(fake.created).toEqual([
      { title: "Night Bus", style: "roots dub, melodica", instrumental: true, negative_style: "vocals", model: "v6-wild", idempotency_key: idempotencyKey(fields, "v6-wild", "job:run:suno.sj-1/create:v6-wild", 0) },
    ]);
    // The key is the caller's: the clock does not move it, another model or another caller key does.
    expect(idempotencyKey(fields, "v6-wild", "k", 1)).toBe(idempotencyKey(fields, "v6-wild", "k", 9e12));
    expect(idempotencyKey(fields, "v6", "k", 1)).not.toBe(idempotencyKey(fields, "v6-wild", "k", 1));
    expect(idempotencyKey(fields, "v6", undefined, 0)).not.toBe(idempotencyKey(fields, "v6", undefined, 61_000));
    expect(refs).toEqual([
      { songId: "a", url: "https://suno.com/song/a", audioUrl: "https://cdn1.suno.ai/a.m4a", imageUrl: "https://cdn2.suno.ai/image_large_a.jpeg", title: "Song a", durationS: 120 },
      { songId: "b", url: "https://suno.com/song/b", audioUrl: "https://cdn1.suno.ai/b.m4a", imageUrl: "https://cdn2.suno.ai/image_large_b.jpeg", title: "Song b", durationS: 120 },
    ]);
  });

  it("sends lyrics and no instrumental flag for a song with words; omits an empty exclude and title", async () => {
    const fake = fakeApi({});
    await driverOf(fake).create({ style: "trip-hop", lyrics: "[Verse]\nYou left the kettle cold", exclude: " " }, "v6", () => {});
    expect(fake.created[0]).toMatchObject({ style: "trip-hop", lyrics: "[Verse]\nYou left the kettle cold", model: "v6" });
    expect(fake.created[0]).not.toHaveProperty("instrumental");
    expect(fake.created[0]).not.toHaveProperty("negative_style");
    expect(fake.created[0]).not.toHaveProperty("title");
  });

  it("polls each clip until complete", async () => {
    const fake = fakeApi({ clipAt: (id, n) => clip(id, n < 3 ? "streaming" : "complete") });
    const refs = await driverOf(fake).create({ style: "dub" }, "v6", () => {});
    expect(fake.gets).toEqual(["a", "b", "a", "b", "a", "b"]);
    expect(refs.map((r) => r.songId)).toEqual(["a", "b"]);
  });

  it("at the 6-minute cap, clips all at least streaming are returned; one still queued throws with the ids", async () => {
    const streaming = fakeApi({ clipAt: (id) => clip(id, "streaming") });
    const refs = await driverOf(streaming).create({ style: "dub" }, "v6", () => {});
    expect(refs.map((r) => r.songId)).toEqual(["a", "b"]);
    const stuck = fakeApi({ clipAt: (id) => clip(id, id === "a" ? "streaming" : "queued") });
    await expect(driverOf(stuck).create({ style: "dub" }, "v6", () => {})).rejects.toThrow("suno did not finish rendering in 6 min (songs a, b)");
  });

  it("a resolver that rejects keeps the paid refs, every audioUrl null", async () => {
    const fake = fakeApi({});
    const phases: SunoPhase[] = [];
    const refs = await driverOf(fake, { resolve: async () => Promise.reject(new Error("suno browser not running")) }).create({ style: "dub" }, "v6", (p) => phases.push(p));
    expect(phases.at(-1)).toBe("collecting");
    expect(refs.map((r) => [r.songId, r.audioUrl])).toEqual([["a", null], ["b", null]]);
  });

  it("refusals: no grant, no credits, a 402, Suno's own sentence, a failed clip", async () => {
    await expect(driverOf(fakeApi({}), { status: NOT }).create({ style: "dub" }, "v6", () => {})).rejects.toThrow("not connected to suno");
    await expect(driverOf(fakeApi({ credits: 0 })).create({ style: "dub" }, "v6", () => {})).rejects.toThrow("suno: out of credits");
    await expect(driverOf(fakeApi({ create: () => err("budget", "Payment required") })).create({ style: "dub" }, "v6", () => {})).rejects.toThrow("suno: out of credits");
    await expect(driverOf(fakeApi({ create: () => err("invalid", "style is too long") })).create({ style: "dub" }, "v6", () => {})).rejects.toThrow("suno refused the create: style is too long");
    const failing = fakeApi({ clipAt: (id) => clip(id, "error", { error: { message: "moderation" } }) });
    await expect(driverOf(failing).create({ style: "dub" }, "v6", () => {})).rejects.toThrow("suno failed the clip: moderation");
  });
});

describe("the API driver's library, probe and credits", () => {
  it("pages by next_cursor, keeps complete only, dedupes by id, newest first, one resolver batch", async () => {
    const at = (d: string) => `2026-11-0${d}T10:00:00.000Z`;
    const fake = fakeApi({
      pages: {
        "": { items: [clip("x", "complete", { created_at: at("1") }), clip("y", "streaming", { created_at: at("2") })], next_cursor: "c2" },
        c2: { items: [clip("z", "complete", { created_at: at("3"), metadata: { style: "", lyrics: "la la", model: "V6-WILD" } }), clip("x", "complete", { created_at: at("1") })], next_cursor: null },
      },
    });
    const batches: string[][] = [];
    const ns: number[] = [];
    const lib = await driverOf(fake, { resolve: async (ids) => (batches.push([...ids]), new Map(ids.map((id) => [id, id === "z" ? null : `u-${id}`]))) }).listLibrary((n) => ns.push(n));
    expect(fake.pages).toEqual([undefined, "c2"]);
    expect(ns).toEqual([2, 4]);
    expect(batches).toEqual([["z", "x"]]);
    expect(lib.map((c) => [c.songId, c.audioUrl, c.model])).toEqual([["z", null, "v6-wild"], ["x", "u-x", "unknown"]]);
    expect(lib[0]?.prompt).toEqual({ title: "Song z", style: "", lyrics: "la la" });
    expect(lib[1]?.prompt).toEqual({ title: "Song x", style: "dub, melodica" });
  });

  it("a library read whose resolver rejects still lands, with no audio", async () => {
    const fake = fakeApi({ pages: { "": { items: [clip("x", "complete")] } } });
    const lib = await driverOf(fake, { resolve: async () => Promise.reject(new Error("not signed in to suno")) }).listLibrary();
    expect(lib.map((c) => c.audioUrl)).toEqual([null]);
  });

  it("probe: no grant, a refusal verbatim, ok - and never asks the browser", async () => {
    const resolve = vi.fn(async () => new Map<string, string | null>());
    expect(await driverOf(fakeApi({}), { status: NOT, resolve }).probe()).toEqual({ ok: false, reason: "not connected to suno" });
    expect(await driverOf(fakeApi({ usage: () => err("refused", "This app is suspended") }), { resolve }).probe()).toEqual({ ok: false, reason: "This app is suspended" });
    expect(await driverOf(fakeApi({}), { resolve }).probe()).toEqual({ ok: true });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("credits: the account's credits_remaining, null without a grant", async () => {
    expect(await driverOf(fakeApi({ credits: 420 })).credits?.()).toBe(420);
    expect(await driverOf(fakeApi({}), { status: NOT }).credits?.()).toBeNull();
  });
});

describe("the selection", () => {
  const saved = process.env["SUNO_DRIVER"];
  afterEach(() => {
    if (saved === undefined) delete process.env["SUNO_DRIVER"];
    else process.env["SUNO_DRIVER"] = saved;
  });

  it("SUNO_DRIVER names fake, browser or api; anything else is auto", () => {
    for (const [v, want] of [["fake", FAKE_SUNO_DRIVER], ["browser", REAL_SUNO], ["api", API_SUNO]] as const) {
      process.env["SUNO_DRIVER"] = v;
      expect(sunoDriver()).toBe(want);
    }
    delete process.env["SUNO_DRIVER"];
    expect(sunoDriverSetting()).toBe("auto");
    process.env["SUNO_DRIVER"] = "chrome";
    expect(sunoDriverSetting()).toBe("auto");
  });

  it("auto decides per call: the API driver while connected, the browser driver otherwise", async () => {
    let connected = false;
    const tag = (name: string): SunoDriver => ({
      probe: async () => ({ ok: false, reason: name }),
      create: async () => [{ songId: name, url: "", audioUrl: null, imageUrl: null, title: name, durationS: null }],
      listLibrary: async () => [],
      ...(name === "api" ? { credits: async () => 7 } : {}),
    });
    const auto = autoSunoDriver({ status: async () => (connected ? CONNECTED : NOT), api: tag("api"), browser: tag("browser") });
    expect(await auto.probe()).toEqual({ ok: false, reason: "browser" });
    expect(await auto.credits?.()).toBeNull();
    connected = true;
    expect(await auto.probe()).toEqual({ ok: false, reason: "api" });
    expect((await auto.create({ style: "dub" }, "v6", () => {}))[0]?.songId).toBe("api");
    expect(await auto.credits?.()).toBe(7);
    connected = false;
    expect((await auto.create({ style: "dub" }, "v6", () => {}))[0]?.songId).toBe("browser");
  });
});
