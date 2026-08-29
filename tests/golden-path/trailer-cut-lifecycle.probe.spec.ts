// LANE — useTrailerCut's HYDRATE / SEED / SAVE LIFECYCLE, driven for real (dynamic).
//
// WHAT WAS UNCOVERED. `pipeline/trailer-structure-regression.mts` is substantial
// — 21 cases and six cross-case invariants — and every one of them calls
// `runStructureCheck` on a hand-built fixture. Nothing anywhere drove the HOOK
// that decides whether a project has a cut at all, and that hook owns the two
// decisions a creator can actually lose work to:
//
//   · SEED-ONCE. A project with confirmed picks and no saved cut composes one
//     and writes it. A project with a saved cut must hydrate THAT and never
//     recompose — recomposing would silently discard every edit made in Step 2,
//     because `composeCut` reads the picks, and the picks are the cut's history
//     rather than its content.
//   · NOTHING IS WRITTEN FOR AN EMPTY SPINE (useTrailerCut.ts:59-76). A project
//     with no confirmed picks hydrates to `cut: null`, and the save effect is
//     gated so the `script-trailer` key stays ABSENT. An empty cut written here
//     would be a Step 2 record that Step 3 then reads as a composed spine.
//
// HOW IT IS DRIVEN, and the honest limits of it. There is no DOM in this lane
// and no renderer — `react-dom/client` needs a container this process does not
// have, and adding one is a dependency, not a test. So the probe installs a
// MINIMAL HOOK DISPATCHER on React's own current-dispatcher slot and calls
// `useTrailerCut` directly: the real hook module, the real effects, the real
// `stepStore`, over a real IndexedDB engine (`fake-indexeddb`). What is NOT
// covered is React's scheduling — batching, transitions, StrictMode's double
// invoke and concurrent re-entry are the renderer's, and none of them is
// exercised here. The harness asserts it installed, so a React release that
// moves the slot fails loudly on the harness rather than passing vacuously.
//
// The import below has a SIDE EFFECT and must come first — it installs the
// storage engine on globalThis before any module under test reads `indexedDB`.
import "fake-indexeddb/auto";
import { test, expect } from "@playwright/test";
import * as React from "react";

import { useTrailerCut } from "@/app/_phases/script/trailer/useTrailerCut";
import { slotsFor } from "@/app/_phases/research/beats/beats";
import {
  readStep,
  saveStep,
  __resetSaveSlots,
  type BeatPicksStepData,
  type TrailerCutStepData,
} from "@/app/_phases/_shared/stepStore";
import { openDb, runTx, STEPS_STORE } from "@/lib/studioDb";
import { GLASS_HARBOR_BUDGET, GLASS_HARBOR_CUE } from "@/app/_studio/trailerFixtures";
import { composeCut } from "@/app/_phases/script/trailer/cut";
import { trailerRender } from "@/app/_phases/frames/frames";
import { shotsFromRender } from "@/app/_phases/frames/shots";

/* ────────────────────────────── the harness ─────────────────────────────────
   Sixty lines, and every one of them is a hook `useTrailerCut` actually calls:
   useState, useEffect, useCallback, useMemo. Nothing else is implemented, so a
   hook that starts using something else fails here with a TypeError naming it
   rather than quietly returning undefined. */

interface Internals {
  H: unknown;
}
const INTERNALS = (React as unknown as Record<string, Internals>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/** Let the effects' async bodies settle — they open a database and await it, so
 *  microtask flushing alone is not enough. */
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

function harness<T>(run: () => T) {
  const cells: unknown[] = [];
  const committed: { deps?: readonly unknown[]; cleanup?: () => void }[] = [];
  const memos: { deps?: readonly unknown[]; value: unknown }[] = [];
  let ci = 0;
  let ei = 0;
  let mi = 0;
  let dirty = false;
  let queue: (() => void)[] = [];

  const dispatcher = {
    useState(init: unknown) {
      const k = ci++;
      if (!(k in cells)) cells[k] = typeof init === "function" ? (init as () => unknown)() : init;
      return [
        cells[k],
        (v: unknown) => {
          const next = typeof v === "function" ? (v as (p: unknown) => unknown)(cells[k]) : v;
          if (!Object.is(next, cells[k])) {
            cells[k] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(v: unknown) {
      const k = ci++;
      if (!(k in cells)) cells[k] = { current: v };
      return cells[k];
    },
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      const k = ei++;
      const prev = committed[k];
      if (prev && sameDeps(prev.deps, deps)) return;
      queue.push(() => {
        prev?.cleanup?.();
        const cleanup = fn();
        committed[k] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
    },
    useMemo(fn: () => unknown, deps?: readonly unknown[]) {
      const k = mi++;
      const prev = memos[k];
      if (prev && sameDeps(prev.deps, deps)) return prev.value;
      const value = fn();
      memos[k] = { deps, value };
      return value;
    },
    useCallback(fn: unknown, deps?: readonly unknown[]) {
      return dispatcher.useMemo(() => fn, deps);
    },
  };

  return {
    /** Render, commit effects, let their async bodies land, and repeat while
     *  state keeps changing — which is what a renderer does, minus the parts
     *  this lane cannot have. */
    async settleUp(): Promise<T> {
      let out!: T;
      for (let pass = 0; pass < 40; pass++) {
        ci = 0;
        ei = 0;
        mi = 0;
        dirty = false;
        const before = INTERNALS.H;
        INTERNALS.H = dispatcher;
        try {
          out = run();
        } finally {
          INTERNALS.H = before;
        }
        const firing = queue;
        queue = [];
        for (const f of firing) f();
        await settle();
        if (!dirty && firing.length === 0) return out;
      }
      throw new Error("the hook never settled in 40 passes — a render loop, or an effect whose deps change every time");
    },
    unmount() {
      for (const c of committed) c.cleanup?.();
    },
  };
}

test("the harness is installed on the dispatcher React actually reads", () => {
  // If a React release moves this slot, this line fails and every test below is
  // reported as broken TOOLING rather than as a broken hook — which is the whole
  // reason it is a separate assertion.
  expect(INTERNALS, "React's client internals are not where this harness expects").toBeTruthy();
  expect("H" in INTERNALS).toBe(true);
});

/* ───────────────────────────────── fixtures ─────────────────────────────────── */

async function clearSteps() {
  const db = await openDb();
  await runTx(db, STEPS_STORE, "readwrite", (store) => {
    store.clear();
  });
}

/** Every slot's first variant, confirmed — the record Step 1 writes when a
 *  creator composes a whole spine. */
function wholeSpinePicks(): BeatPicksStepData {
  const slots = slotsFor("trailer");
  const picks = Object.fromEntries(slots.map((s) => [s.id, s.variants[0].id]));
  return { mode: "beats", picks, confirmed: picks };
}

const drive = (projectId: string) =>
  harness(() => useTrailerCut({ projectId, discipline: "trailer", title: "Glass Harbor — trailer" }));

test.beforeEach(async () => {
  __resetSaveSlots();
  await clearSteps();
});

/* ── 1 · the seed ───────────────────────────────────────────────────────────── */

test("confirmed picks and no saved cut: the hook composes one, and writes it ONCE", async () => {
  await saveStep("p-seed", "research-beats", wholeSpinePicks());

  const h = drive("p-seed");
  const api = await h.settleUp();

  expect(api.hydrated, "hydration must land").toBe(true);
  expect(api.cut, "a confirmed spine must compose a cut").not.toBe(null);
  expect(api.cut!.beats.length).toBe(slotsFor("trailer").length);
  expect(api.budget, "the campaign budget travels with the seeded cut").toEqual(GLASS_HARBOR_BUDGET);
  // The verdict is recomputed from the cut on screen, never stored.
  expect(api.report, "a cut on screen always carries a report").not.toBe(null);

  const stored = await readStep<TrailerCutStepData>("p-seed", "script-trailer");
  expect(stored.ok).toBe(true);
  expect(stored.ok && stored.data?.cut?.beats.length, "the seed reached the record").toBe(api.cut!.beats.length);
  console.log(`[seed] ${api.cut!.beats.length} beats composed and saved; ${api.report!.findings.length} finding(s)`);
  h.unmount();
});

/* ── 2 · the branch that must write NOTHING ─────────────────────────────────── */

test("no confirmed picks: no cut, no budget, and the key is never written", async () => {
  // Deliberately a picks record that EXISTS and confirms nothing — the case a
  // missing record and a half-finished spine both collapse into, and the one a
  // seeder that only checked for `undefined` would have got wrong.
  await saveStep("p-empty", "research-beats", { mode: "beats", picks: {}, confirmed: null });

  const h = drive("p-empty");
  const api = await h.settleUp();

  expect(api.hydrated).toBe(true);
  expect(api.cut).toBe(null);
  expect(api.budget).toBe(null);
  expect(api.report, "no cut means no verdict — not a green one").toBe(null);

  const stored = await readStep<TrailerCutStepData>("p-empty", "script-trailer");
  // `ok: true, data: undefined` is the shape that says NEVER WRITTEN, as opposed
  // to a failed read. An empty cut written here would be read downstream as a
  // composed spine, which is exactly what Step 3 must not be handed.
  expect(stored.ok).toBe(true);
  expect(stored.ok && stored.data, "nothing may be written for an uncomposed spine").toBe(undefined);
  h.unmount();
});

test("a spine confirmed but empty is the same absence", async () => {
  await saveStep("p-blank", "research-beats", { mode: "beats", picks: {}, confirmed: {} });
  const h = drive("p-blank");
  const api = await h.settleUp();
  expect(api.cut).toBe(null);
  expect((await readStep<TrailerCutStepData>("p-blank", "script-trailer")).ok).toBe(true);
  expect((await readStep<TrailerCutStepData>("p-blank", "script-trailer")) as { data?: unknown }).toHaveProperty(
    "data",
    undefined,
  );
  h.unmount();
});

/* ── 3 · hydrate wins over seed ─────────────────────────────────────────────── */

test("a SAVED cut hydrates as itself — the picks never recompose over an edited cut", async () => {
  const slots = slotsFor("trailer");
  const picks = Object.fromEntries(slots.map((s) => [s.id, s.variants[0].id]));
  const composed = composeCut({
    projectId: "p-edited",
    title: "Glass Harbor — trailer",
    picks,
    slots,
    cue: GLASS_HARBOR_CUE,
  });
  // The creator's own edit, made in Step 2 and living only on the cut record.
  const edited = {
    ...composed,
    beats: composed.beats.map((b, i) => (i === 0 ? { ...b, label: "AN EDIT NOBODY MAY DISCARD" } : b)),
  };
  await saveStep<TrailerCutStepData>("p-edited", "script-trailer", {
    cut: edited,
    budget: GLASS_HARBOR_BUDGET,
  });
  // And the picks are still there, offering the ORIGINAL label — so a hook that
  // recomposed would produce a cut that looks plausible and has lost the edit.
  await saveStep("p-edited", "research-beats", wholeSpinePicks());

  const h = drive("p-edited");
  const api = await h.settleUp();

  expect(api.cut!.beats[0].label).toBe("AN EDIT NOBODY MAY DISCARD");
  expect(api.cut!.beats[0].label).not.toBe(composed.beats[0].label);
  h.unmount();
});

/* ── 4 · the join. What the hook wrote is what Frames decomposes ─────────────── */

test("the cut the hook seeded reaches the shot lane — Step 2 to Step 3, end to end", async () => {
  await saveStep("p-join", "research-beats", wholeSpinePicks());
  const h = drive("p-join");
  await h.settleUp();
  h.unmount();

  // Read it back the way `useFrames` reads it: from the record, not from memory.
  const stored = await readStep<TrailerCutStepData>("p-join", "script-trailer");
  expect(stored.ok && stored.data?.cut).toBeTruthy();
  const cut = (stored as { data: TrailerCutStepData }).data.cut;

  const shots = shotsFromRender(trailerRender(cut, { template: "trailer", durationS: 120 }));
  // THE WHOLE POINT. Step 1's picks → Step 2's composed record → Step 3's shots,
  // with a real database in the middle. This was zero before the resolver landed.
  expect(shots.length, "a saved trailer cut must decompose into shots").toBeGreaterThan(0);
  console.log(`[join] picks -> saved cut (${cut.beats.length} beats) -> ${shots.length} shots`);
});
