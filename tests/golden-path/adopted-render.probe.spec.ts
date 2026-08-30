// LANE — ADOPTION REACHES FRAMES, AND EVERY ABSENCE FALLS BACK HONESTLY (dynamic).
//
// THE SEAM THIS GUARDS. Step 2's "adopt this one" was local useState that
// persisted nothing, and Step 3 answered "which explainer chain" with the
// positional default — `RENDERS[0]`, for every project, whatever the creator
// chose (frames.ts:300 documented the missing record). The `script-adopted`
// record now exists and `resolveExplainerRender` (script/candidates/adoption.ts)
// is the ONE rule that turns it into a render, shared by the Script and Frames
// steps. This file asserts that rule's whole table, and the write→read seam
// over the real step store, so the duel's click and the frames derivation
// cannot drift apart without a probe going red.
//
// THE TABLE, from adoption.ts — three absences and one presence:
//   · key never written   → RENDERS[0] (a project that never adopted keeps
//                           exactly today's behaviour)
//   · renderId: ""        → RENDERS[0] (adopted once, explicitly cleared)
//   · renderId unknown    → RENDERS[0] (a pointer into a registry that cannot
//                           answer is the same absence with a longer name)
//   · renderId known      → that render, and the frames derive from ITS chain
//
// The import below has a SIDE EFFECT and must come first — it installs the
// storage engine on globalThis before any module under test reads `indexedDB`.
import "fake-indexeddb/auto";
import { test, expect } from "@playwright/test";

import {
  ADOPTION_PHASE,
  resolveExplainerRender,
} from "@/app/_phases/script/candidates/adoption";
import { explainerRender, framesFor, framesFromRender } from "@/app/_phases/frames/frames";
import { RENDERS, RENDER_BY_ID } from "@/app/_phases/script/renders";
import {
  readStep,
  saveStep,
  __resetSaveSlots,
  type ScriptAdoptionStepData,
} from "@/app/_phases/_shared/stepStore";

test.beforeEach(() => __resetSaveSlots());

/* ── 1 · the resolution table, total over the fixture set ───────────────────── */

test("every shipped render id resolves to itself — adoption is a pointer, not a copy", () => {
  for (const r of RENDERS) {
    expect(resolveExplainerRender(r.id), r.id).toBe(RENDER_BY_ID[r.id]);
    expect(resolveExplainerRender(r.id).id).toBe(r.id);
  }
  console.log(`[resolve] ${RENDERS.map((r) => `${r.id}→${resolveExplainerRender(r.id).id}`).join(" ")}`);
});

test("absent, cleared and unknown all fall back to the positional default — three absences, one answer", () => {
  // Absent record: `readStep` hands the resolver `undefined`.
  expect(resolveExplainerRender(undefined)).toBe(RENDERS[0]);
  // Cleared: the duel's unpick writes `renderId: ""` (the committed type says
  // `renderId: string`, so clearing cannot be a missing field — see adoption.ts).
  expect(resolveExplainerRender("")).toBe(RENDERS[0]);
  // Unknown: a record pointing at a render that no longer ships.
  expect(resolveExplainerRender("a-render-that-never-shipped")).toBe(RENDERS[0]);
  // And the fallback is the SAME object the old `const FIXTURE = RENDERS[0]`
  // handed to `explainerRender` — behaviour-preserving, not merely same-id.
  expect(resolveExplainerRender(undefined)).toBe(resolveExplainerRender(""));
});

/* ── 2 · the frames derive from the ADOPTED chain, not the default ──────────── */

test("an adopted render's frames are derived from ITS beats — the cut actually changes", () => {
  for (const r of RENDERS) {
    const resolved = resolveExplainerRender(r.id);
    const source = explainerRender(resolved);
    // The exact call useFrames now makes: fixture re-resolved from the source's
    // own id, so the derivation and the source cannot name different renders.
    const frames = framesFor(source, resolveExplainerRender(source.id));
    expect(frames, `${r.id} derives from its own chain`).toEqual(framesFromRender(r));
    expect(frames.length, `${r.id} frame count`).toBe(r.beats.length);
  }
  // The adoption is not cosmetic: the shipped renders have different beat
  // counts, so adopting a different card genuinely re-cuts the step.
  const counts = new Set(RENDERS.map((r) => r.beats.length));
  expect(counts.size).toBeGreaterThan(1);
  console.log(`[derive] ${RENDERS.map((r) => `${r.id}:${r.beats.length}f`).join(" ")}`);
});

test("a changed adoption flips the staleness key, so a stored cut re-derives rather than lingering", () => {
  // useFrames keeps `stored.renderId === source.id` as the staleness test. The
  // source id IS the adopted render's id, so adopting a different card makes a
  // cut stored under the old one read as stale — which is exactly what it is.
  const before = explainerRender(resolveExplainerRender(undefined));
  const after = explainerRender(resolveExplainerRender("adjudication"));
  expect(before.id).toBe(RENDERS[0].id);
  expect(after.id).toBe("adjudication");
  expect(before.id === after.id, "the staleness key must move with the adoption").toBe(false);
  // And clearing the adoption moves it back — the fallback cut becomes current
  // again instead of a third identity nothing stored ever matches.
  expect(explainerRender(resolveExplainerRender("")).id).toBe(before.id);
});

/* ── 3 · the write→read seam, over the real step store ──────────────────────── */

test("an adoption written by the duel is what the frames read resolves — the seam, driven", async () => {
  const pid = "p-probe-adoption-seam";

  // Fresh project: the key has never been written, and that is a real answer.
  const absent = await readStep<ScriptAdoptionStepData>(pid, ADOPTION_PHASE);
  expect(absent.ok, "the read itself succeeds").toBe(true);
  if (!absent.ok) return;
  expect(absent.data).toBeUndefined();
  expect(resolveExplainerRender(absent.data?.renderId)).toBe(RENDERS[0]);

  // The duel's pick: card #2, exactly what useAdoption writes on the click.
  expect((await saveStep<ScriptAdoptionStepData>(pid, ADOPTION_PHASE, { renderId: "adjudication" })).ok).toBe(true);
  const adopted = await readStep<ScriptAdoptionStepData>(pid, ADOPTION_PHASE);
  expect(adopted.ok).toBe(true);
  if (!adopted.ok) return;
  expect(adopted.data?.renderId).toBe("adjudication");
  const source = explainerRender(resolveExplainerRender(adopted.data?.renderId));
  expect(source.id).toBe("adjudication");
  expect(source.origin).toBe("explainer-fixture");
  expect(framesFor(source, resolveExplainerRender(source.id))).toEqual(
    framesFromRender(RENDER_BY_ID.adjudication),
  );

  // The duel's unpick: cleared is `""`, and it reads as the fallback.
  expect((await saveStep<ScriptAdoptionStepData>(pid, ADOPTION_PHASE, { renderId: "" })).ok).toBe(true);
  const cleared = await readStep<ScriptAdoptionStepData>(pid, ADOPTION_PHASE);
  expect(cleared.ok).toBe(true);
  if (!cleared.ok) return;
  expect(cleared.data?.renderId).toBe("");
  expect(resolveExplainerRender(cleared.data?.renderId)).toBe(RENDERS[0]);

  // A stale pointer — the record survives, the render it names does not.
  expect((await saveStep<ScriptAdoptionStepData>(pid, ADOPTION_PHASE, { renderId: "retired-engine" })).ok).toBe(true);
  const stale = await readStep<ScriptAdoptionStepData>(pid, ADOPTION_PHASE);
  expect(stale.ok).toBe(true);
  if (!stale.ok) return;
  expect(resolveExplainerRender(stale.data?.renderId)).toBe(RENDERS[0]);

  console.log("[seam] absent→r0 · adopt adjudication→adjudication · clear ''→r0 · unknown→r0");
});
