import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";
import { holderSchema, type Holder } from "@gt/domain/job";
import { eventsMigrations } from "../src/events.ts";
import { assertFence, claimIn, heartbeatIn, leaseMigrations, leaveIn, releaseIn, statusIn } from "../src/lease.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Tx } from "../src/store.ts";
import { findPython, must, scratch } from "./helpers.ts";

// spec/lease.json is the lease's behaviour as a table, and it binds two
// implementations: this file runs it against src/lease.ts, then spawns
// py/lease_spec.py to run the same table (over py/lease.py) against the same migrated schema. Neither
// language is the reference; the table is.

const here = path.dirname(fileURLToPath(import.meta.url));
const specFile = path.join(here, "..", "spec", "lease.json");
const pyLease = path.join(here, "..", "py", "lease_spec.py");

const stepSchema = z.object({
  t: z.number().nonnegative(),
  op: z.enum(["claim", "heartbeat", "release", "leave", "fence", "status", "events", "kill"]),
  as: z.string().optional(),
  ticket: z.string().optional(),
  wait: z.boolean().optional(),
  fence: z.number().int().optional(),
  expect: z.unknown().optional(),
});
const specSchema = z.object({
  base: z.iso.datetime(),
  ttlS: z.number().int().positive(),
  actors: z.record(z.string(), holderSchema),
  scenarios: z.array(z.object({ name: z.string(), resource: z.string(), steps: z.array(stepSchema).min(1) })).min(1),
});
type Spec = z.output<typeof specSchema>;
type Scenario = Spec["scenarios"][number];
type Step = Scenario["steps"][number];

const spec = must(parseJsonAt("spec/lease.json", specSchema, readFileSync(specFile, "utf8")));

const tmp = scratch("lease-spec");
afterAll(() => tmp.dispose());
const template = path.join(tmp.dir, "template.sqlite");
{
  const s = must(openStore(template));
  must(migrate(s, [eventsMigrations, leaseMigrations], { snapshotDir: tmp.dir }));
  s.close();
}

function actor(name: string | undefined): Holder {
  const a = name === undefined ? undefined : spec.actors[name];
  if (a === undefined) throw new Error(`spec names an unknown actor ${String(name)}`);
  return a;
}
const nameOf = (h: Holder | undefined): string | null =>
  h === undefined ? null : (Object.entries(spec.actors).find(([, a]) => a !== undefined && a.bootId === h.bootId && a.pid === h.pid && a.host === h.host)?.[0] ?? "?");

function lostOrOk(fn: () => void, lost: (e: AppError) => unknown): unknown {
  try {
    fn();
    return "ok";
  } catch (e) {
    if (e instanceof AppError && e.code === "conflict") return lost(e);
    throw e;
  }
}

function perform(t: Tx, sc: Scenario, st: Step, killed: Set<number>): unknown {
  const alive = (pid: number) => !killed.has(pid);
  const r = sc.resource;
  switch (st.op) {
    case "claim": {
      const o = claimIn(t, { resource: r, holder: actor(st.as), ticket: st.ticket ?? "", ttlS: spec.ttlS, wait: st.wait ?? false }, alive);
      if (o.kind === "granted") return { granted: o.lease.fence };
      if (o.kind === "queued") return { queued: o.position };
      return { busy: nameOf(o.holder), ahead: o.ahead };
    }
    case "heartbeat":
      return lostOrOk(() => void heartbeatIn(t, r, st.fence ?? 0), (e) => ({ lost: e.detail }));
    case "release":
      return releaseIn(t, r, st.fence ?? 0) ? "released" : "not-held";
    case "leave":
      return leaveIn(t, r, st.ticket ?? "") ? "left" : "absent";
    case "fence":
      return lostOrOk(() => assertFence(t, r, st.fence ?? 0), () => "conflict");
    case "status": {
      const s = statusIn(t, r, actor(st.as), alive);
      return { holder: nameOf(s.holder?.holder), fence: s.fence, queue: s.queue.map((w) => nameOf(w.holder)), reclaims: s.reclaims, stale: s.stale ?? null };
    }
    case "events":
      return t.all("SELECT type, lane FROM events ORDER BY seq").map((e) => `${String(e["type"])}${e["lane"] === null ? "" : `@${String(e["lane"])}`}`);
    case "kill":
      killed.add(actor(st.as).pid);
      return undefined;
  }
}

describe("spec/lease.json against the Node implementation", () => {
  for (const [i, sc] of spec.scenarios.entries()) {
    it(sc.name, () => {
      const file = path.join(tmp.dir, `node-${i}.sqlite`);
      copyFileSync(template, file);
      let now = Date.parse(spec.base);
      const store = must(openStore(file, { clock: () => new Date(now) }));
      const killed = new Set<number>();
      try {
        for (const [k, st] of sc.steps.entries()) {
          now = Date.parse(spec.base) + st.t * 1000;
          const got = must(store.tx((t) => perform(t, sc, st, killed)));
          if (st.op !== "kill") expect(got, `step ${k} (${st.op} at t=${st.t})`).toEqual(st.expect);
        }
      } finally {
        store.close();
      }
    });
  }
});

const python = findPython();
if (python === undefined) console.warn("[lease.spec] SKIPPED: no Python 3 on PATH; the Python half of the lease spec did not run");

describe.skipIf(python === undefined)("spec/lease.json against the Python implementation", () => {
  it("passes every scenario, over the schema Node migrated", () => {
    const r = spawnSync(python ?? "python", ["-I", pyLease, specFile, template], { encoding: "utf8" });
    const report = must(parseJsonAt("lease_spec.py output", z.object({ scenarios: z.number(), failures: z.array(z.unknown()) }), r.stdout.trim() || r.stderr));
    expect(report.failures).toEqual([]);
    expect(report.scenarios).toBe(spec.scenarios.length);
    expect(r.status).toBe(0);
  });
});
