// A KILLED CODEX DRAW (review 2026-11-08 P2). Over fake binaries only: no live Codex, no paid call.
//   (a) a timed-out seat whose wrapper has a sleeping grandchild returns in bounded time, nothing left alive;
//   (b) a draw killed mid-board, then collected, reads rendered with its drawn panels, or failed, never pending;
//   (c) a live owner's board stays pending and untouched;
//   (d) after a failed settle the idea can be drawn again.
// A process death is staged by a draw engine that never answers, and the board's owner rewritten to a process that is gone.
// Every store is a temp directory set before any lib/ module loads.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-codex-recovery-"));
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

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hostname } from "node:os";

import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { runCodex } from "../../lib/foundry/scout/codexExec.ts";
import type { ActContext } from "../../lib/foundry/scout/acts.ts";
import { collectStoryboards, storyboardAct, type StoryboardEngines } from "../../lib/foundry/scout/storyboard.ts";
import { createNight, mutateNight, readNight, withCandidate } from "../../lib/foundry/scout/store.ts";
import type { StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { closeKernel } from "../../lib/kernelStore.ts";

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("a timed-out codex seat", { timeout: 60_000 }, () => {
  it("returns in bounded time and leaves no grandchild", async () => {
    const pidFile = path.join(ROOT, "grandchild.pid");
    const fake = path.join(ROOT, "fake-sleeper.mjs");
    writeFileSync(
      fake,
      `import { spawn } from "node:child_process"; import fs from "node:fs";
const g = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 25000)"], { stdio: "inherit" });
fs.writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
setTimeout(() => {}, 25000);
`,
    );
    const t0 = Date.now();
    const run = await runCodex("p", { timeoutS: 1, base: { ...process.env, ARTICLES_CODEX_BIN: `node|${fake}` } });
    const seconds = (Date.now() - t0) / 1000;
    console.log(`timed-out seat returned after ${seconds}s, exit ${String(run.exit)}`);
    expect(seconds).toBeLessThan(10);
    expect(existsSync(pidFile)).toBe(true);
    const gpid = Number(readFileSync(pidFile, "utf8"));
    await new Promise((r) => setTimeout(r, 500));
    expect(alive(gpid)).toBe(false);
    if (alive(gpid)) process.kill(gpid);
  });
});

const LOC = path.join(ROOT, "kernel.sqlite");
const opened = openKernel(LOC);
if (!opened.ok) throw opened.error;
const kern: Kernel = opened.value;
afterAll(() => kern.close());

const ctx: ActContext = { store: kern.store, location: LOC, actor: { kind: "operator", id: "op-test" }, dryOnly: false, live: true, detach: false, say: () => {} };

const loopIdea = (id: string): void => {
  mkdirSync(path.join(ROOT, "loop"), { recursive: true });
  writeFileSync(path.join(ROOT, "loop", `${id}.json`), JSON.stringify({ id, passed: true, predictedKeep: 0.5, bar: { value: 0.5 } }));
};
const brief = (id: string, panels: number) => ({ fromLoop: id, title: "The tide reads the ledger", paragraph: "A keeper logs a flood.", bullets: ["beats: rise, fall, ink", "format: a 40 s video", "look: ink and wash"], panels: Array.from({ length: panels }, (_, i) => `a lantern over dark water, shot ${i + 1}`) });
const ID = (n: number): string => `il-20261108-${String(n).padStart(3, "0")}`;

/** A Codex draw that answers for `drawn` panels and then never answers: the process is mid-board. */
const stalls = (drawn: number): StoryboardEngines => {
  let n = 0;
  return { drawnBy: "codex", draw: () => (n++ < drawn ? Promise.resolve({ png: new Uint8Array([1, 2, 3]), seed: 0 }) : new Promise(() => {})) };
};

let serial = 0;
const night = () => createNight({ dry: false, day: `2027-01-${String(++serial).padStart(2, "0")}` });
const board = async (nightId: string): Promise<StoryboardCandidate> => {
  const c = (await readNight(nightId)).candidates.find((x): x is StoryboardCandidate => x.kind === "storyboard");
  if (c === undefined) throw new Error("no board");
  return c;
};
async function waitFor(nightId: string, drawn: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const c = (await readNight(nightId)).candidates.find((x): x is StoryboardCandidate => x.kind === "storyboard");
    if ((c?.images ?? []).filter((f) => typeof f === "string").length >= drawn && c !== undefined) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("the draw never reached its panel");
}
/** The owner replaced by a process that is gone: this host, another boot id, a pid nothing holds. */
const killOwner = (nightId: string): Promise<unknown> =>
  mutateNight(nightId, (n) => {
    const c = n.candidates.find((x): x is StoryboardCandidate => x.kind === "storyboard");
    return c === undefined ? n : withCandidate(n, { ...c, owner: { bootId: "b-gone", pid: 2 ** 22 - 3, host: hostname() } });
  });

describe("a codex board whose draw died", { timeout: 60_000 }, () => {
  it("(c) stays pending and untouched while its owner is alive", async () => {
    loopIdea(ID(1));
    const n = await night();
    void storyboardAct(ctx, n.id, [brief(ID(1), 3)], stalls(1));
    await waitFor(n.id, 1);
    const before = await board(n.id);
    expect(before.status).toBe("pending");
    expect(before.owner?.pid).toBe(process.pid);
    expect(await collectStoryboards(n.id)).toEqual([]);
    expect(await board(n.id)).toEqual(before);
  });

  it("(b) reads rendered with its drawn panels once its owner is gone", async () => {
    loopIdea(ID(2));
    const n = await night();
    void storyboardAct(ctx, n.id, [brief(ID(2), 3)], stalls(2));
    await waitFor(n.id, 2);
    await killOwner(n.id);
    await collectStoryboards(n.id);
    const c = await board(n.id);
    expect(c.status).toBe("rendered");
    expect(c.images?.filter((f) => typeof f === "string")).toHaveLength(2);
    expect(c.owner).toBeUndefined();
    expect(c.jobId).toBeUndefined();
  });

  it("(b, d) reads failed with no panel, and the idea can then be drawn again", async () => {
    loopIdea(ID(3));
    const n = await night();
    void storyboardAct(ctx, n.id, [brief(ID(3), 3)], stalls(0));
    await waitFor(n.id, 0);
    expect((await board(n.id)).status).toBe("pending");
    // pending, the idea is held
    const held = await night();
    await expect(storyboardAct(ctx, held.id, [brief(ID(3), 1)], stalls(1))).rejects.toThrow(/already has storyboard/);
    await killOwner(n.id);
    await collectStoryboards(n.id);
    const c = await board(n.id);
    expect(c.status).toBe("failed");
    expect(c.error).toContain("ended before the board was finished");
    const again = await storyboardAct(ctx, held.id, [brief(ID(3), 1)], { drawnBy: "codex", draw: () => Promise.resolve({ png: new Uint8Array([9]), seed: 0 }) });
    expect(again.candidates[0]?.status).toBe("rendered");
  });
});

describe("a retry after a draw that died, with no --collect", { timeout: 60_000 }, () => {
  const again = (nightId: string, id: string) => storyboardAct(ctx, nightId, [brief(id, 1)], { drawnBy: "codex", draw: () => Promise.resolve({ png: new Uint8Array([9]), seed: 0 }) });

  it("(e) draws again on the same night", async () => {
    loopIdea(ID(5));
    const n = await night();
    void storyboardAct(ctx, n.id, [brief(ID(5), 3)], stalls(0));
    await waitFor(n.id, 0);
    await killOwner(n.id);
    const r = await again(n.id, ID(5));
    expect(r.candidates.at(-1)?.status).toBe("rendered");
    expect((await readNight(n.id)).candidates.filter((c) => c.kind === "storyboard" && c.status === "failed")).toHaveLength(1);
  });

  it("(f) draws again when the stranded board is on an earlier night", async () => {
    loopIdea(ID(6));
    const n = await night();
    void storyboardAct(ctx, n.id, [brief(ID(6), 3)], stalls(0));
    await waitFor(n.id, 0);
    await killOwner(n.id);
    const later = await night();
    const r = await again(later.id, ID(6));
    expect(r.candidates[0]?.status).toBe("rendered");
    expect((await board(n.id)).status).toBe("failed");
  });

  it("(g) a live owner still refuses the retry", async () => {
    loopIdea(ID(7));
    const n = await night();
    void storyboardAct(ctx, n.id, [brief(ID(7), 3)], stalls(0));
    await waitFor(n.id, 0);
    const later = await night();
    await expect(again(later.id, ID(7))).rejects.toThrow(/already has storyboard/);
    expect((await board(n.id)).status).toBe("pending");
  });

  it("(h) a stranded board with drawn panels settles to rendered and still holds its idea", async () => {
    loopIdea(ID(8));
    const n = await night();
    void storyboardAct(ctx, n.id, [brief(ID(8), 3)], stalls(2));
    await waitFor(n.id, 2);
    await killOwner(n.id);
    const later = await night();
    await expect(again(later.id, ID(8))).rejects.toThrow(/already has storyboard/);
    expect((await board(n.id)).status).toBe("rendered");
  });

  it("(i) a committed night holding a stranded board is not written, and the act does not throw", async () => {
    loopIdea(ID(9));
    loopIdea(ID(10));
    const n = await night();
    void storyboardAct(ctx, n.id, [brief(ID(9), 3)], stalls(0));
    await waitFor(n.id, 0);
    await killOwner(n.id);
    await mutateNight(n.id, (m) => ({ ...m, state: "committed" }));
    const before = await readNight(n.id);
    const later = await night();
    const r = await again(later.id, ID(10));
    expect(r.candidates[0]?.status).toBe("rendered");
    expect(await readNight(n.id)).toEqual(before);
    expect((await board(n.id)).status).toBe("pending");
  });
});
