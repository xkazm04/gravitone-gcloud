// KEEPING ONE SUNO TAKE (spark suno-covers WP1, lib/sound/cover/suno.ts fileSunoTake) over a temp sound store and a temp
// kernel (the receipt lives there), with a FAKE Suno API and a fake byte fetch - stand-ins: no network. Unconfirmed it
// answers Suno's quote and files nothing; confirmed it spends one download credit under a `suno-download` receipt and files
// the take as the cover's remix with its Suno clip id; under DRY_ONLY it is refused before Suno is asked; Suno's refusal is
// verbatim and releases the receipt; a file Suno answers with a url unconfirmed is filed free.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cover-suno-file-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  delete process.env["GRAVITONE_DRY_ONLY"];
  return dir;
});

import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";

import { fileSunoTake, probedBytes, type FileSunoDeps } from "../../lib/sound/cover/suno.ts";
import { coverFileAbs, createCover, mutateCover, readCover, writeCoverFile } from "../../lib/sound/cover/store.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const OP = { kind: "operator" as const, id: "op" };
/** Clip ids carry the cover id: a settled receipt of one test is never another's replay. */
const A = (c: { readonly id: string }): string => `${c.id}-a`;
const B = (c: { readonly id: string }): string => `${c.id}-b`;
const PAID_URL = "https://s3.example/clip-a_paid_wm.mp3";
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 9, 9, 9]);

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
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

type Answer = { readonly status: string; readonly format?: string; readonly url?: string; readonly credits_remaining?: number; readonly message?: string };

/** A Suno whose download answers come from the test: one for the unconfirmed press, one for the confirmed. */
function fakeDeps(o: { readonly quote?: Answer; readonly paid?: Answer | "refuse"; readonly dryOnly?: boolean; readonly measure?: FileSunoDeps["measure"] } = {}) {
  const downloads: { readonly id: string; readonly confirm: boolean }[] = [];
  const fetched: string[] = [];
  const deps: FileSunoDeps = {
    api: {
      download: async (id, x) => {
        downloads.push({ id, confirm: x.confirm });
        if (!x.confirm) return ok((o.quote ?? { status: "requires_credit", format: "mp3", credits_remaining: 42, message: "needs a credit" }) as never);
        if (o.paid === "refuse") return err("refused", "Suno: no download credits left");
        return ok((o.paid ?? { status: "ok", format: "mp3", url: PAID_URL }) as never);
      },
    },
    fetchBytes: async (url) => {
      fetched.push(url);
      return MP3;
    },
    measure: o.measure ?? (async () => ok(187.5)),
    store: (): Result<Store> => ok(store()),
    actor: OP,
    dryOnly: o.dryOnly ?? false,
    sleep: async () => undefined,
    now: () => 0,
  };
  return { deps, downloads, fetched };
}

/** A picked cover whose send 1 made two takes (clips clip-a and clip-b). */
async function sentCover(o: { readonly takeState?: "complete" | "failed"; readonly state?: "picked" | "judging" } = {}) {
  const c = await createCover({ title: "Tears", rights: "own", source: { bytes: new Uint8Array([0x49, 0x44, 0x33, 4]), mime: "audio/mpeg", name: "tears.mp3", durationS: 200 } });
  await writeCoverFile(c.id, "winner.mp3", new Uint8Array([1, 2, 3]));
  await mutateCover(c.id, (x) => ({
    ...x,
    state: o.state ?? "picked",
    winnerSeed: 1,
    exportFile: "winner.mp3",
    suno: {
      uploadClipId: "up-1",
      sends: [
        {
          n: 1,
          at: "2026-11-10T12:00:00.000Z",
          jobId: `job:cover-suno:${c.id}:1`,
          state: "done",
          plan: { style: "Dark synthwave, 100 BPM", lyrics: "", model: "v6" },
          takes: [
            { take: 1, state: o.takeState ?? "complete", clipId: `${c.id}-a`, title: "Tears (suno 1)" },
            { take: 2, state: "complete", clipId: `${c.id}-b`, title: "Tears (suno 2)" },
          ],
        },
      ],
    },
  }));
  return c;
}

describe("keeping a Suno take", () => {
  it("unconfirmed answers Suno's quote (one credit, how many are left) and files nothing", async () => {
    const c = await sentCover();
    const f = fakeDeps();
    const r = await fileSunoTake({ id: c.id, send: 1, take: 1 }, f.deps);
    expect(r.ok && r.value).toEqual({ quote: { clipId: A(c), credits: 1, format: "mp3", left: 42 } });
    expect(f.downloads).toEqual([{ id: A(c), confirm: false }]);
    const rec = await readCover(c.id);
    expect([rec?.remix, rec?.suno?.filed]).toEqual([undefined, undefined]);
  });

  it("confirmed spends the credit and files remix.mp3 with the Suno clip id and the send's style", async () => {
    const c = await sentCover();
    const f = fakeDeps();
    const r = await fileSunoTake({ id: c.id, send: 1, take: 1, confirm: true }, f.deps);
    expect(r.ok && r.value).toEqual({ filed: { send: 1, take: 1, clipId: A(c) } });
    expect(f.downloads).toEqual([{ id: A(c), confirm: true }]);
    expect(f.fetched).toEqual([PAID_URL]);
    const rec = await readCover(c.id);
    expect(rec?.remix).toEqual({ file: "remix.mp3", mime: "audio/mpeg", name: "Tears (suno 1).mp3", style: "Dark synthwave, 100 BPM", sunoClipId: A(c) });
    expect(rec?.suno?.filed).toEqual({ send: 1, take: 1, clipId: A(c) });
    expect(rec?.suno?.uploadClipId).toBe("up-1");
    expect([...readFileSync(coverFileAbs(c.id, "remix.mp3"))]).toEqual([...MP3]);
    // The same take pressed again is the remix already: no second credit.
    const again = await fileSunoTake({ id: c.id, send: 1, take: 1, confirm: true }, f.deps);
    expect(again.ok && again.value).toEqual({ filed: { send: 1, take: 1, clipId: A(c) } });
    expect(f.downloads).toHaveLength(1);
  });

  it("under DRY_ONLY the confirmed press is refused before Suno is asked, and nothing is filed", async () => {
    const c = await sentCover();
    const f = fakeDeps({ dryOnly: true });
    const r = await fileSunoTake({ id: c.id, send: 1, take: 2, confirm: true }, f.deps);
    expect(!r.ok && r.error.message).toBe(`GRAVITONE_DRY_ONLY=1 pins this server dry: "Tears (suno 2)" was not downloaded and no download credit was spent`);
    expect(f.downloads).toEqual([]);
    expect(existsSync(coverFileAbs(c.id, "remix.mp3"))).toBe(false);
    expect((await readCover(c.id))?.remix).toBeUndefined();
  });

  it("Suno's refusal is the answer verbatim and the receipt is released: the next press is not a conflict", async () => {
    const c = await sentCover();
    const refuse = fakeDeps({ paid: "refuse" });
    const r = await fileSunoTake({ id: c.id, send: 1, take: 1, confirm: true }, refuse.deps);
    expect(!r.ok && r.error.message).toBe("Suno: no download credits left");
    expect((await readCover(c.id))?.remix).toBeUndefined();
    const next = fakeDeps();
    const ok2 = await fileSunoTake({ id: c.id, send: 1, take: 1, confirm: true }, next.deps);
    expect(ok2.ok && ok2.value).toEqual({ filed: { send: 1, take: 1, clipId: A(c) } });
    expect(next.downloads).toEqual([{ id: A(c), confirm: true }]);
  });

  it("a file Suno answers with a url, unconfirmed, is filed free: no confirm, no receipt", async () => {
    const c = await sentCover();
    const f = fakeDeps({ quote: { status: "ok", format: "mp3", url: PAID_URL } });
    const r = await fileSunoTake({ id: c.id, send: 1, take: 2 }, f.deps);
    expect(r.ok && r.value).toEqual({ filed: { send: 1, take: 2, clipId: B(c) } });
    expect(f.downloads).toEqual([{ id: B(c), confirm: false }]);
    expect((await readCover(c.id))?.remix?.sunoClipId).toBe(B(c));
  });

  it("bytes that do not decode are refused in the decoder's words and nothing is filed", async () => {
    const c = await sentCover();
    const f = fakeDeps({ measure: async (_b, name) => err("invalid", `${name} could not be read: moov atom not found`) });
    const r = await fileSunoTake({ id: c.id, send: 1, take: 1, confirm: true }, f.deps);
    expect(!r.ok && r.error.message).toBe("Tears (suno 1).mp3 could not be read: moov atom not found");
    expect(existsSync(coverFileAbs(c.id, "remix.mp3"))).toBe(false);
    expect((await readCover(c.id))?.remix).toBeUndefined();
  });

  it("refuses a cover that is not picked, a take that was not made, and a send that is not there, in words", async () => {
    const f = fakeDeps();
    const judging = await sentCover({ state: "judging" });
    const a = await fileSunoTake({ id: judging.id, send: 1, take: 1 }, f.deps);
    expect(!a.ok && a.error.message).toBe(`cover ${judging.id} is judging; keeping a Suno take follows a picked winner`);
    const failed = await sentCover({ takeState: "failed" });
    const b = await fileSunoTake({ id: failed.id, send: 1, take: 1 }, f.deps);
    expect(!b.ok && b.error.message).toBe("take 1 of send 1 was not made; there is nothing to keep");
    const picked = await sentCover();
    const c = await fileSunoTake({ id: picked.id, send: 3, take: 1 }, f.deps);
    expect(!c.ok && c.error.message).toBe(`cover ${picked.id} has no send 3 to Suno`);
    const none = await fileSunoTake({ id: "cov-000000000000", send: 1, take: 1 }, f.deps);
    expect(!none.ok && none.error.message).toBe("no cover cov-000000000000");
    expect(f.downloads).toEqual([]);
  });

  it("probedBytes refuses bytes ffprobe cannot read, naming the file", async () => {
    const r = await probedBytes(new Uint8Array([1, 2, 3]), "x.mp3", ".mp3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message.startsWith("x.mp3 could not be read:")).toBe(true);
  });
});
