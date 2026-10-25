// A NIGHT'S GAME ASSETS (spark game-3d-assets WP4) - `pipeline/scout.mts asset` end to end on a
// dry night, every store a temp directory set below before any lib/ module loads: the brief's door,
// the night's asset cap, the deadline, the scout-asset job (concepts drawn as dry stand-ins, the
// input gate run on them for real, the mesh asset written, the mesh job QUEUED and never driven by
// the act), then the worker's half driven here in-process - mesh, then the finish its settle
// queued - to finished variants linked to the night. The gate reads the concepts through a decoder
// that inflates this repo's own PNGs; the production decoder (ffmpeg) is exercised once when the
// box has it. No vendor, no ComfyUI, no Blender: a dry job calls none of them.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-asset-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  // POF's root (spark scout-vision S4): the act reads <root>/asset-needs/<project>.json; written below, never ../pof.
  process.env["EXPORT_ROOT_POF"] = path.join(dir, "pof");
  return dir;
});

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { ok } from "@gt/domain/errors";
import { closeProcessKernel } from "@gt/kernel/process";
import { openKernel } from "@gt/kernel/kernel";
import { FINISH, MESH } from "@gt/producers/mesh/define";

import { runCli } from "../../pipeline/scout.mts";
import { inputGate, INPUT_SIZE, type Decode, type Pixels } from "../../lib/foundry/mesh/inputGate.ts";
import { readAsset } from "../../lib/foundry/mesh/store.ts";
import { assetIdFor, conceptsFor, parseBrief, standConcept } from "../../lib/foundry/scout/concept.ts";
import { createNight, readNight } from "../../lib/foundry/scout/store.ts";
import type { Asset3dCandidate } from "../../lib/foundry/scout/types.ts";
import { finishProducer } from "../../lib/producers/finish.ts";
import { driveStage, meshProducer, stageJobs } from "../../lib/producers/mesh.ts";
import { scoutAssetProducer } from "../../lib/producers/scoutAsset.ts";
import { scoutSceneProducer } from "../../lib/producers/scoutScene.ts";
import { assetUse } from "../../lib/decision/v1/sources/scoutPlan.ts";

const ENV = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LOC = path.join(ROOT, "kernel.sqlite");

afterEach(() => closeProcessKernel());
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

/** This repo's PNGs (filter 0, RGB) inflated and sampled to the gate's square - what ffmpeg would hand it. */
function decodeOurPng(bytes: Buffer): Pixels {
  let at = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (at < bytes.length) {
    const len = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") [w, h] = [body.readUInt32BE(0), body.readUInt32BE(4)];
    if (type === "IDAT") idat.push(body);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(INPUT_SIZE * INPUT_SIZE * 4);
  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const sx = Math.floor((x * w) / INPUT_SIZE);
      const sy = Math.floor((y * h) / INPUT_SIZE);
      const o = sy * (1 + w * 3) + 1 + sx * 3;
      rgba.set([raw[o] ?? 0, raw[o + 1] ?? 0, raw[o + 2] ?? 0, 255], (y * INPUT_SIZE + x) * 4);
    }
  }
  return { width: INPUT_SIZE, height: INPUT_SIZE, rgba };
}

/** A busy picture: what a concept drawn into a scene would be. */
const BUSY: Pixels = { width: INPUT_SIZE, height: INPUT_SIZE, rgba: new Uint8Array(INPUT_SIZE * INPUT_SIZE * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7919) % 251)) };

const fs = process.getBuiltinModule("node:fs");
const ours: Decode = async (file) => ({ ok: true, value: decodeOurPng(fs.readFileSync(file)) });
/** The canonical concepts read as drawn; every `concept-2` (a character's T2 design) read as busy. */
const t2Busy: Decode = async (file) => (path.basename(file).startsWith("concept-2") ? { ok: true, value: BUSY } : ours(file));
const allBusy: Decode = async () => ({ ok: true, value: BUSY });

async function cli(argv: string[], decode: Decode = ours): Promise<{ code: number; out: string; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: ENV, out: (s) => out.push(s), err: (s) => err.push(s), ports: { asset: { decode } } });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, out: out.join("\n"), err: err.join("\n"), doc };
}

function brief(name: string, body: unknown): string {
  const p = path.join(ROOT, `${name}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

// Every brief states what it is for and the project it serves (operator, 2026-10-23: "we cannot create assets without purpose").
// A new kind of project answers to no game's needs file; a brief for an existing game names its need (spark scout-vision S4).
const FOR = { use: "the starting party of a co-op dungeon crawler", serves: { newProject: "a co-op dungeon crawler" } };
const PIN = { class: "prop", subject: "amber survey pin with a paper tag", use: "a pin on the light table", serves: { project: "bp" }, need: "need-amber-pins-with-tags" };

/** bp's needs (pipeline/fixtures/asset-needs-bp.json) under the test's POF root, generated now so they are fresh. */
function bpNeeds(generatedAt = new Date().toISOString()): void {
  const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "..", "pipeline", "fixtures", "asset-needs-bp.json"), "utf8")) as Record<string, unknown>;
  mkdirSync(path.join(ROOT, "pof", "asset-needs"), { recursive: true });
  writeFileSync(path.join(ROOT, "pof", "asset-needs", "bp.json"), JSON.stringify({ ...fixture, generatedAt }));
}
const HERO = { class: "character", subject: "hooded archer, leather jerkin, quiver", style: "flat leather browns", ...FOR };
const AXE = { class: "weapon", kind: "axe", subject: "bearded battle axe, iron head, wrapped haft", ...FOR };
const CRATE = { class: "prop", subject: "supply crate, banded planks", ...FOR };

const candidateOf = async (night: string, cid: string): Promise<Asset3dCandidate> => {
  const c = (await readNight(night)).candidates.find((x) => x.id === cid);
  if (c?.kind !== "asset3d") throw new Error(`${cid} is not an asset3d candidate`);
  return c;
};

describe("the brief and its concepts", () => {
  it("a brief becomes the class's budget, a character is rigged, and T2 asks for a second, game-camera concept", () => {
    const b = parseBrief(HERO);
    expect(b.ok && b.value.brief).toEqual({ class: "character", subject: "hooded archer, leather jerkin, quiver", style: "flat leather browns", budgetTris: 40_000, rig: "ue5-mannequin" });
    if (!b.ok) return;
    const asks = conceptsFor(b.value.brief, ["T1", "T2"]);
    expect(asks.map((a) => a.design)).toEqual(["canonical", "game-camera"]);
    expect(asks[0]?.prompt).toMatch(/A-pose facing the camera, orthographic front view.*plain flat uniform light gray background.*a single character/);
    expect(asks[1]?.prompt).toMatch(/thick simple solid shapes with no thin parts.*flat strong colour blocks/);
    expect(conceptsFor(b.value.brief, ["T1"]).length).toBe(1);
    const axe = parseBrief(AXE);
    if (!axe.ok) throw axe.error;
    expect(conceptsFor(axe.value.brief, ["T1", "M1"])[0]?.prompt).toMatch(/concept: axe, bearded battle axe.*Strict flat orthographic side profile.*exactly one blade or head on one straight shaft/);
    expect(parseBrief({ ...CRATE, colour: "red" }).ok).toBe(false);
    expect(parseBrief({ class: "vehicle", subject: "cart", ...FOR }).ok).toBe(false);
    expect(assetIdFor("2026-10-22-2", "c-03", "Hooded Archer, leather!")).toBe("2026-10-22-2-c-03-hooded-archer-leather");
  });

  it("a brief states what it is for and the project it serves - an existing game, or a new kind of project", () => {
    const why = (raw: unknown): string => {
      const r = parseBrief(raw);
      return r.ok ? "ok" : r.error.message;
    };
    const { use: _u, ...noUse } = CRATE;
    expect(why(noUse)).toMatch(/^asset brief: use: /);
    const { serves: _s, ...noServes } = CRATE;
    expect(why(noServes)).toMatch(/^asset brief: serves: /);
    expect(why({ ...CRATE, serves: { project: "skyrim" } })).toMatch(/^asset brief: serves: /);
    const fresh = parseBrief({ ...CRATE, serves: { newProject: "a cozy farming sim" } });
    expect(fresh.ok && fresh.value.serves).toEqual({ newProject: "a cozy farming sim" });
    expect(parseBrief(CRATE).ok && (parseBrief(CRATE) as { value: { serves: unknown; use: string } }).value).toMatchObject({ serves: { newProject: "a co-op dungeon crawler" }, use: "the starting party of a co-op dungeon crawler" });
  });

  it("the 3D row states the purpose: the project first, then what it is for there", () => {
    expect(assetUse({ use: "a pin on the light table", serves: { project: "bp" }, need: "need-amber-pins-with-tags" })).toBe("for bp · need need-amber-pins-with-tags · a pin on the light table");
    // An old night's brief for the retired mage-arena still reads (spark scout-vision S4).
    expect(assetUse({ use: "the forge set dressing", serves: { project: "mage-arena" } })).toBe("for mage-arena · the forge set dressing");
    expect(assetUse({ use: "a hero roster", serves: { newProject: "a cozy farming sim" } })).toBe("new project: a cozy farming sim · a hero roster");
    expect(assetUse({ use: "an older brief's use" })).toBe("an older brief's use");
    expect(assetUse({})).toBeUndefined();
  });

  it("every dry stand-in concept passes the input gate it stands in front of", async () => {
    for (const cls of ["character", "weapon", "prop"] as const) {
      for (const design of ["canonical", "game-camera"] as const) {
        const f = path.join(ROOT, `stand-${cls}-${design}.png`);
        writeFileSync(f, standConcept(cls, design));
        const g = await inputGate(f, ours);
        expect(g.verdict, `${cls} ${design}: ${g.fails.join("; ")}`).toBe("pass");
      }
    }
  });

  let ffmpeg = true;
  try {
    execFileSync(process.env["FFMPEG"] ?? "ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    ffmpeg = false;
  }
  it.skipIf(!ffmpeg)("...and passes it through ffmpeg, the production decoder", async () => {
    for (const cls of ["character", "weapon", "prop"] as const) {
      const f = path.join(ROOT, `ff-${cls}.png`);
      writeFileSync(f, standConcept(cls, "canonical"));
      expect((await inputGate(f)).verdict).toBe("pass");
    }
  });
});

describe("a dry night briefs three assets, refuses a fourth, and the worker finishes them", () => {
  let night = "";

  it("open records the asset cap; three briefs each draw concepts, write a mesh asset and queue its mesh job", async () => {
    const r = await cli(["open", "--json"]);
    expect(r.code, r.err).toBe(0);
    night = String(r.doc["night"]);
    expect(r.doc["assetCap"]).toBe(3);
    for (const [name, body] of [["hero", HERO], ["axe", AXE], ["crate", CRATE]] as const) {
      const a = await cli(["asset", night, "--brief", brief(name, body), "--json"]);
      expect(a.code, a.err).toBe(0);
      const c = a.doc["candidate"] as Asset3dCandidate;
      expect(c).toMatchObject({ kind: "asset3d", status: "rendered", sourceIds: [] });
      expect(c.assetId).toBe(assetIdFor(night, c.id, body.subject));
    }
    const n = await readNight(night);
    const assets = n.candidates.filter((c): c is Asset3dCandidate => c.kind === "asset3d");
    expect(assets.map((c) => c.concepts.length)).toEqual([2, 1, 1]);
    expect(assets[0]?.concepts).toEqual(["assets/c-01/concept-1.png", "assets/c-01/concept-2.png"]);
    for (const c of assets) {
      expect(n.jobs).toContain(`job:scout-asset:${night}:${c.id}`);
      expect(n.jobs).toContain(`job:run:mesh:${c.assetId}`);
    }
  });

  it("a fourth brief is refused by the cap, before a candidate or a job exists", async () => {
    const before = (await readNight(night)).candidates.length;
    const r = await cli(["asset", night, "--brief", brief("fourth", { class: "prop", subject: "iron lantern", ...FOR })]);
    expect(r.code).toBe(1);
    expect(r.err).toBe(`night ${night} has briefed 3 of its 3 game assets; "iron lantern" was not launched`);
    expect((await readNight(night)).candidates.length).toBe(before);
  });

  it("the act left every mesh job QUEUED for the worker; driving it then the finish it queues finishes every variant, linked to the night", async () => {
    const k = openKernel(LOC);
    if (!k.ok) throw k.error;
    try {
      const store = k.value.store;
      const n = await readNight(night);
      for (const c of n.candidates.filter((x): x is Asset3dCandidate => x.kind === "asset3d")) {
        const id = c.assetId ?? "";
        const before = await readAsset(id);
        expect(before).toMatchObject({ night, dry: true, rights: "publishable", brief: c.brief });
        expect(before.variants.every((v) => v.status === "pending")).toBe(true);
        const mesh = stageJobs(store, MESH, { assetId: id });
        expect(mesh.map((j) => j.state)).toEqual(["queued"]);
        expect(mesh[0]?.mode.kind).toBe("dry");
        const m = await driveStage(store, LOC, mesh[0]?.id ?? "", meshProducer({ store: () => ok(store) }), { dryOnly: true });
        expect(m.ok && m.value.outcome).toBe("done");
        const fin = stageJobs(store, FINISH, { assetId: id });
        expect(fin.map((j) => j.state)).toEqual(["queued"]);
        const f = await driveStage(store, LOC, fin[0]?.id ?? "", finishProducer({ store: () => ok(store) }), { dryOnly: true });
        expect(f.ok && f.value.outcome).toBe("done");
        const after = await readAsset(id);
        expect(after.variants.map((v) => [v.id, v.status])).toEqual(before.variants.map((v) => [v.id, "finished"]));
        for (const v of after.variants) expect(v.gates[0]).toMatchObject({ name: "input", verdict: "pass" });
      }
      const hero = await readAsset(n.candidates[0]?.kind === "asset3d" ? (n.candidates[0].assetId ?? "") : "");
      expect(hero.variants.map((v) => [v.id, v.technique, v.concept])).toEqual([
        ["t1", "T1", undefined],
        ["t2", "T2", "concept-game-camera.png"],
      ]);
      expect(hero.variants.every((v) => v.files.rigged !== undefined)).toBe(true);
      expect(readdirSync(path.join(ROOT, "mesh", hero.id)).filter((f) => f.startsWith("concept")).sort()).toEqual(["concept-game-camera.png", "concept.png"]);
    } finally {
      k.value.close();
    }
  }, 60_000);
});

describe("refusals", () => {
  it("a concept the input gate refuses launches nothing: no asset, no mesh job, and the cap keeps its place", async () => {
    const r0 = await cli(["open", "--assets", "1", "--json"]);
    const night = String(r0.doc["night"]);
    const r = await cli(["asset", night, "--brief", brief("crate-busy", CRATE), "--json"], allBusy);
    expect(r.code).toBe(1);
    const c = await candidateOf(night, "c-01");
    expect(c.status).toBe("failed");
    expect(c.assetId).toBeUndefined();
    expect(c.error).toMatch(/^no mesh launched: t1 - the input gate read concept-1 as fail: busy-background/);
    expect(existsSync(path.join(ROOT, "mesh", assetIdFor(night, "c-01", CRATE.subject)))).toBe(false);
    expect((await readNight(night)).jobs).toEqual([`job:scout-asset:${night}:c-01`]);
    // Nothing reached the GPU, so the night's one place is still free.
    const again = await cli(["asset", night, "--brief", brief("crate-ok", CRATE), "--json"]);
    expect(again.code, again.err).toBe(0);
  });

  it("a refused T2 concept refuses only T2: T1 goes to the mesh, T2 is written failed with the gate's codes", async () => {
    const r0 = await cli(["open", "--json"]);
    const night = String(r0.doc["night"]);
    const r = await cli(["asset", night, "--brief", brief("hero-t2", HERO), "--json"], t2Busy);
    expect(r.code, r.err).toBe(0);
    const a = await readAsset((await candidateOf(night, "c-01")).assetId ?? "");
    expect(a.variants.map((v) => [v.id, v.status])).toEqual([
      ["t1", "pending"],
      ["t2", "failed"],
    ]);
    expect(a.variants[1]?.error).toMatch(/^the input gate read concept-2 as fail: busy-background/);
  });

  it("past its deadline the night is closed and nothing is launched", async () => {
    const n = await createNight({ dry: true, day: "2026-10-01", deadline: "2026-10-01T06:00:00.000Z" });
    const r = await cli(["asset", n.id, "--brief", brief("late", CRATE)]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/passed its deadline/);
    const after = await readNight(n.id);
    expect(after).toMatchObject({ state: "closed", stop: "deadline", candidates: [] });
  });

  it("a brief the door refuses is a usage of the act, nothing written", async () => {
    const r0 = await cli(["open", "--json"]);
    const night = String(r0.doc["night"]);
    const r = await cli(["asset", night, "--brief", brief("bad", { class: "weapon", subject: "longsword", techniques: ["M1"], ...FOR })]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/M1 touches up a weapon's T1 mesh/);
    expect((await readNight(night)).candidates).toEqual([]);
  });
});

describe("a brief for an existing game answers one of its needs (spark scout-vision S4)", () => {
  it("a bp brief naming an open need launches with the need's budget, and the candidate carries the need", async () => {
    bpNeeds();
    const night = String((await cli(["open", "--json"])).doc["night"]);
    const r = await cli(["asset", night, "--brief", brief("pin", PIN), "--json"]);
    expect(r.code, r.err).toBe(0);
    const c = await candidateOf(night, "c-01");
    expect(c).toMatchObject({ need: "need-amber-pins-with-tags", serves: { project: "bp" }, brief: { class: "prop", budgetTris: 500 } });
    expect((await readAsset(c.assetId ?? "")).brief.budgetTris).toBe(500);
  });

  it("a bp brief with no need, a stale needs file, mage-arena or pof launch nothing, each with its reason", async () => {
    const night = String((await cli(["open", "--json"])).doc["night"]);
    const { need: _n, ...noNeed } = PIN;
    bpNeeds();
    expect((await cli(["asset", night, "--brief", brief("no-need", noNeed)])).err).toMatch(/^asset brief: serves bp names a need: need: "<id>", one of need-amber-pins-with-tags, need-lamp-agent/);
    bpNeeds("2026-01-01T00:00:00.000Z");
    expect((await cli(["asset", night, "--brief", brief("stale", PIN)])).err).toMatch(/^asset brief: serves bp: bp's asset needs are \d+ days old \(generated 2026-01-01, stale past 7\); run `npx tsx scripts\/asset-needs.ts bp` in pof/);
    expect((await cli(["asset", night, "--brief", brief("arena", { ...PIN, serves: { project: "mage-arena" } })])).err).toBe("asset brief: serves: mage-arena is developed on another device; gravitone no longer briefs for it (spark scout-vision S4)");
    const { need: _p, ...pof } = { ...PIN, serves: { project: "pof" } };
    expect((await cli(["asset", night, "--brief", brief("pof", pof)])).err).toMatch(/^asset brief: serves pof: pof has no game content to measure - pof has no asset-needs file at /);
    expect((await readNight(night)).candidates).toEqual([]);
  });
});

describe("engines the worker admits by", () => {
  it("a scene on the card names the comfy engine (its clip is LTX through ComfyUI); on Leonardo's lane, and an asset's concepts, name none", () => {
    expect(scoutSceneProducer("gpu.local").engine).toBe("comfy");
    expect(scoutSceneProducer("cloud.leonardo").engine).toBeUndefined();
    expect(scoutAssetProducer().engine).toBeUndefined();
    expect(scoutAssetProducer().lane).toBe("cloud.leonardo");
  });
});
