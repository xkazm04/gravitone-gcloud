// A NIGHT'S IDEA ARTBOARDS (spark scout-idea-artboards WP-I2) - `pipeline/scout.mts ideas` end to
// end, every store a temp directory set below before any lib/ module loads: the batch's door, the
// night's idea cap, the scout-ideas job (dry: stand-ins, no router; live: the REAL router on the fake
// Leonardo studio, each generation deleted through the WP-I1 seam), one idea's failure kept to that
// idea, a dead studio failing the rest with its one sentence, and the stop rule's counts that ignore
// ideas. No vendor, no browser, no network: the fake studio records, and fetch throws.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-idea-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  // The router's own windows in memory; its plan with nothing but the studio named.
  process.env["SPEND_STORE"] = "memory";
  process.env["IMAGING_ENV"] = "dev";
  process.env["LOCAL_BINARIES"] = "off";
  for (const k of ["LEONARDO_API_KEY", "GOOGLE_AI_API_KEY", "OLLAMA_HOST", "LEONARDO_STUDIO_CDP"]) delete process.env[k];
  return dir;
});

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { armLive } from "@gt/kernel/dryrun";
import { enqueue } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";
import { ideasPlan, type IdeasRequest } from "@gt/producers/scout-ideas/define";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { closeAct } from "../../lib/foundry/scout/acts.ts";
import { blocking, doctor, doctorLine } from "../../lib/foundry/scout/doctor.ts";
import { nightBudget } from "../../lib/foundry/scout/budget.ts";
import { parseIdeas } from "../../lib/foundry/scout/idea.ts";
import { mutateNight, readNight, resolveInNight, summarise } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate } from "../../lib/foundry/scout/types.ts";
import { ImagingError } from "../../lib/imaging/errors.ts";
import { producers } from "../../lib/producers/registry.ts";
import { driveIdeas } from "../../lib/producers/scoutIdea.ts";
import { __resetBudget } from "../../lib/imaging/budget.ts";
import { FAKE_LEONARDO_STUDIO, resetFakeLeonardoStudio } from "../../lib/imaging/providers/leonardoStudio.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
/** A live shell for the fake studio only: the router, the meter and the kernel run live, and the studio is a fake. */
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();
const LOC = path.join(ROOT, "kernel.sqlite");

/** Fails the test on any engine call: a dry job asks none. */
const NEVER: CliPorts = {
  ideas: {
    generate: async () => {
      throw new Error("a dry ideas job called the studio");
    },
  },
};

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
function batch(body: unknown): string {
  const p = path.join(ROOT, `ideas-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

const idea = (title: string, o: Record<string, unknown> = {}) => ({
  title,
  target: "scene",
  genre: "animated short",
  prompt: `A rough artboard: ${title.toLowerCase()}, loose gouache thumbnail, wide frame, one figure small against the ground.`,
  anchor: { kind: "watch", ref: "- tag: gouache thumbnails" },
  app: "short",
  appTarget: "animated short cold open",
  aim: "extract a new artstyle from gouache thumbnails",
  ...o,
});
const THREE = [idea("Lantern fishers at low tide"), idea("Salt flats under a green dusk", { target: "style", anchor: { kind: "gap", ref: "palette: dusk greens" } }), idea("Moth-wing shield", { target: "asset3d", anchor: { kind: "free", ref: "" }, app: "videogame", appTarget: "a mobile game's armoury screen" })];

async function open(args: string[] = [], env: Record<string, string | undefined> = DRY): Promise<string> {
  const r = await cli(["open", "--json", ...args], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const ideasOf = async (night: string): Promise<IdeaCandidate[]> => (await readNight(night)).candidates.filter((c): c is IdeaCandidate => c.kind === "idea");

describe("the batch's door", () => {
  it("names the first bad brief's place and reason, and passes a good batch whole", () => {
    expect(parseIdeas(THREE).ok).toBe(true);
    const at = (raw: unknown): string => {
      const r = parseIdeas(raw);
      return r.ok ? "ok" : r.error.message;
    };
    expect(at([THREE[0], { ...THREE[1], target: "poster" }])).toMatch(/^idea 2: target: /);
    expect(at([idea("x".repeat(91))])).toMatch(/^idea 1: title: /);
    expect(at([idea("a"), idea("b", { anchor: { kind: "gap", ref: "  " } })])).toBe("idea 2: anchor.ref: a watch or gap anchor quotes its watchlist line or registry gap in `ref`");
    expect(at([idea("a", { colour: "red" })])).toMatch(/^idea 1: /);
    // A new brief names its genre (WP-I4a), one line; the first batch's candidates hold none and stay valid.
    const { genre: _g, ...bare } = idea("a");
    expect(at([idea("b"), bare])).toMatch(/^idea 2: genre: /);
    expect(at([idea("a", { genre: "  " })])).toMatch(/^idea 1: genre: /);
    expect(at([idea("a", { genre: "g".repeat(81) })])).toMatch(/^idea 1: genre: /);
    expect(at([idea("a", { genre: "music\nvideo" })])).toBe("idea 1: genre: one line");
    const parsed = parseIdeas([idea("a", { genre: " music video " })]);
    expect(parsed.ok && parsed.value[0]?.genre).toBe("music video");
    expect(at({ title: "not a list" })).toMatch(/^ideas: the input is a JSON array/);
    expect(at([])).toBe("ideas: the batch holds no brief");
  });

  it("a resumed job plans only the ideas it has not booked", () => {
    const req: IdeasRequest = { nightId: "2026-10-23", ideas: [1, 2, 3].map((k) => ({ candidateId: `c-0${k}`, prompt: "p" })), estimates: { idea: { seconds: 45, usd: null, unpricedReason: "studio credits, prepaid" } }, by: "op" };
    expect(ideasPlan(req, new Map([["idea:1", { step: "idea:1", value: {}, at: "2026-10-23T00:00:00.000Z" }]])).map((s) => s.name)).toEqual(["idea:2", "idea:3"]);
    expect(ideasPlan(req, new Map()).every((s) => s.credit === "studio credits, prepaid")).toBe(true);
  });
});

describe("a dry night draws stand-ins", () => {
  it("open records the idea cap; a batch becomes idea candidates drawn as OUR pictures, no studio asked", async () => {
    const r0 = await cli(["open", "--json"]);
    expect(r0.doc["ideaCap"]).toBe(25);
    const night = String(r0.doc["night"]);
    const r = await cli(["ideas", night, "--json", batch(THREE)], { ports: NEVER });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["outcome"]).toBe("done");
    expect(r.doc["jobId"]).toBe(`job:scout-ideas:${night}:c-01`);
    expect(r.doc["ideas"]).toEqual({ used: 3, cap: 25 });
    expect(r.err).toMatch(/receipt \(dry\): ideas c-01\.\.c-03 · 3 artboard\(s\) on box\.chrome · leonardo-studio · unpriced \(studio credits, prepaid\)/);
    const ideas = await ideasOf(night);
    expect(ideas.map((c) => [c.id, c.status, c.image, c.target, c.sourceIds])).toEqual([
      ["c-01", "rendered", "ideas/c-01.png", "scene", []],
      ["c-02", "rendered", "ideas/c-02.png", "style", []],
      ["c-03", "rendered", "ideas/c-03.png", "asset3d", []],
    ]);
    expect(ideas[2]).toMatchObject({ anchor: { kind: "free", ref: "" }, use: "videogame: a mobile game's armoury screen", app: "videogame", aim: "extract a new artstyle from gouache thumbnails", prompt: THREE[2]?.prompt, genre: "animated short" });
    for (const c of ideas) expect(readFileSync(resolveInNight(night, c.image ?? "")).subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(FAKE_LEONARDO_STUDIO.calls).toEqual([]);
    expect((await readNight(night)).jobs).toEqual([`job:scout-ideas:${night}:c-01`]);
    const status = await cli(["status", night, "--json"]);
    expect(status.doc["ideas"]).toEqual({ used: 3, cap: 25 });
  });

  it("closeAct and the summary count the plan's rows, never the ideas", async () => {
    const night = await open(["--target", "2"]);
    expect((await cli(["ideas", night, "--json", batch(THREE)], { ports: NEVER })).code).toBe(0);
    const n = await readNight(night);
    expect(summarise(n)).toMatchObject({ rendered: 0, failed: 0, pending: 0 });
    const k = openKernel(LOC);
    if (!k.ok) throw k.error;
    try {
      const m = await closeAct({ store: k.value.store }, night);
      expect(m.stop).toBe("sources-exhausted");
      expect(m.byKind["idea"]).toEqual({ pending: 0, rendered: 3, failed: 0 });
    } finally {
      k.value.close();
    }
  });
});

describe("--detach", () => {
  it("leaves the batch's job queued for the worker, which carries scout-ideas on box.chrome and draws it", async () => {
    const night = await open();
    const r = await cli(["ideas", night, "--json", batch(THREE.slice(0, 2)), "--detach"], { ports: NEVER });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["outcome"]).toBe("detached");
    const jobId = `job:scout-ideas:${night}:c-01`;
    expect((await ideasOf(night)).map((c) => [c.status, c.jobId])).toEqual([
      ["pending", jobId],
      ["pending", jobId],
    ]);
    const bound = producers();
    expect(bound.ok && bound.value.has("scout-ideas@box.chrome")).toBe(true);
    const k = openKernel(LOC);
    if (!k.ok) throw k.error;
    try {
      const d = await driveIdeas(k.value.store, LOC, jobId, { dryOnly: true });
      expect(d.ok && d.value.outcome).toBe("done");
    } finally {
      k.value.close();
    }
    expect((await ideasOf(night)).map((c) => c.status)).toEqual(["rendered", "rendered"]);
  });
});

describe("refusals, before anything is written", () => {
  it("a bad brief refuses the whole batch", async () => {
    const night = await open();
    const r = await cli(["ideas", night, "--json", batch([THREE[0], { ...THREE[1], target: "poster" }])], { ports: NEVER });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^idea 2: target: /);
    const t = await cli(["ideas", night, "--json", batch([idea("y".repeat(120))])], { ports: NEVER });
    expect(t.err).toMatch(/^idea 1: title: /);
    expect((await readNight(night)).candidates).toEqual([]);
  });

  it("a batch over the night's idea cap says how many are left", async () => {
    const night = await open(["--ideas", "4"]);
    expect((await cli(["ideas", night, "--json", batch(THREE)], { ports: NEVER })).code).toBe(0);
    const r = await cli(["ideas", night, "--json", batch(THREE.slice(0, 2))], { ports: NEVER });
    expect(r.code).toBe(1);
    expect(r.err).toBe(`night ${night} holds 3 of its 4 ideas; 1 left, and the batch has 2 - nothing was drawn`);
    expect(await ideasOf(night)).toHaveLength(3);
    expect((await cli(["open", "--ideas", "41"])).code).toBe(2);
  });

  it("a closed night draws nothing", async () => {
    const night = await open();
    expect((await cli(["close", night])).code).toBe(0);
    const r = await cli(["ideas", night, "--json", batch(THREE)], { ports: NEVER });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(new RegExp(`^night ${night} is closed`));
    expect((await readNight(night)).candidates).toEqual([]);
  });
});

describe("a live night, on the fake studio", () => {
  it("draws every idea through the router, deletes each studio generation once, and books it uncapped", async () => {
    const night = await open(["--live"], LIVE);
    const r = await cli(["ideas", night, "--json", batch(THREE)], { env: LIVE });
    expect(r.code, r.err).toBe(0);
    expect(r.err).toMatch(/receipt \(live\): ideas c-01\.\.c-03/);
    const ideas = await ideasOf(night);
    expect(ideas.map((c) => [c.status, c.image])).toEqual([
      ["rendered", "ideas/c-01.png"],
      ["rendered", "ideas/c-02.png"],
      ["rendered", "ideas/c-03.png"],
    ]);
    for (const c of ideas) expect(existsSync(resolveInNight(night, c.image ?? ""))).toBe(true);
    expect(FAKE_LEONARDO_STUDIO.calls.map((x) => [x.prompt, x.aspect])).toEqual(THREE.map((i) => [i.prompt, "16:9"]));
    expect(FAKE_LEONARDO_STUDIO.deletes).toEqual(["fake-gen-0001", "fake-gen-0002", "fake-gen-0003"]);
    const k = openKernel(LOC);
    if (!k.ok) throw k.error;
    try {
      const jobId = `job:scout-ideas:${night}:c-01`;
      // Studio credits are booked unpriced, with the reason and the credits; no dollar row reaches the ceiling.
      const rows = k.value.store.read((x) => ({ priced: x.all("SELECT axes FROM spend_rows WHERE job_id = ?", jobId), unpriced: x.all("SELECT reason FROM spend_unpriced WHERE job_id = ?", jobId) }));
      if (!rows.ok) throw rows.error;
      expect(rows.value.priced).toEqual([]);
      expect(rows.value.unpriced.map((row) => row["reason"])).toEqual(Array(3).fill("leonardo-studio bills studio credits, prepaid (8 for this artboard)"));
      const b = nightBudget(k.value.store, await readNight(night));
      expect(b.ok && b.value).toMatchObject({ settledUsd: 0, heldUsd: 0, remainingUsd: 15 });
    } finally {
      k.value.close();
    }
  });

  it("one idea the studio refuses fails with its sentence verbatim; the batch draws the rest", async () => {
    const night = await open(["--live"], LIVE);
    FAKE_LEONARDO_STUDIO.failWith = (p) => (p.includes("salt flats") ? "Leonardo declined this prompt: content filter" : null);
    const r = await cli(["ideas", night, "--json", batch(THREE)], { env: LIVE });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["outcome"]).toBe("done");
    expect((await ideasOf(night)).map((c) => [c.status, c.error])).toEqual([
      ["rendered", undefined],
      ["failed", "Leonardo declined this prompt: content filter"],
      ["rendered", undefined],
    ]);
    expect(FAKE_LEONARDO_STUDIO.calls).toHaveLength(3);
    expect(FAKE_LEONARDO_STUDIO.deletes).toEqual(["fake-gen-0001", "fake-gen-0002"]);
  });

  it("a signed-out studio fails the remaining ideas with its one sentence, asked once", async () => {
    const night = await open(["--live"], LIVE);
    let asked = 0;
    const signedOut: CliPorts = {
      ideas: {
        generate: async () => {
          asked++;
          throw new ImagingError("not signed in to leonardo", "no-key", "leonardo-studio");
        },
      },
    };
    const r = await cli(["ideas", night, "--json", batch(THREE)], { env: LIVE, ports: signedOut });
    expect(r.code).toBe(1);
    expect(asked).toBe(1);
    expect((await ideasOf(night)).map((c) => [c.status, c.error])).toEqual(Array(3).fill(["failed", "not signed in to leonardo"]));
  });

  it("a night with no Gemini left still draws its ideas: the batch is unpriced and never refused for money", async () => {
    const night = await open(["--live"], LIVE);
    const k = openKernel(LOC);
    if (!k.ok) throw k.error;
    try {
      const arm = armLive({ kind: "operator", id: "op-test" }, new Date().toISOString(), "scout idea test", { dryOnly: false });
      if (!arm.ok) throw arm.error;
      const held = enqueue(k.value.store, { id: `job:run:scout-idea-hold-${night}`, of: { kind: "run", id: `hold-${night}` }, producer: "scout-scene", lane: "cloud.google", mode: arm.value, ceilingUsd: 15 }, { kind: "operator", id: "op-test" });
      if (!held.ok) throw held.error;
      await mutateNight(night, (n) => ({ ...n, jobs: [...n.jobs, held.value.id] }));
      const b = nightBudget(k.value.store, await readNight(night));
      expect(b.ok && b.value.remainingUsd).toBe(0);
    } finally {
      k.value.close();
    }
    const r = await cli(["ideas", night, "--json", batch(THREE.slice(0, 1))], { env: LIVE });
    expect(r.code, r.err).toBe(0);
    expect((await ideasOf(night)).map((c) => c.status)).toEqual(["rendered"]);
  });
});

describe("doctor, the studio", () => {
  const base = { env: {}, storePath: ":memory:", scoutRoot: path.join(ROOT, "scout"), dry: false, spawn: async () => ({ ok: true as const, stdout: Buffer.from("tool 9.9"), stderr: "" }), keyFetch: async () => ({ ok: true, status: 200, text: async () => "{}" }) };
  const studioLine = async (studio: () => Promise<{ ok: boolean; reason?: string }>) => {
    const checks = await doctor({ ...base, studio });
    const c = checks.find((x) => x.name === "studio");
    return { line: c === undefined ? "absent" : doctorLine(c), blocked: blocking(checks).some((x) => x.name === "studio") };
  };

  it("reads ok when the studio is ready, and a note - never a failure - with its reason when not", async () => {
    expect(await studioLine(async () => ({ ok: true }))).toEqual({ line: "ok   studio              leonardo studio signed in, with credits", blocked: false });
    const down = await studioLine(async () => ({ ok: false, reason: "leonardo studio browser not running" }));
    expect(down.line).toMatch(/^note studio +leonardo studio browser not running -> the night's stills are drawn there by default \(SCOUT_REPLICA_GENERATOR\): set LEONARDO_STUDIO_CDP/);
    expect(down.blocked).toBe(false);
  });

  it("by default asks the provider's health, which names the missing variable and launches nothing", async () => {
    delete process.env["LEONARDO_STUDIO_DRIVER"];
    const checks = await doctor(base);
    expect(checks.find((x) => x.name === "studio")).toMatchObject({ ok: false, needed: false, found: "leonardo studio is not configured (LEONARDO_STUDIO_CDP is unset)" });
  });
});
