// THE SONG LAB ON THE AGENT DOOR (spark yue2-song-lab WP3; app/_server/mcp/tools/songlab.ts): the four
// ops live in their own `songlab` family and NO tool, in either projection, records a verdict - blind
// votes are the owner's. Through the JSON-RPC layer over a temp kernel and sound store: a launch with
// only style + lyrics enqueues a yue2-render job on the measured recipe as the agent (origin `agent`), a
// post launches a chain, queue_pairs answers pair and job ids without saying which take plays as A,
// and the takes listing carries the rights line. lib/yue2/ab.ts is WP4's: faked at its module seam.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-yue2-mcp-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

const ab = vi.hoisted(() => ({ propose: vi.fn(), queue: vi.fn() }));

// The rest of ab.ts stays real: S2's inbox reads the draws (lib/yue2/draw.ts), which imports its helpers.
vi.mock("../../lib/yue2/ab.ts", async (importOriginal) => ({ ...(await importOriginal<object>()), proposePairs: ab.propose, queuePairs: ab.queue, voteAb: vi.fn() }));
vi.mock("../../lib/yue2/facts.ts", () => ({ allYue2Facts: async () => ({ ok: true, value: {} }), readYue2Facts: vi.fn(), putYue2Facts: vi.fn() }));
vi.mock("../../lib/yue2/scores.ts", () => ({ readSongScores: () => ({ ok: true, value: {} }), putSongScores: vi.fn() }));

import { rmSync } from "node:fs";
import path from "node:path";

import { abQueueKey, YUE2_RECIPE, type AbPair } from "@gt/domain/audio.yue2";
import { ok, type Result } from "@gt/domain/errors";
import { append } from "@gt/kernel/events";
import { get } from "@gt/kernel/job";
import { jobIdSchema } from "@gt/domain/ids";
import { openKernel } from "@gt/kernel/kernel";

import type { McpDeps } from "../../app/_server/mcp/op.ts";
import type { Agent } from "../../app/_server/mcp/principal.ts";
import { toolsOf } from "../../app/_server/mcp/projection.ts";
import { opsOf, REGISTRY } from "../../app/_server/mcp/registry.ts";
import { answerRpc } from "../../app/_server/mcp/rpc.ts";
import { yue2RequestOf } from "../../lib/producers/yue2Jobs.ts";

const AGENT: Agent = { name: "lab-agent", scope: "act", who: { who: "lab-agent", kind: "agent" }, actor: { kind: "agent", id: "lab-agent" } };

const k = openKernel(path.join(ROOT, "kernel.sqlite"));
if (!k.ok) throw k.error;
const store = k.value.store;
afterAll(() => {
  k.value.close();
  rmSync(ROOT, { recursive: true, force: true });
});

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const deps = (): McpDeps => {
  const none = (): Promise<never> => Promise.reject(new Error("not reached in this test"));
  return { produce: () => { throw new Error("not reached"); }, part: none, board: none, library: none, store: () => ok(store) };
};

type ToolOut = { isError?: boolean; structuredContent: Record<string, unknown> };
let n = 0;
async function tool(name: string, args: Record<string, unknown>): Promise<ToolOut> {
  const r = await answerRpc({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }, { agent: AGENT, deps: deps(), mode: "family", version: "0.1.0" });
  const body = (await r.json()) as { result?: ToolOut; error?: unknown };
  expect(body.error).toBeUndefined();
  return body.result as ToolOut;
}

const VOTE = /vote|verdict|judge/i;
/** S2: the owner keeps or removes the agent's proposals; no tool does either. */
const DECIDE = /keep|drop|remove|decide/i;

describe("the songlab family", () => {
  it("holds exactly launch, takes, queue_pairs, post, inbox and turn - and no tool in either projection votes, keeps or drops", () => {
    expect(opsOf("songlab").map((s) => s.op)).toEqual(["launch", "takes", "queue_pairs", "post", "inbox", "turn"]);
    expect(opsOf("songlab").map((s) => s.writes)).toEqual([true, false, true, true, false, true]);
    for (const s of REGISTRY) expect(s.op, `${s.family}.${s.op}`).not.toMatch(VOTE);
    for (const s of opsOf("songlab")) expect(s.op).not.toMatch(DECIDE);
    expect(toolsOf("operation").map((t) => t.name)).toEqual(expect.arrayContaining(["gt_songlab_launch", "gt_songlab_takes", "gt_songlab_queue_pairs", "gt_songlab_post", "gt_songlab_inbox", "gt_songlab_turn"]));
    for (const t of toolsOf("operation")) expect(t.name).not.toMatch(VOTE);
    for (const t of toolsOf("operation").filter((x) => x.name.startsWith("gt_songlab"))) {
      expect(t.name).not.toMatch(DECIDE);
      expect(t.description.length, t.name).toBeLessThanOrEqual(240);
    }
    const family = toolsOf("family").find((t) => t.name === "gt_songlab")!;
    expect(family.description.length).toBeLessThanOrEqual(240);
    expect(JSON.stringify(family.inputSchema)).not.toMatch(VOTE);
  });
});

describe("the songlab ops", () => {
  it("launch: style + lyrics alone render the measured recipe, as the agent", async () => {
    const out = await tool("gt_songlab", { op: "launch", style: "dream pop, airy vocal", lyrics: "[verse]\nhold the line" });
    expect(out.isError).toBeFalsy();
    const jobId = String(out.structuredContent["jobId"]);
    expect(must(get(store, jobIdSchema.parse(jobId))).job).toMatchObject({ producer: "yue2-render", lane: "gpu.local", state: "queued" });
    const req = must(yue2RequestOf(store, "yue2-render", jobId));
    expect(req).toMatchObject({ cot: YUE2_RECIPE.cot, cfg: YUE2_RECIPE.cfg, origin: "agent", by: "lab-agent" });
    expect(req.seeds).toHaveLength(YUE2_RECIPE.seeds);
    expect((out.structuredContent["receipt"] as { totals: { usd: number } }).totals.usd).toBe(0);
  });

  it("post: a chain only; an out-of-order stage list is refused at the door", async () => {
    const good = await tool("gt_songlab", { op: "post", takeId: "st-abc", stages: ["stems", "master"], referenceTakeId: "st-ref" });
    expect(good.isError).toBeFalsy();
    const req = must(yue2RequestOf(store, "yue2-post", String(good.structuredContent["jobId"])));
    expect(req).toMatchObject({ op: "chain", origin: "agent", stages: ["stems", "master"], referenceTakeId: "st-ref" });
    expect((await tool("gt_songlab", { op: "post", takeId: "st-abc", stages: ["master", "stems"] })).isError).toBe(true);
    expect((await tool("gt_songlab", { op: "post", takeId: "st-abc", stages: ["stems"], op2: "ab-window" })).isError).toBe(true);
  });

  it("queue_pairs: both arms' windows enqueued off the QUEUED side; the answer names no take", async () => {
    const pair: AbPair = { pairId: "fedcba9876543210", source: "best-of-n", takeA: "st-a", takeB: "st-b", windowS: [0, 25], side: "ab" };
    ab.propose.mockResolvedValueOnce(ok([pair]));
    // WP4 draws the side at queue time: the queued event says `ba`, whatever the proposal said.
    ab.queue.mockImplementationOnce((s: typeof store) => s.tx((t) => {
      append(t, { actor: AGENT.actor, type: "audio.ab.queue", subject: { kind: "ab-pair", id: pair.pairId }, key: abQueueKey(pair.pairId), data: { ...pair, windowS: [0, 25], side: "ba" } });
      return [pair.pairId];
    }));
    const out = await tool("gt_songlab", { op: "queue_pairs", source: "best-of-n" });
    expect(out.isError).toBeFalsy();
    expect(JSON.stringify(out.structuredContent)).not.toMatch(/st-a|st-b|"side"/);
    const [q] = out.structuredContent["pairs"] as { pairId: string; jobIds: string[] }[];
    expect(q!.pairId).toBe(pair.pairId);
    const arms = q!.jobIds.map((id) => must(yue2RequestOf(store, "yue2-post", id)));
    expect(arms.map((a) => [a.arm, a.takeId, a.op, a.windowS])).toEqual([["a", "st-b", "ab-window", 25], ["b", "st-a", "ab-window", 25]]);
    // Queued again: the arms' jobs exist, so nothing more is enqueued.
    ab.propose.mockResolvedValueOnce(ok([pair]));
    ab.queue.mockReturnValueOnce(ok([pair.pairId]));
    const again = await tool("gt_songlab", { op: "queue_pairs", source: "best-of-n" });
    expect((again.structuredContent["pairs"] as { jobIds: string[] }[])[0]!.jobIds).toEqual(q!.jobIds);
  });

  it("takes: the rights line and the lyric gate ride every listing", async () => {
    const out = await tool("gt_songlab", { op: "takes", limit: 5 });
    expect(out.isError).toBeFalsy();
    expect(String(out.structuredContent["rights"])).toContain("CC BY-NC 4.0");
    expect(out.structuredContent["gate"]).toEqual({ metric: "wer", max: YUE2_RECIPE.gateWer });
    expect(out.structuredContent["takes"]).toEqual([]);
  });
});

describe("the song lab relay ops (S2)", () => {
  it("inbox answers the owner's unanswered direction; turn files the agent's answer and names a dropped proposal", async () => {
    const { appendLabSay } = await import("../../lib/yue2/labRelay.ts");
    const say = must(appendLabSay(store, { session: "lab-mcp-1", text: "less chorus looping" }, { kind: "operator", id: "owner" }));
    const inbox = await tool("gt_songlab", { op: "inbox", waitS: 0 });
    expect(inbox.isError).toBeFalsy();
    expect((inbox.structuredContent["says"] as { turnId: string }[]).map((x) => x.turnId)).toEqual([say.turnId]);
    expect(String(inbox.structuredContent["next"])).toMatch(/^\d+$/);
    expect(inbox.structuredContent["session"]).toBe("lab-mcp-1");

    const launch = { id: "p-mcp-launch", kind: "launch", label: "8 seeds at the recipe", why: "a fresh field", launch: { style: "dream pop", lyrics: "[verse] hold", seeds: [1, 2, 3, 4, 5, 6, 7, 8], cot: "off" } };
    const turn = { op: "turn", session: say.session, answers: say.turnId, line: "two ideas", ran: ["read the takes"], proposals: [launch, { id: "p-mcp-bad", kind: "vote" }] };
    const checked = await tool("gt_songlab", { ...turn, check: true });
    expect(checked.structuredContent).toMatchObject({ checked: true, appended: false, proposed: ["p-mcp-launch"] });
    const filed = await tool("gt_songlab", turn);
    expect(filed.isError).toBeFalsy();
    expect(filed.structuredContent).toMatchObject({ appended: true, proposed: ["p-mcp-launch"] });
    expect(String((filed.structuredContent["dropped"] as string[])[0])).toMatch(/^p-mcp-bad /);

    const after = await tool("gt_songlab", { op: "inbox", session: say.session });
    expect(after.structuredContent["says"]).toEqual([]);
    expect(after.structuredContent["proposals"]).toEqual([expect.objectContaining({ id: "p-mcp-launch", kind: "launch" })]);
    expect((await tool("gt_songlab", { op: "turn", session: "lab-nobody-1", line: "hi" })).isError).toBe(true);
  });
});
