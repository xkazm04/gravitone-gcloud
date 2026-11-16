// THE COVER'S DOORS AND ACTS (spark track-mirror-studio WP2): POST /audio/cover/source and /audio/cover/remix,
// GET /audio/cover/file, over the real cover store (lib/sound/cover/store.ts) in a temp dir, and the act bodies
// (app/(studio)/audio/_cover/actsCore.ts) with the launch and the mp3 export stood in: the launch is
// lib/producers/cover.ts's, and the export's ffmpeg is not the subject. ffprobe IS the subject of the source door
// (the duration on the record is the decoder's): the lanes that need a real mp3 make one with ffmpeg and SKIP,
// saying why, on a box without it.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cover-doors-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "sound-ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

const fakes = vi.hoisted(() => ({ launches: [] as unknown[][], exports: [] as [string, string][] }));

vi.mock("../../lib/producers/cover.ts", () => ({
  coverJobId: (id: string) => `job:cover:${id}`,
  launchCover: async (...a: unknown[]) => {
    fakes.launches.push(a);
    return { ok: true, value: { kind: "launched", jobId: "job:cover:stand-in" } };
  },
}));
vi.mock("../../lib/sound/cover/cut.ts", async (actual) => {
  const real = await actual<typeof import("../../lib/sound/cover/cut.ts")>();
  const fs = process.getBuiltinModule("node:fs");
  return {
    ...real,
    exportMp3: async (abs: string, out: string) => {
      fakes.exports.push([abs, out]);
      fs.writeFileSync(out, "stand-in mp3");
      return { ok: true, value: undefined };
    },
  };
});

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CoverRecord } from "@gt/domain/cover";
import type { Actor } from "@gt/domain/event";
import { openKernel } from "@gt/kernel/kernel";

import { POST as SOURCE } from "../../app/(studio)/audio/cover/source/route.ts";
import { POST as REMIX } from "../../app/(studio)/audio/cover/remix/route.ts";
import { GET as FILE } from "../../app/(studio)/audio/cover/file/route.ts";
import { launchCoverBody, pickCoverBody, saveCoverStylesBody, sectionProblem } from "../../app/(studio)/audio/_cover/actsCore.ts";
import { COVER_REMIX_ROUTE, COVER_SOURCE_ROUTE } from "../../app/(studio)/audio/_cover/contract.ts";
import { readCoverDesk } from "../../app/(studio)/audio/_cover/read.ts";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "../../lib/apiAuth.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { coverFileAbs, createCover, listCovers, mutateCover, readCover } from "../../lib/sound/cover/store.ts";
import { coverFileHref } from "../../lib/sound/cover/href.ts";

vi.setConfig({ testTimeout: 60_000 });

const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AUTH = { authorization: "Bearer cover-secret" };
const BASE = "http://127.0.0.1:3111";

const FFMPEG = process.env["FFMPEG"]?.trim() || "ffmpeg";
const MP3 = path.join(ROOT, "tone.mp3");
/** A 12 s sine as mp3, or why this box cannot make one. */
const NO_FFMPEG = ((): string | null => {
  const r = spawnSync(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-c:a", "libmp3lame", "-b:a", "128k", MP3], { encoding: "utf8", timeout: 60_000, windowsHide: true });
  return r.status === 0 && existsSync(MP3) ? null : `${FFMPEG} did not make an mp3: ${(r.error?.message ?? r.stderr ?? "").trim().slice(-200)}`;
})();
if (NO_FFMPEG !== null) console.warn(`cover-doors ffprobe lanes skipped: ${NO_FFMPEG}`);

beforeAll(() => {
  for (const k of ENV) delete process.env[k];
  process.env[ACCESS_SECRET_VAR] = "cover-secret";
});
afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
  for (const k of ENV) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function form(fields: Record<string, string>, file?: File): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (file !== undefined) f.set("file", file);
  return f;
}
const post = (door: typeof SOURCE, route: string, body: FormData, headers: Record<string, string> = AUTH): Promise<Response> => {
  __resetRateLimit();
  return door(new Request(`${BASE}${route}`, { method: "POST", body, headers }));
};
const get = (q: string): Promise<Response> => {
  __resetRateLimit();
  return FILE(new Request(`${BASE}/audio/cover/file?${q}`, { headers: AUTH }));
};
const errorOf = async (r: Response): Promise<string> => ((await r.json()) as { error: string }).error;
const mp3File = (name = "song.mp3"): File => new File([readFileSync(MP3)], name, { type: "audio/mpeg" });
const count = async (): Promise<number> => (await listCovers()).length;

/** A cover made through the store, in the state a test needs. */
async function coverIn(change: (c: CoverRecord) => CoverRecord = (c) => c): Promise<CoverRecord> {
  const c = await createCover({ title: "Tears", rights: "third-party-uncleared", source: { bytes: new TextEncoder().encode("stand-in song"), mime: "audio/mpeg", name: "tears.mp3", durationS: 200 } });
  return mutateCover(c.id, change);
}
const judging = (c: CoverRecord): CoverRecord => ({
  ...c,
  state: "judging",
  takes: [
    { n: 1, seed: 1111, state: "done", file: "takes/s1111.flac" },
    { n: 2, seed: 2222, state: "failed", error: "out of memory" },
  ],
});

describe("POST /audio/cover/source", () => {
  it("fails closed: nothing presented is 401 and no cover is made", async () => {
    const before = await count();
    const r = await post(SOURCE, COVER_SOURCE_ROUTE, form({ title: "x", rights: "own" }), {});
    expect(r.status).toBe(401);
    expect(await count()).toBe(before);
  });

  it("refuses an upload with no rights declared, and one with an unknown declaration", async () => {
    const before = await count();
    const none = await post(SOURCE, COVER_SOURCE_ROUTE, form({ title: "Tears" }, new File(["x"], "a.mp3", { type: "audio/mpeg" })));
    expect(none.status).toBe(400);
    expect(await errorOf(none)).toContain("rights");
    const unknown = await post(SOURCE, COVER_SOURCE_ROUTE, form({ title: "Tears", rights: "public-domain" }, new File(["x"], "a.mp3", { type: "audio/mpeg" })));
    expect(unknown.status).toBe(400);
    expect(await errorOf(unknown)).toContain("rights");
    expect(await count()).toBe(before);
  });

  it("refuses a file that is not audio, in the store's words, and one with no file", async () => {
    const before = await count();
    const txt = await post(SOURCE, COVER_SOURCE_ROUTE, form({ title: "Tears", rights: "own" }, new File(["not a song"], "notes.txt", { type: "text/plain" })));
    expect(txt.status).toBe(400);
    expect(await errorOf(txt)).toBe("notes.txt is not audio (content-type text/plain)");
    const empty = await post(SOURCE, COVER_SOURCE_ROUTE, form({ title: "Tears", rights: "own" }));
    expect(await errorOf(empty)).toContain("audio file");
    expect(await count()).toBe(before);
  });

  it.skipIf(NO_FFMPEG !== null)("refuses a file ffprobe cannot read, in ffprobe's words, making nothing", async () => {
    const before = await count();
    const r = await post(SOURCE, COVER_SOURCE_ROUTE, form({ title: "Tears", rights: "own" }, new File(["ID3 but not really"], "broken.mp3", { type: "audio/mpeg" })));
    expect(r.ok).toBe(false);
    expect(await errorOf(r)).toMatch(/^broken\.mp3 could not be read: ffprobe duration: /);
    expect(await count()).toBe(before);
  });

  it.skipIf(NO_FFMPEG !== null)("makes a draft cover from a good mp3, with its measured duration and the declaration", async () => {
    const r = await post(SOURCE, COVER_SOURCE_ROUTE, form({ title: "Tears", rights: "licensed", holder: "Label Co", note: "sync licence 2026-11" }, mp3File()));
    const body = (await r.json()) as { id: string };
    expect(r.status, JSON.stringify(body)).toBe(200);
    const c = await readCover(body.id);
    expect(c).toMatchObject({ title: "Tears", rights: "licensed", holder: "Label Co", note: "sync licence 2026-11", state: "draft", source: { mime: "audio/mpeg", name: "song.mp3" } });
    expect(c?.source.durationS).toBeGreaterThan(11.5);
    expect(c?.source.durationS).toBeLessThan(12.5);
    const served = await get(`id=${body.id}&f=source`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("audio/mpeg");
    expect(served.headers.get("accept-ranges")).toBe("bytes");
  });
});

describe("POST /audio/cover/remix", () => {
  it("refuses a cover with no winner", async () => {
    const c = await coverIn(judging);
    const r = await post(REMIX, COVER_REMIX_ROUTE, form({ id: c.id, style: "lo-fi" }, new File(["x"], "remix.mp3", { type: "audio/mpeg" })));
    expect(r.status).toBe(403);
    expect(await errorOf(r)).toBe(`cover ${c.id} is judging; a remix follows a picked winner`);
    expect((await readCover(c.id))?.remix).toBeUndefined();
  });

  it.skipIf(NO_FFMPEG !== null)("files the remix on a picked cover, with its style, and serves it", async () => {
    const c = await coverIn((x) => ({ ...judging(x), state: "picked", winnerSeed: 1111, exportFile: "winner.mp3" }));
    const r = await post(REMIX, COVER_REMIX_ROUTE, form({ id: c.id, style: "lo-fi, warm tape" }, mp3File("final.mp3")));
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await readCover(c.id))?.remix).toEqual({ file: "remix.mp3", mime: "audio/mpeg", name: "final.mp3", style: "lo-fi, warm tape" });
    expect(existsSync(coverFileAbs(c.id, "remix.mp3"))).toBe(true);
    expect((await get(`id=${c.id}&f=remix`)).status).toBe(200);
  });
});

describe("GET /audio/cover/file", () => {
  it("serves only the allow-list: an unlisted name, an unknown seed, a path and a bad id are all not-found", async () => {
    const c = await coverIn(judging);
    writeFileSync(coverFileAbs(c.id, "cover-notes.txt"), "not served");
    const take = coverFileAbs(c.id, "takes/s1111.flac");
    process.getBuiltinModule("node:fs").mkdirSync(path.dirname(take), { recursive: true });
    writeFileSync(take, "flac bytes");
    const ok = await get(`id=${c.id}&f=take-1111`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("audio/flac");
    for (const q of [`id=${c.id}&f=cover.json`, `id=${c.id}&f=cover-notes.txt`, `id=${c.id}&f=take-2222`, `id=${c.id}&f=take-9`, `id=${c.id}&f=../cover.json`, `id=${c.id}&f=..%2F..%2Ftakes.json`, `id=${c.id}&f=winner`, `id=..%2F${c.id}&f=source`, `id=cov-000000000000&f=source`, "f=source"]) {
      const r = await get(q);
      expect(r.status, q).toBe(404);
    }
    // Named but not cut yet: still not-found.
    expect((await get(`id=${c.id}&f=section`)).status).toBe(404);
  });
});

describe("the acts", () => {
  const store = (() => {
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    return k.value.store;
  })();
  const plan = (id: string, over: Partial<{ startS: number; endS: number }> = {}) => ({ plan: { id: id as `cov-${string}`, startS: 20, endS: 80, style: "bossa nova, nylon guitar", lyrics: "", sourceStyle: "synthwave", ...over } });

  it("launch saves the plan on a draft and calls the producer live with the actor and the token", async () => {
    const c = await coverIn();
    fakes.launches.length = 0;
    const r = await launchCoverBody({ ...plan(c.id), token: "tok-12345678" }, store, OPERATOR, true);
    expect(r).toEqual({ ok: true, value: { kind: "launched", jobId: "job:cover:stand-in" } });
    expect(await readCover(c.id)).toMatchObject({ section: { startS: 20, endS: 80 }, style: "bossa nova, nylon guitar", lyrics: "", sourceStyle: "synthwave" });
    expect(fakes.launches).toHaveLength(1);
    const [s, p, o] = fakes.launches[0] ?? [];
    expect(s).toBe(store);
    expect(p).toEqual({ id: c.id, startS: 20, endS: 80, style: "bossa nova, nylon guitar", lyrics: "", sourceStyle: "synthwave" });
    expect(o).toEqual({ mode: "live", actor: OPERATOR, dryOnly: true, token: "tok-12345678" });
  });

  it("launch is refused outside draft and failed, and for a section outside the song or past 360 s, saving nothing", async () => {
    fakes.launches.length = 0;
    for (const state of ["queued", "rendering", "judging", "picked"] as const) {
      const c = await coverIn((x) => ({ ...x, state, ...(state === "picked" ? { winnerSeed: 1, exportFile: "winner.mp3" } : {}) }));
      const r = await launchCoverBody(plan(c.id), store, OPERATOR, true);
      expect(r.ok ? "" : r.error.message).toBe(`cover ${c.id} is ${state}; it launches from draft or failed`);
      expect((await readCover(c.id))?.style).toBe("");
    }
    const failed = await coverIn((x) => ({ ...x, state: "failed" }));
    expect((await launchCoverBody(plan(failed.id), store, OPERATOR, true)).ok).toBe(true);
    const c = await coverIn();
    const past = await launchCoverBody(plan(c.id, { startS: 150, endS: 210 }), store, OPERATOR, true);
    expect(past.ok ? "" : past.error.message).toBe("the section ends at 210.0 s; Tears is 200.0 s long");
    const long = await createCover({ title: "Long", rights: "own", source: { bytes: new Uint8Array([1]), mime: "audio/mpeg", name: "l.mp3", durationS: 600 } });
    const over = await launchCoverBody(plan(long.id, { startS: 0, endS: 400 }), store, OPERATOR, true);
    expect(over.ok ? "" : over.error.message).toBe("the section is 400.0 s; YuE2 reads at most 360 s");
    expect((await readCover(c.id))?.style).toBe("");
    expect(fakes.launches).toHaveLength(1);
    expect(sectionProblem(c, 10, 15)).toBe("the section is 5.0 s; a cover needs at least 10 s");
  });

  it("pick is refused before judging and for a seed with no finished take", async () => {
    fakes.exports.length = 0;
    const draft = await coverIn();
    const early = await pickCoverBody({ id: draft.id, seed: 1111 });
    expect(early.ok ? "" : early.error.message).toBe(`cover ${draft.id} is draft; a winner is picked while judging`);
    const c = await coverIn(judging);
    for (const seed of [2222, 3333]) {
      const r = await pickCoverBody({ id: c.id, seed });
      expect(r.ok ? "" : r.error.message).toBe(`cover ${c.id} has no finished take with seed ${seed}`);
    }
    expect(fakes.exports).toHaveLength(0);
    expect((await readCover(c.id))?.state).toBe("judging");
  });

  it("pick exports the take to winner.mp3 and the cover is picked", async () => {
    fakes.exports.length = 0;
    const c = await coverIn(judging);
    const r = await pickCoverBody({ id: c.id, seed: 1111 });
    expect(r).toEqual({ ok: true, value: { winnerUrl: coverFileHref(c.id, "winner") } });
    expect(fakes.exports).toEqual([[coverFileAbs(c.id, "takes/s1111.flac"), coverFileAbs(c.id, "winner.mp3")]]);
    expect(await readCover(c.id)).toMatchObject({ state: "picked", winnerSeed: 1111, exportFile: "winner.mp3" });
    expect(readFileSync(coverFileAbs(c.id, "winner.mp3"), "utf8")).toBe("stand-in mp3");
    const again = await pickCoverBody({ id: c.id, seed: 1111 });
    expect(again.ok).toBe(false);
  });

  it("styles: the source style always, the remix style only on a remix", async () => {
    const c = await coverIn((x) => ({ ...judging(x), state: "picked", winnerSeed: 1111, exportFile: "winner.mp3" }));
    expect(await saveCoverStylesBody({ id: c.id, styles: { sourceStyle: "city pop, 1984" } })).toEqual({ ok: true, value: undefined });
    expect((await readCover(c.id))?.sourceStyle).toBe("city pop, 1984");
    const noRemix = await saveCoverStylesBody({ id: c.id, styles: { remixStyle: "lo-fi" } });
    expect(noRemix.ok ? "" : noRemix.error.message).toBe(`cover ${c.id} has no remix yet`);
    await mutateCover(c.id, (x) => ({ ...x, remix: { file: "remix.mp3", mime: "audio/mpeg", name: "r.mp3", style: "" } }));
    expect((await saveCoverStylesBody({ id: c.id, styles: { remixStyle: "lo-fi" } })).ok).toBe(true);
    expect(await readCover(c.id)).toMatchObject({ sourceStyle: "city pop, 1984", remix: { style: "lo-fi" } });
    expect((await saveCoverStylesBody({ id: c.id, styles: { sourceStyle: "" } })).ok).toBe(true);
    expect(await readCover(c.id)).not.toHaveProperty("sourceStyle");
  });
});

describe("the desk's read", () => {
  it("lists newest first with addresses through the file route, and holds ?cover=", async () => {
    const view = await readCoverDesk({});
    const ids = view.covers.map((c) => c.record.createdAt);
    expect([...ids].sort().reverse()).toEqual(ids);
    expect(view.current?.record.id).toBe(view.covers[0]?.record.id);
    const judged = view.covers.find((c) => c.record.state === "judging");
    expect(judged).toBeDefined();
    if (judged === undefined) return;
    expect(judged.sourceUrl).toBe(coverFileHref(judged.record.id, "source"));
    expect(judged.takeUrls).toEqual({ 1111: coverFileHref(judged.record.id, "take-1111") });
    expect(judged).not.toHaveProperty("winnerUrl");
    expect((await readCoverDesk({ cover: judged.record.id })).current?.record.id).toBe(judged.record.id);
  });
});
