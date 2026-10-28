// A KEPT CHARACTER'S REFERENCE SHEET (spark scout-vision S3 WP3) - `pipeline/scout.mts sheet` end to end over temp nights
// in both roots (the muse ARCHIVE too) and a temp kernel: who is due (no kept sheet, none in flight; a rejected sheet
// makes her due again, a pending or undecided one holds her back), `--character` refused with why, a dry night's sheets
// words only, a live sheet drawn by a fake Flux with HER KEPT PORTRAIT as the one reference admitted late and the
// neutral prompt (identity block verbatim + framing), the eye before a byte is written (by her audience's rules), and the
// taste's `## Sheets to draw`. No ComfyUI, no vendor: fetch throws, the engines are fakes.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-sheet-"));
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

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { get } from "@gt/kernel/job";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { rootedNights } from "../../lib/foundry/scout/cast.ts";
import { identityBlock, keptCharacters } from "../../lib/foundry/scout/characters.ts";
import type { CharacterCard, MuseJudge } from "../../lib/foundry/scout/muse.ts";
import { SHEET_FRAMING, sheetPrompt, sheetsDue, sheetsToDraw } from "../../lib/foundry/scout/sheet.ts";
import { readNight } from "../../lib/foundry/scout/store.ts";
import type { Candidate, IdeaCandidate, Night, SheetCandidate } from "../../lib/foundry/scout/types.ts";
import type { Recognition } from "../../lib/imaging/types.ts";
import { producers } from "../../lib/producers/registry.ts";
import { driveSheet } from "../../lib/producers/scoutSheet.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();
const LOC = path.join(ROOT, "kernel.sqlite");

const ARCHIVE = "2026-09-10";
const KEPT = "2026-09-20";
const REJECTED = "2026-09-22";
const UNJUDGED = "2026-09-23";
const png = (k: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, k]);
const MARA_PORTRAIT = png(3);
const PIP_PORTRAIT = png(4);
const UNA_PORTRAIT = png(5);
const DRAWN = png(42);

const MARA: CharacterCard = { name: "Mara Venn", age: 34, look: "auburn bob, freckles, green wool coat", personality: "dry wit" };
const ILSE: CharacterCard = { name: "Ilse Marrow", age: 36, look: "copper bob, grey eyes, a navy pea coat", personality: "patient", kind: "original", render: "stylised", audience: "adult" };
const PIP: CharacterCard = { name: "Pip Wren", age: 9, look: "a small round fox in a yellow raincoat", personality: "curious", kind: "original", render: "stylised", audience: "kids" };
const UNA: CharacterCard = { name: "Una Brask", age: 41, look: "silver crop, a scar through one brow, a red scarf", personality: "blunt", kind: "original", render: "photoreal", audience: "adult" };
const VIC: CharacterCard = { name: "Vic Hale", age: 29, look: "black braids, a denim jacket", personality: "restless", kind: "original", render: "stylised", audience: "adult" };

function put(root: "scout" | "scout-muse", night: string, rel: string, bytes: Uint8Array): void {
  const abs = path.join(ROOT, root, night, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
}

const character = (id: string, card: CharacterCard): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: card.name, target: "character", prompt: `poster of ${card.name}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, aspect: "9:16", card });
const sheet = (id: string, card: CharacterCard, fromPortrait: string): SheetCandidate => ({ id, kind: "sheet", sourceIds: [], status: "rendered", character: card.name.toLowerCase(), name: card.name, fromPortrait, image: `sheets/${id}.png`, seed: 1 });

function night(root: "scout" | "scout-muse", id: string, candidates: Candidate[], o: { kept?: string[]; rejected?: string[]; reasons?: Record<string, string[]>; notes?: Record<string, string>; committed?: boolean } = {}): void {
  const committed = o.committed !== false;
  const n: Night = {
    id,
    startedAt: `${id}T00:00:00.000Z`,
    ceilingUsd: 15,
    target: 20,
    clipCap: 2,
    dry: false,
    state: committed ? "committed" : "closed",
    stop: "target",
    sources: [],
    candidates,
    jobs: [],
    ...(committed ? { committed: { at: `${id}T08:00:00.000Z`, by: "operator", kept: o.kept ?? [], rejected: o.rejected ?? [], reasons: o.reasons ?? {}, notes: o.notes ?? {}, dry: false } } : {}),
  };
  mkdirSync(path.join(ROOT, root, id), { recursive: true });
  writeFileSync(path.join(ROOT, root, id, "night.json"), JSON.stringify(n));
}

beforeAll(() => {
  put("scout-muse", ARCHIVE, "ideas/c-03.png", MARA_PORTRAIT);
  night("scout-muse", ARCHIVE, [character("c-03", MARA)], { kept: ["c-03/board"] });
  put("scout", KEPT, "ideas/c-01.png", png(1));
  put("scout", KEPT, "ideas/c-02.png", PIP_PORTRAIT);
  put("scout", KEPT, "ideas/c-04.png", UNA_PORTRAIT);
  put("scout", KEPT, "ideas/c-05.png", png(6));
  put("scout", KEPT, "sheets/c-03.png", png(2));
  // Ilse has her kept sheet; Pip, Una and Vic none.
  night("scout", KEPT, [character("c-01", ILSE), character("c-02", PIP), sheet("c-03", ILSE, `${KEPT}/c-01`), character("c-04", UNA), character("c-05", VIC)], { kept: ["c-01/board", "c-02/board", "c-03/sheet", "c-04/board", "c-05/board"] });
  // Una's first sheet was rejected (she is due again, the reason carried); Vic's waits on a night not yet judged.
  put("scout", REJECTED, "sheets/c-01.png", png(7));
  night("scout", REJECTED, [sheet("c-01", UNA, `${KEPT}/c-04`)], { rejected: ["c-01/sheet"], reasons: { "c-01/sheet": ["craft", "style"] }, notes: { "c-01/sheet": "the scar moved brows" } });
  put("scout", UNJUDGED, "sheets/c-01.png", png(8));
  night("scout", UNJUDGED, [sheet("c-01", VIC, `${KEPT}/c-05`)], { committed: false });
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

async function open(env: Record<string, string | undefined>, live: boolean): Promise<string> {
  const r = await cli(["open", "--json", ...(live ? ["--live"] : [])], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const sheetsOn = async (n: string): Promise<SheetCandidate[]> => (await readNight(n)).candidates.filter((c): c is SheetCandidate => c.kind === "sheet");

type Drawn = { prompt: string; refs: readonly Uint8Array[]; late: number; seed?: number };
function fakeDraw(): { draw: (prompt: string, o: { readonly refs: readonly Uint8Array[]; readonly late: number; readonly seed?: number }) => Promise<{ png: Uint8Array; seed: number }>; asked: Drawn[] } {
  const asked: Drawn[] = [];
  return {
    asked,
    draw: async (prompt, o) => {
      asked.push({ prompt, refs: o.refs, late: o.late, ...(o.seed === undefined ? {} : { seed: o.seed }) });
      return { png: DRAWN, seed: o.seed ?? 1 };
    },
  };
}

const read = (o: Partial<MuseJudge> = {}): MuseJudge => ({ adult: "yes", apparentAge: 34, clothing: "covered", realPerson: "no", hands: "none", notes: "flat grey field", ...o });
const eye = (j: MuseJudge) => async (): Promise<Recognition> => ({ text: "", json: { ...j, apparentAge: j.apparentAge ?? 0 }, provenance: { provider: "ollama", model: "eye", modelBasis: "requested", durationMs: 1 } }) as unknown as Recognition;

describe("who is due a sheet", () => {
  it("every kept character with no kept sheet and none in flight: not Ilse (kept sheet), not Vic (undecided)", async () => {
    const nights = await rootedNights();
    const due = sheetsDue(nights, keptCharacters(nights));
    expect(due.map((d) => d.character.card.name)).toEqual(["Mara Venn", "Pip Wren", "Una Brask"]);
    expect(due.find((d) => d.character.key === "una brask")?.rejected).toEqual({ ref: `${REJECTED}/c-01`, reasons: ["craft", "style"], note: "the scar moved brows" });
    expect(due.find((d) => d.character.key === "mara venn")?.character.portrait.ref).toBe(`muse:${ARCHIVE}/c-03`);
  });

  it("the taste's ## Sheets to draw names each, her portrait, and why her last sheet was rejected", async () => {
    const nights = await rootedNights();
    expect(sheetsToDraw(nights, keptCharacters(nights))).toEqual([
      "## Sheets to draw",
      "",
      `- Mara Venn · portrait muse:${ARCHIVE}/c-03`,
      `- Pip Wren · portrait ${KEPT}/c-02`,
      `- Una Brask · portrait ${KEPT}/c-04 · last sheet ${REJECTED}/c-01 rejected: craft, style - note: the scar moved brows`,
      "",
    ]);
    expect(sheetsToDraw(nights, [])).toEqual(["## Sheets to draw", "", "- none", ""]);
  });

  it("the prompt is her identity block verbatim, then the neutral framing, then how she is drawn", () => {
    expect(sheetPrompt(UNA)).toBe(`${identityBlock(UNA)} ${SHEET_FRAMING} Photoreal.`);
    expect(sheetPrompt(MARA)).toBe(`${identityBlock(MARA)} ${SHEET_FRAMING}`);
    expect(SHEET_FRAMING).toMatch(/three-quarters/);
    expect(SHEET_FRAMING).toMatch(/plain mid-grey background/);
  });
});

describe("the sheet act", () => {
  it("--character refuses one not due, saying why; one not kept names the kept", async () => {
    const n = await open(DRY, false);
    const why = async (name: string): Promise<string> => {
      const r = await cli(["sheet", n, "--character", name, "--json"]);
      expect(r.code).toBe(1);
      return r.err;
    };
    expect(await why("Ilse Marrow")).toContain(`Ilse Marrow already has her kept sheet ${KEPT}/c-03`);
    expect(await why("vic hale")).toContain(`Vic Hale already has sheet ${UNJUDGED}/c-01 (rendered) waiting on its verdict`);
    expect(await why("Nobody")).toMatch(/Nobody is not a kept character \(kept: Mara Venn, /);
    expect(await sheetsOn(n)).toEqual([]);
  });

  it("a dry night writes each due sheet as words only and launches nothing; a second run adds none", async () => {
    const n = await open(DRY, false);
    const r = await cli(["sheet", n, "--json"]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc).toMatchObject({ ok: true, jobIds: [], dry: true });
    expect(r.err).toContain("is dry: 3 sheet(s) written as words only; no still is drawn and nothing is launched");
    expect((await sheetsOn(n)).map((c) => [c.id, c.status, c.character, c.name, c.fromPortrait, c.image])).toEqual([
      ["c-01", "rendered", "mara venn", "Mara Venn", `muse:${ARCHIVE}/c-03`, undefined],
      ["c-02", "rendered", "pip wren", "Pip Wren", `${KEPT}/c-02`, undefined],
      ["c-03", "rendered", "una brask", "Una Brask", `${KEPT}/c-04`, undefined],
    ]);
    expect((await readNight(n)).jobs).toEqual([]);
    const again = await cli(["sheet", n, "--json"]);
    expect(again.code, again.err).toBe(0);
    expect(await sheetsOn(n)).toHaveLength(3);
  });

  it("a live sheet: one gpu.local job at $0, her archive portrait the one reference admitted late, the neutral prompt - and the eye throws a still it could not read", async () => {
    const n = await open(LIVE, true);
    const fake = fakeDraw();
    const r = await cli(["sheet", n, "--character", "Mara Venn", "--json"], { env: LIVE, ports: { sheet: { draw: fake.draw } } });
    expect(r.code, r.err).toBe(0);
    expect(r.err).toMatch(/receipt \(live\): sheet c-01 of Mara Venn · 1 still on gpu\.local · her portrait muse:2026-09-10\/c-03 late 0\.25 · comfyui · \$0/);
    expect(fake.asked).toHaveLength(1);
    expect(fake.asked[0]?.prompt).toBe(sheetPrompt(MARA));
    expect(fake.asked[0]?.late).toBe(0.25);
    expect(fake.asked[0]?.refs.map((b) => [...b])).toEqual([[...MARA_PORTRAIT]]);
    // No eye answered (fetch throws): the still is never written and the sheet fails with the eye's sentence.
    const [c] = await sheetsOn(n);
    expect(c?.status).toBe("failed");
    expect(c?.error).toMatch(/^judge: unavailable - /);
    expect(existsSync(path.join(ROOT, "scout", n, "sheets", "c-01.png"))).toBe(false);
    const k = processKernel(LOC);
    if (!k.ok) throw k.error;
    const j = get(k.value.store, `job:scout-sheet:${n}:c-01` as never);
    expect(j.ok && [j.value.job.producer, j.value.job.lane, j.value.job.ceilingUsd]).toEqual(["scout-sheet", "gpu.local", undefined]);
  });

  it("the eye by her audience: a kids character read as a child passes; an adult read under 21 is thrown", async () => {
    const n = await open(LIVE, true);
    const r = await cli(["sheet", n, "--detach", "--json"], { env: LIVE });
    expect(r.code, r.err).toBe(0);
    const ids = (await sheetsOn(n)).map((c) => [c.id, c.name]);
    // Mara's earlier live sheet failed, so she is due again here, beside Pip and Una.
    expect(ids).toEqual([["c-01", "Mara Venn"], ["c-02", "Pip Wren"], ["c-03", "Una Brask"]]);
    const k = processKernel(LOC);
    if (!k.ok) throw k.error;
    const pip = fakeDraw();
    const d1 = await driveSheet(k.value.store, LOC, `job:scout-sheet:${n}:c-02`, { dryOnly: false, engines: { draw: pip.draw, recognize: eye(read({ adult: "no", apparentAge: 9 })) } });
    expect(d1.ok && d1.value.outcome).toBe("done");
    expect(pip.asked[0]?.refs.map((b) => [...b])).toEqual([[...PIP_PORTRAIT]]);
    const una = fakeDraw();
    const d2 = await driveSheet(k.value.store, LOC, `job:scout-sheet:${n}:c-03`, { dryOnly: false, engines: { draw: una.draw, recognize: eye(read({ apparentAge: 17 })) } });
    expect(d2.ok).toBe(true);
    const after = await sheetsOn(n);
    expect(after.find((c) => c.id === "c-02")).toMatchObject({ status: "rendered", image: "sheets/c-02.png" });
    expect([...readFileSync(path.join(ROOT, "scout", n, "sheets", "c-02.png"))]).toEqual([...DRAWN]);
    expect(after.find((c) => c.id === "c-03")).toMatchObject({ status: "failed", error: "judge: apparent age 17" });
    expect(existsSync(path.join(ROOT, "scout", n, "sheets", "c-03.png"))).toBe(false);
  });

  it("the producer is registered on gpu.local", () => {
    const set = producers();
    expect(set.ok && set.value.has("scout-sheet@gpu.local" as never)).toBe(true);
  });
});
