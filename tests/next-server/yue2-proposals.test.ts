// KEEP / DROP OF THE AGENT'S PROPOSALS (spark yue2-song-lab S2, WP-B; lib/yue2/proposals.ts) over a temp
// kernel, with the acts faked at their module seams (launchRender / launchPost in lib/producers/yue2Jobs.ts,
// reseed in lib/yue2/draw.ts): a keep runs exactly one act and then files `audio.lab.keep` with what it
// started; a refused act files nothing and its refusal comes back verbatim; a second keep conflicts; a kept
// proposal cannot be removed; `decisions` folds both.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-yue2-proposals-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

const acts = vi.hoisted(() => ({ render: vi.fn(), post: vi.fn(), reseed: vi.fn() }));

vi.mock("../../lib/producers/yue2Jobs.ts", async (importOriginal) => ({ ...(await importOriginal<object>()), launchRender: acts.render, launchPost: acts.post }));
vi.mock("../../lib/yue2/draw.ts", () => ({ reseed: acts.reseed }));

import { rmSync } from "node:fs";
import path from "node:path";

import { LAB_KEEP_EVENT } from "@gt/domain/audio.yue2.lab";
import { err, ok, type Result } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel } from "@gt/kernel/kernel";

import { appendLabSay, appendLabTurn } from "../../lib/yue2/labRelay.ts";
import { decisions, dropProposal, keepProposal } from "../../lib/yue2/proposals.ts";

const OWNER = { kind: "operator", id: "owner" } as const;
const AGENT = { kind: "agent", id: "lab-agent" } as const;
const DRAW = "0123456789ab";

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

const RULE = { id: "p-rule-1", kind: "rule", label: "exclude wer over 0.1", why: "the chorus loops where the words slip", rule: { drawId: DRAW, rules: [{ kind: "exclude", metric: "wer", op: "gt", value: 0.1 }] } };
const LAUNCH = { id: "p-launch-1", kind: "launch", label: "8 seeds at the recipe", why: "refill the field", launch: { style: "dream pop", lyrics: "[verse]\nhold the line", seeds: [1, 2, 3, 4, 5, 6, 7, 8], cot: "off", cfg: 1.5 } };
const POST = { id: "p-post-1", kind: "post", label: "stems + master two takes", why: "both sound muddy", post: { takeIds: ["st-a", "st-b"], stages: ["stems", "master"] } };

const say = must(appendLabSay(store, { session: "lab-keep-1", text: "less chorus looping" }, OWNER));
must(appendLabTurn(store, { session: say.session, turnId: "a-keep-turn-1", answers: say.turnId, line: "three ideas", proposals: [RULE, LAUNCH, POST] }, AGENT));
const T = "a-keep-turn-1";

const keeps = () => must(queryEvents(store, { type: [LAB_KEEP_EVENT], limit: 100 })).events;
const calls = () => acts.render.mock.calls.length + acts.post.mock.calls.length + acts.reseed.mock.calls.length;

beforeEach(() => {
  acts.render.mockReset();
  acts.post.mockReset();
  acts.reseed.mockReset();
});

describe("keep", () => {
  it("a refused act files nothing and returns the refusal verbatim", async () => {
    acts.render.mockReturnValueOnce(err("unavailable", "gpu.local is held by the operator"));
    const r = await keepProposal(store, { turnId: T, proposalId: "p-launch-1" }, OWNER);
    expect(r).toMatchObject({ ok: false, error: { code: "unavailable", message: "gpu.local is held by the operator" } });
    expect(keeps()).toEqual([]);
    expect(must(decisions(store))).toEqual({});
  });

  it("launch: runs exactly one launchRender as the lab, then files the keep with its job id; a second keep conflicts", async () => {
    acts.render.mockReturnValueOnce(ok({ jobId: "job:yue2-render:lab-p-launch-1", receipt: {} }));
    const d = must(await keepProposal(store, { turnId: T, proposalId: "p-launch-1" }, OWNER));
    expect(d).toEqual({ turnId: T, proposalId: "p-launch-1", started: "job:yue2-render:lab-p-launch-1" });
    expect(calls()).toBe(1);
    expect(acts.render.mock.calls[0]?.[1]).toMatchObject({ ...LAUNCH.launch, origin: "lab" });
    expect(acts.render.mock.calls[0]?.[2]).toMatchObject({ actor: OWNER, key: "lab-p-launch-1" });
    expect(keeps()).toHaveLength(1);
    expect(await keepProposal(store, { turnId: T, proposalId: "p-launch-1" }, OWNER)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(calls()).toBe(1);
  });

  it("post: one chain per take, the started range names both", async () => {
    acts.post.mockImplementation((_s: unknown, _raw: unknown, o: { key: string }) => ok({ jobId: `job:yue2-post:${o.key}`, receipt: {} }));
    const d = must(await keepProposal(store, { turnId: T, proposalId: "p-post-1" }, OWNER));
    expect(acts.post).toHaveBeenCalledTimes(2);
    expect(acts.post.mock.calls.map((c) => (c[1] as { takeId: string; op: string; origin: string }))).toEqual([
      expect.objectContaining({ takeId: "st-a", op: "chain", origin: "lab", stages: ["stems", "master"] }),
      expect.objectContaining({ takeId: "st-b", op: "chain", origin: "lab" }),
    ]);
    expect(d.started).toBe("job:yue2-post:lab-p-post-1-1..2");
    expect(acts.render).not.toHaveBeenCalled();
    expect(acts.reseed).not.toHaveBeenCalled();
  });

  it("rule: reseeds the draw with the proposal's rules, the started value is the new version", async () => {
    acts.reseed.mockResolvedValueOnce(ok({ drawId: DRAW, version: 2, field: "main", size: 16, entrants: [], rules: RULE.rule.rules }));
    const d = must(await keepProposal(store, { turnId: T, proposalId: "p-rule-1" }, OWNER));
    expect(calls()).toBe(1);
    expect(acts.reseed).toHaveBeenCalledWith(store, DRAW, RULE.rule.rules, OWNER);
    expect(d.started).toBe(`draw:${DRAW}:v2`);
  });

  it("an unknown turn or proposal is not-found and runs nothing", async () => {
    expect(await keepProposal(store, { turnId: "a-none-1", proposalId: "p-rule-1" }, OWNER)).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(await keepProposal(store, { turnId: T, proposalId: "p-none-1" }, OWNER)).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(calls()).toBe(0);
  });
});

describe("drop", () => {
  it("a kept proposal cannot be removed; decisions fold keeps and drops", () => {
    expect(dropProposal(store, { turnId: T, proposalId: "p-launch-1" }, OWNER)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(must(decisions(store))).toEqual({ "p-launch-1": "kept", "p-post-1": "kept", "p-rule-1": "kept" });
  });

  it("removes an undecided proposal once; a removed one cannot be kept", async () => {
    const s2 = must(appendLabSay(store, { session: "lab-keep-2", text: "more" }, OWNER));
    const other = { ...LAUNCH, id: "p-launch-2" };
    must(appendLabTurn(store, { session: s2.session, turnId: "a-keep-turn-2", line: "one more", proposals: [other] }, AGENT));
    expect(must(dropProposal(store, { turnId: "a-keep-turn-2", proposalId: "p-launch-2" }, OWNER))).toEqual({ turnId: "a-keep-turn-2", proposalId: "p-launch-2" });
    expect(dropProposal(store, { turnId: "a-keep-turn-2", proposalId: "p-launch-2" }, OWNER).ok).toBe(true);
    expect(await keepProposal(store, { turnId: "a-keep-turn-2", proposalId: "p-launch-2" }, OWNER)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(calls()).toBe(0);
    expect(must(decisions(store))["p-launch-2"]).toBe("dropped");
  });
});
