// THE REEL FILM (spark reel-studio): lib/reel/film.ts's stage machine, the store's drop and pins, the ffmpeg half
// (lib/reel/encode.ts), pipeline/reel-import.mts, the one verdict writer (lib/reel/decide.ts) and the film's two
// Board stops (lib/decision/v1/sources/reel.ts + reelFilm.ts) - over a TINY generated film (ffmpeg testsrc, 4 s
// desktop and 2 s phone, a sine bed), a temp reel root, a temp exports root and an in-memory kernel.
//
// Pinned: an imported film is at `review` without a table; a film keep -> bed -> two copies -> release keep makes
// exactly two exports and two youtube slots, and doing it again makes nothing more; a stop decided through
// decideReelStop reads decided on the Board; a verdict of a film made again since is refused; a drop is the film's
// alone; a new render drops every copy and a new bed drops them too; a bed shorter than the film is refused with
// the length to ask for.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-reel-film-"));
  process.env["REELS_STORE_DIR"] = path.join(dir, "reels");
  process.env["PUBLISH_EXPORTS_DIR"] = path.join(dir, "exports");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["PUBLISH_MODE"] = "dry";
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { listSlots } from "@gt/kernel/slots/read";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { liveReelPiles, makeReelAdapter } from "../../lib/decision/v1/sources/reel.ts";
import { reelExportId, reelSlotId } from "../../lib/producers/reelActs.ts";
import { decideReelStop } from "../../lib/reel/decide.ts";
import { encodeToSize, muxBed, probeMedia, sha256File } from "../../lib/reel/encode.ts";
import { bedProblem, filmStageOf, filmSubjectSha, withBed, withCopy, withFilmRender } from "../../lib/reel/film.ts";
import { sha256Text } from "../../lib/reel/sha256.ts";
import { parseState } from "../../lib/reel/state.ts";
import { parseVerdicts, readVerdicts, recordVerdict, type ReelVerdict, type ReelVerdicts } from "../../lib/reel/store.ts";
import { FILM_DIR, FILM_SPEC, type BedRecord, type FilmCopy, type FilmFace, type ReelState } from "../../lib/reel/types.ts";
import { importReel } from "../../pipeline/reel-import.mts";
import { must, openFlow } from "./decision-v1-harness.ts";

const REELS = path.join(ROOT, "reels");
const EXPORTS = path.join(ROOT, "exports");
const SRC = path.join(ROOT, "src");
const SLUG = "tiny-strait";
const dir = path.join(REELS, SLUG);
const filmDir = path.join(dir, FILM_DIR);
const IDEA = { title: "The Tiny Strait", hook: "Who ships the most goods to the world?", path: "The US leads the 1970s, Germany takes over, and in 2013 China surges past into the top lane." };
const ff = (args: string[]): void => void execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

const loadState = (): ReelState => {
  const s = parseState(JSON.parse(readFileSync(path.join(dir, "reel.json"), "utf8")));
  if (typeof s === "string") throw new Error(s);
  return s;
};
const saveState = (s: ReelState): void => writeFileSync(path.join(dir, "reel.json"), JSON.stringify(s, null, 2));
const stage = async (): Promise<string> => filmStageOf(loadState(), await readVerdicts(dir));
const verdict = (v: Partial<ReelVerdict> & Pick<ReelVerdict, "verdict" | "of">): ReelVerdict => ({ reasons: [], by: "operator", at: "2026-11-18T12:00:00.000Z", round: 1, ...v });
const NO_VERDICTS: ReelVerdicts = { v: 1, stops: {} };

let store: Store;
const adapter = makeReelAdapter({ store: () => ({ ok: true, value: store }) });

beforeAll(() => {
  mkdirSync(SRC, { recursive: true });
  ff(["-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=4", "-pix_fmt", "yuv420p", path.join(SRC, "film-desktop.mp4")]);
  ff(["-f", "lavfi", "-i", "testsrc=size=180x320:rate=30:duration=2", "-pix_fmt", "yuv420p", path.join(SRC, "film-mobile.mp4")]);
  ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=5", "-c:a", "aac", path.join(SRC, "bed.m4a")]);
  ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "aac", path.join(SRC, "short-bed.m4a")]);
  for (const page of ["reel.html", "reel-desktop.html"]) writeFileSync(path.join(SRC, page), "<!doctype html><script type=module src=./reel.js></script>");
  writeFileSync(path.join(SRC, "reel.js"), "window.REEL = { frames: 120 };");
  writeFileSync(path.join(SRC, "build.mjs"), "// not a page: stays behind");
  mkdirSync(path.join(SRC, "fonts"));
  writeFileSync(path.join(SRC, "fonts", "a.woff2"), "font");
  store = must(openKernel(":memory:")).store;
}, 60_000);

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("the film's pure half", () => {
  it("the subject sha is node's sha256 of the two faces' shas, desktop first", () => {
    for (const s of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "x\nyé中".repeat(40)]) expect(sha256Text(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    const render = { file: "f", frames: 1, seconds: 1, bytes: 1, renderedAt: "x" };
    const film = { frames: 1, renders: { desktop: { ...render, sha: "d" }, phone: { ...render, sha: "p" } }, copies: {} };
    expect(filmSubjectSha(film, "film")).toBe(createHash("sha256").update("d\np").digest("hex"));
    expect(filmSubjectSha(film, "release")).toBeUndefined();
  });

  it("a bed shorter than the desktop film is refused with the length to ask for", () => {
    expect(bedProblem({ seconds: 3 }, 4)).toBe("the bed is 3.0 s and the desktop film is 4.0 s: ask Suno for a track of at least 4 s");
    expect(bedProblem({ seconds: 99.98 }, 100)).toBeUndefined();
    expect(bedProblem({ seconds: 101.2 }, 100.4)).toBeUndefined();
  });

  it("pins read in time order; a drop and a pin are the film stop's alone", async () => {
    const parsed = parseVerdicts({ v: 1, stops: { film: { verdict: "reject", reasons: ["pacing"], pins: [{ t: 40, reasons: [], text: "b" }, { t: 3.5, reasons: ["legibility"], text: "a" }], by: "operator", at: "x", of: "s", round: 1 } } });
    expect(typeof parsed === "string" ? parsed : parsed.stops.film?.pins?.map((p) => p.t)).toEqual([3.5, 40]);
    expect(parseVerdicts({ v: 1, stops: { film: { verdict: "reject", reasons: [], pins: [{ t: -1, reasons: [], text: "" }], by: "operator", at: "x", of: "s", round: 1 } } })).toBe("verdicts.json: the film verdict does not read");
    const folder = path.join(ROOT, "pure");
    mkdirSync(folder, { recursive: true });
    await expect(recordVerdict(folder, "release", verdict({ verdict: "drop", of: "s" }))).rejects.toThrow("only the film stop can be dropped, not release");
    await expect(recordVerdict(folder, "data", verdict({ verdict: "reject", of: "s", pins: [{ t: 1, reasons: [], text: "x" }] }))).rejects.toThrow("only the film stop takes pinned notes, not data");
  });
});

describe("a film imported, kept, scored, encoded and released", () => {
  it("imports at review with no table: masters copied by name, thumbs and poster drawn, the build script left behind", async () => {
    const out = await importReel({ folder: SRC, slug: SLUG, title: IDEA.title, hook: IDEA.hook, path: IDEA.path, shared: path.join(ROOT, "no-shared") });
    expect(out["stage"]).toBe("review");
    const state = loadState();
    expect(state.stage).toBe("idea");
    expect(state.tableSha).toBeUndefined();
    expect(state.film?.frames).toBe(120);
    expect(state.film?.renders.phone).toMatchObject({ file: "film-phone.mp4", frames: 60, sha: await sha256File(path.join(SRC, "film-mobile.mp4")) });
    expect(state.film?.thumbs?.desktop).toHaveLength(12);
    expect(state.film?.thumbs?.phone[11]).toBe("thumbs/p-12.jpg");
    for (const f of ["reel.html", "reel-desktop.html", "reel.js", "fonts/a.woff2", "poster.jpg", "thumbs/d-01.jpg", "film-desktop.mp4"]) expect(existsSync(path.join(filmDir, f)), f).toBe(true);
    expect(existsSync(path.join(filmDir, "build.mjs"))).toBe(false);
    await expect(importReel({ folder: SRC, slug: SLUG, title: IDEA.title, hook: IDEA.hook, path: IDEA.path })).rejects.toThrow("pass --again");
  }, 180_000);

  it("the film stop opens on the Board with the desktop face's recorded sha and its poster; decided through decideReelStop it reads decided", async () => {
    const state = loadState();
    const film = state.film;
    if (film === undefined) throw new Error("no film");
    const plan = must(adapter.packet(must(await adapter.read({ runId: `${SLUG}:film` }))));
    expect(plan.packet.items.map((c) => [c.id, c.media.sha256])).toEqual([["film", film.renders.desktop?.sha]]);
    expect(plan.present.items["film"]).toMatchObject({ label: IDEA.title, meta: "desktop 4 s · phone 2 s · 120 frames" });
    expect(plan.present.items["film"]?.poster).toContain("path=film%2Fposter.jpg");
    expect(must(await liveReelPiles()).map((p) => p.id)).toEqual([`${SLUG}:film`]);

    const subject = filmSubjectSha(film, "film") as string;
    expect(words(await decideReelStop(SLUG, "film", verdict({ verdict: "keep", of: "0".repeat(64) })))).toBe(`conflict: reel ${SLUG}: the film was made again since you looked`);
    expect(words(await decideReelStop(SLUG, "film", verdict({ verdict: "keep", of: subject, by: "agent" })))).toBe(`refused: reel ${SLUG}: only an operator keeps the film stop`);
    expect(must(await decideReelStop(SLUG, "film", verdict({ verdict: "keep", of: subject })))).toEqual({ recorded: "written" });
    expect(must(await decideReelStop(SLUG, "film", verdict({ verdict: "keep", of: subject })))).toEqual({ recorded: "same" });
    expect(await stage()).toBe("sound");
    expect(words(await adapter.read({ runId: `${SLUG}:film` }))).toBe(`not-found: reel ${SLUG}: the film stop is decided (keep, round 1)`);
    expect(must(await liveReelPiles())).toEqual([]);
  });

  it("a short bed is refused; the bed and two copies make the release stop; a release keep lands two exports and two slots, once", async () => {
    const seconds = async (f: string): Promise<number> => (await probeMedia(f)).seconds;
    const bedOf = async (file: string): Promise<BedRecord> => ({ file: "bed.m4a", seconds: await seconds(file), sha: await sha256File(file), attachedAt: "2026-11-18T12:01:00.000Z", prompt: { style: "calm sine", model: "v5.5" } });
    expect(() => withBed(loadState(), { file: "bed.m4a", seconds: 3, sha: "s", attachedAt: "x" }, "now")).toThrow("ask Suno for a track of at least 4 s");

    writeFileSync(path.join(filmDir, "bed.m4a"), readFileSync(path.join(SRC, "bed.m4a")));
    let state = withBed(loadState(), await bedOf(path.join(filmDir, "bed.m4a")), "2026-11-18T12:01:00.000Z");
    const bed = state.film?.bed;
    if (bed === undefined) throw new Error("no bed");
    for (const face of ["desktop", "phone"] as FilmFace[]) {
      const spec = FILM_SPEC[face];
      const render = state.film?.renders[face];
      if (render === undefined) throw new Error("no render");
      await muxBed({ film: path.join(filmDir, spec.file), bed: path.join(filmDir, bed.file), out: path.join(filmDir, spec.mix), face, seconds: render.seconds });
      const mixed = await probeMedia(path.join(filmDir, spec.mix));
      expect(mixed.hasAudio).toBe(true);
      expect(Math.abs(mixed.seconds - render.seconds)).toBeLessThan(0.15);
      const target = face === "desktop" ? 150_000 : 100_000;
      const bytes = await encodeToSize({ src: path.join(filmDir, spec.mix), out: path.join(filmDir, spec.release), targetBytes: target, seconds: render.seconds });
      const copy: FilmCopy = { file: spec.release, seconds: render.seconds, bytes, sha: await sha256File(path.join(filmDir, spec.release)), encodedAt: "2026-11-18T12:02:00.000Z", bedSha: bed.sha };
      state = withCopy(state, face, copy, "2026-11-18T12:02:00.000Z");
    }
    saveState(state);
    expect(await stage()).toBe("release");
    expect(must(await liveReelPiles()).map((p) => p.id)).toEqual([`${SLUG}:release`]);
    const film = loadState().film;
    if (film === undefined) throw new Error("no film");
    const plan = must(adapter.packet(must(await adapter.read({ runId: `${SLUG}:release` }))));
    expect(plan.packet.items[0]?.media.sha256).toBe(film.copies.desktop?.sha);
    expect(plan.present.items["release"]?.meta).toContain("with its bed");

    const of = filmSubjectSha(film, "release") as string;
    expect(words(await decideReelStop(SLUG, "release", verdict({ verdict: "drop", of })))).toBe(`invalid: reel ${SLUG}: only the film stop can be dropped`);
    const keep = verdict({ verdict: "keep", of, note: "calendar: youtube 2026-11-21T17:00:00.000Z" });
    const first = must(await decideReelStop(SLUG, "release", keep, { store: () => ({ ok: true, value: store }) }));
    expect(first).toEqual({ recorded: "written", slots: [reelSlotId(SLUG, "desktop"), reelSlotId(SLUG, "phone")] });
    const again = must(await decideReelStop(SLUG, "release", keep, { store: () => ({ ok: true, value: store }) }));
    expect(again).toEqual({ recorded: "same", slots: [reelSlotId(SLUG, "desktop"), reelSlotId(SLUG, "phone")] });

    const slots = must(listSlots(store));
    expect(slots.map((r) => [r.slot.id, r.slot.libraryItemId, r.slot.channel, r.slot.at, r.slot.title])).toEqual([
      [reelSlotId(SLUG, "desktop"), `video:export:${reelExportId(SLUG, "desktop")}`, "youtube", "2026-11-21T17:00:00.000Z", IDEA.title],
      [reelSlotId(SLUG, "phone"), `video:export:${reelExportId(SLUG, "phone")}`, "youtube", "2026-11-21T17:00:00.000Z", IDEA.title],
    ]);
    expect(readdirSync(EXPORTS).sort()).toEqual([`reel-${SLUG}-desktop.json`, `reel-${SLUG}-desktop.mp4`, `reel-${SLUG}-phone.json`, `reel-${SLUG}-phone.mp4`]);
    expect(JSON.parse(readFileSync(path.join(filmDir, "publish.json"), "utf8"))).toMatchObject({ title: IDEA.title, description: IDEA.hook });
    expect(await stage()).toBe("released");
    expect(must(await liveReelPiles())).toEqual([]);
  }, 180_000);

  it("a new render drops every copy and keeps the bed; a different bed drops the copies too", () => {
    const state = loadState();
    const film = state.film;
    if (film?.renders.phone === undefined || film.bed === undefined) throw new Error("no film");
    const again = withFilmRender(state, "phone", { ...film.renders.phone, sha: "f".repeat(64) }, film.frames, "now");
    expect(again.film?.copies).toEqual({});
    expect(again.film?.bed).toEqual(film.bed);
    expect(withFilmRender(state, "phone", film.renders.phone, film.frames, "now")).toBe(state);
    expect(withBed(state, { ...film.bed, sha: "e".repeat(64) }, "now").film?.copies).toEqual({});
    expect(Object.keys(withBed(state, { ...film.bed, prompt: { style: "backfilled" } }, "now").film?.copies ?? {})).toEqual(["desktop", "phone"]);
  });
});

describe("the film stop sent back on the Board, and dropped", () => {
  const OTHER = "tiny-again";
  const otherDir = path.join(REELS, OTHER);

  it("a Board reject with a reason is recorded as a verdict of the pair: redo, until the pages are written again", async () => {
    await importReel({ folder: SRC, slug: OTHER, title: IDEA.title, hook: IDEA.hook, path: IDEA.path, shared: path.join(ROOT, "no-shared") });
    const flow = await openFlow(adapter, `${OTHER}:film`, path.join(ROOT, "blobs"));
    flow.patch([{ candidate: "film", verdict: "reject", reasons: ["pacing"], note: "the 2013 overtake is over in a blink" }]);
    expect(must(flow.preview()).consequence.writes.map((w) => w.detail)).toEqual(["reject (pacing) · the pages are written again"]);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    const st = JSON.parse(readFileSync(path.join(otherDir, "reel.json"), "utf8")) as ReelState;
    const held = (await readVerdicts(otherDir)).stops.film;
    expect(held).toMatchObject({ verdict: "reject", reasons: ["pacing"], of: st.film === undefined ? "" : filmSubjectSha(st.film, "film"), round: 1 });
    expect(filmStageOf(st, await readVerdicts(otherDir))).toBe("redo");
    const rewritten: ReelState = { ...st, film: st.film === undefined ? undefined : { ...st.film, authoredAt: "2099-01-01T00:00:00.000Z" } };
    expect(filmStageOf(rewritten, await readVerdicts(otherDir))).toBe("rendering");
  }, 180_000);

  it("a drop is final", async () => {
    const st = JSON.parse(readFileSync(path.join(otherDir, "reel.json"), "utf8")) as ReelState;
    const film = st.film;
    if (film === undefined) throw new Error("no film");
    const fresh = withFilmRender(withFilmRender(st, "desktop", { ...(film.renders.desktop as NonNullable<typeof film.renders.desktop>), sha: "a".repeat(64) }, film.frames, "now"), "phone", { ...(film.renders.phone as NonNullable<typeof film.renders.phone>), sha: "b".repeat(64) }, film.frames, "now");
    writeFileSync(path.join(otherDir, "reel.json"), JSON.stringify(fresh));
    const of = filmSubjectSha(fresh.film as NonNullable<typeof fresh.film>, "film") as string;
    expect(must(await decideReelStop(OTHER, "film", verdict({ verdict: "drop", of, round: 2 })))).toEqual({ recorded: "written" });
    expect(filmStageOf(fresh, await readVerdicts(otherDir))).toBe("dropped");
    expect(filmStageOf({ ...fresh, film: undefined }, NO_VERDICTS)).toBe("idea");
  });
});

function words<T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): string {
  return r.ok ? "ok" : `${r.error.code}: ${r.error.message}`;
}
