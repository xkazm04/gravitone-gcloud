// The reel retention sweep (spark reel-studio, the owner's rule of 2026-11-18): lib/reel/retention.ts says what is
// due, lib/reel/archive.ts writes the recipe first, deletes, and records each deletion in reel.json.
//
// Pinned: a master's 14 days do not run while the film is in review, sound or release; a mix goes once its copy is
// encoded; the final cut (both copies) goes 3 days after a REAL publication, never after a dry one; the bed goes with
// the last cut; the recipe and the thumbnails survive; a file found already gone is recorded once, marked; a dry
// sweep writes nothing.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-reel-archive-"));
  process.env["REELS_STORE_DIR"] = path.join(dir, "reels");
  process.env["PUBLISH_EXPORTS_DIR"] = path.join(dir, "exports");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { archiveReel } from "../../lib/reel/archive.ts";
import type { FilmStage } from "../../lib/reel/film.ts";
import { RECIPE_DOC, RECIPE_FILE, type ReelRecipe } from "../../lib/reel/recipe.ts";
import { dueFiles, MASTER_HELD, type FacePublication } from "../../lib/reel/retention.ts";
import type { ReelVerdicts } from "../../lib/reel/store.ts";
import type { FilmRecord, ReelState } from "../../lib/reel/types.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-01T00:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

const film = (o: Partial<FilmRecord> = {}): FilmRecord => ({
  frames: 300,
  renders: {
    desktop: { file: "film-desktop.mp4", frames: 300, seconds: 10, bytes: 1000, sha: "d".repeat(64), renderedAt: iso(T0) },
    phone: { file: "film-phone.mp4", frames: 150, seconds: 5, bytes: 500, sha: "p".repeat(64), renderedAt: iso(T0) },
  },
  copies: {},
  thumbs: { desktop: ["thumbs/d-01.jpg"], phone: ["thumbs/p-01.jpg"], poster: "poster.jpg" },
  ...o,
});
const copies: FilmRecord["copies"] = {
  desktop: { file: "release-desktop.mp4", seconds: 10, bytes: 300, sha: "a".repeat(64), encodedAt: iso(T0 + DAY), bedSha: "b".repeat(64) },
  phone: { file: "release-phone.mp4", seconds: 5, bytes: 200, sha: "c".repeat(64), encodedAt: iso(T0 + DAY), bedSha: "b".repeat(64) },
};
const bed = { file: "bed.mp3", seconds: 12, sha: "b".repeat(64), attachedAt: iso(T0), prompt: { style: "lofi, 80 bpm" } };
const none = (): undefined => undefined;
const names = (stage: FilmStage, f: FilmRecord, now: number, pub: (face: "desktop" | "phone") => FacePublication | undefined = none): string[] =>
  dueFiles({ film: f, stage, now: new Date(now), published: pub, exportOf: (face) => `reel-x-${face}.mp4` }).map((d) => `${d.file}:${d.rule}`);

describe("what is due", () => {
  it("a master's 14 days do not run while the film still needs it", () => {
    for (const stage of MASTER_HELD) expect(names(stage, film(), T0 + 30 * DAY)).toEqual([]);
    expect(names("dropped", film(), T0 + 13 * DAY)).toEqual([]);
    expect(names("dropped", film(), T0 + 14 * DAY)).toEqual(["film-desktop.mp4:master-14d", "film-phone.mp4:master-14d"]);
    expect(names("redo", film(), T0 + 15 * DAY)).toHaveLength(2);
  });

  it("a mix goes as soon as its copy is encoded; the cut 3 days after a real publication, the bed with the last cut", () => {
    const f = film({ copies, bed });
    expect(names("release", f, T0 + 2 * DAY)).toEqual(["mix-desktop.mp4:mix-encoded", "mix-phone.mp4:mix-encoded"]);
    const real = (): FacePublication => ({ at: iso(T0 + 2 * DAY), dry: false });
    expect(names("released", f, T0 + 4 * DAY, real).filter((n) => n.includes("cut"))).toEqual([]);
    const due = names("released", f, T0 + 5 * DAY, real);
    expect(due).toEqual(expect.arrayContaining(["release-desktop.mp4:cut-3d-published", "exports:reel-x-desktop.mp4:cut-3d-published", "release-phone.mp4:cut-3d-published", "exports:reel-x-phone.mp4:cut-3d-published", "bed.mp3:bed-with-cut"]));
  });

  it("a dry publication starts no clock, and one face published keeps the bed", () => {
    const f = film({ copies, bed });
    const dry = (): FacePublication => ({ at: iso(T0), dry: true });
    expect(names("released", f, T0 + 30 * DAY, dry).filter((n) => !n.includes("master") && !n.includes("mix"))).toEqual([]);
    const desktopOnly = (face: "desktop" | "phone"): FacePublication | undefined => (face === "desktop" ? { at: iso(T0), dry: false } : undefined);
    const due = names("released", f, T0 + 30 * DAY, desktopOnly);
    expect(due).toContain("release-desktop.mp4:cut-3d-published");
    expect(due).not.toContain("bed.mp3:bed-with-cut");
  });
});

describe("the sweep", () => {
  const reels = path.join(ROOT, "reels");
  const exportsDir = path.join(ROOT, "exports");
  const slug = "swept";
  const dir = path.join(reels, slug);
  const fd = path.join(dir, "film");
  const touch = (abs: string, bytes: number): void => {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.alloc(bytes, 1));
  };
  const state = (f: FilmRecord): ReelState => ({ v: 1, slug, stage: "idea", idea: { title: "Swept", hook: "Who is swept?", path: "A test reel whose files the retention sweep takes, one rule at a time." }, cuts: {}, film: f, updatedAt: iso(T0) });
  const verdicts: ReelVerdicts = {
    v: 1,
    stops: {
      film: { verdict: "keep", reasons: [], by: "operator", at: iso(T0 + DAY), of: "x", round: 1 },
      release: { verdict: "keep", reasons: [], by: "operator", at: iso(T0 + DAY), of: "y", round: 1 },
    },
  };

  it("writes the recipe, deletes what is due, records it, and keeps the code and the thumbs", async () => {
    // The film/release shas in `verdicts` do not match the record's, so the stage reads `review`-like; make them match.
    const { filmSubjectSha } = await import("../../lib/reel/film.ts");
    const f = film({ copies, bed });
    const v: ReelVerdicts = { v: 1, stops: { film: { ...verdicts.stops.film!, of: filmSubjectSha(f, "film")! }, release: { ...verdicts.stops.release!, of: filmSubjectSha(f, "release")! } } };
    mkdirSync(fd, { recursive: true });
    writeFileSync(path.join(dir, "reel.json"), JSON.stringify(state(f)));
    writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(v));
    for (const [name, bytes] of [["film-desktop.mp4", 1000], ["film-phone.mp4", 500], ["mix-desktop.mp4", 1100], ["mix-phone.mp4", 600], ["release-desktop.mp4", 300], ["release-phone.mp4", 200], ["bed.mp3", 50], ["thumbs/d-01.jpg", 10], ["thumbs/p-01.jpg", 10], ["poster.jpg", 20], ["stills/desktop-1.png", 70]] as const) touch(path.join(fd, name), bytes);
    writeFileSync(path.join(fd, "reel.html"), "<html></html>");
    writeFileSync(path.join(fd, "reel.js"), "export const x = 1;");
    touch(path.join(exportsDir, "reel-swept-desktop.mp4"), 300);
    // reel-swept-phone.mp4 is NOT there: a copy found already gone is recorded, once, as missing.

    const pub = (): FacePublication => ({ at: iso(T0 + 2 * DAY), dry: false });

    const dry = await archiveReel(slug, { now: new Date(T0 + 20 * DAY), dry: true, publication: pub });
    expect(dry.deleted.length).toBeGreaterThan(0);
    expect(existsSync(path.join(fd, "film-desktop.mp4"))).toBe(true);
    expect(existsSync(path.join(dir, RECIPE_FILE))).toBe(false);

    const r = await archiveReel(slug, { now: new Date(T0 + 20 * DAY), publication: pub });
    expect(r.error).toBeUndefined();
    const gone = r.deleted.map((d) => d.file).sort();
    expect(gone).toEqual(["bed.mp3", "exports:reel-swept-desktop.mp4", "film-desktop.mp4", "film-phone.mp4", "mix-desktop.mp4", "mix-phone.mp4", "release-desktop.mp4", "release-phone.mp4", "stills/"].sort());
    expect(r.missing.map((m) => m.file)).toEqual(["exports:reel-swept-phone.mp4"]);
    for (const keep of ["reel.html", "reel.js", "poster.jpg", "thumbs/d-01.jpg", "thumbs/p-01.jpg"]) expect(existsSync(path.join(fd, keep)), keep).toBe(true);
    for (const lost of ["film-desktop.mp4", "mix-phone.mp4", "release-desktop.mp4", "bed.mp3", "stills"]) expect(existsSync(path.join(fd, lost)), lost).toBe(false);
    expect(existsSync(path.join(exportsDir, "reel-swept-desktop.mp4"))).toBe(false);

    const saved = JSON.parse(readFileSync(path.join(dir, "reel.json"), "utf8")) as ReelState;
    expect(saved.film?.archived?.map((a) => `${a.file}:${a.rule}`)).toEqual(expect.arrayContaining(["film-desktop.mp4:master-14d", "bed.mp3:bed-with-cut", "exports:reel-swept-phone.mp4:cut-3d-published"]));
    expect(saved.film?.archived?.find((a) => a.file === "exports:reel-swept-phone.mp4")?.foundMissing).toBe(true);
    expect(saved.film?.renders.desktop?.sha).toBe("d".repeat(64));

    const recipe = JSON.parse(readFileSync(path.join(dir, RECIPE_FILE), "utf8")) as ReelRecipe;
    expect(recipe.schema).toBe("gravitone.reel-recipe/1");
    expect(recipe.bed?.prompt?.style).toBe("lofi, 80 bpm");
    expect(recipe.pages.map((p) => p.file)).toEqual(["reel.html", "reel.js"]);
    expect(recipe.archived.length).toBe(saved.film?.archived?.length);
    expect(readFileSync(path.join(dir, RECIPE_DOC), "utf8")).toContain("Suno style: lofi, 80 bpm");

    // A second sweep finds nothing new to take and records nothing twice.
    const again = await archiveReel(slug, { now: new Date(T0 + 21 * DAY), publication: pub });
    expect(again.deleted).toEqual([]);
    expect(again.missing).toEqual([]);
    const after = JSON.parse(readFileSync(path.join(dir, "reel.json"), "utf8")) as ReelState;
    expect(after.film?.archived?.length).toBe(saved.film?.archived?.length);
  });
});
