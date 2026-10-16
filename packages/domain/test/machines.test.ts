import { describe, expect, expectTypeOf, it } from "vitest";
import { jobMachine, jobStateSchema, type JobState } from "../src/job.ts";
import { packetMachine, packetStateSchema } from "../src/packet.ts";
import { partMachine, partStateSchema } from "../src/part.ts";
import { projectMachine, projectStateSchema } from "../src/project.ts";
import { runMachine, runStateSchema } from "../src/run.ts";
import { slotMachine, slotStateSchema } from "../src/slot.ts";
import { styleMachine, styleStatusSchema } from "../src/style.ts";
import type { Machine } from "../src/transitions.ts";
import * as jobTable from "../src/job.machine.ts";
import * as packetTable from "../src/packet.machine.ts";
import * as partTable from "../src/part.machine.ts";
import * as projectTable from "../src/project.machine.ts";
import * as runTable from "../src/run.machine.ts";
import * as slotTable from "../src/slot.machine.ts";
import * as styleTable from "../src/style.machine.ts";
import type { z } from "zod";

function closedMachine<S extends string>(name: string, m: Machine<S>, schema: { readonly options: readonly string[] }) {
  it(`${name}: the table is closed — every target is a declared state`, () => {
    for (const from of m.states) for (const to of m.next(from)) expect(m.states, `${name}: ${from} -> ${to}`).toContain(to);
  });
  it(`${name}: the schema enum IS the machine's state list`, () => {
    expect(schema.options).toEqual([...m.states]);
  });
  it(`${name}: every state is reachable from the first`, () => {
    const first = m.states[0];
    if (first === undefined) throw new Error(`${name} has no states`);
    const seen = new Set<S>([first]);
    const walk: S[] = [first];
    for (let s = walk.pop(); s !== undefined; s = walk.pop())
      for (const to of m.next(s))
        if (!seen.has(to)) {
          seen.add(to);
          walk.push(to);
        }
    expect([...seen].sort()).toEqual([...m.states].sort());
  });
}

describe("every machine", () => {
  closedMachine("run", runMachine, runStateSchema);
  closedMachine("project", projectMachine, projectStateSchema);
  closedMachine("part", partMachine, partStateSchema);
  closedMachine("job", jobMachine, jobStateSchema);
  closedMachine("packet", packetMachine, packetStateSchema);
  closedMachine("slot", slotMachine, slotStateSchema);
  closedMachine("style", styleMachine, styleStatusSchema);
  it("derives the state union from the table, so the record type moves with it", () => {
    expectTypeOf<JobState>().toEqualTypeOf<"planned" | "queued" | "running" | "paused" | "failed" | "interrupted" | "done" | "cancelled">();
  });
});

describe("the transitions v1 relied on", () => {
  it("job: a crash-stop is its own state, and it never resumes without the queue", () => {
    expect(jobMachine.can("running", "interrupted")).toBe(true);
    expect(jobMachine.can("interrupted", "running")).toBe(false);
    expect(jobMachine.can("interrupted", "done")).toBe(false);
    expect(jobMachine.next("interrupted")).toEqual(["queued", "cancelled"]);
    expect(jobMachine.states).toContain("failed");
    expect(jobMachine.states).not.toContain("orphaned");
  });
  it("job: nothing skips the lease — only a running job finishes", () => {
    for (const s of jobMachine.states) if (s !== "running") expect(jobMachine.can(s, "done"), s).toBe(false);
    expect(jobMachine.can("queued", "running")).toBe(true);
  });
  it("job: done and cancelled are terminal", () => {
    expect(jobMachine.next("done")).toEqual([]);
    expect(jobMachine.next("cancelled")).toEqual([]);
  });
  it("slot: at-most-once — a claimed slot never goes back to scheduled", () => {
    expect(slotMachine.can("scheduled", "publishing")).toBe(true);
    expect(slotMachine.can("publishing", "scheduled")).toBe(false);
    expect(slotMachine.next("publishing")).toEqual(["published", "failed"]);
  });
  it("slot: a missed slot is never published late, only rescheduled or cancelled", () => {
    expect(slotMachine.can("missed", "publishing")).toBe(false);
    expect(slotMachine.next("missed")).toEqual(["scheduled", "cancelled"]);
  });
  it("slot: v1's addition over StatReel — a failed slot is rescheduled, not re-created", () => {
    expect(slotMachine.can("failed", "scheduled")).toBe(true);
    expect(slotMachine.next("published")).toEqual([]);
  });
  it("packet: the commit is one final act; only an open packet is decided", () => {
    expect(packetMachine.can("open", "committed")).toBe(true);
    expect(packetMachine.next("committed")).toEqual([]);
    expect(packetMachine.next("returned")).toEqual([]);
  });
  it("run: a pile sent back goes round again; a ratified run is done", () => {
    expect(runMachine.can("awaiting_gate", "running")).toBe(true);
    expect(runMachine.next("ratified")).toEqual([]);
  });
  it("style: both ratchets are one-way - nothing demotes, and a lock has no way out (Phase 5 decision 2)", () => {
    expect(styleMachine.can("candidate", "proven")).toBe(true);
    expect(styleMachine.can("proven", "locked")).toBe(true);
    expect(styleMachine.can("proven", "candidate")).toBe(false);
    expect(styleMachine.can("locked", "candidate")).toBe(false);
    expect(styleMachine.can("locked", "proven")).toBe(false);
    expect(styleMachine.next("locked")).toEqual([]);
  });
});

// The split (wave 4): each table lives zod-free in <record>.machine.ts so a client can hold it,
// and the schema file re-exports it. Two doors onto ONE table: a copy in either would let the
// browser's vocabulary and the server's door disagree about which states exist.
describe("one table, two doors", () => {
  it.each([
    ["job", jobTable.jobMachine, jobMachine],
    ["packet", packetTable.packetMachine, packetMachine],
    ["part", partTable.partMachine, partMachine],
    ["project", projectTable.projectMachine, projectMachine],
    ["run", runTable.runMachine, runMachine],
    ["slot", slotTable.slotMachine, slotMachine],
    ["style", styleTable.styleMachine, styleMachine],
  ] as const)("%s: the schema file re-exports the machine module's own table", (_, fromTable, fromSchema) => {
    expect(fromSchema).toBe(fromTable);
  });
  it("the machine's union is the schema door's output type", () => {
    expectTypeOf<jobTable.JobState>().toEqualTypeOf<z.output<typeof jobStateSchema>>();
    expectTypeOf<slotTable.SlotState>().toEqualTypeOf<z.output<typeof slotStateSchema>>();
    expectTypeOf<styleTable.StyleStatus>().toEqualTypeOf<z.output<typeof styleStatusSchema>>();
  });
});
