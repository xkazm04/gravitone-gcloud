// LANE — A RUN THAT FINISHES TWICE (pure, fake IO).
//
// The engine is a step machine and `finish` is a unit like any other, so a
// retry — prune the failed units, step again — walks back through it. Two
// things at `finish` were written as if it ran once: the twin warning, which
// appended its pair to `similar_to` on every pass, and (next test) the
// retry's prune, which its own comment called a no-op on a clean run and was
// not. Both are pinned against a hand-built manifest already at its last
// unit, driven with an IO that records nothing.

import { test, expect } from "@playwright/test";

import { newManifest, pruneFailures, step, type EngineIO } from "@/lib/foundry/extract/engine";
import type { ExtractManifest, ExtractedStyle, Observables, Readback } from "@/lib/foundry/extract/types";

const NOW = "2026-09-05T00:00:00.000Z";

const obs = (over: Partial<Observables> = {}): Observables => ({
  render_mode: "painterly",
  medium: "2d-digital-painting",
  detail_density: "dense",
  surface_realism: "plausible",
  atmospherics: "heavy-haze",
  particle_fx: "none",
  palette_strategy: "warm-cool-split",
  black_handling: "crushed",
  edge_treatment: "soft",
  finish: "painterly-textured",
  focus: "deep-focus",
  ...over,
});

const readback = (o: Observables): Readback => ({ ...o, has_text: false, dominant_colours: ["teal"], look: "a painted look", depiction: "a figure" });

/** A style whose one replica has already hit the round cap — settled, no more work. */
function settledStyle(id: string, o: Observables, rounds: number): ExtractedStyle {
  return {
    id,
    name: id,
    family: "painterly",
    members: ["s01"],
    observables: o,
    recipe: `${id} recipe, long enough to count as a real recipe for the loop.`,
    negative: "text, watermark",
    recipe_history: [],
    grouped_by: "engine",
    replicas: [
      {
        source: "s01",
        rounds: Array.from({ length: rounds }, (_, i) => ({
          n: i + 1,
          file: `styles/${id}/replica-s01-r${i + 1}.jpg`,
          recipe: "r",
          prompt: "p",
          critique: null,
          score: 0.5,
          per_field: {},
          generator: "fake",
          vision: "fake",
          error: null,
        })),
      },
    ],
    transfers: [],
  };
}

/** A manifest standing at its `finish` unit: read, grouped into two TWIN
 *  styles (one minor field apart), replicated to the cap, no transfers. */
function atFinish(): ExtractManifest {
  const m = newManifest(
    "2026-09-05-twins",
    "twins",
    [{ id: "s01", name: "s01.jpg", file: "sources/s01.jpg", mime: "image/jpeg", width: 1280, height: 720, aspect: "16:9", readback: readback(obs()), error: null }],
    { rounds: 1, replicas: 1, transfers: 0 },
    NOW,
  );
  m.status = "replicating";
  m.styles = [settledStyle("haze-a", obs(), 1), settledStyle("haze-b", obs({ edge_treatment: "crisp" }), 1)];
  return m;
}

const io: EngineIO = {
  readImage: async () => ({ base64: "", mime: "image/jpeg" }),
  writeImage: async () => {},
  recognize: async () => ({ value: {}, model: "none" }),
  generate: async () => ({ value: { base64: "", mime: "image/jpeg" }, model: "none" }),
  reason: async () => ({ value: {}, model: "none" }),
  save: async () => {},
  now: () => NOW,
};

test("finish: twins are recorded ONCE in similar_to however many times the run finishes", async () => {
  const m = atFinish();
  const first = await step(m, io);
  expect(first.unit).toBe("finish");
  expect(m.status).toBe("done");
  expect(m.styles[0].similar_to).toEqual(["haze-b"]);
  expect(m.styles[1].similar_to).toEqual(["haze-a"]);

  // A retry walks back through finish. Before the fix: [b, b], then [b, b, b].
  for (let pass = 0; pass < 2; pass++) {
    pruneFailures(m);
    m.status = "replicating"; // the shape a retry leaves a run in
    const again = await step(m, io);
    expect(again.unit).toBe("finish");
  }
  const warnings = m.log.filter((l) => l.msg.startsWith("warning: haze-a and haze-b")).length;
  console.log(`[extract] after 3 finishes -> similar_to=${JSON.stringify(m.styles[0].similar_to)} warnings=${warnings}`);
  expect(m.styles[0].similar_to).toEqual(["haze-b"]);
  expect(m.styles[1].similar_to).toEqual(["haze-a"]);
  expect(warnings).toBe(1);
});

test("pruneFailures: a run with nothing failed is left exactly as it was — zero pruned, zero touched", async () => {
  const m = atFinish();
  await step(m, io);
  expect(m.status).toBe("done");
  const before = JSON.stringify(m);

  // Before the fix: `finished` deleted, status back to "replicating", and the
  // next step finished the run a second time with a second "done" line.
  const n = pruneFailures(m);
  console.log(`[extract] prune on a clean done run -> pruned=${n} status=${m.status} finished=${m.finished}`);
  expect(n).toBe(0);
  expect(m.status).toBe("done");
  expect(m.finished).toBe(NOW);
  expect(JSON.stringify(m)).toBe(before);

  // And the step that follows a retry has nothing to do.
  const r = await step(m, io);
  expect(r.unit).toBeNull();
  expect(m.log.filter((l) => l.msg.startsWith("done:")).length).toBe(1);
});
