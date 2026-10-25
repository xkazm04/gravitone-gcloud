import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { ok } from "@gt/domain/errors";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPartIn, writePart } from "@gt/kernel/parts/driver";
import { gateFacts } from "@gt/kernel/parts/gates";
import { launchProject, planReceipt } from "@gt/kernel/records/launch";
import { planViewIn } from "@gt/kernel/records/read";
import { compose, setPart } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { inspectArchive } from "../../lib/studioArchive.ts";
import { ARCHIVE_KIND, MANIFEST_KIND, readArchive, rowLine, type Archive, type Row } from "../../lib/import/archive.ts";
import { commitImport } from "../../lib/import/commit.ts";
import { exportProjects } from "../../lib/import/export.ts";
import { kernelIdOf, planImport } from "../../lib/import/project.ts";
import { putProject } from "../../lib/projects.ts";
import { THEMES_STORE } from "../../lib/studioDb.ts";
import { clearV1, dataUrl, putRows, pngB64, putStep, seedV1, SHELF, v1Archive, type Seeded } from "./import-harness.ts";

// THE IMPORT, END TO END (Phase 4 wave D, L42): an archive v1 wrote (its own exportAccount over
// its own IndexedDB) -> the preview -> the confirm -> kernel Projects whose Plan opens with the
// recipe's parts in the states v1's work implies, whose records read through their doors with
// plates as blobs, and whose re-export v1 reads back - byte for byte on every step row nobody
// edited, in v1's shape on every row somebody did.

const dirs: string[] = [];
let open: Kernel[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
beforeEach(async () => {
  await clearV1();
});

// Measured 2026-10-25 on the 1000 x 100 x 20,000 archive below: 5.2 s with a scan per project and per
// asset, 1.4 s indexed; the bound sits between them.
const BOUND_MS = 3000;
const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");

function universe(): { store: Store; blobs: BlobStore } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-import-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  return { store: k.value.store, blobs: blobStore(path.join(dir, "blobs")) };
}

function read(bytes: Uint8Array): Archive {
  const a = readArchive(bytes);
  if (!a.ok) throw a.error;
  return a.value;
}

async function imported(seed: Seeded) {
  const u = universe();
  const archive = read(await v1Archive(seed.uid));
  const plan = u.store.read((r) => planImport(r, archive));
  if (!plan.ok) throw plan.error;
  const done = await commitImport({ ...u, actor: OP }, archive, plan.value.token);
  if (!done.ok) throw done.error;
  return { ...u, archive, plan: plan.value, done: done.value };
}

const plan = (store: Store, id: string) => {
  const v = store.read((r) => planViewIn(r, id, gateFacts(NOW)));
  if (!v.ok) throw v.error;
  return v.value;
};
const stateOf = (store: Store, id: string) => new Map(plan(store, id).parts.map((p) => [p.id.slice(id.length + 1), p.state]));

describe("preview, then confirm", () => {
  it("previews every project with its outcome, counts and losses, and writes nothing", async () => {
    const seed = await seedV1("uid-a");
    const u = universe();
    const archive = read(await v1Archive(seed.uid));
    const p = u.store.read((r) => planImport(r, archive));
    if (!p.ok) throw p.error;
    const film = p.value.projects.find((x) => x.preview.v1Id === seed.film.id)?.preview;
    expect(film).toMatchObject({ id: kernelIdOf(seed.film.id), recipe: "film/short-educational-video", outcome: "import", launched: true, done: ["research", "script", "frames", "score", "cut"], ratified: ["gate:frames"] });
    // research-scope, script-adopted, frames, frames-alts, research, score, cut held; script-mode carried.
    expect(film?.held).toBe(7);
    expect(film?.losses.map((l) => [l.entity, l.grade])).toEqual(expect.arrayContaining([["script-mode", "data-only"], ["sign-off research", "approximate"]]));
    // The theme is a Style the import lands (./import-shelf.test.ts), not a loss.
    expect(film?.losses.some((l) => l.entity === "theme")).toBe(false);
    // u1, u2 plates (each once though v1 stored them twice), the alternative, the theme proof.
    expect(film?.blobs).toBe(4);
    const album = p.value.projects.find((x) => x.preview.v1Id === seed.album.id)?.preview;
    expect(album).toMatchObject({ recipe: "album-video", launched: false, held: 0 });
    expect(album?.losses[0]).toMatchObject({ entity: "music-video-source", grade: "data-only" });
    const empty = p.value.projects.find((x) => x.preview.v1Id === seed.empty.id)?.preview;
    expect(empty).toMatchObject({ recipe: "film/teaser", launched: false, held: 0 });
    expect(u.store.read((r) => r.get("SELECT count(*) AS n FROM projects")?.["n"])).toEqual(ok(0));
  });

  it("refuses a confirm on a stale preview with the fresh one, nothing written", async () => {
    const seed = await seedV1("uid-a");
    const u = universe();
    const archive = read(await v1Archive(seed.uid));
    const r = await commitImport({ ...u, actor: OP }, archive, "not-the-token");
    expect(r.ok && r.value.kind).toBe("stale");
    expect(u.store.read((x) => x.get("SELECT count(*) AS n FROM projects")?.["n"])).toEqual(ok(0));
  });

  it("imports each project once; a re-import skips every one, reported", async () => {
    const seed = await seedV1("uid-a");
    const first = await imported(seed);
    expect(first.done.kind === "done" && first.done.outcomes.map((o) => o.outcome)).toEqual(["imported", "imported", "imported", "imported"]);
    const again = first.store.read((r) => planImport(r, first.archive));
    if (!again.ok) throw again.error;
    const second = await commitImport({ store: first.store, blobs: first.blobs, actor: OP }, first.archive, again.value.token);
    const outcomes = second.ok && second.value.kind === "done" ? second.value.outcomes.map((o) => [o.outcome, o.reason]).sort() : [];
    expect(outcomes).toEqual([seed.film, seed.ad, seed.album, seed.empty].map((p) => ["skipped", `already imported as ${kernelIdOf(p.id)}`]).sort());
  });
});

describe("staging an archive at the line cap", () => {
  it("indexes steps, themes, assets and uploads once, not once per project and per asset", () => {
    const PROJECTS = 1000;
    const STEPS = 100;
    const ASSETS = 20_000;
    const projects: Row[] = Array.from({ length: PROJECTS }, (_, i) => ({ id: `p${i}`, uid: "u", title: `Film ${i}`, template: "short-educational-video", targetS: 90, cover: `a${i}`, themeId: "th-none", signedOff: {} }));
    const steps: Row[] = projects.flatMap((p) => Array.from({ length: STEPS }, (_, j) => ({ id: `${String(p["id"])}:k${j}`, projectId: p["id"], phase: "script-mode", data: { mode: "expert" } })));
    const assets: Row[] = Array.from({ length: ASSETS }, (_, i) => ({ id: `a${i}`, uid: "u", path: ["refs"], name: `a${i}`, src: `upload:up${i}`, kind: "image", createdAt: 1 }));
    const uploads: Row[] = Array.from({ length: ASSETS }, (_, i) => ({ id: `up${i}`, blob: { b64: pngB64(i % 200), type: "image/png" }, mime: "image/png", bytes: 11 }));
    const archive: Archive = {
      header: { kind: ARCHIVE_KIND, format: 1, dbVersion: 5, exportedAt: 1, from: "test", scope: "account" },
      manifest: { kind: MANIFEST_KIND, counts: { projects: PROJECTS, steps: steps.length, themes: 0, assets: ASSETS, uploads: ASSETS }, sha256: { projects: "", steps: "", themes: "", assets: "", uploads: "" } },
      rows: { projects, steps, themes: [], assets, uploads },
      bytes: 0,
      digest: "scale",
    };
    // A scan is a call to the list's own search: counted per section, so each surface is held alone.
    const scans: string[] = [];
    for (const [name, rows] of Object.entries(archive.rows)) {
      for (const m of ["filter", "find", "some", "findIndex"] as const) {
        const own = rows[m].bind(rows) as (...a: unknown[]) => unknown;
        Object.defineProperty(rows, m, { value: (...a: unknown[]) => (scans.push(`${name}.${m}`), own(...a)) });
      }
    }
    const u = universe();
    const t0 = performance.now();
    const p = u.store.read((r) => planImport(r, archive));
    const ms = performance.now() - t0;
    if (!p.ok) throw p.error;
    // The same plan as the scanning version staged: the lookups return the same rows.
    expect(p.value.token).toBe("c677326e50374b579c418456574226af9db13d23279dfee5eb25ab41e4d38d70");
    expect(p.value.projects).toHaveLength(PROJECTS);
    expect(p.value.items).toHaveLength(ASSETS);
    expect(p.value.projects.every((x) => x.preview.outcome === "import")).toBe(true);
    // The rows each project names, in archive order: the cover asset, and its upload through it.
    expect(p.value.projects[7]?.record.assets.map((a) => (a as Row)["id"])).toEqual(["a7"]);
    expect(p.value.projects[7]?.record.uploads.map((x) => (x as Row)["id"])).toEqual(["up7"]);
    expect([...new Set(scans)], "no section is searched by scanning it").toEqual([]);
    expect(ms, "planImport over a capped archive is bounded").toBeLessThan(BOUND_MS);
  }, 30_000);
});

describe("what the import will not take, and says so", () => {
  it("carries a newer build's record as data only, never writes it, and refuses an unknown template", async () => {
    const seed = await seedV1("uid-a");
    await putStep(seed.film.id, "cut", { v: 9, offsets: {} });
    await putProject({ ...seed.empty, template: "hologram" as never });
    const { store, done, plan: p } = await imported(seed);
    const film = p.projects.find((x) => x.preview.v1Id === seed.film.id)?.preview;
    expect(film?.losses).toEqual(expect.arrayContaining([{ entity: "cut", grade: "data-only", reason: "cut was written as v9 by a newer build; this build reads up to v1" }]));
    expect(film?.done).not.toContain("cut");
    const id = kernelIdOf(seed.film.id);
    expect(store.read((r) => r.get("SELECT 1 AS x FROM part_records WHERE project_id = ? AND key = 'cut'", id))).toEqual(ok(undefined));
    const outcome = done.kind === "done" ? done.outcomes.find((o) => o.v1Id === seed.empty.id) : undefined;
    expect(outcome).toMatchObject({ outcome: "refused", reason: "template hologram is not in the catalogue" });
    expect(store.read((r) => r.get("SELECT 1 AS x FROM projects WHERE id = ?", kernelIdOf(seed.empty.id)))).toEqual(ok(undefined));
  });

  it("grades a v1 frames row its walk cannot read as data only, and stages every other project", async () => {
    const seed = await seedV1("uid-a");
    await putStep(seed.film.id, "frames", { frames: "x", renderId: "r" });
    const u = universe();
    const archive = read(await v1Archive(seed.uid));
    const p = u.store.read((r) => planImport(r, archive));
    if (!p.ok) throw p.error;
    const film = p.value.projects.find((x) => x.preview.v1Id === seed.film.id)?.preview;
    expect(film?.outcome).toBe("import");
    expect(film?.losses).toEqual(expect.arrayContaining([{ entity: "frames", grade: "data-only", reason: "frames v1 could not be read: frames is not a list" }]));
    // The other six records are still held (frames-alts keeps the frames part done).
    expect(film?.held).toBe(6);
    expect(p.value.projects.map((x) => x.preview.outcome)).toEqual(["import", "import", "import", "import"]);
  });

  it("previews a project exactly as the commit lands it: a target the creation door refuses is refused at the preview", async () => {
    const seed = await seedV1("uid-a");
    await putProject({ ...seed.film, targetS: 1e300 });
    const u = universe();
    const archive = read(await v1Archive(seed.uid));
    const p = u.store.read((r) => planImport(r, archive));
    if (!p.ok) throw p.error;
    const film = p.value.projects.find((x) => x.preview.v1Id === seed.film.id)?.preview;
    const done = await commitImport({ ...u, actor: OP }, archive, p.value.token);
    if (!done.ok) throw done.error;
    const landed = done.value.kind === "done" ? done.value.outcomes.find((o) => o.v1Id === seed.film.id) : undefined;
    // The preview's outcome is the commit's: both import, or both refuse with the door's sentence.
    expect({ preview: film?.outcome, landed: landed?.outcome }).toEqual({ preview: "refuse", landed: "refused" });
    expect(film?.reason).toBeDefined();
    expect(landed?.reason).toBe(film?.reason);
  });

  it("reads a v1 instant no Date can hold as unreadable: a reported loss, never a failed preview or a refused commit", async () => {
    const seed = await seedV1("uid-a");
    // 1e20 ms is JSON v1 can write and past what a Date holds (8.64e15): toISOString throws on it.
    await putProject({ ...seed.film, createdAt: 1e20, signedOff: { research: seed.signedAt, frames: 1e20 } });
    await putRows(THEMES_STORE, [{ id: SHELF.untitled, uid: seed.uid, name: "Untitled style", origin: "scratch", block: {}, elements: [], proofs: [], createdAt: 1e20, updatedAt: 1e20 }]);
    const { store, plan: p, done } = await imported(seed);
    const film = p.projects.find((x) => x.preview.v1Id === seed.film.id)?.preview;
    expect(film?.outcome).toBe("import");
    expect(film?.ratified).toEqual([]);
    expect(film?.losses).toEqual(expect.arrayContaining([{ entity: "sign-off frames", grade: "dropped", reason: "v1's sign-off instant 100000000000000000000 is unreadable" }]));
    expect(p.themes.find((t) => t.preview.v1Id === SHELF.untitled)?.preview.name).toBe("Brief style");
    // The preview's promise is the commit's: imported, its event at the import's own clock.
    expect(done.kind === "done" && done.outcomes.find((o) => o.v1Id === seed.film.id)?.outcome).toBe("imported");
    const ev = store.read((r) => r.get("SELECT at_src FROM events WHERE type = 'project.imported' AND subject_id = ?", kernelIdOf(seed.film.id)));
    expect(ev).toEqual(ok({ at_src: null }));
  });
});

describe("the Plan the import opens", () => {
  it("draws the recipe's parts in the states v1's work implies", async () => {
    const seed = await seedV1("uid-a");
    const { store } = await imported(seed);
    const id = kernelIdOf(seed.film.id);
    const v = plan(store, id);
    // Launched by its v1 work, yet a part still waits to be bought: the Plan offers a launch (L43).
    expect(v.project).toMatchObject({ title: "Glass harbor", recipe: "film/short-educational-video", launched: false, launchedAt: expect.any(String), runtimeS: 90, styleId: `v1-theme:${seed.theme.id}` });
    const s = stateOf(store, id);
    expect(Object.fromEntries(s)).toEqual({
      research: "ratified",
      script: "ratified",
      frames: "ratified",
      "gate:frames": "ratified", // v1's sign-off, as a committed packet
      motion: "draft", // no v1 work, no job: the import queues nothing, and it reads unlaunched (L43)
      score: "ratified",
      "gate:score": "awaiting_gate", // done, never signed off
      cut: "ratified",
      "gate:cut": "awaiting_gate",
      slot: "queued",
    });
    // The ratifying decision says where it came from.
    const note = store.read((r) => r.get("SELECT note FROM decisions WHERE packet_id = ?", `pkt:step:${id}/gate:frames`)?.["note"]);
    expect(note).toEqual(ok(`imported sign-off, v1 at ${new Date(seed.signedAt).toISOString()}`));
    // An empty v1 project is a draft that launches through a receipt like any composed one.
    expect(plan(store, kernelIdOf(seed.empty.id)).project.launched).toBe(false);
    // The imported done jobs spent nothing and claimed nothing.
    const jobs = store.read((r) => r.all("SELECT state, json_extract(record, '$.spend.usd') AS usd FROM jobs WHERE json_extract(record, '$.correlation.projectId') = ?", id));
    expect(jobs.ok && jobs.value.every((j) => j["state"] === "done" && j["usd"] === 0)).toBe(true);
  });

  it("launches only the parts v1 never worked, through a receipt, released behind its ratified upstream (L43)", async () => {
    const seed = await seedV1("uid-a");
    const { store } = await imported(seed);
    const id = kernelIdOf(seed.film.id);
    const ctx = { ...gateFacts(NOW), dryOnly: true };
    const rec = planReceipt(store, id, { mode: "dry" }, ctx);
    if (!rec.ok) throw rec.error;
    expect(rec.value.lines.map((l) => l.key)).toEqual([`${id}/motion`]);
    const launched = launchProject(store, { id, baseRev: plan(store, id).project.rev, token: rec.value.token, mode: "dry" }, OP, ctx);
    if (!launched.ok) throw launched.error;
    expect(launched.value.jobIds).toEqual([`job:part:${id}/motion`]);
    // motion waits on gate:frames, which the import ratified: no settle will come, so it is queued now.
    expect(store.read((r) => r.get("SELECT state FROM jobs WHERE id = ?", `job:part:${id}/motion`)?.["state"])).toEqual(ok("queued"));
    expect(plan(store, id).project.launched).toBe(true);
    expect(stateOf(store, id).get("research")).toBe("ratified");
    // Nothing left to launch: a second receipt is refused, and a finished part's model is not changed.
    expect(planReceipt(store, id, { mode: "dry" }, ctx).ok).toBe(false);
    const research = plan(store, id).parts.find((p) => p.id === `${id}/research`);
    const other = research !== undefined && "options" in research ? research.options.find((o) => o.key !== research.chosen) : undefined;
    if (other === undefined) throw new Error("research offers one option; the refusal below would not be about launch");
    const moved = setPart(store, { id, baseRev: plan(store, id).project.rev, partId: `${id}/research`, patch: { option: other.key } }, OP);
    expect(moved.ok ? "" : moved.error.code).toBe("refused");
  });

  it("lands every record through its door, plates as blobs the store serves", async () => {
    const seed = await seedV1("uid-a");
    const { store, blobs } = await imported(seed);
    const id = kernelIdOf(seed.film.id);
    const snap = store.read((r) => readPartIn(r, { projectId: id, partId: `${id}/frames` }));
    if (!snap.ok) throw snap.error;
    expect(snap.value.refused).toEqual([]);
    const frames = snap.value.records.get("frames");
    expect(frames?.["v"]).toBe(3);
    expect("frames" in (frames ?? {})).toBe(false);
    const units = frames?.["units"] as { plate: { blob?: { sha256: string; bytes: number; mime: string }; src?: string } }[];
    expect(units.every((x) => x.plate.src === undefined && x.plate.blob !== undefined)).toBe(true);
    const bytes = await blobs.read(units[0]!.plate.blob!);
    expect(bytes.ok && `data:image/png;base64,${Buffer.from(bytes.value).toString("base64")}`).toBe(dataUrl(1));
    expect([...snap.value.records.keys()].sort()).toEqual(["cut", "frames", "frames-alts", "research", "research-scope", "score", "script-adopted"]);
    const ad = kernelIdOf(seed.ad.id);
    const adSnap = store.read((r) => readPartIn(r, { projectId: ad, partId: `${ad}/frames` }));
    expect(adSnap.ok && adSnap.value.records.get("ads-shots")?.["scenarioId"]).toBe("sc1");
  });
});

describe("the re-export", () => {
  it("writes every step row nobody edited back byte for byte, and v1 reads the archive", async () => {
    const seed = await seedV1("uid-a");
    const { store, blobs, archive } = await imported(seed);
    const out = await exportProjects(store, blobs, { ids: [kernelIdOf(seed.film.id), kernelIdOf(seed.ad.id), kernelIdOf(seed.album.id)], uid: seed.uid, now: NOW });
    if (!out.ok) throw out.error;
    const back = read(out.value);
    const lines = (a: Archive, s: "steps" | "projects" | "themes" | "uploads") => new Map(a.rows[s].map((r) => [String(r["id"]), rowLine(s, r)]));
    const was = lines(archive, "steps");
    const now = lines(back, "steps");
    expect([...now.keys()].sort()).toEqual([...was.keys()].filter((k) => !k.startsWith(seed.empty.id)).sort());
    for (const [id, line] of now) expect(line, id).toBe(was.get(id));
    for (const s of ["projects", "themes", "uploads"] as const) for (const [id, line] of lines(back, s)) expect(line, id).toBe(lines(archive, s).get(id));
    // v1's own reader takes it (its digests, its closure rules).
    const v1 = await inspectArchive(new Blob([Buffer.from(out.value)]));
    expect(v1.manifest.counts).toMatchObject({ projects: 3, themes: 1, uploads: 1 });
  });

  it("writes an edited record in v1's shape: plates inlined, the frames shadow rebuilt, v2", async () => {
    const seed = await seedV1("uid-a");
    const { store, blobs, archive } = await imported(seed);
    const id = kernelIdOf(seed.film.id);
    const snap = store.read((r) => readPartIn(r, { projectId: id, partId: `${id}/frames` }));
    if (!snap.ok) throw snap.error;
    const frames = snap.value.records.get("frames") ?? {};
    const w = writePart(store, { projectId: id, partId: `${id}/frames`, baseRev: snap.value.rev, act: "op", op: { turn: "edited" }, label: "turn", by: OP, next: () => ok({ frames: { ...frames, turn: "edited" } }) });
    expect(w.ok).toBe(true);
    const out = await exportProjects(store, blobs, { ids: [id], uid: seed.uid, now: NOW });
    if (!out.ok) throw out.error;
    const row = read(out.value).rows.steps.find((r) => r["id"] === `${seed.film.id}:frames`);
    const data = row?.["data"] as { v: number; turn: string; units: { plate: { src: string; blob?: unknown } }[]; frames: unknown[] };
    expect(data).toMatchObject({ v: 2, turn: "edited" });
    expect(data.units.map((x) => x.plate.src)).toEqual([dataUrl(1), dataUrl(2)]);
    expect(data.units.every((x) => x.plate.blob === undefined)).toBe(true);
    expect(data.frames).toHaveLength(2);
    // The rest still byte for byte.
    const cut = (a: Archive) => a.rows.steps.find((r) => r["id"] === `${seed.film.id}:cut`);
    expect(rowLine("steps", cut(read(out.value)) ?? {})).toBe(rowLine("steps", cut(archive) ?? {}));
  });

  it("writes a project the kernel composed itself in v1's project shape when its recipe is a v1 template's film, and refuses an album by name", async () => {
    const { store, blobs } = universe();
    expect(compose(store, { recipe: "film/trailer", title: "Tidal tariffs" }, OP, { id: "flm" }).ok).toBe(true);
    expect(compose(store, { recipe: "album-video", title: "Night drive" }, OP, { id: "alb" }).ok).toBe(true);
    const out = await exportProjects(store, blobs, { ids: ["flm"], uid: "uid-k", now: NOW });
    if (!out.ok) throw out.error;
    const back = read(out.value);
    expect(back.header).toMatchObject({ from: "uid-k", scope: "project", projectIds: ["flm"], exportedAt: NOW });
    expect(back.rows.projects).toEqual([expect.objectContaining({ id: "flm", uid: "uid-k", title: "Tidal tariffs", template: "trailer", targetS: expect.any(Number) })]);
    const v1 = await inspectArchive(new Blob([Buffer.from(out.value)]));
    expect(v1.manifest.counts).toMatchObject({ projects: 1 });
    const album = await exportProjects(store, blobs, { ids: ["flm", "alb"], uid: "uid-k", now: NOW });
    expect(album.ok ? null : [album.error.code, album.error.message]).toEqual(["refused", "a album-video project has no v1 shape; only a film of a v1 template exports"]);
  });
});
