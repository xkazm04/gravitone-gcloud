// CASTING A KEPT CHARACTER (spark scout-vision S3 WP3) - over temp nights in both roots (the scout root and the muse
// ARCHIVE, whose night ids collide with the scout's) and a temp kernel:
//   - THE GUARD, lib/foundry/scout/cast.ts castStillOf: her kept portrait (the archive's `muse:<night>/c-NN` too) and her
//     kept sheet read; a source file, a brief-supplied path, another candidate's ref, a candidate whose own image is a
//     source file, a climbing path, a character not kept - each refused, naming why;
//   - the panels' NAME RULE (scene.ts namesIn `allow`): a cast name or a declared parody origin mid-sentence passes, any
//     other capital still refuses; a scene recipe keeps the no-names rule;
//   - THE CAST on a storyboard / trial: every panel compiled as her identity block VERBATIM then the panel's own words
//     (byte-identical in every panel), her kept sheet riding each frame as a reference admitted late, a cast member with
//     no kept sheet identity block only (and the receipt line says so), a kids character refused into adult work.
// No ComfyUI, no vendor: fetch throws, the frame engine is a fake.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-cast-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { castAllow, castOf, castStillOf, rootedNights } from "../../lib/foundry/scout/cast.ts";
import { identityBlock, keptCharacters } from "../../lib/foundry/scout/characters.ts";
import type { CharacterCard } from "../../lib/foundry/scout/muse.ts";
import { namesIn } from "../../lib/foundry/scout/scene.ts";
import { parseStoryboards } from "../../lib/foundry/scout/storyboard.ts";
import { readNight } from "../../lib/foundry/scout/store.ts";
import type { Candidate, IdeaCandidate, Night, SeedBatch, SheetCandidate, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();

/** The same id in both roots: the archive's is `muse:2026-09-10`. */
const SAME = "2026-09-10";
const KEPT = "2026-09-20";
const png = (k: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, k]);
const PORTRAIT = png(1);
const SHEET = png(2);
const MARA_PORTRAIT = png(3);
const SOURCE = png(9);

const ILSE: CharacterCard = { name: "Ilse Marrow", age: 36, look: "copper bob, grey eyes, a navy pea coat", personality: "dry, patient", kind: "original", render: "stylised", audience: "adult" };
const PIP: CharacterCard = { name: "Pip Wren", age: 9, look: "a small round fox in a yellow raincoat", personality: "curious", kind: "original", render: "stylised", audience: "kids" };
const PLUMBER: CharacterCard = { name: "Luigi Verde", age: 34, look: "a tall plumber in a green cap and overalls", personality: "nervous, brave", kind: "parody", origin: "Super Mario Bros", render: "stylised", audience: "adult" };
const MARA: CharacterCard = { name: "Mara Venn", age: 34, look: "auburn bob, freckles, green wool coat", personality: "dry wit" };

function put(root: "scout" | "scout-muse", night: string, rel: string, bytes: Uint8Array): void {
  const abs = path.join(ROOT, root, night, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
}

const character = (id: string, card: CharacterCard, o: Partial<IdeaCandidate> = {}): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: card.name, target: "character", prompt: `poster of ${card.name}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, aspect: "9:16", card, ...o });
const sceneIdea = (id: string, o: Partial<IdeaCandidate> = {}): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `prompt of ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, ...o });

function night(root: "scout" | "scout-muse", id: string, candidates: Candidate[], kept: string[], sources: Night["sources"] = []): void {
  const n: Night = { id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "committed", stop: "target", sources, candidates, jobs: [], committed: { at: `${id}T08:00:00.000Z`, by: "operator", kept, rejected: [], reasons: {}, notes: {}, dry: false } };
  mkdirSync(path.join(ROOT, root, id), { recursive: true });
  writeFileSync(path.join(ROOT, root, id, "night.json"), JSON.stringify(n));
}

const sheetOf = (id: string, character: string, name: string, fromPortrait: string): SheetCandidate => ({ id, kind: "sheet", sourceIds: [], status: "rendered", character, name, fromPortrait, image: `sheets/${id}.png`, seed: 4 });

beforeAll(() => {
  // The archive: Mara Venn kept, and a source frame beside her.
  put("scout-muse", SAME, "ideas/c-03.png", MARA_PORTRAIT);
  put("scout-muse", SAME, "sources/s-01/k-001.png", SOURCE);
  night("scout-muse", SAME, [character("c-03", MARA, { aspect: "4:5" })], ["c-03/board"], [{ id: "s-01", url: "https://example.com/v", kind: "video", title: "A found video", why: "w", found: "search", rights: "reference-only", status: "ingested", files: ["sources/s-01/k-001.png"] }]);
  // The scout night of the same id: a character whose "image" is a source file (forged), kept.
  put("scout", SAME, "sources/s-01/k-001.png", SOURCE);
  night("scout", SAME, [character("c-01", { ...ILSE, name: "Forged Fern" }, { image: "sources/s-01/k-001.png" })], ["c-01/board"], [{ id: "s-01", url: "https://example.com/v", kind: "video", title: "A found video", why: "w", found: "search", rights: "reference-only", status: "ingested", files: ["sources/s-01/k-001.png"] }]);
  // Ilse with her kept sheet; Pip (kids); the parody plumber; three kept scene ideas (an adult seed, a kids seed, none).
  for (const [id, b] of [["c-01", PORTRAIT], ["c-02", png(5)], ["c-07", png(6)]] as const) put("scout", KEPT, `ideas/${id}.png`, b);
  put("scout", KEPT, "sheets/c-03.png", SHEET);
  for (const id of ["c-04", "c-05", "c-06", "c-08"]) put("scout", KEPT, `ideas/${id}.png`, png(7));
  night(
    "scout",
    KEPT,
    [character("c-01", ILSE), character("c-02", PIP), sheetOf("c-03", "ilse marrow", "Ilse Marrow", `${KEPT}/c-01`), sceneIdea("c-04", { fromSeed: "2026-09-01/sd-001" }), sceneIdea("c-05", { fromSeed: "2026-09-01/sd-002" }), sceneIdea("c-06"), character("c-07", PLUMBER), sceneIdea("c-08", { fromSeed: "2026-09-01/sd-002" })],
    ["c-01/board", "c-02/board", "c-03/sheet", "c-04/board", "c-05/board", "c-06/board", "c-07/board", "c-08/board"],
  );
  const batch: SeedBatch = {
    id: "2026-09-01",
    createdAt: "2026-09-01T00:00:00.000Z",
    dry: false,
    seeds: [
      { id: "sd-001", sentence: "A lighthouse keeper's quiet week.", genre: "drama", subgenre: "slice of life", type: "animated short", audience: "adult", format: "short" },
      { id: "sd-002", sentence: "A fox who counts raindrops.", genre: "kids animation", subgenre: "counting", type: "animated short", audience: "kids", format: "short" },
    ],
    committed: { at: "2026-09-01T08:00:00.000Z", by: "operator", kept: ["sd-001", "sd-002"], rejected: [], reasons: {}, notes: {}, dry: false },
  };
  mkdirSync(path.join(ROOT, "scout", "seeds", batch.id), { recursive: true });
  writeFileSync(path.join(ROOT, "scout", "seeds", batch.id, "batch.json"), JSON.stringify(batch));
});
beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeProcessKernel();
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("the guard - castStillOf", () => {
  it("reads her kept portrait, her kept sheet, and an archive portrait by its muse: ref", async () => {
    const nights = await rootedNights();
    const kept = keptCharacters(nights);
    expect(kept.map((k) => k.key)).toEqual(expect.arrayContaining(["ilse marrow", "mara venn", "pip wren"]));
    const portrait = await castStillOf(nights, { name: "Ilse Marrow", ref: `${KEPT}/c-01` });
    expect(portrait.ok && [portrait.value.which, [...portrait.value.bytes]]).toEqual(["portrait", [...PORTRAIT]]);
    const sheet = await castStillOf(nights, { name: "ilse  marrow", ref: `${KEPT}/c-03` });
    expect(sheet.ok && [sheet.value.which, [...sheet.value.bytes]]).toEqual(["sheet", [...SHEET]]);
    const mara = await castStillOf(nights, { name: "Mara Venn", ref: `muse:${SAME}/c-03` });
    expect(mara.ok && [...mara.value.bytes]).toEqual([...MARA_PORTRAIT]);
  });

  it("refuses a source file, a brief-supplied path, another candidate, the wrong root, and a character not kept", async () => {
    const nights = await rootedNights();
    const why = async (name: string, ref: string): Promise<string> => {
      const r = await castStillOf(nights, { name, ref });
      return r.ok ? "read" : r.error.message;
    };
    expect(await why("Ilse Marrow", "sources/s-01/k-001.png")).toMatch(/^sources\/s-01\/k-001\.png is neither Ilse Marrow's kept portrait .* nor her kept sheet .*; a reference is only ever one of those$/);
    expect(await why("Ilse Marrow", "ideas/c-01.png")).toMatch(/is neither Ilse Marrow's kept portrait/);
    expect(await why("Ilse Marrow", "../../outside.png")).toMatch(/is neither/);
    expect(await why("Ilse Marrow", `${KEPT}/c-04`)).toMatch(/is neither/);
    // Mara's ref under the scout root's night of the same id is not hers.
    expect(await why("Mara Venn", `${SAME}/c-03`)).toMatch(/is neither Mara Venn's kept portrait \(muse:2026-09-10\/c-03\)/);
    expect(await why("Nobody Here", `${KEPT}/c-01`)).toBe("Nobody Here is not a kept character; only a kept character's own still is a reference");
  });

  it("refuses a kept character whose own image is a source file, and a forged kept record pointing elsewhere", async () => {
    const nights = await rootedNights();
    const forged = await castStillOf(nights, { name: "Forged Fern", ref: `${SAME}/c-01` });
    expect(forged.ok ? "read" : forged.error.message).toBe(`${SAME}/c-01: sources/s-01/k-001.png is a source file (reference-only); a found picture never becomes a character's reference`);
    // A kept record (as a broken reader might hand it) whose file is not the candidate's own image.
    const real = keptCharacters(nights).find((k) => k.key === "ilse marrow");
    if (real === undefined) throw new Error("no Ilse");
    const lie = { ...real, portrait: { ...real.portrait, file: "sources/s-01/k-001.png" } };
    const r = await castStillOf(nights, { name: "Ilse Marrow", ref: `${KEPT}/c-01` }, [lie]);
    expect(r.ok ? "read" : r.error.message).toBe(`${KEPT}/c-01 does not record sources/s-01/k-001.png as its own portrait; a reference is the candidate's own image`);
  });
});

describe("the panels' name rule - namesIn allow", () => {
  it("a cast name or a declared parody origin mid-sentence passes; any other capital still refuses; a scene recipe allows none", async () => {
    const kept = keptCharacters(await rootedNights());
    const allow = castAllow(["Ilse Marrow", "Luigi Verde"], kept);
    expect(allow).toEqual(expect.arrayContaining(["Ilse Marrow", "Luigi Verde", "Super Mario Bros"]));
    expect(namesIn(["the camera finds Ilse on the stair, Marrow's coat wet", "a plumber like Luigi Verde in a Super Mario Bros level"], [], allow)).toEqual([]);
    expect(namesIn(["the camera finds Ilse beside Gandalf"], [], allow)).toEqual(['"Gandalf" (a capital mid-sentence)']);
    expect(namesIn(["the camera finds Ilse on the stair"], [], [])).toEqual(['"Ilse" (a capital mid-sentence)']);
  });

  it("the door: a brief's cast widens its own panels only", async () => {
    const kept = keptCharacters(await rootedNights());
    const b = { fromIdea: `${KEPT}/c-04`, title: "t", paragraph: "p", bullets: ["a", "b", "c"], panels: ["the lamp swings as Ilse turns"] };
    expect(parseStoryboards([{ ...b, cast: ["Ilse Marrow"] }], kept).ok).toBe(true);
    const plain = parseStoryboards([b], kept);
    expect(plain.ok ? "ok" : plain.error.message).toBe('storyboard 1: the panels name "Ilse" (a capital mid-sentence): craft, not content (no person, studio or franchise)');
    const other = parseStoryboards([{ ...b, cast: ["Ilse Marrow"], panels: ["the lamp swings as Ilse meets Batman"] }], kept);
    expect(other.ok ? "ok" : other.error.message).toMatch(/the panels name "Batman"/);
  });
});

describe("castOf - kept, once each, and the audience rule", () => {
  it("refuses a character not kept, one named twice, and a kids character in adult or unseeded work", async () => {
    const kept = keptCharacters(await rootedNights());
    const at = (names: string[], aud: "kids" | "family" | "adult" | undefined): string => {
      const r = castOf(names, kept, aud);
      return r.ok ? r.value.map((k) => k.card.name).join(",") : r.error.message;
    };
    expect(at(["Ilse Marrow", "Mara Venn"], "adult")).toBe("Ilse Marrow,Mara Venn");
    expect(at(["Pip Wren"], "kids")).toBe("Pip Wren");
    expect(at(["Pip Wren"], "adult")).toBe("cast: Pip Wren is a kids character; never cast into adult work");
    expect(at(["Pip Wren"], undefined)).toBe("cast: Pip Wren is a kids character; never cast into unseeded work");
    expect(at(["Ilse Marrow", "ilse marrow"], "adult")).toBe("cast: Ilse Marrow is named twice");
    expect(at(["Nobody"], "adult")).toMatch(/^cast: Nobody is not a kept character \(kept: /);
  });
});

/* ── the storyboard act ─────────────────────────────────────────────────────── */

async function cli(argv: string[], o: { env?: Record<string, string | undefined>; ports?: CliPorts } = {}): Promise<{ code: number; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: o.env ?? DRY, out: (s) => out.push(s), err: (s) => err.push(s), ...(o.ports === undefined ? {} : { ports: o.ports }) });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, err: err.join("\n"), doc };
}

let seq = 0;
function file(body: unknown): string {
  const p = path.join(ROOT, `boards-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

async function open(env: Record<string, string | undefined>, live: boolean): Promise<string> {
  const r = await cli(["open", "--json", ...(live ? ["--live"] : [])], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const STATES = ["she climbs the stair after the lantern, Ilse's breath fogging", "a dark landing, the lantern's pool of light ahead", "at the rail she watches the lantern over the sea"];
const brief = (fromIdea: string, o: Record<string, unknown> = {}) => ({ fromIdea, title: "The keeper follows her own light", paragraph: "She climbs after a lantern that never waits.", bullets: ["beats: climb, landing, rail", "format: a 30 s vertical short", "look: cold slate, one warm light"], panels: STATES, ...o });

function fakeDraw(): { ports: CliPorts; asked: { prompt: string; refs?: readonly Uint8Array[]; late?: number }[] } {
  const asked: { prompt: string; refs?: readonly Uint8Array[]; late?: number }[] = [];
  return {
    asked,
    ports: {
      storyboard: {
        draw: async (prompt, o) => {
          asked.push({ prompt, ...(o.refs === undefined ? {} : { refs: o.refs }), ...(o.late === undefined ? {} : { late: o.late }) });
          return { png: png(8), seed: o.seed ?? 1 };
        },
      },
    },
  };
}

const boardsOf = async (n: string): Promise<StoryboardCandidate[]> => (await readNight(n)).candidates.filter((c): c is StoryboardCandidate => c.kind === "storyboard");

describe("a cast storyboard", () => {
  it("compiles every panel as her identity block verbatim then the panel's words, and her kept sheet rides each frame late", async () => {
    const n = await open(LIVE, true);
    const fake = fakeDraw();
    const r = await cli(["storyboard", n, "--json", file([brief(`${KEPT}/c-04`, { cast: ["ilse marrow"] })])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    expect(r.err).toContain("c-01 cast: Ilse Marrow (kept sheet, late 0.25)");
    const [c] = await boardsOf(n);
    const block = identityBlock(ILSE);
    expect(c?.cast).toEqual(["Ilse Marrow"]);
    expect(c?.panels).toEqual(STATES.map((s) => `${block} ${s}`));
    // Byte-identical identity in every panel, and every frame Flux drew starts with it.
    for (const p of [...(c?.panels ?? []), ...fake.asked.map((a) => a.prompt)]) expect(p.slice(0, block.length)).toBe(block);
    expect(fake.asked).toHaveLength(3);
    for (const a of fake.asked) {
      expect(a.late).toBe(0.25);
      expect(a.refs?.map((x) => [...x])).toEqual([[...SHEET]]);
    }
  });

  it("a cast member with no kept sheet is identity block only: no reference, and the receipt line says so", async () => {
    const n = await open(LIVE, true);
    const fake = fakeDraw();
    const r = await cli(["storyboard", n, "--json", file([brief(`${KEPT}/c-06`, { cast: ["Mara Venn"], panels: ["Mara at a chart table by lamplight"] })])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    expect(r.err).toContain("c-01 cast: Mara Venn (identity block only)");
    expect(fake.asked).toEqual([{ prompt: `${identityBlock(MARA)} Mara at a chart table by lamplight` }]);
  });

  it("a plain storyboard draws as before: its own words, no reference", async () => {
    const n = await open(LIVE, true);
    const fake = fakeDraw();
    const r = await cli(["storyboard", n, "--json", file([brief(`${KEPT}/c-05`, { panels: ["a fox under a raindrop sky"] })])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    expect(fake.asked).toEqual([{ prompt: "a fox under a raindrop sky" }]);
    expect((await boardsOf(n))[0]).not.toHaveProperty("cast");
  });

  it("refuses a kids character cast into adult work, and one not kept - before a candidate exists", async () => {
    const n = await open(DRY, false);
    const kids = await cli(["storyboard", n, "--json", file([brief(`${KEPT}/c-04`, { cast: ["Pip Wren"], panels: ["a fox on the stair"] })])]);
    expect(kids.code).toBe(1);
    expect(kids.err).toContain("storyboard 1: cast: Pip Wren is a kids character; never cast into adult work");
    const ghost = await cli(["storyboard", n, "--json", file([brief(`${KEPT}/c-04`, { cast: ["Nobody"], panels: ["a figure on the stair"] })])]);
    expect(ghost.err).toMatch(/storyboard 1: cast: Nobody is not a kept character/);
    expect(await boardsOf(n)).toEqual([]);
    // Into kids work she may be cast.
    const ok = await cli(["storyboard", n, "--json", file([brief(`${KEPT}/c-08`, { cast: ["Pip Wren"], panels: ["a fox counting raindrops"] })])]);
    expect(ok.code, ok.err).toBe(0);
    expect((await boardsOf(n))[0]?.panels).toEqual([`${identityBlock(PIP)} a fox counting raindrops`]);
  });
});
