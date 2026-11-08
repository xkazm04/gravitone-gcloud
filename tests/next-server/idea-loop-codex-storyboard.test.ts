// `scout storyboard --draw codex` over a FAKE codex binary: the file on disk decides a panel, a failed panel stays
// failed and Flux is never reached, nothing goes through a job, and the key-shaped environment never reaches the child.
// Every store is a temp directory set before any lib/ module loads.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-idea-loop-codex-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["SCOUT_CHANNELS_DIR"] = path.join(dir, "scout-channels");
  process.env["SCOUT_SEED_STORE_DIR"] = path.join(dir, "seeds");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["STRIPS_STORE_DIR"] = path.join(dir, "strips");
  process.env["IDEA_LOOP_STORE_DIR"] = path.join(dir, "loop");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  process.env["SPEND_STORE"] = "memory";
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

const flux = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../../lib/imaging/local/flux2.ts", async (orig) => ({
  ...(await orig<typeof import("../../lib/imaging/local/flux2.ts")>()),
  drawFlux: async () => {
    flux.calls++;
    throw new Error("flux must not be reached");
  },
}));

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { closeWith, Refusal, type ActContext } from "../../lib/foundry/scout/acts.ts";
import { codexDraw } from "../../lib/foundry/scout/codexDraw.ts";
import { inspectPng } from "../../lib/foundry/scout/codexExec.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { storyboardAct, type StoryboardEngines } from "../../lib/foundry/scout/storyboard.ts";
import { createNight, readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import { openFlow } from "./decision-v1-harness.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const FAKE = path.join(ROOT, "fake-codex.mjs");
const CALLS = path.join(ROOT, "calls.jsonl");
const SCRIPT = path.join(ROOT, "script.json");

// What each call does, in order: ok, blank, refuse (exit 0, no image), fail (exit 3).
writeFileSync(
  FAKE,
  `import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import crypto from "node:crypto";
const dir = ${JSON.stringify(ROOT)};
const script = JSON.parse(fs.readFileSync(dir + "/script.json", "utf8"));
const n = fs.existsSync(dir + "/calls.jsonl") ? fs.readFileSync(dir + "/calls.jsonl", "utf8").split("\\n").filter(Boolean).length : 0;
const mode = script[n] ?? "ok";
const thread = "t-" + n;
fs.appendFileSync(dir + "/calls.jsonl", JSON.stringify({ mode, keys: Object.keys(process.env).filter((k) => /KEY|^OPENAI/i.test(k)) }) + "\\n");
fs.readFileSync(0);
function chunk(type, body) { const crcTable = (c) => { for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }; let c = 0xffffffff; for (const b of Buffer.concat([Buffer.from(type), body])) c = crcTable((c ^ b) & 255) ^ (c >>> 8); const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const crc = Buffer.alloc(4); crc.writeUInt32BE((c ^ 0xffffffff) >>> 0); return Buffer.concat([len, Buffer.from(type), body, crc]); }
function png(noisy) { const w = 300, h = 300; const raw = Buffer.alloc((w * 3 + 1) * h, 90); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; if (noisy) crypto.randomFillSync(raw, y * (w * 3 + 1) + 1, w * 3); } const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); }
console.log(JSON.stringify({ type: "thread.started", thread_id: thread }));
if (mode === "fail") { console.error("usage limit reached"); process.exit(3); }
if (mode === "refuse") { console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "I saved the image." } })); process.exit(0); }
const out = path.join(process.env.CODEX_HOME, "generated_images", thread); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "ig_0.png"), png(mode === "ok"));
console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "DONE" } }));
`,
);

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const calls = (): { mode: string; keys: string[] }[] => (existsSync(CALLS) ? readFileSync(CALLS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { mode: string; keys: string[] }) : []);

let serial = 0;

beforeEach(() => {
  rmSync(CALLS, { force: true });
  rmSync(path.join(ROOT, "codex-home"), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "codex-home"), { recursive: true });
  process.env["ARTICLES_CODEX_BIN"] = `node|${FAKE}`;
  process.env["CODEX_HOME"] = path.join(ROOT, "codex-home");
  process.env["OPENAI_API_KEY"] = "sk-must-not-reach";
  process.env["ANTHROPIC_KEY_LANE_X"] = "must-not-reach";
  flux.calls = 0;
});

async function withKernel<T>(fn: (k: Kernel) => Promise<T>): Promise<T> {
  const k = openKernel(LOC);
  if (!k.ok) throw k.error;
  try {
    return await fn(k.value);
  } finally {
    k.value.close();
  }
}

const ctxOf = (k: Kernel, over: Partial<ActContext> = {}): ActContext => ({ store: k.store, location: LOC, actor: { kind: "operator", id: "op-test" }, dryOnly: false, live: true, detach: false, say: () => {}, ...over });

const loopIdea = (id: string, passed: boolean): void => {
  mkdirSync(path.join(ROOT, "loop"), { recursive: true });
  writeFileSync(path.join(ROOT, "loop", `${id}.json`), JSON.stringify({ id, passed, predictedKeep: passed ? 0.5 : 0.2, bar: { value: 0.5 } }));
};

const brief = (id: string, panels: number, o: Record<string, unknown> = {}) => ({ fromLoop: id, title: "The tide reads the ledger", paragraph: "A keeper logs a flood.", bullets: ["beats: rise, fall, ink", "format: a 40 s video", "look: ink and wash"], panels: Array.from({ length: panels }, (_, i) => `a lantern over dark water, shot ${i + 1}`), ...o });

const codex = (): StoryboardEngines => ({ draw: codexDraw(), drawnBy: "codex" });

async function night(dry = false) {
  serial++;
  return createNight({ dry, day: `2026-12-${String(serial).padStart(2, "0")}` });
}

const ID = (n: number): string => `il-20261108-${String(n).padStart(3, "0")}`;

describe("a codex-drawn storyboard of a passing idea", { timeout: 60_000 }, () => {
  it("draws every panel from the file on disk, with no job, no Flux and no key in the child", async () => {
    writeFileSync(SCRIPT, JSON.stringify(["ok", "ok", "ok"]));
    loopIdea(ID(1), true);
    const n = await night();
    const r = await withKernel((k) => storyboardAct(ctxOf(k), n.id, [brief(ID(1), 3)], codex()));
    expect(r.jobIds).toEqual([]);
    expect(r.outcome).toBe("done");
    const c = r.candidates[0];
    expect(c).toMatchObject({ status: "rendered", fromIdea: `idea-loop/${ID(1)}`, seeds: [0, 0, 0] });
    expect(c?.jobId).toBeUndefined();
    expect(c?.images).toHaveLength(3);
    for (const f of c?.images ?? []) expect(inspectPng(readFileSync(resolveInNight(n.id, String(f)))).width).toBe(300);
    expect(calls().map((x) => x.mode)).toEqual(["ok", "ok", "ok"]);
    expect(calls().flatMap((x) => x.keys)).toEqual([]);
    expect(flux.calls).toBe(0);
  });

  it("reaches the Board as frame cells, naming its idea-loop record and no undefined", async () => {
    writeFileSync(SCRIPT, JSON.stringify(["ok", "ok"]));
    loopIdea(ID(5), true);
    const n = await night();
    await withKernel((k) => storyboardAct(ctxOf(k), n.id, [brief(ID(5), 2)], codex()));
    await closeWith(n.id, "sources-exhausted", new Date());
    const flow = await openFlow(scoutAdapter, n.id, path.join(ROOT, "blobs"));
    expect(flow.plan.packet.items.map((c) => c.id)).toEqual(expect.arrayContaining(["c-01/panel-1", "c-01/panel-2"]));
    expect(flow.plan.packet.items.length).toBeGreaterThan(2);
    expect(JSON.stringify(flow.plan)).not.toContain("idea: undefined");
  });

  it("records a failed panel as failed: a refusal that exited 0, a blank image and a non-zero exit, with no fallback", async () => {
    writeFileSync(SCRIPT, JSON.stringify(["refuse", "ok", "blank", "fail"]));
    loopIdea(ID(2), true);
    const n = await night();
    const r = await withKernel((k) => storyboardAct(ctxOf(k), n.id, [brief(ID(2), 4)], codex()));
    const c = r.candidates[0];
    expect(c?.status).toBe("rendered");
    expect(c?.images?.map((f) => f !== null)).toEqual([false, true, false, false]);
    expect(c?.error).toContain("panel 1: codex exited 0 with no image");
    expect(c?.error).toContain("panel 3: blank");
    expect(c?.error).toContain("panel 4: codex exited 3");
    expect(calls()).toHaveLength(4);
    expect(flux.calls).toBe(0);
  });

  it("fails the storyboard when no panel drew, and reports failed", async () => {
    writeFileSync(SCRIPT, JSON.stringify(["refuse", "refuse"]));
    loopIdea(ID(3), true);
    const n = await night();
    const r = await withKernel((k) => storyboardAct(ctxOf(k), n.id, [brief(ID(3), 2)], codex()));
    expect(r.outcome).toBe("failed");
    expect(r.candidates[0]?.status).toBe("failed");
    expect(flux.calls).toBe(0);
  });

  it("draws nothing on a dry night", async () => {
    writeFileSync(SCRIPT, JSON.stringify([]));
    loopIdea(ID(4), true);
    const n = await night(true);
    const r = await withKernel((k) => storyboardAct(ctxOf(k, { live: false }), n.id, [brief(ID(4), 2)], codex()));
    expect(r.dry).toBe(true);
    expect(r.candidates[0]?.images).toEqual([]);
    expect(calls()).toEqual([]);
  });
});

describe("the door", { timeout: 60_000 }, () => {
  const refused = async (input: unknown[], engines: StoryboardEngines, over: Partial<ActContext> = {}): Promise<string> => {
    const n = await night();
    try {
      await withKernel((k) => storyboardAct(ctxOf(k, over), n.id, input, engines));
    } catch (e) {
      expect(e).toBeInstanceOf(Refusal);
      expect((await readNight(n.id)).candidates).toEqual([]);
      return (e as Error).message;
    }
    throw new Error("not refused");
  };

  it("refuses an idea-loop idea without --draw codex, one that did not pass, and one that does not exist", async () => {
    loopIdea(ID(10), true);
    loopIdea(ID(11), false);
    expect(await refused([brief(ID(10), 2)], {})).toContain("only with --draw codex");
    expect(await refused([brief(ID(11), 2)], codex())).toContain("did not clear the bar");
    expect(await refused([brief(ID(12), 2)], codex())).toContain("no idea-loop idea");
  });

  it("refuses --detach, a genre and a cast: each would reach Flux, a clip or a reference path", async () => {
    loopIdea(ID(13), true);
    expect(await refused([brief(ID(13), 2)], codex(), { detach: true })).toContain("--detach");
    expect(await refused([brief(ID(13), 2, { genre: "gn-abc" })], codex())).toContain("takes no genre");
    expect(await refused([brief(ID(13), 2, { cast: ["Ines Roca"] })], codex())).toContain("takes no cast");
    expect(calls()).toEqual([]);
  });
});
