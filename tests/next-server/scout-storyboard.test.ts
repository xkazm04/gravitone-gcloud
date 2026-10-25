// A KEPT IDEA'S STORYBOARD (spark scout-storyboards WP4a) - `pipeline/scout.mts storyboard` end to end, every
// store a temp directory set below before any lib/ module loads: the batch's door (each refusal its own
// case), the cap under the night's lock, the dry night's words-only rows, a scout-storyboard job on gpu.local
// driven with a fake frame engine (frames + seeds written, a failed panel kept to that panel, no frame at all
// is a loss), collect, the gate (`keptStoryboardFor`: kept, rejected, dry, an open part), `developedOf`
// ignoring storyboards, and the taste brief's two sections. No ComfyUI, no vendor, no network: fetch throws.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-storyboard-"));
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

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { get } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import { storyboardPlan, type StoryboardRequest } from "@gt/producers/scout-storyboard/define";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { developedOf } from "../../lib/foundry/scout/direction.ts";
import { collectStoryboards, keptStoryboardFor, parseStoryboards } from "../../lib/foundry/scout/storyboard.ts";
import { storyboardSections } from "../../lib/foundry/scout/storyboardKept.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../../lib/foundry/scout/store.ts";
import { tasteOf } from "../../lib/foundry/scout/taste.ts";
import { DEFAULT_STORYBOARD_CAP, type Candidate, type IdeaCandidate, type Night, type NightCommit, type StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { producers } from "../../lib/producers/registry.ts";
import { checkStoryboard, driveStoryboard, launchStoryboard } from "../../lib/producers/scoutStoryboard.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();
const LOC = path.join(ROOT, "kernel.sqlite");

const KEPT = "2026-09-20";
const DRYN = "2026-09-19";
const OPEN = "2026-09-18";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const idea = (id: string, o: Partial<IdeaCandidate> = {}): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `prompt of ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, ...o });

function seedNight(id: string, o: { dry: boolean; committed: boolean; candidates: Candidate[]; kept?: string[]; rejected?: string[] }): void {
  const dir = path.join(ROOT, "scout", id);
  mkdirSync(dir, { recursive: true });
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
    ...(o.committed ? { committed: { at: `${id}T08:00:00.000Z`, by: "operator", kept: o.kept ?? [], rejected: o.rejected ?? [], reasons: {}, notes: {}, dry: o.dry } } : {}),
  };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

beforeAll(() => {
  // Ten kept ideas (one a portrait, one grown from a seed), one rejected; a dry night's kept idea; an uncommitted night's idea.
  const ideas = ["c-01", "c-02", "c-03", "c-04", "c-05", "c-06", "c-07", "c-09", "c-10", "c-11"].map((id) => idea(id, id === "c-02" ? { aspect: "9:16" } : id === "c-03" ? { fromSeed: "2026-09-01/sd-004", use: "short: a cold open", app: "short" } : {}));
  seedNight(KEPT, { dry: false, committed: true, candidates: [...ideas, idea("c-08")], kept: ideas.map((c) => `${c.id}/board`), rejected: ["c-08/board"] });
  seedNight(DRYN, { dry: true, committed: true, candidates: [idea("c-01")], kept: ["c-01/board"] });
  seedNight(OPEN, { dry: false, committed: false, candidates: [idea("c-01")] });
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

async function cli(argv: string[], o: { env?: Record<string, string | undefined>; ports?: CliPorts } = {}): Promise<{ code: number; out: string; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: o.env ?? DRY, out: (s) => out.push(s), err: (s) => err.push(s), ...(o.ports === undefined ? {} : { ports: o.ports }) });
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
  const p = path.join(ROOT, `boards-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

const brief = (fromIdea: string, o: Record<string, unknown> = {}) => ({
  fromIdea,
  title: "The lantern that keeps three steps ahead",
  paragraph: "A watchman climbs after a lantern he never catches, until the top landing opens on the city.",
  bullets: ["beats: the lantern moves, the chase, the window", "format: a 30 s vertical short", "audience: adults who like quiet mysteries", "look: warm amber against cold slate"],
  panels: ["a watchman at the foot of a stairwell, a lantern three steps above", "the chase up the stairs, long shadow", "an open window over a night city"],
  ...o,
});

async function open(args: string[], env: Record<string, string | undefined>): Promise<string> {
  const r = await cli(["open", "--json", ...args], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const boardsOf = async (night: string): Promise<StoryboardCandidate[]> => (await readNight(night)).candidates.filter((c): c is StoryboardCandidate => c.kind === "storyboard");

/** A frame engine that draws a PNG for every prompt except those it is told to refuse. */
function engine(refuse: (prompt: string) => boolean = () => false): { ports: CliPorts; asked: { prompt: string; aspect: string; seed?: number }[] } {
  const asked: { prompt: string; aspect: string; seed?: number }[] = [];
  return {
    asked,
    ports: {
      storyboard: {
        draw: async (prompt, o) => {
          asked.push({ prompt, aspect: o.aspect, ...(o.seed === undefined ? {} : { seed: o.seed }) });
          if (refuse(prompt)) throw new Error("ComfyUI SamplerCustomAdvanced (node 11) failed: out of memory");
          return { png: PNG, seed: o.seed ?? 7 };
        },
      },
    },
  };
}

describe("the door - each refusal", () => {
  const at = (raw: unknown): string => {
    const r = parseStoryboards(raw);
    return r.ok ? "ok" : r.error.message;
  };
  const ref = `${KEPT}/c-01`;

  it("passes a good batch whole", () => expect(at([brief(ref), brief(`${KEPT}/c-02`)])).toBe("ok"));
  it("refuses more than five panels", () => expect(at([brief(ref, { panels: ["a", "b", "c", "d", "e", "f"] })])).toMatch(/^storyboard 1: panels: /));
  it("refuses no panel", () => expect(at([brief(ref, { panels: [] })])).toMatch(/^storyboard 1: panels: /));
  it("refuses fewer than three bullets", () => expect(at([brief(ref, { bullets: ["one", "two"] })])).toMatch(/^storyboard 1: bullets: /));
  it("refuses more than six bullets", () => expect(at([brief(ref, { bullets: ["1", "2", "3", "4", "5", "6", "7"] })])).toMatch(/^storyboard 1: bullets: /));
  it("refuses an over-long paragraph", () => expect(at([brief(ref, { paragraph: "x".repeat(481) })])).toMatch(/^storyboard 1: paragraph: /));
  it("refuses an over-long bullet", () => expect(at([brief(ref, { bullets: ["x".repeat(141), "b", "c"] })])).toMatch(/^storyboard 1: bullets\.0: /));
  it("refuses an over-long title", () => expect(at([brief(ref, { title: "x".repeat(91) })])).toMatch(/^storyboard 1: title: /));
  it("refuses a name in the panels, and reads the title and paragraph as the operator's words", () => {
    expect(at([brief(ref), brief(`${KEPT}/c-02`, { panels: ["a heist in the style of Studio Ghibli, by night."] })])).toBe('storyboard 2: the panels name "Studio" (a capital mid-sentence), "Ghibli" (a capital mid-sentence): craft, not content (no person, studio or franchise)');
    expect(at([brief(ref, { panels: ["a knight in armour from Gotham"] })])).toMatch(/^storyboard 1: the panels name "Gotham"/);
    expect(at([brief(ref, { title: "The Last Lighthouse Keeper", paragraph: "A 30 s YouTube Short about a keeper and her cat." })])).toBe("ok");
  });
  it("refuses a second brief for one idea in the batch, and a ref that is not an idea's", () => {
    expect(at([brief(ref), brief(ref)])).toBe(`storyboard 2: fromIdea: ${ref} is storyboard 1's too; one storyboard per idea`);
    expect(at([brief("not-a-ref")])).toMatch(/^storyboard 1: fromIdea: /);
    expect(at([])).toBe("storyboard: the batch holds no brief");
  });

  it("refuses, on the act, an idea that is not kept, a dry night's, an uncommitted night's - before a candidate exists", async () => {
    const night = await open([], DRY);
    const refused = async (ref: string): Promise<string> => {
      const r = await cli(["storyboard", night, "--json", file([brief(ref)])]);
      expect(r.code).toBe(1);
      return r.err;
    };
    expect(await refused(`${KEPT}/c-08`)).toContain(`storyboard 1: fromIdea: idea ${KEPT}/c-08: night ${KEPT} rejected c-08/board; only a kept idea is developed`);
    expect(await refused(`${DRYN}/c-01`)).toContain(`storyboard 1: fromIdea: idea ${DRYN}/c-01 is a dry night's`);
    expect(await refused(`${OPEN}/c-01`)).toContain(`storyboard 1: fromIdea: idea ${OPEN}/c-01: night ${OPEN} is closed: it has no verdicts yet`);
    expect(await boardsOf(night)).toEqual([]);
  });
});

describe("the door - a technique (spark scout-vision)", () => {
  const ref = `${KEPT}/c-01`;
  const technique = { claim: "Hold the reveal frame twice as long", quote: "the last shot sits for 48 frames", url: "https://example.com/reveal", template: "short-form-clip", step: "02-frames" };
  const at = (t: Record<string, unknown>): string => {
    const r = parseStoryboards([brief(ref, { technique: t })]);
    return r.ok ? "ok" : r.error.message;
  };

  it("takes a finding's shape, the template and step held to the finding door's rule", () => {
    expect(at(technique)).toBe("ok");
    expect(at({ ...technique, step: "frames" })).toBe("storyboard 1: technique.step: a step is NN-name (02-frames, 05-cut)");
    expect(at({ ...technique, template: "../up" })).toBe("storyboard 1: technique.template: a template is a knowledge/templates directory name");
    expect(at({ ...technique, url: "ftp://example.com/x" })).toBe("storyboard 1: technique.url: an http(s) page");
    expect(at({ ...technique, claim: "x".repeat(141) })).toMatch(/^storyboard 1: technique\.claim: /);
    expect(at({ ...technique, quote: "" })).toMatch(/^storyboard 1: technique\.quote: /);
    expect(at({ ...technique, evidence: "x" })).toMatch(/^storyboard 1: technique: /);
  });

  it("the act refuses a template with no knowledge/templates directory before a candidate exists; a good one rides on the candidate", async () => {
    const night = await open([], DRY);
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-11`, { technique: { ...technique, template: "no-such-template" } })])]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("storyboard 1: technique: there is no knowledge/templates/no-such-template/");
    expect(await boardsOf(night)).toEqual([]);
    const ok = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-11`, { technique })])]);
    expect(ok.code, ok.err).toBe(0);
    expect((await boardsOf(night))[0]?.technique).toEqual(technique);
  });
});

describe("a dry night - words only", () => {
  it("writes rendered storyboards with no frame and launches nothing; a second storyboard for the idea is refused", async () => {
    const night = await open([], DRY);
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-01`), brief(`${KEPT}/c-02`)])]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc).toMatchObject({ ok: true, jobIds: [], dry: true, storyboards: { used: 2, cap: DEFAULT_STORYBOARD_CAP } });
    expect(r.err).toContain("is dry: 2 storyboard(s) written as words only; no frame is drawn and nothing is launched");
    const [a, b] = await boardsOf(night);
    expect(a).toMatchObject({ id: "c-01", status: "rendered", images: [], fromIdea: `${KEPT}/c-01`, panels: brief("").panels });
    expect(a).not.toHaveProperty("jobId");
    expect(a).not.toHaveProperty("aspect");
    // The portrait idea draws 9:16.
    expect(b).toMatchObject({ id: "c-02", aspect: "9:16" });
    expect((await readNight(night)).jobs).toEqual([]);
    const again = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-01`)])]);
    expect(again.code).toBe(1);
    expect(again.err).toContain(`storyboard 1: idea ${KEPT}/c-01 already has storyboard ${night}/c-01 (rendered); one storyboard per idea, unless that one failed`);
    // From another night too.
    const other = await open([], DRY);
    const there = await cli(["storyboard", other, "--json", file([brief(`${KEPT}/c-02`)])]);
    expect(there.err).toContain(`already has storyboard ${night}/c-02`);
  });

  it("--collect on a night with nothing waiting says so; the muse wing has no storyboard command", async () => {
    const night = await open([], DRY);
    const r = await cli(["storyboard", night, "--collect", "--json"]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc).toMatchObject({ ok: true, night, candidates: [] });
    const muse = await cli(["storyboard", night, "--wing", "muse", "--json", file([brief(`${KEPT}/c-07`)])]);
    expect(muse.code).toBe(3);
    expect(muse.err).toMatch(/^storyboard is not in the muse wing/);
  });

  it("a batch over the night's cap says how many are left and writes nothing", async () => {
    const night = await open(["--storyboards", "1"], DRY);
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-03`), brief(`${KEPT}/c-04`)])]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(`night ${night} holds 0 of its 1 storyboards; 1 left, and the batch has 2 - nothing was drawn`);
    expect(await boardsOf(night)).toEqual([]);
  });

  it("the cap holds under the lock: two batches at once cannot both take the last place", async () => {
    const night = await open(["--storyboards", "1"], DRY);
    const [x, y] = await Promise.all([cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-05`)])]), cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-06`)])])]);
    expect([x.code, y.code].sort()).toEqual([0, 1]);
    expect(await boardsOf(night)).toHaveLength(1);
    expect([x.err, y.err].join("\n")).toContain("holds 1 of its 1 storyboards; 0 left");
  });
});

describe("a live night - the scout-storyboard job", () => {
  it("launches one job on gpu.local at $0 and drives it with the fake engine: frames and seeds written", async () => {
    const night = await open(["--live"], LIVE);
    const fake = engine();
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-03`)])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    expect(r.err).toMatch(/receipt \(live\): storyboard c-01 · 3 frame\(s\) on gpu\.local · comfyui · \$0 \(free: a local model\)/);
    const jobId = `job:scout-storyboard:${night}:c-01`;
    expect(r.doc).toMatchObject({ ok: true, jobIds: [jobId], outcome: "done" });
    const [c] = await boardsOf(night);
    expect(c).toMatchObject({ status: "rendered", jobId, fromSeed: "2026-09-01/sd-004", use: "short: a cold open", app: "short", images: [1, 2, 3].map((k) => `storyboards/c-01/panel-${k}.png`) });
    expect(c?.seeds).toEqual(fake.asked.map((a) => a.seed));
    expect(fake.asked.map((a) => [a.prompt, a.aspect])).toEqual(brief("").panels.map((p) => [p, "16:9"]));
    for (const k of [1, 2, 3]) expect(new Uint8Array(readFileSync(resolveInNight(night, `storyboards/c-01/panel-${k}.png`)))).toEqual(PNG);
    expect((await readNight(night)).jobs).toContain(jobId);
    const k = processKernel(LOC);
    if (!k.ok) throw k.error;
    const j = get(k.value.store, jobId as never);
    expect(j.ok && [j.value.job.producer, j.value.job.lane, j.value.job.state, j.value.job.ceilingUsd]).toEqual(["scout-storyboard", "gpu.local", "done", undefined]);
    const spent = k.value.store.read((rd) => rd.all("SELECT 1 AS x FROM spend_rows WHERE job_id = ?", jobId).length);
    expect(spent.ok && spent.value).toBe(0);
  });

  it("a panel the engine refuses is that panel's: its frame empty, its sentence kept, the storyboard rendered", async () => {
    const night = await open(["--live"], LIVE);
    const fake = engine((p) => p.startsWith("the chase"));
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-04`)])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    const [c] = await boardsOf(night);
    expect(c).toMatchObject({ status: "rendered", images: ["storyboards/c-01/panel-1.png", null, "storyboards/c-01/panel-3.png"], error: "panel 2: ComfyUI SamplerCustomAdvanced (node 11) failed: out of memory" });
    expect(existsSync(resolveInNight(night, "storyboards/c-01/panel-2.png"))).toBe(false);
  });

  it("no frame at all is a loss: failed, every panel's sentence joined", async () => {
    const night = await open(["--live"], LIVE);
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-09`, { panels: ["one frame", "two frame"] })])], { env: LIVE, ports: engine(() => true).ports });
    expect(r.code, r.err).toBe(0);
    const [c] = await boardsOf(night);
    expect(c).toMatchObject({ status: "failed", images: [null, null] });
    expect(c?.error).toBe("panel 1: ComfyUI SamplerCustomAdvanced (node 11) failed: out of memory; panel 2: ComfyUI SamplerCustomAdvanced (node 11) failed: out of memory");
  });

  it("--detach leaves the job queued; the worker's drive writes the frames, and collect settles what is still pending", async () => {
    const night = await open(["--live"], LIVE);
    const r = await cli(["storyboard", night, "--detach", "--json", file([brief(`${KEPT}/c-10`)])], { env: LIVE });
    expect(r.code, r.err).toBe(0);
    expect(r.doc).toMatchObject({ outcome: "detached" });
    const jobId = `job:scout-storyboard:${night}:c-01`;
    expect((await boardsOf(night))[0]).toMatchObject({ status: "pending", jobId });
    const k = openKernel(LOC);
    if (!k.ok) throw k.error;
    try {
      const d = await driveStoryboard(k.value.store, LOC, jobId, { dryOnly: false, engines: { draw: async (_p, o) => ({ png: PNG, seed: o.seed ?? 1 }) } });
      expect(d.ok && d.value.outcome).toBe("done");
      // The night as if the drive's ending had not been written: collect tells it from the kernel's record.
      await mutateNight(night, (n) => {
        const c = n.candidates.find((x): x is StoryboardCandidate => x.id === "c-01" && x.kind === "storyboard");
        return c === undefined ? n : withCandidate(n, { ...c, status: "pending" });
      });
      const got = await collectStoryboards(night, { store: k.value.store });
      expect(got.map((c) => [c.id, c.status, c.images?.length])).toEqual([["c-01", "rendered", 3]]);
      expect(await collectStoryboards(night, { store: k.value.store })).toEqual([]);
      // A launch for a storyboard that has its job answers with that job, never a second.
      const again = await launchStoryboard(k.value.store, { nightId: night, candidateId: "c-01" }, { mode: "live", actor: { kind: "operator", id: "t" }, dryOnly: false });
      expect(again.ok && again.value.kind).toBe("existing");
    } finally {
      k.value.close();
    }
  });

  it("is bound on gpu.local with the comfy engine; a resumed job plans only its missing panels; a dry or rendered board is not priced", async () => {
    const bound = producers();
    expect(bound.ok && bound.value.get("scout-storyboard@gpu.local" as never)?.engine).toBe("comfy");
    const req: StoryboardRequest = { nightId: "n", candidateId: "c-01", aspect: "16:9", panels: [{ prompt: "a", seed: 1 }, { prompt: "b", seed: 2 }], estimates: { panel: { seconds: 96, usd: 0 } }, by: "op" };
    expect(storyboardPlan(req, new Map([["panel:1", {} as never]])).map((s) => s.name)).toEqual(["panel:2"]);
    const n = (await readNight(KEPT)) as Night;
    const board: StoryboardCandidate = { id: "c-99", kind: "storyboard", sourceIds: [], status: "pending", fromIdea: `${KEPT}/c-01`, title: "t", paragraph: "p", bullets: ["a", "b", "c"], panels: ["x"] };
    const open = { ...n, state: "open" as const, committed: undefined, candidates: [...n.candidates, board] } as Night;
    expect(checkStoryboard(open, "c-99", "live")).toMatchObject({ ok: true });
    expect(checkStoryboard({ ...open, dry: true }, "c-99", "live")).toMatchObject({ ok: false });
    expect(checkStoryboard({ ...open, candidates: [...n.candidates, { ...board, status: "rendered" }] }, "c-99", "live")).toMatchObject({ ok: false, error: { message: "c-99 is already rendered" } });
  });
});

/* ── The gate, the brief, the graph's development rule (pure) ──────────────── */

const commit = (kept: string[], rejected: string[], o: Partial<NightCommit> = {}): NightCommit => ({ at: "2026-10-25T07:00:00.000Z", by: "op", kept, rejected, reasons: {}, notes: {}, dry: false, ...o });
const nightOf = (id: string, candidates: Candidate[], committed?: NightCommit, dry = false): Night => ({ id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry, state: committed === undefined ? "closed" : "committed", sources: [], candidates, jobs: [], ...(committed === undefined ? {} : { committed }) });
const sb = (id: string, fromIdea: string, o: Partial<StoryboardCandidate> = {}): StoryboardCandidate => ({ id, kind: "storyboard", sourceIds: [], status: "rendered", fromIdea, title: `board ${id}`, paragraph: `the vision of ${id}`, bullets: ["a", "b", "c"], panels: ["p"], ...o });
const REF = "2026-10-20/c-01";

describe("keptStoryboardFor - the gate", () => {
  const verdict = (k: string[], r: string[], o: Partial<NightCommit> = {}, dry = false) => keptStoryboardFor([nightOf("2026-10-21", [sb("c-02", REF)], commit(k, r, o), dry)], REF)?.candidate.id ?? null;

  it("kept when its words cell is kept, even with a frame rejected", () => {
    expect(verdict(["c-02/words"], ["c-02/panel-2"])).toBe("c-02");
  });
  it("kept when any cell is kept and none is rejected", () => {
    expect(verdict(["c-02/panel-1"], [])).toBe("c-02");
  });
  it("not kept when its words are rejected, or a frame is kept beside a rejected one", () => {
    expect(verdict(["c-02/panel-1"], ["c-02/words"])).toBeNull();
    expect(verdict(["c-02/panel-1"], ["c-02/panel-2"])).toBeNull();
    expect(verdict([], ["c-02/words"])).toBeNull();
  });
  it("not kept on a dry night, nor by a dry commit, nor uncommitted", () => {
    expect(verdict(["c-02/words"], [], {}, true)).toBeNull();
    expect(verdict(["c-02/words"], [], { dry: true })).toBeNull();
    expect(keptStoryboardFor([nightOf("2026-10-21", [sb("c-02", REF)])], REF)).toBeNull();
  });
  it("a night committed in parts counts its committed cells only: a cell still open is not kept", () => {
    expect(verdict([], [], { open: ["c-02/words", "c-02/panel-1"], parts: 1 })).toBeNull();
    expect(verdict(["c-02/panel-1"], [], { open: ["c-02/panel-1"], parts: 1 })).toBeNull();
    expect(verdict(["c-02/words"], [], { open: ["c-02/panel-1"], parts: 2 })).toBe("c-02");
  });
  it("names the night, and another idea's storyboard is not this one's", () => {
    const n = nightOf("2026-10-21", [sb("c-02", REF), sb("c-03", "2026-10-20/c-09")], commit(["c-02/words", "c-03/words"], []));
    expect(keptStoryboardFor([n], REF)).toMatchObject({ night: "2026-10-21", candidate: { id: "c-02" } });
    expect(keptStoryboardFor([n], "2026-10-20/c-77")).toBeNull();
  });
});

describe("developedOf and the taste brief", () => {
  const ideas = nightOf("2026-10-20", [idea("c-01", { title: "A lantern on the stairs", genre: "mystery short" }), idea("c-02", { title: "Cut-paper harbour" }), idea("c-03", { title: "A thrown one" })], commit(["c-01/board", "c-02/board"], ["c-03/board"]));
  const boards = nightOf("2026-10-21", [sb("c-01", "2026-10-20/c-01", { title: "The lantern that keeps three steps ahead", paragraph: "A watchman climbs after a lantern he never catches." })], commit(["c-01/words"], []));

  it("developedOf ignores a storyboard: its idea stays to develop", () => {
    expect(developedOf([ideas, boards]).has("2026-10-20/c-01")).toBe(false);
    const scene: Candidate = { id: "c-02", kind: "scene", sourceIds: [], status: "rendered", keyframes: [], replicas: [], fromIdea: "2026-10-20/c-01" };
    expect(developedOf([ideas, { ...boards, candidates: [...boards.candidates, scene] }]).get("2026-10-20/c-01")).toBe("2026-10-21/c-02");
  });

  it("developedOf ignores a failed candidate (spark scout-vision); a source brought in from the idea still develops it", () => {
    const failed: Candidate = { id: "c-02", kind: "scene", sourceIds: [], status: "failed", error: "replica 1: comfy answered 500", keyframes: [], replicas: [], fromIdea: "2026-10-20/c-01" };
    const tried = { ...boards, candidates: [...boards.candidates, failed] };
    expect(developedOf([ideas, tried]).has("2026-10-20/c-01")).toBe(false);
    expect(tasteOf([tried, ideas])).toContain("- 2026-10-20/c-01 · scene · mystery short · A lantern on the stairs");
    const brought: Night = { ...tried, sources: [{ id: "s-01", url: "idea:2026-10-20/c-01", kind: "image", title: "A lantern on the stairs", why: "kept idea", found: "idea", rights: "ours", fromIdea: "2026-10-20/c-01", status: "ingested", files: [] }] };
    expect(developedOf([ideas, brought]).get("2026-10-20/c-01")).toBe("2026-10-21/s-01");
  });

  it("lists the kept ideas with no storyboard yet, and the kept storyboards ready for full video", () => {
    const brief = tasteOf([boards, ideas]);
    const at = (h: string): string[] => {
      const lines = brief.split("\n");
      const i = lines.indexOf(h);
      const end = lines.findIndex((l, k) => k > i + 1 && l.startsWith("## "));
      return lines.slice(i + 2, end < 0 ? undefined : end).filter((l) => l !== "");
    };
    expect(at("## Storyboards to make")).toEqual(["- 2026-10-20/c-02 · scene · - · 16:9 · Cut-paper harbour", "  prompt of c-02"]);
    expect(at("## Ready for full video")).toEqual(["- 2026-10-20/c-01 · storyboard 2026-10-21/c-01 · The lantern that keeps three steps ahead", "  A watchman climbs after a lantern he never catches."]);
    // A storyboard stays off the to-develop list's reckoning: the idea it composes is still to develop.
    expect(at("## Ideas to develop")[0]).toBe("- 2026-10-20/c-01 · scene · mystery short · A lantern on the stairs");
    expect(brief).toContain("- kept: 1 storyboard");
  });

  it("a failed storyboard leaves its idea to make again; none says none", () => {
    const failed = nightOf("2026-10-21", [sb("c-01", "2026-10-20/c-01", { status: "failed", error: "panel 1: x" })]);
    expect(storyboardSections([ideas], [ideas, failed]).slice(0, 5)).toEqual(["## Storyboards to make", "", "- 2026-10-20/c-01 · scene · mystery short · 16:9 · A lantern on the stairs", "  prompt of c-01", "- 2026-10-20/c-02 · scene · - · 16:9 · Cut-paper harbour"]);
    expect(storyboardSections([], [])).toEqual(["## Storyboards to make", "", "- none", "", "## Ready for full video", "", "- none", ""]);
  });
});
