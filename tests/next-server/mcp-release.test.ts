// THE RELEASE ON THE AGENT DOOR (app/_server/mcp/tools/release.ts; spark studio-to-release WP2). Both ops are called
// through the JSON-RPC layer (answerRpc) as an act-scope agent over an in-memory kernel for the studio conversation.
// The release store (lib/release/store.ts) is faked at its module seam with the semantics its signature promises -
// compare-and-swap on the version, every proposal through the one release door (`applyProposal`), a refusal refusing
// the whole call - so these tests hold the OP: what it reads, what it answers in words, what it passes through. The
// store's own behaviour is WP1's tests'. Take facts are faked at lib/sound/suno/facts.ts (no sound store is opened).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({ records: new Map<string, unknown>(), calls: [] as unknown[], facts: {} as Record<string, unknown> }));

vi.mock("../../lib/release/store.ts", async () => {
  const { applyProposal } = await import("@gt/domain/release.record.schema");
  const { err, ok } = await import("@gt/domain/errors");
  type Rec = import("@gt/domain/release.record").ReleaseRecord;
  type In = import("../../lib/release/store.ts").ProposalInput;
  const get = (id: string): Rec | undefined => fake.records.get(id) as Rec | undefined;
  return {
    listReleases: async () => ok([...fake.records.values()] as Rec[]),
    readRelease: async (id: string) => {
      const r = get(id);
      return r === undefined ? err("not-found", `no release ${id}`) : ok(r);
    },
    createRelease: async () => err("unavailable", "not in this test"),
    proposeToRelease: async (a: { id: string; version: number; proposals: readonly In[]; turnId: string | null; by: unknown }) => {
      fake.calls.push(a);
      const rec = get(a.id);
      if (rec === undefined) return err("not-found", `no release ${a.id}`);
      if (rec.version !== a.version) return ok({ record: rec, stale: true });
      let release = rec.release;
      for (const p of a.proposals) {
        const next = applyProposal(release, p.path as never, p.value);
        if (!next.ok) return next;
        release = next.value;
      }
      const pending = [...rec.pending, ...a.proposals.map((p, i) => ({ id: `p-${rec.version}-${i}`, path: p.path as never, value: p.value, source: p.source, turnId: a.turnId, at: "2026-11-17T00:00:00Z" }))];
      const next: Rec = { ...rec, version: rec.version + 1, pending };
      fake.records.set(a.id, next);
      return ok({ record: next, stale: false });
    },
  };
});

vi.mock("../../lib/sound/suno/facts.ts", async (orig) => {
  const { ok } = await import("@gt/domain/errors");
  return { ...(await orig<typeof import("../../lib/sound/suno/facts.ts")>()), readTakeFacts: async (ids: readonly string[]) => ok(Object.fromEntries(ids.flatMap((id) => (fake.facts[id] === undefined ? [] : [[id, fake.facts[id]]])))) };
});

import { parseStudioTurn } from "@gt/domain/audio.studio.door";
import { ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { PROBLEM_TEXT } from "@gt/domain/release.problems";
import type { ReleaseRecord } from "@gt/domain/release.record";
import { applyProposal } from "@gt/domain/release.record.schema";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { fixturePort } from "../../app/(studio)/audio/_release/_port/fixture.ts";
import { appendSay } from "../../app/(studio)/audio/studio/_live/say.ts";
import type { McpDeps } from "../../app/_server/mcp/op.ts";
import type { Agent } from "../../app/_server/mcp/principal.ts";
import { opsOf } from "../../app/_server/mcp/registry.ts";
import { answerRpc } from "../../app/_server/mcp/rpc.ts";
import { RELEASE_OPS_FAMILY } from "../../app/_server/mcp/tools/release.ts";

const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Agent = { name: "studio-agent", scope: "act", who: { who: "studio-agent", kind: "agent" }, actor: { kind: "agent", id: "studio-agent" } };
const TOOL = `gt_${RELEASE_OPS_FAMILY}`;
const SESSION = "night-drive";
const AT = "2026-11-17T10:00:00.000Z";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

let store: Store;
let single: ReleaseRecord;
let album: ReleaseRecord;
beforeEach(async () => {
  store = must(openKernel(":memory:")).store;
  const recs = (await fixturePort.read()).records;
  // The draft single (session night-drive, four pending) and an album born on the shelf (no session).
  single = recs.find((r) => r.release.id === "rel-0000000000a1") as ReleaseRecord;
  album = recs.find((r) => r.sessionId === null) as ReleaseRecord;
  fake.records.clear();
  fake.calls.length = 0;
  fake.records.set(single.release.id, single);
  fake.records.set(album.release.id, album);
  fake.facts = {};
});

const deps = (): McpDeps => {
  const none = (): Promise<never> => Promise.reject(new Error("not reached in this test"));
  return { produce: () => { throw new Error("not reached"); }, part: none, board: none, library: none, store: () => ok(store) };
};

type ToolOut = { isError?: boolean; content: { type: string; text: string }[]; structuredContent: Record<string, unknown> };
let n = 0;
async function tool(name: string, args: Record<string, unknown>, agent: Agent = AGENT): Promise<ToolOut> {
  const r = await answerRpc({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }, { agent, deps: deps(), mode: "family", version: "0.1.0" });
  const body = (await r.json()) as { result?: ToolOut; error?: unknown };
  expect(body.error).toBeUndefined();
  return body.result as ToolOut;
}

/** The conversation the single was made from: a kept Suno prompt and an uploaded take. */
async function converse(): Promise<void> {
  const say = (id: string, text: string, extra: Record<string, unknown> = {}) => must(appendSay(store, { session: SESSION, turn: { v: 1, id, seq: 0, at: AT, from: "user", text, ...extra } }, OPERATOR));
  say("u-1", "a synthwave song for a night drive");
  const prompt = { id: "p1", kind: "suno_prompt", promptId: "p1", name: "Dancing in the Static", style: "synthwave, nocturnal and wistful, 112 bpm", lyrics: "[Verse]\nStreetlights count the miles", instrumental: false, model: "v6", settings: { variety: 0 } };
  const turned = await tool("gt_launch", { op: "audio_turn", session: SESSION, turn: { id: "a-1", text: "Paste this into Suno.", show: [prompt], actions: [] } });
  expect(turned.isError).toBeUndefined();
  say("u-2", "keeping take a", { verdict: { promptId: "p1", clip: "a", keep: true }, takeId: "suno-take-a" });
}

type Read = { releases: { id: string; version: number; sessionId: string | null; kind: string; problems: { code: string; severity: string; rule: string }[]; blocks: number; warns: number; pending: unknown[]; empty: string[]; draftFrom: { session: string | null; prompts: { promptId: string; style: string; turnId: string }[]; keptPrompts: string[]; takes: Record<string, unknown>; takesNote: string | null }; card: Record<string, unknown>; view: string }[]; next: string[]; said?: string };

describe("the release ops are registered", () => {
  it("release_read reads and release_propose writes, side by side in one family", () => {
    const ops = opsOf(RELEASE_OPS_FAMILY);
    expect(ops.find((s) => s.op === "release_read")).toMatchObject({ writes: false, annotations: { readOnlyHint: true } });
    expect(ops.find((s) => s.op === "release_propose")).toMatchObject({ writes: true, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } });
  });
});

describe("release_read", () => {
  it("answers one release whole: version, live problems with the store's rule, pending, empty fields, and what the conversation knows", async () => {
    await converse();
    fake.facts = { "suno-take-a": { takeId: "suno-take-a", name: "Dancing (a).mp3", durationS: 180, href: "/api/sound/takes/x/file", measured: { bpm: 112 } } };
    const out = await tool(TOOL, { op: "release_read", id: single.release.id });
    expect(out.isError).toBeUndefined();
    const v = out.structuredContent as Read;
    expect(v.releases).toHaveLength(1);
    const r = v.releases[0];
    if (r === undefined) throw new Error("no release");
    expect(r).toMatchObject({ id: "rel-0000000000a1", version: single.version, sessionId: SESSION, kind: "single", blocks: 2, warns: 2 });
    expect(r.problems.find((p) => p.code === "sleeve-missing")).toEqual({ code: "sleeve-missing", severity: "block", at: "sleeve", rule: PROBLEM_TEXT["sleeve-missing"] });
    expect(r.pending).toHaveLength(4);
    expect(r.empty).toEqual(expect.arrayContaining(["sleevePrompt", "upc", "track:1.isrc", "track:1.lyrics"]));
    expect(r.empty).not.toContain("title");
    expect(r.draftFrom.prompts).toEqual([expect.objectContaining({ promptId: "p1", style: "synthwave, nocturnal and wistful, 112 bpm", turnId: "a-1" })]);
    expect(r.draftFrom.keptPrompts).toEqual(["p1"]);
    expect(Object.keys(r.draftFrom.takes)).toEqual(["suno-take-a"]);
    expect(r.draftFrom.takesNote).toBeNull();
    expect(r.view).toBe("/audio?s=studio&session=night-drive&stage=package&r=rel-0000000000a1");
    // The card it hands over is one the studio door shows as is.
    const turn = must(parseStudioTurn({ v: 1, id: "a-2", seq: 3, at: AT, from: "agent", text: "Two things block it.", show: [r.card] }));
    expect(turn.dropped).toEqual([]);
    expect(turn.turn.show[0]).toEqual({ id: "release", kind: "release", releaseId: "rel-0000000000a1", title: "Dancing in the Static", releaseKind: "single", blocks: 2, warns: 2, status: "draft", pending: 4 });
    // Journey-shaped and complete as text: what may be proposed next, and that the irreversible acts are not ops.
    expect(v.next.join(" ")).toMatch(/release_propose/);
    expect(v.next.join(" ")).toMatch(/never invent a rights fact/);
    expect(out.content[0]?.text).toContain("release_propose");
  });

  it("by conversation answers that conversation's releases only; one with none says how a release is made", async () => {
    const mine = (await tool(TOOL, { op: "release_read", session: SESSION })).structuredContent as Read;
    expect(mine.releases.map((r) => r.id)).toEqual(["rel-0000000000a1"]);
    const none = (await tool(TOOL, { op: "release_read", session: "study-bed" })).structuredContent as Read;
    expect(none.releases).toEqual([]);
    expect(none.said).toMatch(/Release this/);
    expect(none.next).toEqual([]);
  });

  it("a release with no conversation reads with nothing to draft from; an unknown id is not-found", async () => {
    const out = (await tool(TOOL, { op: "release_read", id: album.release.id })).structuredContent as Read;
    expect(out.releases[0]?.draftFrom).toMatchObject({ session: null, prompts: [], keptPrompts: [] });
    const gone = await tool(TOOL, { op: "release_read", id: "rel-00000000ffff" });
    expect(gone.isError).toBe(true);
    expect(gone.structuredContent["code"]).toBe("not-found");
    const bad = await tool(TOOL, { op: "release_read", id: "rel-xyz" });
    expect(bad.isError).toBe(true);
  });
});

describe("release_propose", () => {
  const proposal = { path: "track:1.lyrics", value: "[Verse]\nStreetlights count the miles", source: "the kept Suno prompt p1's lyrics" };

  it("files proposals as the agent against the version read, and says nothing reaches the release before the operator", async () => {
    const out = await tool(TOOL, { op: "release_propose", id: single.release.id, version: single.version, proposals: [proposal], turnId: "a-2" });
    expect(out.isError).toBeUndefined();
    expect(out.structuredContent).toMatchObject({ id: single.release.id, stale: false, written: 1, version: single.version + 1, pending: 5 });
    expect(String(out.structuredContent["said"])).toMatch(/operator's accept or dismiss/);
    expect(fake.calls).toEqual([{ id: single.release.id, version: single.version, proposals: [proposal], turnId: "a-2", by: { kind: "agent", id: "studio-agent" } }]);
  });

  it("a read-only token may not propose", async () => {
    const out = await tool(TOOL, { op: "release_propose", id: single.release.id, version: single.version, proposals: [proposal] }, { ...AGENT, scope: "read" });
    expect(out.structuredContent).toMatchObject({ code: "refused", reason: "token-scope" });
    expect(fake.calls).toEqual([]);
  });

  it("a stale version is answered in-band: nothing written, the stored version, read again", async () => {
    const out = await tool(TOOL, { op: "release_propose", id: single.release.id, version: single.version + 7, proposals: [proposal] });
    expect(out.isError).toBeUndefined();
    expect(out.structuredContent).toMatchObject({ stale: true, written: 0, version: single.version });
    expect(String(out.structuredContent["said"])).toMatch(/Read it again with release_read and propose against version/);
    expect((fake.records.get(single.release.id) as ReleaseRecord).pending).toHaveLength(4);
  });

  it("a value the release door refuses is refused with the door's own sentence", async () => {
    const door = applyProposal(single.release, "genre.primary", "Polka");
    if (door.ok) throw new Error("the door took Polka");
    const out = await tool(TOOL, { op: "release_propose", id: single.release.id, version: single.version, proposals: [{ path: "genre.primary", value: "Polka", source: "a guess" }] });
    expect(out.isError).toBe(true);
    expect(out.structuredContent["detail"]).toBe(door.error.message);
    expect((fake.records.get(single.release.id) as ReleaseRecord).version).toBe(single.version);
  });

  it("a path no proposal may set is refused at the op's door, before the store", async () => {
    const out = await tool(TOOL, { op: "release_propose", id: single.release.id, version: single.version, proposals: [{ path: "status", value: "published", source: "me" }] });
    expect(out.isError).toBe(true);
    expect(String(out.structuredContent["detail"])).toMatch(/not a field a proposal may set/);
    expect(fake.calls).toEqual([]);
  });
});
