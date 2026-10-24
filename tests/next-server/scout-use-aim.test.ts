// THE USE / AIM / LOOK DOOR AND THE REPEAT GUARD (spark scout-use-aim WP1) - a brief names its `app` (a
// closed list), its specific `appTarget`, the one-sentence `aim` (never the prompt) and, for a muse
// character, her `look` slug; the candidate stores `use` as `<app>: <appTarget>`. A muse character whose
// card name or look an earlier character of the wing already used is refused with the whole batch,
// unless that earlier one was kept; the scout wing is unaffected. Every store is a temp directory.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-use-aim-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  process.env["SPEND_STORE"] = "memory";
  process.env["IMAGING_ENV"] = "dev";
  process.env["LOCAL_BINARIES"] = "off";
  for (const k of ["LEONARDO_API_KEY", "GOOGLE_AI_API_KEY", "OLLAMA_HOST", "LEONARDO_STUDIO_CDP"]) delete process.env[k];
  return dir;
});

import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { parseIdeas } from "../../lib/foundry/scout/idea.ts";
import { alreadyDrawn, repeatRefusal } from "../../lib/foundry/scout/ideaRepeat.ts";
import { readNight } from "../../lib/foundry/scout/store.ts";
import { tasteBrief, tasteOf } from "../../lib/foundry/scout/taste.ts";
import { cellId, type Candidate, type IdeaCandidate, type Night } from "../../lib/foundry/scout/types.ts";
import { withWing } from "../../lib/foundry/scout/wingScope.ts";
import { __resetBudget } from "../../lib/imaging/budget.ts";
import { resetFakeLeonardoStudio } from "../../lib/imaging/providers/leonardoStudio.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };

beforeEach(() => {
  resetFakeLeonardoStudio();
  __resetBudget();
  process.env["LEONARDO_STUDIO_DRIVER"] = "fake";
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
afterAll(() => {
  delete process.env["LEONARDO_STUDIO_DRIVER"];
  rmSync(ROOT, { recursive: true, force: true });
});

const NEVER: CliPorts = {
  ideas: {
    generate: async () => {
      throw new Error("dry: no studio");
    },
    recognize: async () => {
      throw new Error("dry: no eye");
    },
  },
};

async function cli(argv: string[]): Promise<{ code: number; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: DRY, out: (s) => out.push(s), err: (s) => err.push(s), ports: NEVER });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, err: err.join("\n"), doc };
}

let seq = 0;
const batch = (body: unknown): string => {
  const p = path.join(ROOT, `b-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
};
const openMuse = async (): Promise<string> => String((await cli(["--wing", "muse", "open", "--json"])).doc["night"]);
const ideasOf = async (night: string): Promise<IdeaCandidate[]> => withWing("muse", async () => (await readNight(night)).candidates.filter((c): c is IdeaCandidate => c.kind === "idea"));

const card = (name: string) => ({ name, age: 34, look: "auburn bob, freckles, green wool coat", personality: "dry wit, never hurries" });
const brief = (title: string, o: Record<string, unknown> = {}) => ({
  title,
  target: "style",
  genre: "character poster",
  prompt: `A poster of a woman aged 34, ${title.toLowerCase()}, painterly finish, soft rim light.`,
  anchor: { kind: "watch", ref: "- look: painterly portraits" },
  app: "dating-sim",
  appTarget: "visual novel, first-meeting greeting card",
  aim: "extract a new artstyle: painterly finish",
  ...o,
});
const character = (name: string, look: string, o: Record<string, unknown> = {}) => brief(name, { target: "character", card: card(name), look, prompt: `${name}, aged 34, auburn bob, photoreal portrait.`, ...o });
const reason = (raw: unknown, wing: "scout" | "muse" = "scout"): string => {
  const r = parseIdeas(raw, wing);
  return r.ok ? "ok" : r.error.message;
};

describe("the brief's app, appTarget, aim and look", () => {
  it("stores use as <app>: <appTarget> beside app, aim and look, and omits look when absent", () => {
    const r = parseIdeas([brief("a", { look: "painterly-noir" }), brief("b")], "scout");
    expect(r.ok && r.value[0]).toMatchObject({ use: "dating-sim: visual novel, first-meeting greeting card", app: "dating-sim", aim: "extract a new artstyle: painterly finish", look: "painterly-noir" });
    expect(r.ok && r.value[1]).not.toHaveProperty("look");
  });

  it("refuses a free `use` key, an app off the list, a missing aim, a bad look slug, and an aim that is or holds the prompt", () => {
    expect(reason([brief("a", { use: "a beat for a slow reveal" })])).toMatch(/^idea 1: /);
    expect(reason([brief("a", { app: "billboard" })])).toMatch(/^idea 1: app: /);
    const { aim: _a, ...noAim } = brief("a");
    expect(reason([noAim])).toMatch(/^idea 1: aim: /);
    expect(reason([brief("a", { look: "Painterly Noir" })])).toMatch(/^idea 1: look: /);
    const b = brief("a");
    expect(reason([{ ...b, aim: b.prompt }])).toBe("idea 1: aim: the aim says why the run was chosen; it is not the image prompt");
    expect(reason([{ ...b, aim: `to see ${b.prompt} drawn` }])).toMatch(/^idea 1: aim: the aim says why/);
  });

  it("requires a look on a muse character, and scans appTarget and aim for youth and nudity words", () => {
    expect(reason([character("Mara Veil", "x", { look: undefined })], "muse")).toMatch(/^idea 1: look: a character idea names her look/);
    expect(reason([brief("a", { aim: "a teen look study" })], "muse")).toMatch(/^idea 1: aim: "teen" is a youth word/);
    expect(reason([brief("a", { appTarget: "nsfw pin-up" })], "muse")).toMatch(/^idea 1: appTarget: "nsfw" is a nudity or sexual word/);
  });
});

const idea = (id: string, over: Partial<IdeaCandidate>): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: id, target: "scene", prompt: "p", anchor: { kind: "free", ref: "" }, ...over });
const night = (id: string, candidates: Candidate[], committed?: { kept: string[]; rejected: string[] }): Night => ({
  id,
  startedAt: "2026-10-23T00:00:00.000Z",
  ceilingUsd: 2,
  target: 3,
  clipCap: 0,
  dry: false,
  state: committed === undefined ? "closed" : "committed",
  sources: [],
  candidates,
  jobs: [],
  ...(committed === undefined ? {} : { committed: { at: "2026-10-24T00:00:00.000Z", by: "op", kept: committed.kept, rejected: committed.rejected, reasons: {}, notes: {}, dry: false } }),
});
const mara = (id: string, look?: string, over: Partial<IdeaCandidate> = {}) => idea(id, { target: "character", card: card("Mara Veil"), ...(look === undefined ? {} : { look }), ...over });
const ask = (name: string, look: string) => ({ target: "character", card: { name }, look });

describe("the repeat guard", () => {
  it("refuses a card name seen before, case-blind, naming where and what became of her", () => {
    const old = night("2026-10-23", [mara("c-05", "painterly-soft-key")], { kept: [], rejected: [cellId("c-05", "board")] });
    expect(repeatRefusal([ask("mara veil", "new-look")], [old], "muse")).toBe("idea 1: card mara veil already drawn in 2026-10-23/c-05 (rejected)");
  });

  it("refuses a look seen before, and says undecided for a night with no verdict", () => {
    const old = night("2026-10-23", [mara("c-05", "painterly-soft-key")]);
    expect(repeatRefusal([ask("Ines", "painterly-soft-key")], [old], "muse")).toBe("idea 1: look painterly-soft-key already drawn in 2026-10-23/c-05 (undecided)");
  });

  it("lets a kept character come again, and a scene through; a failed earlier card never drew", () => {
    const kept = night("2026-10-23", [mara("c-05", "painterly-soft-key")], { kept: [cellId("c-05", "board")], rejected: [] });
    expect(repeatRefusal([ask("Mara Veil", "painterly-soft-key")], [kept], "muse")).toBeUndefined();
    const old = night("2026-10-23", [mara("c-05", "painterly-soft-key")]);
    expect(repeatRefusal([{ target: "scene" }], [old], "muse")).toBeUndefined();
    const failed = night("2026-10-23", [mara("c-05", "painterly-soft-key", { status: "failed" })]);
    expect(repeatRefusal([ask("Mara Veil", "painterly-soft-key")], [failed], "muse")).toBeUndefined();
  });

  it("catches a repeat inside the batch, and a legacy candidate with no look on her name alone", () => {
    expect(repeatRefusal([ask("Ines", "a-look"), ask("Ines", "b-look")], [], "muse")).toBe("idea 2: card Ines already drawn in idea 1 (this batch)");
    expect(repeatRefusal([ask("Ines", "a-look"), ask("Tove", "a-look")], [], "muse")).toBe("idea 2: look a-look already drawn in idea 1 (this batch)");
    const legacy = night("2026-10-22", [mara("c-01")]);
    expect(repeatRefusal([ask("Ines", "any-look")], [legacy], "muse")).toBeUndefined();
    expect(repeatRefusal([ask("Mara Veil", "any-look")], [legacy], "muse")).toMatch(/already drawn in 2026-10-22\/c-01/);
  });

  it("leaves the scout wing alone", () => {
    const old = night("2026-10-23", [mara("c-05", "painterly-soft-key")]);
    expect(repeatRefusal([ask("Mara Veil", "painterly-soft-key")], [old], "scout")).toBeUndefined();
  });
});

describe("the ideas act refuses a repeat with nothing written", () => {
  it("a later night repeating a card, a look, or a card twice in one batch writes no candidate", async () => {
    const first = await openMuse();
    const ok = await cli(["--wing", "muse", "ideas", first, "--json", batch([character("Mara Veil", "painterly-soft-key")])]);
    expect(ok.code, ok.err).toBe(0);
    expect((await ideasOf(first)).map((c) => [c.look, c.app, c.use])).toEqual([["painterly-soft-key", "dating-sim", "dating-sim: visual novel, first-meeting greeting card"]]);

    const second = await openMuse();
    const byCard = await cli(["--wing", "muse", "ideas", second, "--json", batch([brief("fine"), character("MARA VEIL", "other-look")])]);
    expect(byCard.code).toBe(1);
    expect(byCard.err).toBe(`idea 2: card MARA VEIL already drawn in ${first}/c-01 (undecided)`);
    const byLook = await cli(["--wing", "muse", "ideas", second, "--json", batch([character("Ines Roca", "painterly-soft-key")])]);
    expect(byLook.err).toBe(`idea 1: look painterly-soft-key already drawn in ${first}/c-01 (undecided)`);
    const twice = await cli(["--wing", "muse", "ideas", second, "--json", batch([character("Ines Roca", "a-look"), character("Ines Roca", "b-look")])]);
    expect(twice.err).toBe("idea 2: card Ines Roca already drawn in idea 1 (this batch)");
    expect(await ideasOf(second)).toEqual([]);

    const good = await cli(["--wing", "muse", "ideas", second, "--json", batch([character("Ines Roca", "a-look")])]);
    expect(good.code, good.err).toBe(0);
    const same = await cli(["--wing", "muse", "ideas", second, "--json", batch([character("Ines Roca", "c-look")])]);
    expect(same.err).toBe(`idea 1: card Ines Roca already drawn in ${second}/c-01 (undecided)`);
    expect(await ideasOf(second)).toHaveLength(1);
  });
});

describe("the taste brief", () => {
  it("names every muse character already drawn, decided or not, and the look beside each idea; a legacy idea reads", async () => {
    const md = await withWing("muse", () => tasteBrief());
    expect(md).toContain("## Already drawn");
    expect(md).toContain("- Mara Veil · look: painterly-soft-key (");
    expect(md).toContain("undecided)");
    const old = night("2026-10-23", [mara("c-05", "painterly-soft-key"), mara("c-06")], { kept: [], rejected: [cellId("c-05", "board"), cellId("c-06", "board")] });
    const taste = tasteOf([old]);
    expect(taste).toContain("[character · look: painterly-soft-key]");
    expect(taste).toContain('"c-06" [character]');
    expect(alreadyDrawn([old]).filter((l) => l.startsWith("- "))).toEqual(["- Mara Veil · look: painterly-soft-key (2026-10-23/c-05, rejected)", "- Mara Veil (2026-10-23/c-06, rejected)"]);
    expect(alreadyDrawn([])).toEqual(["## Already drawn", "", "- none yet", ""]);
  });
});
