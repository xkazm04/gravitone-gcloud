// DIRECTIONS AND KEPT IDEAS (spark scout-idea-artboards WP-I4a) - `pipeline/scout.mts direction`,
// `add-source` with `{fromIdea}` and `asset --brief` with `fromIdea`, end to end on dry nights, every
// store a temp directory set below before any lib/ module loads; then the next night's taste brief
// over the same records. The earlier nights are seeded on disk as committed: a live one that kept
// three ideas and a finding and rejected an idea, a dry one that kept an idea, one still closed.
// No vendor, no network: every launch here is dry and detached, and fetch throws.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-direction-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { runCli } from "../../pipeline/scout.mts";
import { readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import { tasteOf } from "../../lib/foundry/scout/taste.ts";
import type { Candidate, DirectionCandidate, IdeaCandidate, Night } from "../../lib/foundry/scout/types.ts";

const ENV = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = "2026-09-20";
const DRYN = "2026-09-19";
const OPEN = "2026-09-18";

/** A PNG header of the given size: enough for imageDims and the sniff. */
function png(w: number, h: number, seed: number): Buffer {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  b.writeUInt32BE(seed, 33);
  return b;
}

const idea = (id: string, o: Partial<IdeaCandidate> = {}): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `prompt of ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, ...o });

function seed(id: string, o: { dry: boolean; committed: boolean; candidates: Candidate[]; kept?: string[]; rejected?: string[]; reasons?: Record<string, string[]>; notes?: Record<string, string> }): void {
  const dir = path.join(ROOT, "scout", id);
  mkdirSync(path.join(dir, "ideas"), { recursive: true });
  o.candidates.forEach((c, i) => {
    if (c.kind === "idea" && c.image !== undefined) writeFileSync(path.join(dir, c.image), png(1024, 576, i + 1));
  });
  const night: Night = {
    id,
    startedAt: `${id}T00:00:00.000Z`,
    ceilingUsd: 15,
    target: 20,
    clipCap: 2,
    dry: o.dry,
    state: o.committed ? "committed" : "closed",
    stop: "target",
    sources: [],
    candidates: o.candidates,
    jobs: [],
    ...(o.committed ? { committed: { at: `${id}T08:00:00.000Z`, by: "operator", kept: o.kept ?? [], rejected: o.rejected ?? [], reasons: o.reasons ?? {}, notes: o.notes ?? {}, dry: o.dry } } : {}),
  };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  seed(LIVE, {
    dry: false,
    committed: true,
    candidates: [
      idea("c-01", { title: "Neon title card in the rain", genre: "title opener", prompt: "rough frame, a title card lit by a neon sign" }),
      idea("c-02", { title: "A poster of a lighthouse", target: "style", genre: "art print" }),
      idea("c-03", { title: "Cut-paper harbour", target: "style", genre: "music video" }),
      idea("c-04", { title: "Brass diving helmet", target: "asset3d" }),
      { id: "c-05", kind: "finding", sourceIds: [], status: "rendered", template: "cinematic", step: "02-frames", claim: "Hold the wide", quote: "q" },
    ],
    kept: ["c-01/board", "c-03/board", "c-04/board", "c-05/text"],
    rejected: ["c-02/board"],
    reasons: { "c-02/board": ["use case"] },
    notes: { "c-02/board": "we never print" },
  });
  seed(DRYN, { dry: true, committed: true, candidates: [idea("c-01")], kept: ["c-01/board"] });
  seed(OPEN, { dry: false, committed: false, candidates: [idea("c-01")] });
});
afterEach(() => closeProcessKernel());
afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(ROOT, { recursive: true, force: true });
});

async function cli(argv: string[]): Promise<{ code: number; out: string; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: ENV, out: (s) => out.push(s), err: (s) => err.push(s) });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, out: out.join("\n"), err: err.join("\n"), doc };
}

let seq = 0;
function file(body: unknown): string {
  const p = path.join(ROOT, `in-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

async function open(): Promise<string> {
  const r = await cli(["open", "--json"]);
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const BRIEF = {
  title: "Animated comedy sketch, dark humour for adults",
  format: "short",
  genre: "animated comedy sketch",
  style: "cut-paper harbour look",
  tone: "deadpan, dark",
  audience: "adults",
  premise: "A lighthouse keeper keeps switching the lamp off to save money; the ships keep finding him anyway.",
  basedOn: [`${LIVE}/c-03/board`, `${LIVE}/c-05/text`, `${LIVE}/c-03/board`],
};

describe("direction - a brief that stands on kept cells", () => {
  it("is a rendered words-only candidate: no source, no job, its basedOn once each", async () => {
    const night = await open();
    const r = await cli(["direction", night, "--json", file(BRIEF)]);
    expect(r.code, r.err).toBe(0);
    const c = (await readNight(night)).candidates[0] as DirectionCandidate;
    expect(c).toEqual({ id: "c-01", kind: "direction", sourceIds: [], status: "rendered", title: BRIEF.title, format: "short", genre: BRIEF.genre, style: BRIEF.style, tone: BRIEF.tone, audience: "adults", premise: BRIEF.premise, basedOn: [`${LIVE}/c-03/board`, `${LIVE}/c-05/text`] });
    expect((await readNight(night)).jobs).toEqual([]);
    expect(r.err).toBe("  + c-01 direction rendered · short · animated comedy sketch · based on 2 kept");
  });

  it("refuses a bad brief, and an entry that is not a kept cell, with the entry and why - nothing written", async () => {
    const night = await open();
    const said = async (over: Record<string, unknown>): Promise<string> => {
      const r = await cli(["direction", night, "--json", file({ ...BRIEF, ...over })]);
      expect(r.code).toBe(1);
      return r.err;
    };
    expect(await said({ format: "poster" })).toMatch(/^direction: format: /);
    expect(await said({ tone: "dark,\nand deadpan" })).toBe("direction: tone: one line");
    expect(await said({ premise: "p".repeat(281) })).toMatch(/^direction: premise: /);
    expect(await said({ basedOn: [] })).toBe("direction: basedOn: a direction stands on at least one kept cell: `<night>/<cell id>`");
    expect(await said({ basedOn: [`${LIVE}/c-01/board`, `${LIVE}/c-02/board`] })).toBe(`direction: basedOn 2 "${LIVE}/c-02/board": night ${LIVE} rejected c-02/board (use case); a direction stands only on a kept cell`);
    expect(await said({ basedOn: [`${LIVE}/c-09/text`] })).toBe(`direction: basedOn 1 "${LIVE}/c-09/text": night ${LIVE} did not keep c-09/text; a direction stands only on a kept cell`);
    expect(await said({ basedOn: [`${OPEN}/c-01/board`] })).toBe(`direction: basedOn 1 "${OPEN}/c-01/board": night ${OPEN} is closed: it has no verdicts yet; a direction stands only on a kept cell`);
    expect(await said({ basedOn: ["2026-01-01/c-01/board"] })).toBe(`direction: basedOn 1 "2026-01-01/c-01/board": No night called 2026-01-01.`);
    expect(await said({ basedOn: ["c-01/board"] })).toBe(`direction: basedOn 1 "c-01/board": not <night>/<cell id>`);
    expect((await readNight(night)).candidates).toEqual([]);
  });

  it("a closed night takes no direction", async () => {
    const night = await open();
    expect((await cli(["close", night])).code).toBe(0);
    const r = await cli(["direction", night, "--json", file(BRIEF)]);
    expect(r.code).toBe(1);
    expect(r.err).toBe(`night ${night} is closed; it takes no more directions`);
  });
});

describe("add-source {fromIdea} - a kept idea brought in as our own source", () => {
  let night = "";

  it("copies the kept artboard into the night, ingested, ours - no fetch, no ingest", async () => {
    night = await open();
    const r = await cli(["add-source", night, "--json", file([{ fromIdea: `${LIVE}/c-01` }, { fromIdea: `${LIVE}/c-03`, why: "the harbour look as a video's baseline" }])]);
    expect(r.code, r.err).toBe(0);
    const n = await readNight(night);
    expect(n.sources).toEqual([
      { id: "s-01", url: `idea:${LIVE}/c-01`, kind: "image", title: "Neon title card in the rain", why: `kept idea ${LIVE}/c-01: scene`, found: "idea", rights: "ours", fromIdea: `${LIVE}/c-01`, status: "ingested", files: ["sources/s-01/c-01.png"] },
      { id: "s-02", url: `idea:${LIVE}/c-03`, kind: "image", title: "Cut-paper harbour", why: "the harbour look as a video's baseline", found: "idea", rights: "ours", fromIdea: `${LIVE}/c-03`, status: "ingested", files: ["sources/s-02/c-03.png"] },
    ]);
    expect(readFileSync(resolveInNight(night, "sources/s-01/c-01.png"))).toEqual(readFileSync(resolveInNight(LIVE, "ideas/c-01.png")));
    expect((await cli(["ingest", night, "--json"])).doc["outcome"]).toBe("nothing");
  });

  it("refuses the whole batch for an idea not kept, a dry night's, one already brought in, or not an idea", async () => {
    const before = (await readNight(night)).sources.length;
    const refused = async (items: unknown[]): Promise<string> => {
      const r = await cli(["add-source", night, "--json", file(items)]);
      expect(r.code).toBe(1);
      return r.err;
    };
    const url = { url: "https://art.example/one.png", kind: "image", title: "One", why: "two flat inks", found: "search" };
    expect(await refused([url, { fromIdea: `${LIVE}/c-02` }])).toBe(`source 2: idea ${LIVE}/c-02: night ${LIVE} rejected c-02/board (use case); only a kept idea is developed`);
    expect(await refused([{ fromIdea: `${DRYN}/c-01` }])).toBe(`source 1: idea ${DRYN}/c-01 is a dry night's: its artboard is a stand-in, nothing to develop`);
    expect(await refused([{ fromIdea: `${OPEN}/c-01` }])).toBe(`source 1: idea ${OPEN}/c-01: night ${OPEN} is closed: it has no verdicts yet; only a kept idea is developed`);
    expect(await refused([{ fromIdea: `${LIVE}/c-05` }])).toBe(`source 1: night ${LIVE} has no idea c-05`);
    expect(await refused([{ fromIdea: `${LIVE}/c-01` }])).toBe(`source 1: idea ${LIVE}/c-01 is already developed as ${night}/s-01; a kept idea is brought in once`);
    expect(await refused([{ fromIdea: `${LIVE}/c-04` }, { fromIdea: `${LIVE}/c-04` }])).toBe(`source 2: idea ${LIVE}/c-04 is already developed as source 1 of this batch; a kept idea is brought in once`);
    expect(await refused([{ fromIdea: "c-04" }])).toBe("source 1: fromIdea: a kept idea's <night>/<c-id>");
    expect(await refused([{ fromIdea: `${LIVE}/c-04`, url: "https://x.example" }])).toMatch(/^source 1: /);
    expect((await readNight(night)).sources).toHaveLength(before);
  });

  it("refuses it in ANY other night once one holds it", async () => {
    const other = await open();
    const r = await cli(["add-source", other, "--json", file([{ fromIdea: `${LIVE}/c-03` }])]);
    expect(r.code).toBe(1);
    expect(r.err).toBe(`source 1: idea ${LIVE}/c-03 is already developed as ${night}/s-02; a kept idea is brought in once`);
  });

  it("a style and a scene launched over it carry fromIdea", async () => {
    const st = await cli(["style", night, "--sources", "s-02", "--use", "a music video's look", "--detach", "--json"]);
    expect(st.code, st.err).toBe(0);
    expect(st.doc["candidate"]).toMatchObject({ kind: "style", sourceIds: ["s-02"], fromIdea: `${LIVE}/c-03` });
    const sc = await cli(["scene", night, "--source", "s-01", "--use", "a title opener", "--detach", "--json"]);
    expect(sc.code, sc.err).toBe(0);
    const scene = (await readNight(night)).candidates.find((c) => c.kind === "scene");
    expect(scene, sc.err).toMatchObject({ sourceIds: ["s-01"], keyframes: ["sources/s-01/c-01.png"], fromIdea: `${LIVE}/c-01` });
  });

  it("asset --brief records the kept idea it develops, and refuses one not kept before anything is written", async () => {
    const before = (await readNight(night)).candidates.length;
    const bad = await cli(["asset", night, "--brief", file({ class: "prop", subject: "brass diving helmet", use: "a game trailer's hero prop", fromIdea: `${LIVE}/c-02` }), "--detach"]);
    expect(bad.code).toBe(1);
    expect(bad.err).toBe(`asset brief: fromIdea: idea ${LIVE}/c-02: night ${LIVE} rejected c-02/board (use case); only a kept idea is developed`);
    expect((await readNight(night)).candidates).toHaveLength(before);
    const r = await cli(["asset", night, "--brief", file({ class: "prop", subject: "brass diving helmet", use: "a game trailer's hero prop", fromIdea: `${LIVE}/c-04` }), "--detach", "--json"]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc["candidate"]).toMatchObject({ kind: "asset3d", fromIdea: `${LIVE}/c-04` });
    const c = (await readNight(night)).candidates.find((x) => x.kind === "asset3d");
    expect(c).toMatchObject({ fromIdea: `${LIVE}/c-04`, brief: { class: "prop", subject: "brass diving helmet" } });
  });

  it("the next night's taste.md no longer lists the ideas brought in", async () => {
    const r = await cli(["open", "--json"]);
    const md = readFileSync(String(r.doc["taste"]), "utf8");
    const develop = md.slice(md.indexOf("## Ideas to develop"), md.indexOf("## Ideas blocked"));
    expect(develop).toBe("## Ideas to develop\n\n- none\n\n");
    expect(md).toContain(`- "A poster of a lighthouse" (${LIVE}/c-02): use case - note: we never print`);
  });
});

describe("taste - directions confirmed and refused, ideas to develop and blocked, genres", () => {
  const night = (id: string, candidates: Candidate[], committed?: Night["committed"]): Night => ({ id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: committed === undefined ? "open" : "committed", sources: [], candidates, jobs: [], ...(committed === undefined ? {} : { committed }) });
  const dir = (id: string, title: string): DirectionCandidate => ({ id, kind: "direction", sourceIds: [], status: "rendered", title, format: "video", genre: "music video", style: "cut-paper", tone: "warm, slow", audience: "families", premise: `the premise of ${title}`, basedOn: ["2026-09-01/c-01/board"] });
  const judged = night(
    "2026-09-02",
    [dir("c-01", "Cut-paper music video"), dir("c-02", "Gallery prints"), idea("c-03", { title: "Neon titles", genre: "title opener" }), idea("c-04", { title: "Harbour", genre: "music video" }), idea("c-05", { title: "First batch, no genre" }), idea("c-06", { title: "Canvas print", genre: "art print" }), idea("c-07", { title: "Ports as tides", target: "stats", genre: "data explainer" })],
    { at: "2026-09-02T08:00:00.000Z", by: "operator", kept: ["c-01/text", "c-03/board", "c-04/board", "c-05/board", "c-07/board"], rejected: ["c-02/text", "c-06/board"], reasons: { "c-02/text": ["use case"], "c-06/board": ["use case", "generic"] }, notes: { "c-02/text": "we never print" }, dry: false },
  );
  const developing = night("2026-09-03", [{ id: "c-01", kind: "asset3d", sourceIds: [], status: "pending", brief: { class: "prop", subject: "x", budgetTris: 1000 }, concepts: [], fromIdea: "2026-09-02/c-07" }]);
  const bringing: Night = { ...night("2026-09-04", []), sources: [{ id: "s-01", url: "idea:2026-09-02/c-04", kind: "image", title: "Harbour", why: "w", found: "idea", rights: "ours", fromIdea: "2026-09-02/c-04", status: "ingested", files: [] }] };

  it("reads each in the brief's own words; a developed idea drops off the list", () => {
    const md = tasteOf([bringing, developing, judged]);
    const section = (h: string): string => {
      const at = md.indexOf(`## ${h}\n`);
      return md.slice(at, md.indexOf("\n## ", at + 1) + 1);
    };
    expect(section("Directions confirmed")).toBe('## Directions confirmed\n\n- "Cut-paper music video" (2026-09-02/c-01) · video · music video · style: cut-paper · tone: warm, slow · audience: families\n  the premise of Cut-paper music video\n\n');
    expect(section("Directions refused")).toBe('## Directions refused\n\n- "Gallery prints" (2026-09-02/c-02): use case - note: we never print\n\n');
    expect(section("Ideas to develop")).toBe("## Ideas to develop\n\n- 2026-09-02/c-03 · scene · title opener · Neon titles\n  prompt of c-03\n- 2026-09-02/c-05 · scene · - · First batch, no genre\n  prompt of c-05\n\n");
    expect(section("Ideas blocked")).toBe('## Ideas blocked\n\n- "Canvas print" (2026-09-02/c-06): use case, generic\n\n');
    expect(section("Genres")).toBe("## Genres\n\n- kept: data explainer 1, music video 1, title opener 1\n- blocked: art print 1\n\n");
    expect(md).toContain('threw idea c-06/board "Canvas print" [scene · art print]: use case, generic');
  });

  it("says none where there is nothing, and stays silent on a night not yet committed", () => {
    const md = tasteOf([night("2026-09-05", [idea("c-01")], { at: "2026-09-05T08:00:00.000Z", by: "operator", kept: [], rejected: [], reasons: {}, notes: {}, dry: false })]);
    expect(md).toContain("## Directions confirmed\n\n- none\n");
    expect(md).toContain("## Ideas to develop\n\n- none\n");
    expect(md).toContain("## Genres\n\n- kept: none\n- blocked: none\n");
    expect(tasteOf([developing])).toContain("No committed live night yet");
  });
});
