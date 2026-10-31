import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MCP_FAMILIES } from "@gt/domain/mcp";

import { DESCRIPTION_MAX, familyAnnotations, opsOf, REGISTRY, registryFaults } from "../../app/_server/mcp/registry.ts";
import { resolveCall, toolsOf } from "../../app/_server/mcp/projection.ts";

// THE ONE REGISTRY and its two projections (app/_server/mcp/): every op one row, published as four
// family tools (`gt_read` + op) or one tool per op (`gt_read_projects`), and a call in either
// resolving to the SAME row with the SAME args. What a model is shown is checked here: names,
// descriptions within 240 chars, JSON-Schema objects, and a family's annotations as severe as its
// most severe op's.

describe("the registry", () => {
  it("holds its own rules: unique ops, short descriptions, writes agree with readOnlyHint, every family has an op", () => {
    expect(registryFaults()).toEqual([]);
  });

  it("carries the ops the door publishes, at least 30 of them", () => {
    const names = REGISTRY.map((s) => `${s.family}.${s.op}`);
    expect(names.length).toBeGreaterThanOrEqual(30);
    for (const n of ["read.projects", "read.ledger", "read.events_after", "launch.composer_run", "launch.plan_launch", "launch.part_act", "job.retry", "job.reroute", "job.cancel", "spend.list", "spend.get"]) expect(names).toContain(n);
  });

  it("marks every write op as needing the act scope, and no read op", () => {
    for (const s of opsOf("read")) expect(s.writes, s.op).toBe(false);
    for (const s of opsOf("spend")) expect(s.writes, s.op).toBe(false);
    for (const op of ["composer_run", "compose", "set_part", "rename", "plan_launch", "discard", "part_act"]) expect(opsOf("launch").find((s) => s.op === op)?.writes, op).toBe(true);
    for (const op of ["pause", "resume", "retry", "move", "reroute", "cancel", "ack_lane"]) expect(opsOf("job").find((s) => s.op === op)?.writes, op).toBe(true);
  });

  it("carries the audio studio's ops (spark audio-agent-studio S2): reads in read, the local band's writes in launch", () => {
    const read = ["audio_inbox", "audio_guide", "audio_palette", "audio_compile", "intent_steer"];
    const launch = ["audio_turn", "audio_render", "audio_mix", "audio_rewrite", "audio_audition"];
    for (const op of read) expect(opsOf("read").find((s) => s.op === op), op).toMatchObject({ writes: false, annotations: { readOnlyHint: true } });
    for (const op of launch) expect(opsOf("launch").find((s) => s.op === op), op).toMatchObject({ writes: true, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } });
    // `read.steer` is the composer's sentence compile; e4's intent steer is its own op beside it.
    expect(opsOf("read").map((s) => s.op)).toEqual(expect.arrayContaining(["steer", "intent_steer"]));
  });
});

describe("the family projection", () => {
  const tools = toolsOf("family");

  it("publishes exactly four tools, one per family", () => {
    expect(tools.map((t) => t.name)).toEqual(MCP_FAMILIES.map((f) => `gt_${f}`));
  });

  it("gives each an object schema whose oneOf branches are its ops, discriminated by op", () => {
    for (const f of MCP_FAMILIES) {
      const t = tools.find((x) => x.name === `gt_${f}`);
      expect(t?.inputSchema["type"]).toBe("object");
      expect(t?.inputSchema["required"]).toEqual(["op"]);
      const branches = t?.inputSchema["oneOf"] as { properties: { op: { const: string } }; required: string[] }[];
      expect(branches.map((b) => b.properties.op.const)).toEqual(opsOf(f).map((s) => s.op));
      for (const b of branches) expect(b.required[0]).toBe("op");
    }
  });

  it("keeps each description within 240 chars and names its ops", () => {
    for (const t of tools) {
      expect(t.description.length, t.name).toBeLessThanOrEqual(DESCRIPTION_MAX);
      for (const s of opsOf(t.name.slice(3) as (typeof MCP_FAMILIES)[number])) expect(t.description).toContain(s.op);
    }
  });

  it("annotates a family with its most severe op", () => {
    expect(familyAnnotations("read")).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(familyAnnotations("launch")).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });
    expect(familyAnnotations("job")).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(familyAnnotations("spend").readOnlyHint).toBe(true);
  });

  it("resolves a call to its op's row with the op stripped, and names the known ops for an unknown one", () => {
    const r = resolveCall("family", "gt_job", { op: "cancel", jobId: "j-1" });
    expect(r).toMatchObject({ ok: true, args: { jobId: "j-1" } });
    expect(r.ok && r.spec.op).toBe("cancel");
    const bad = resolveCall("family", "gt_job", { op: "explode" });
    expect(bad).toMatchObject({ ok: false });
    expect(!bad.ok && bad.message).toContain("known ops: status, pause, resume, retry, move, reroute_options, reroute, cancel, ack_lane");
    expect(resolveCall("family", "gt_read_projects", {})).toMatchObject({ ok: false, message: expect.stringContaining("unknown tool") });
  });
});

describe("the operation projection", () => {
  const tools = toolsOf("operation");

  it("publishes one tool per op, named gt_<family>_<op>, at least 30", () => {
    expect(tools.length).toBe(REGISTRY.length);
    expect(tools.length).toBeGreaterThanOrEqual(30);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    expect(tools.map((t) => t.name)).toContain("gt_launch_composer_run");
    for (const t of tools) {
      expect(t.inputSchema["type"], t.name).toBe("object");
      expect(t.description.length, t.name).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });

  it("resolves a call to the same row the family tool reaches, with the same args", () => {
    const op = resolveCall("operation", "gt_job_cancel", { jobId: "j-1" });
    const fam = resolveCall("family", "gt_job", { op: "cancel", jobId: "j-1" });
    expect(op.ok && fam.ok && op.spec === fam.spec).toBe(true);
    expect(op.ok && op.args).toEqual(fam.ok && fam.args);
    expect(resolveCall("operation", "gt_job", { op: "cancel" })).toMatchObject({ ok: false });
  });
});
