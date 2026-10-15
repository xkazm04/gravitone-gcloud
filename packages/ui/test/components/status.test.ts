// The one status vocabulary: exhaustive over every machine, both at the type level (a table
// missing or inventing a state does not compile) and at runtime (the table's keys are the
// machine's states, no more, no fewer); every look has a class and a real token role; an
// unknown wire token degrades toward attention and is reported.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, test } from "vitest";
import { jobMachine, type JobState } from "@gt/domain/job";
import { LIBRARY_STATES } from "@gt/domain/libraryItem";
import { packetMachine } from "@gt/domain/packet";
import { partMachine } from "@gt/domain/part";
import { projectMachine } from "@gt/domain/project";
import { runMachine } from "@gt/domain/run";
import { slotMachine } from "@gt/domain/slot";
import { styleMachine } from "@gt/domain/style";
import {
  LOOKS,
  STATUS,
  UNKNOWN,
  statusFromWire,
  statusOf,
  type Look,
  type Machine,
  type StatusEntry,
  type StatusMiss,
  type StatusTable,
} from "../../src/components/status/status.ts";
import { EntryPill, StatusPill } from "../../src/components/status/StatusPill.tsx";
import pill from "../../src/components/status/StatusPill.module.css";
import pip from "../../src/components/piprow/PipRow.module.css";
import { tokens } from "../../src/tokens.ts";

const STATES: { readonly [M in Machine]: readonly string[] } = {
  job: jobMachine.states,
  run: runMachine.states,
  part: partMachine.states,
  project: projectMachine.states,
  packet: packetMachine.states,
  slot: slotMachine.states,
  style: styleMachine.states,
  library: LIBRARY_STATES,
};
const MACHINES = Object.keys(STATES).filter((m): m is Machine => m in STATUS);
const e: StatusEntry = { look: "idle", label: "x" };

describe("the status table is exhaustive over each machine", () => {
  test.each(MACHINES)("%s: the table's keys are exactly the machine's states", (m) => {
    expect(Object.keys(STATUS[m]).sort()).toEqual([...STATES[m]].sort());
  });

  test("every vocabulary of the table is checked here", () => {
    expect(MACHINES.sort()).toEqual(Object.keys(STATUS).sort());
  });

  test("type level: a table missing a state, or naming one the machine lacks, does not compile", () => {
    expectTypeOf<keyof StatusTable["job"]>().toEqualTypeOf<JobState>();
    const { interrupted: _dropped, ...short } = STATUS.job;
    // @ts-expect-error - a job table without `interrupted` is not a job table
    const missing: StatusTable["job"] = short;
    // @ts-expect-error - `exploded` is not a job state
    const extra: StatusTable["job"] = { ...STATUS.job, exploded: e };
    expect([missing, extra].length).toBe(2);
  });

  test("labels are words, never the raw token with its underscore", () => {
    for (const m of MACHINES) {
      for (const entry of Object.values<StatusEntry>(STATUS[m])) expect(entry.label).not.toMatch(/_/);
    }
  });
});

describe("looks", () => {
  const looks = Object.keys(LOOKS).filter((l): l is Look => l in LOOKS);

  test.each(looks)("%s resolves to a real token and a pill class", (l) => {
    expect(tokens[LOOKS[l].role]).toBeTypeOf("string");
    expect(pill[l]).toBeTypeOf("string");
  });

  test("a pip draws the five looks the design gave pips", () => {
    for (const c of ["done", "awaiting", "running", "failed", "idle"]) expect(pip[c]).toBeTypeOf("string");
  });

  test("the five prototype copies agree with the one table at the slot edges", () => {
    // index.html SLOT_STATE: scheduled->awaiting_gate, publishing->running, published->ratified,
    // failed|missed->blocked, cancelled->draft.
    expect(statusOf("slot", "scheduled").look).toBe("awaiting");
    expect(statusOf("slot", "publishing").look).toBe("running");
    expect(statusOf("slot", "published").look).toBe("done");
    expect(statusOf("slot", "missed").look).toBe("failed");
    expect(statusOf("slot", "cancelled").look).toBe("idle");
  });
});

describe("an unknown wire token", () => {
  test("degrades toward attention, never to the raw token, and is reported", () => {
    const misses: StatusMiss[] = [];
    const got = statusFromWire("job", "exploded", (m) => misses.push(m));
    expect(got).toBe(UNKNOWN);
    expect(got.look).toBe("awaiting");
    expect(got.label).not.toContain("exploded");
    expect(misses).toEqual([{ machine: "job", token: "exploded" }]);
  });

  test("a known token is not a miss, and a prototype key like `constructor` is not a state", () => {
    const misses: StatusMiss[] = [];
    expect(statusFromWire("run", "awaiting_gate", (m) => misses.push(m))).toEqual(STATUS.run.awaiting_gate);
    expect(statusFromWire("run", "constructor", (m) => misses.push(m))).toBe(UNKNOWN);
    expect(misses).toHaveLength(1);
  });
});

describe("StatusPill", () => {
  test("draws the entry's label with its look's class", () => {
    const html = renderToStaticMarkup(createElement(StatusPill<"part">, { machine: "part", state: "awaiting_gate" }));
    expect(html).toBe(`<span class="${pill.state} ${pill.awaiting}">at weir</span>`);
  });

  test("an unknown token's pill says unknown", () => {
    const html = renderToStaticMarkup(createElement(EntryPill, { entry: UNKNOWN }));
    expect(html).toContain(">unknown<");
    expect(html).toContain(String(pill.awaiting));
  });
});
