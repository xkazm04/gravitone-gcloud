import "server-only";

// THE FIXTURE SIDE - the generated universe (./fixtureData.ts) through the real builder's pure half (graphOf), and
// the steer held in memory for the server process. Pause, resume and the split go through the SAME doors the real
// side's steer.ts does (the ref's shape, checkSplit), so a refusal reads here exactly as it reads over the store.
// `SCOUT_FIXTURE_SCALE` repeats the universe (the 10x measure); absent, it is drawn once.

import { err, ok, type Result } from "@gt/domain/errors";

import { graphOf } from "../../../../lib/foundry/scout/graph.ts";
import { checkSplit } from "../../../../lib/foundry/scout/steer.ts";
import { SEED_REF_RE, type Steer, type SteerSplit } from "../../../../lib/foundry/scout/types.ts";
import { FIXTURE_NOW, fixtureEffort, fixtureSteer, fixtureUniverse } from "./fixtureData.ts";
import type { ScoutView } from "./contract.ts";
import type { ServerScout } from "./port.ts";

const scale = (): number => {
  const n = Number.parseInt(process.env["SCOUT_FIXTURE_SCALE"] ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 1;
};

const world = (() => {
  const u = fixtureUniverse(scale());
  return { ...u, effort: fixtureEffort(u.nights) };
})();
let steer: Steer = fixtureSteer(world.batches);

const view = (): ScoutView => ({
  graph: graphOf({ nights: world.nights, batches: world.batches, steer, effort: world.effort, now: FIXTURE_NOW }),
  ...(steer.split === undefined ? {} : { split: steer.split }),
});

function act(next: (s: Steer) => Result<Steer>): Result<ScoutView> {
  const r = next(steer);
  if (!r.ok) return r;
  steer = r.value;
  return ok(view());
}

const refused = (ref: string): string | undefined => (SEED_REF_RE.test(ref) ? undefined : `not a seed ref: ${ref} (want <batch>/sd-NNN)`);

export const fixtureScout: ServerScout = {
  view: async () => ok(view()),
  pause: async (ref, by) =>
    act((s) => {
      const no = refused(ref);
      if (no !== undefined) return err("invalid", no);
      return ok(s.paused.includes(ref) ? s : { ...s, paused: [...s.paused, ref], history: [...s.history, { at: new Date().toISOString(), by, act: "pause", ref }] });
    }),
  resume: async (ref, by) =>
    act((s) => {
      const no = refused(ref);
      if (no !== undefined) return err("invalid", no);
      return ok(s.paused.includes(ref) ? { ...s, paused: s.paused.filter((r) => r !== ref), history: [...s.history, { at: new Date().toISOString(), by, act: "resume", ref }] } : s);
    }),
  split: async (split: SteerSplit, by) =>
    act((s) => {
      const c = checkSplit(split);
      return c.ok ? ok({ ...s, split: c.value, history: [...s.history, { at: new Date().toISOString(), by, act: "split", split: c.value }] }) : c;
    }),
};
