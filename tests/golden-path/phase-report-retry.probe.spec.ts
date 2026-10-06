// A REFUSED PROGRESS WRITE IS RETRIED, AND THERE IS ONE REPORTER (dynamic + source).
//
// `usePhaseReport` took its dedupe stamp BEFORE awaiting `reportPhase`, and the
// effect re-runs only when its deps move. One transient rejection therefore left
// the shelf and the rail on the wrong phase word for the rest of the session:
// the stamp said "reported", the store said otherwise, nothing would ever look
// again. `useFrames` carried a byte-identical copy (`lastReport`), so the defect
// had two homes; it now calls the shared hook, and the source assertion pins that.
//
// The import below has a SIDE EFFECT and must come first.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import * as React from "react";

import { REPORT_RETRY_MS, usePhaseReport } from "@/app/_phases/_shared/usePhaseReport";
import { getProject, newProject, putProject } from "@/lib/projects";

import { stripComments } from "./_helpers";

interface Internals {
  H: unknown;
}
const INTERNALS = (React as unknown as Record<string, Internals>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

/** The same dispatcher the sibling probes drive hooks under: state, ref, effect. */
function harness(run: () => void) {
  const cells: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const committed: { deps?: readonly unknown[]; cleanup?: () => void }[] = [];
  let ci = 0;
  let ri = 0;
  let ei = 0;
  let queue: (() => void)[] = [];
  const dispatcher = {
    useState(init: unknown) {
      const k = ci++;
      if (!(k in cells)) cells[k] = typeof init === "function" ? (init as () => unknown)() : init;
      return [
        cells[k],
        (v: unknown) => {
          cells[k] = typeof v === "function" ? (v as (p: unknown) => unknown)(cells[k]) : v;
        },
      ];
    },
    useRef(init: unknown) {
      const k = ri++;
      if (!(k in refs)) refs[k] = { current: init };
      return refs[k];
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
  };
  return {
    async render() {
      ci = 0;
      ri = 0;
      ei = 0;
      const before = INTERNALS.H;
      INTERNALS.H = dispatcher;
      try {
        run();
      } finally {
        INTERNALS.H = before;
      }
      const firing = queue;
      queue = [];
      for (const f of firing) f();
      await settle();
    },
    unmount() {
      for (const c of committed) c.cleanup?.();
    },
  };
}

test("a progress write refused once is retried and lands", async () => {
  const p = await putProject(
    newProject("u-retry", { title: "t", logline: "l", template: "explainer", discipline: "video", targetS: 60 } as unknown as Parameters<typeof newProject>[1]),
  );
  // Refuse exactly the first open of the store, the way a blocked upgrade does.
  const realOpen = indexedDB.open.bind(indexedDB);
  let opens = 0;
  let refused = 0;
  indexedDB.open = ((...a: Parameters<IDBFactory["open"]>) => {
    opens++;
    if (refused === 0) {
      refused++;
      throw new Error("transient: the store was busy");
    }
    return realOpen(...a);
  }) as IDBFactory["open"];
  const h = harness(() => usePhaseReport(p.id, "frames", "working"));
  try {
    await h.render();
    expect(refused, "the injected refusal never fired").toBe(1);
    expect((await getProject(p.id))?.progress.frames).toBe("empty");
    await new Promise((r) => setTimeout(r, REPORT_RETRY_MS[0] + 300));
    await h.render();
    await settle();
    expect((await getProject(p.id))?.progress.frames, "the refused write was never retried").toBe("working");
    expect(opens).toBeGreaterThanOrEqual(2);
  } finally {
    h.unmount();
    indexedDB.open = realOpen;
  }
});

test("the backoff is a short bounded table, and the first refusal does not spin", async () => {
  const realOpen = indexedDB.open.bind(indexedDB);
  let opens = 0;
  indexedDB.open = (() => {
    opens++;
    throw new Error("quota");
  }) as unknown as IDBFactory["open"];
  const h = harness(() => usePhaseReport("p-gone", "frames", "working"));
  try {
    await h.render();
    await new Promise((r) => setTimeout(r, 50));
    expect(REPORT_RETRY_MS.length).toBeGreaterThan(0);
    expect(REPORT_RETRY_MS.length).toBeLessThanOrEqual(5);
    expect(opens).toBe(1);
  } finally {
    h.unmount();
    indexedDB.open = realOpen;
  }
});

test("useFrames reports through the shared hook and keeps no stamp of its own", () => {
  const src = stripComments(readFileSync("app/_phases/frames/useFrames.ts", "utf8"));
  expect(src.length).toBeGreaterThan(1000);
  expect(src).toMatch(/usePhaseReport\(\s*projectId,\s*PHASE,\s*reported\s*\)/);
  expect(src, "useFrames carries its own pre-await stamp").not.toMatch(/lastReport/);
  expect(src, "useFrames calls reportPhase itself").not.toMatch(/\breportPhase\s*\(/);
});
