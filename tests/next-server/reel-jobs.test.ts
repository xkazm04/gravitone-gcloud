// THE FOUR REEL JOBS (spark reel-studio WP2) end to end over a temp reel folder and a temp kernel, every store a temp
// directory set below before any lib/ module loads. The seat is a fake that fails the test if it is ever entered (a
// dry job's turns are the stand-ins); the GPU renderer, ffprobe and ffmpeg are counted fakes that write files; the
// film's stage machine and reducers are injected, so nothing here waits on lib/reel/film.ts. No seat, no GPU, no
// vendor, no network.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-reel-jobs-"));
  process.env["REELS_STORE_DIR"] = p.join(dir, "reels");
  process.env["SOUND_STORE_DIR"] = p.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = p.join(dir, "kernel.sqlite");
  process.env["SPEND_STORE"] = "memory";
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Result } from "@gt/domain/errors";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { driveReelJob, launchReelJob, reelJobsOf, type ReelJobKind } from "../../lib/producers/reel.ts";
import type { ReelEngines } from "../../lib/producers/reel/engines.ts";
import { producers } from "../../lib/producers/registry.ts";
import { withCopy, withFilmRender, type FilmStage } from "../../lib/reel/film.ts";
import { newReel } from "../../lib/reel/state.ts";
import { reelDir } from "../../lib/reel/store.ts";
import { FILM_SPEC, type FilmFace, type ReelState } from "../../lib/reel/types.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const OP = { kind: "operator", id: "op" } as const;
const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

let kernels: Kernel[] = [];
let worlds = 0;
afterEach(() => {
  for (const k of kernels) k.close();
  kernels = [];
});

function world(): { store: Store; location: string } {
  const dir = path.join(ROOT, `k-${++worlds}`);
  mkdirSync(dir, { recursive: true });
  const location = path.join(dir, "k.sqlite");
  const k = must(openKernel(location, { snapshotDir: dir }));
  kernels.push(k);
  return { store: k.store, location };
}

let n = 0;
function reel(): { slug: string; dir: string } {
  const slug = `reel-${++n}`;
  const dir = reelDir(slug);
  mkdirSync(dir, { recursive: true });
  const state = newReel(slug, { title: "Who ships the strait", hook: "Who carries the most through the strait?", path: "Five exporters trade the lead across forty years of tankers and wars." }, new Date().toISOString());
  writeFileSync(path.join(dir, "reel.json"), JSON.stringify(state));
  return { slug, dir };
}
const stateOf = (dir: string): ReelState => JSON.parse(readFileSync(path.join(dir, "reel.json"), "utf8")) as ReelState;

/** Counted fakes for everything outside the job; `stage` is what the injected stage machine answers. */
function fakes(stage: { now: FilmStage }) {
  const calls = { seat: 0, render: [] as FilmFace[], stills: 0, mux: 0, encode: 0, vmaf: 0, progressSeen: 0 };
  const sha = (f: string): string => createHash("sha256").update(readFileSync(f)).digest("hex");
  const e: ReelEngines = {
    seat: async () => {
      calls.seat++;
      throw new Error("a dry job entered the seat");
    },
    stageOf: () => stage.now,
    // WP1's reducers, real: the jobs write the state exactly as the studio reads it.
    withFilmRender,
    withCopy,
    renderFilm: async (o) => {
      calls.render.push(o.width === 1920 ? "desktop" : "phone");
      const total = Math.ceil(1800 / o.step);
      await o.onProgress?.(30, total);
      if (existsSync(path.join(o.filmDir, "progress.json"))) calls.progressSeen++;
      await o.onProgress?.(total, total);
      await mkdir(path.dirname(o.out), { recursive: true });
      await writeFile(o.out, `master ${o.page}`);
      return { renderer: "fake", gpu: true, timeline: 1800, frames: total, msPerFrame: 1, pageErrors: [] };
    },
    renderStills: async (o) => {
      calls.stills++;
      for (const s of o.shots) {
        await mkdir(path.dirname(s.out), { recursive: true });
        await writeFile(s.out, "png");
      }
      return { renderer: "fake", gpu: true, timeline: 1800, frames: o.shots.length, msPerFrame: 1, pageErrors: [] };
    },
    probe: async (file) => (file.endsWith(FILM_SPEC.phone.file) ? { seconds: 30, frames: 900 } : { seconds: 60, frames: 1800 }),
    sha256File: async (f) => sha(f),
    muxBed: async (o) => {
      calls.mux++;
      await writeFile(o.out, `mix ${o.face}`);
    },
    encodeToSize: async (o) => {
      calls.encode++;
      await writeFile(o.out, `copy of ${o.src}`);
      return 49_000_000;
    },
    measureVmaf: async () => {
      calls.vmaf++;
      return { mean: 93.7, min: 87 };
    },
    filmThumbs: async (o) => {
      await mkdir(o.dir, { recursive: true });
      const names = Array.from({ length: o.count }, (_, k) => `${o.prefix}-${String(k).padStart(2, "0")}.jpg`);
      for (const nm of names) await writeFile(path.join(o.dir, nm), "jpg");
      return names;
    },
  };
  return { e, calls };
}

async function launch(store: Store, kind: ReelJobKind, slug: string, stage: FilmStage, mode: "dry" | "live" = "dry") {
  const engines = { stageOf: () => stage };
  const first = must(await launchReelJob(kind, slug, { mode, actor: OP, dryOnly: true, store, engines }));
  if (first.kind !== "receipt") throw new Error(`no receipt: ${first.kind}`);
  return launchReelJob(kind, slug, { mode, actor: OP, dryOnly: true, store, engines, token: first.receipt.token });
}

async function launchAndDrive(w: { store: Store; location: string }, kind: ReelJobKind, slug: string, stage: { now: FilmStage }, e: ReelEngines): Promise<string> {
  const done = must(await launch(w.store, kind, slug, stage.now));
  if (done.kind !== "launched") throw new Error(`no launch: ${done.kind}`);
  must(await driveReelJob(w.store, w.location, done.jobId, { engines: e, dryOnly: true }));
  return done.jobId;
}

describe("the four reel jobs, dry, on a temp store", () => {
  it("are bound in the registry", () => {
    const keys = [...must(producers()).keys()];
    for (const k of ["reel-data@seat.text", "reel-author@seat.text", "reel-render@box.render", "reel-release@box.render"]) expect(keys).toContain(k);
  });

  it("walk a reel from its idea to both publish copies without entering the seat", async () => {
    const w = world();
    const { slug, dir } = reel();
    const stage = { now: "idea" as FilmStage };
    const { e, calls } = fakes(stage);

    const dataJob = await launchAndDrive(w, "reel-data", slug, stage, e);
    expect(dataJob).toBe(`job:reel-data:${slug}:1`);
    expect(existsSync(path.join(dir, "table.json"))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(dir, "continuity.json"), "utf8")).steps).toBe(72);
    expect(stateOf(dir).tableSha).toMatch(/^[0-9a-f]{64}$/);

    stage.now = "authoring";
    await launchAndDrive(w, "reel-author", slug, stage, e);
    const film = path.join(dir, "film");
    for (const f of ["reel.html", "reel-desktop.html", "film.js", "data/table.json"]) expect(existsSync(path.join(film, f))).toBe(true);
    expect(stateOf(dir).film?.frames).toBe(1800);
    expect(stateOf(dir).film?.authoredAt).toMatch(/^\d{4}-/);

    stage.now = "rendering";
    await launchAndDrive(w, "reel-render", slug, stage, e);
    const rendered = stateOf(dir).film;
    expect(Object.keys(rendered?.renders ?? {}).sort()).toEqual(["desktop", "phone"]);
    expect(rendered?.renders.phone?.frames).toBe(900);
    expect(rendered?.thumbs?.desktop).toHaveLength(12);
    expect(rendered?.thumbs?.poster).toBe("poster.jpg");
    expect(existsSync(path.join(film, "stills", "phone-07.png"))).toBe(true);
    expect(calls.progressSeen).toBe(2);
    expect(existsSync(path.join(film, "progress.json"))).toBe(false);

    const s = stateOf(dir);
    writeFileSync(path.join(film, "bed.mp3"), "bed");
    writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ ...s, film: { ...s.film, bed: { file: "bed.mp3", seconds: 62, sha: "b".repeat(64), attachedAt: "2026-11-18T00:00:00Z" } } }));
    stage.now = "sound";
    await launchAndDrive(w, "reel-release", slug, stage, e);
    const copies = stateOf(dir).film?.copies;
    expect(copies?.desktop?.vmaf).toEqual({ mean: 93.7, min: 87 });
    expect(copies?.phone?.bedSha).toBe("b".repeat(64));
    expect([calls.mux, calls.encode, calls.vmaf, calls.seat]).toEqual([2, 2, 2, 0]);

    const views = await reelJobsOf(slug, { store: w.store });
    expect(views.map((v) => [v.kind, v.state])).toEqual([
      ["reel-data", "done"],
      ["reel-author", "done"],
      ["reel-render", "done"],
      ["reel-release", "done"],
    ]);
  });

  it("answers a second launch with the open job, and refuses live under GRAVITONE_DRY_ONLY", async () => {
    const w = world();
    const { slug } = reel();
    const first = must(await launch(w.store, "reel-data", slug, "idea"));
    expect(first.kind).toBe("launched");
    const again = must(await launchReelJob("reel-data", slug, { mode: "dry", actor: OP, dryOnly: true, store: w.store, engines: { stageOf: () => "idea" } }));
    expect(again).toEqual({ kind: "existing", jobId: `job:reel-data:${slug}:1`, state: "queued" });

    const other = reel();
    const live = await launch(w.store, "reel-data", other.slug, "idea", "live");
    expect(live.ok).toBe(false);
    expect(live.ok ? "" : live.error.message).toContain("GRAVITONE_DRY_ONLY");
  });

  it("refuses a job the reel's stage does not serve, in one line", async () => {
    const w = world();
    const { slug } = reel();
    const r = await launchReelJob("reel-release", slug, { mode: "dry", actor: OP, dryOnly: true, store: w.store, engines: { stageOf: () => "sound" } });
    expect(r.ok ? "" : r.error.message).toBe("the film has no bed yet");
    const early = await launchReelJob("reel-render", slug, { mode: "dry", actor: OP, dryOnly: true, store: w.store, engines: { stageOf: () => "data" } });
    expect(early.ok ? "" : early.error.message).toBe("the film has no pages yet");
  });

  it("never draws again a face whose master is in the state", async () => {
    const w = world();
    const { slug, dir } = reel();
    const stage = { now: "rendering" as FilmStage };
    const { e, calls } = fakes(stage);
    const film = path.join(dir, "film");
    mkdirSync(film, { recursive: true });
    writeFileSync(path.join(film, FILM_SPEC.desktop.file), "old master");
    const s = stateOf(dir);
    const desktop = { file: FILM_SPEC.desktop.file, frames: 1800, seconds: 60, bytes: 10, sha: "d".repeat(64), renderedAt: "2026-11-18T00:00:00Z" };
    writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ ...s, film: { frames: 1800, renders: { desktop }, copies: {} } }));
    for (const f of [FILM_SPEC.desktop.mix, FILM_SPEC.phone.release]) writeFileSync(path.join(film, f), "made of the old picture");
    await launchAndDrive(w, "reel-render", slug, stage, e);
    expect(calls.render).toEqual(["phone"]);
    expect(existsSync(path.join(film, FILM_SPEC.desktop.mix)) || existsSync(path.join(film, FILM_SPEC.phone.release))).toBe(false);
    expect(stateOf(dir).film?.renders.desktop?.sha).toBe("d".repeat(64));
  });
});
