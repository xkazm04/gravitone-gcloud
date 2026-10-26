// The one status vocabulary: exhaustive over every machine, both at the type level (a table
// missing or inventing a state does not compile) and at runtime (the table's keys are the
// machine's states, no more, no fewer); every look has a class and a real token role; an
// unknown wire token degrades toward attention and is reported.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  type Mark,
  type StatusEntry,
  type StatusMiss,
  type StatusTable,
} from "../../src/components/status/status.ts";
import { EntryPill, StatusPill } from "../../src/components/status/StatusPill.tsx";
import pill from "../../src/components/status/StatusPill.module.css";
import pip from "../../src/components/piprow/PipRow.module.css";
import { pipClasses } from "../../src/components/piprow/PipRow.tsx";
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

// LOOKS and the two stylesheets are three tables over the same Look union. Totality is the type
// system's; AGREEMENT is not (status-color-mapping, "totality is not agreement"): a pill drawn in
// one hue and a pip in another, or a kit row naming a mark the CSS does not draw, compiles and
// renders. So the stylesheet is read here and its colour and its ::before mark are pinned to the
// role and mark LOOKS declares.
describe("the stylesheets draw what LOOKS declares", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sheet = (p: string): readonly { readonly sel: readonly string[]; readonly body: string }[] =>
    [...readFileSync(join(here, "../../src/components", p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      sel: (m[1] ?? "").split(",").map((x) => x.trim()),
      body: m[2] ?? "",
    }));
  const pills = sheet("status/StatusPill.module.css");
  const pips = sheet("piprow/PipRow.module.css");
  const rule = (rules: typeof pills, sel: string): string => rules.filter((r) => r.sel.includes(sel)).map((r) => r.body).join(";");
  const looks = Object.keys(LOOKS).filter((l): l is Look => l in LOOKS);

  test("the walk read rules (a sheet it cannot parse is not a sheet that agrees)", () => {
    expect(pills.length).toBeGreaterThan(8);
    expect(pips.length).toBeGreaterThan(5);
  });

  test.each(looks)("%s: the pill's colour is its role", (l) => {
    expect(rule(pills, `.${l}`)).toMatch(new RegExp(`(^|;)color:var\\(--${LOOKS[l].role}\\)`));
  });

  test.each(looks)("%s: the pill's ::before draws its mark", (l) => {
    const before = rule(pills, `.${l}::before`);
    const drawn: Mark = /animation:pulse/.test(before)
      ? "pulse"
      : /border-left:[^;]*solid/.test(before) && /border-right:[^;]*solid/.test(before)
        ? "bars"
        : /border:[^;]*dashed/.test(before)
          ? "dashed-ring"
          : /border:[^;]*solid/.test(before)
            ? "ring"
            : "dot";
    expect(drawn).toBe(LOOKS[l].mark);
  });

  test.each(looks.filter((l) => pipClasses({ looks: [l] })[0] === l))("%s: the pip's colour is its role", (l) => {
    const own = rule(pips, `.${l}`);
    const role = `var(--${LOOKS[l].role})`;
    // The idle pip is the bare pip with its border dashed; its colour is the bare pip's.
    expect(own.includes(role) || (/border-style:dashed/.test(own) && rule(pips, ".pip").includes(role))).toBe(true);
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
