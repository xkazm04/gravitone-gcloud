// LANE — THE BOARD DEALS THE PROJECT'S OWN NOTEBOOK (research-scope-board-A, stage 3).
//
// Stages 1-2 made "the notebook the board deals" one object (NotebookSource) and
// let a notebook carry its own columns and conclusions. Every caller still dealt
// the fixture: `useScope(projectId)` defaulted to `fixtureSource()`, and the
// live card (run/LiveResult.tsx) and the run wiring (guided/useEducationalResearch.ts)
// both kept the creator's reasoned notebook away from the board on purpose.
//
// Stage 3 resolves the project's ACTIVE notebook from the step store and deals
// it. What is pinned here, driven against the real hooks over a real IndexedDB
// engine (`fake-indexeddb`) with the minimal-dispatcher harness
// step-records.probe.spec.ts uses (no DOM in this lane):
//
//   · card case 4 — a non-null `research-notebook` record resolves to
//     `reasoned` (or `researched`, as its receipt says); after `resetLive` it
//     resolves to the replay and never to the cleared notebook — at once, and
//     on disk, and even when the reset lands while a mount's read is in flight.
//   · card case 5 — a scope saved against digest X and loaded against a source
//     with digest Y is orphaned and applies no verdicts; a digest-less scope
//     (every scope written before this stage, all against the fixture) still
//     applies on the replay.
//   · a live notebook that tags every card is dealt alone: its own cards, no
//     fixture conclusion, nothing untagged, no fixture card id.
//   · project A's live notebook does not reach project B.
//   · with no live notebook the board is the fixture board exactly.
//
// The modules are imported STATICALLY: a runtime `import()` here loads them
// without this lane's `@/` alias resolution for THEIR imports (see
// step-verdicts.probe.spec.ts and job-elapsed.probe.spec.ts).
//
// The import below has a SIDE EFFECT and must come first.
import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";
import * as React from "react";

import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import { CONCLUSIONS, type Conclusion } from "@/app/_phases/_shared/notebook/conclusions";
import { UNTAGGED_DIMENSION_ID, type Dimension } from "@/app/_phases/_shared/notebook/dimensions";
import { NOTEBOOK } from "@/app/_phases/_shared/notebook/notebook";
import { fixtureSource, sourceOf } from "@/app/_phases/_shared/notebook/source";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";
import {
  activeSourceOf,
  LIVE_NOTEBOOK_PHASE,
  readActiveNotebook,
  useActiveNotebook,
} from "@/app/_phases/_shared/notebook/useActiveNotebook";
import { readStep, saveStep, type ScopeStepData } from "@/app/_phases/_shared/stepStore";
import { RESEARCH_SCOPE } from "@/app/_phases/research/records";
import { resetLive, type EngineReceipt } from "@/app/_phases/research/run/live";
import { stateOf } from "@/app/_phases/research/scope";
import { useScope } from "@/app/_phases/research/useScope";
import { parseNotebook } from "@/lib/notebook/validate";

import { loadCassette, stripComments, type CassetteTurn } from "./_helpers";

const ROOT = process.cwd();

/* ────────────────────────────── the harness ───────────────────────────────── */
// step-records.probe.spec.ts's dispatcher, plus `useSyncExternalStore` (read the
// snapshot; the next pass re-reads it, which is all a store update means here).
// `settle` turns the loop with setImmediate rather than setTimeout(0): the
// engine's work drains the same, and on this OS a zero timer costs a clock tick,
// which made this file take a minute instead of two seconds.

interface Internals {
  H: unknown;
}
const INTERNALS = (React as unknown as Record<string, Internals>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

const settle = async () => {
  for (let i = 0; i < 200; i++) await new Promise((r) => setImmediate(r));
};

function harness<T>(run: () => T) {
  const cells: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const committed: { deps?: readonly unknown[]; cleanup?: () => void }[] = [];
  const memos: { deps?: readonly unknown[]; value: unknown }[] = [];
  let ci = 0;
  let ei = 0;
  let mi = 0;
  let ri = 0;
  let dirty = false;
  let queue: (() => void)[] = [];
  let out!: T;

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
    useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) {
      return getSnapshot();
    },
  };

  return {
    async settleUp(): Promise<T> {
      for (let pass = 0; pass < 60; pass++) {
        ci = 0;
        ei = 0;
        mi = 0;
        ri = 0;
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
        if (!dirty) return out;
      }
      throw new Error("the hook never settled in 60 passes");
    },
    get current(): T {
      return out;
    },
    unmount() {
      for (const c of committed) c?.cleanup?.();
    },
  };
}

test("the harness is installed on the dispatcher React actually reads", () => {
  expect(INTERNALS, "React's client internals are not where this harness expects").toBeTruthy();
  expect("H" in INTERNALS).toBe(true);
});

/* ───────────────────────────────── fixtures ───────────────────────────────── */

/** A schema-valid notebook (the retrieval cassette's answer, as
 *  notebook-source.probe.spec.ts uses it) that declares its own columns, tags
 *  every Fact/Mechanism/Reversal, and carries one conclusion of its own. */
const RAW = (loadCassette("research-retrieve").turns[0]! as CassetteTurn).resultJson as Record<string, unknown>;

const COLUMNS: Dimension[] = [
  { id: "volume", label: "Volume", purpose: "How much moved.", emptyByOmission: "Nobody measured it.", notApplicable: "Nothing moved." },
  { id: "rate", label: "Rate", purpose: "What it cost.", emptyByOmission: "Nobody priced it.", notApplicable: "Nothing was charged." },
];

const OWN_CONCLUSION: Conclusion = {
  id: "c-harbour-own",
  claim: "The dredging bill is a rate story, not a volume story.",
  reasoning: "Because the dredging volume and the rate disagree.",
  leap: "moderate",
  restsOn: ["f-volume", "f-rate"],
  falsifiableBy: "A harbour authority invoice.",
  useFor: "thesis",
};

function liveNotebook(): Notebook {
  const nb = structuredClone(RAW) as {
    facts: { dimension?: string }[];
    mechanisms: { dimension?: string }[];
    reversals: { dimension?: string }[];
  };
  nb.facts.forEach((f, i) => (f.dimension = i % 2 ? "rate" : "volume"));
  nb.mechanisms.forEach((m) => (m.dimension = "volume"));
  nb.reversals.forEach((r) => (r.dimension = "rate"));
  return parseNotebook({ ...nb, dimensions: structuredClone(COLUMNS), conclusions: [OWN_CONCLUSION] }, "harbour dredging costs");
}

const RECEIPT: EngineReceipt = {
  kind: "local-claude-code",
  provider: "claude-cli",
  model: "probe-model",
  rung: "reason",
  transport: "cli",
  schemaEnforcement: "prompt",
  costBasis: "unpriced",
  durationMs: 1,
  promptChars: 1,
  searched: false,
};

/** What `startLive` writes when a run lands — through the same `saveStep`. */
async function landLive(projectId: string, receipt: EngineReceipt = RECEIPT): Promise<Notebook> {
  const notebook = liveNotebook();
  const out = await saveStep(projectId, LIVE_NOTEBOOK_PHASE, { topic: "harbour dredging costs", notebook, engine: receipt, savedAt: 1 });
  expect(out.ok, "the live record was not written - nothing below proves anything").toBe(true);
  return notebook;
}

async function scopeOnDisk(projectId: string): Promise<ScopeStepData | undefined> {
  const r = await readStep<ScopeStepData>(projectId, "research-scope");
  expect(r.ok).toBe(true);
  return r.ok ? r.data : undefined;
}

/** Card ids that belong to the 2026-08-11 run itself. `counter-N` and
 *  `steel-man` are not here: buildCards mints those ids for EVERY notebook. */
const FIXTURE_IDS = new Set([
  ...NOTEBOOK.facts.map((f) => f.id),
  ...NOTEBOOK.mechanisms.map((m) => m.id),
  ...NOTEBOOK.reversals.map((r) => r.id),
  ...CONCLUSIONS.map((c) => c.id),
]);

const board = (projectId: string) =>
  harness(() => {
    const active = useActiveNotebook(projectId);
    const api = useScope(projectId, active.source);
    return { active, api };
  });

/* ─────────────────────────── case 4: which notebook ───────────────────────── */

test("case 4: a non-null research-notebook record resolves to `reasoned`, and the receipt decides `researched`", async () => {
  const notebook = await landLive("an-reasoned");
  const src = await readActiveNotebook("an-reasoned");
  expect(src, "the read failed").not.toBeNull();
  expect(src!.kind).toBe("reasoned");
  expect(src!.notebook.id).toBe(notebook.id);
  expect(src!.receipt?.model).toBe("probe-model");
  expect(src!.digest).not.toBe(fixtureSource().digest);

  await landLive("an-researched", { ...RECEIPT, searched: true });
  expect((await readActiveNotebook("an-researched"))!.kind).toBe("researched");

  // No record at all, and the cleared record, are both the replay.
  expect(await readActiveNotebook("an-never-run")).toBe(fixtureSource());
  expect(activeSourceOf({ topic: "", notebook: null, engine: null })).toBe(fixtureSource());
  expect(activeSourceOf(undefined)).toBe(fixtureSource());
});

test("case 4: the hook resolves the live notebook, and the same record gives the same source object", async () => {
  await landLive("an-hook");
  const h = board("an-hook");
  const first = await h.settleUp();
  expect(first.active.hydrated).toBe(true);
  expect(first.active.source.kind).toBe("reasoned");
  const again = await h.settleUp();
  expect(again.active.source, "a fresh source per render would re-deal the board every render").toBe(first.active.source);
  expect(again.api.cards).toBe(first.api.cards);
  h.unmount();
});

test("case 4: after resetLive the hook resolves the replay at once, and the disk agrees - never the cleared notebook", async () => {
  const notebook = await landLive("an-reset");
  const h = board("an-reset");
  const before = await h.settleUp();
  expect(before.active.source.notebook.id).toBe(notebook.id);

  resetLive("an-reset");
  const after = await h.settleUp();
  expect(after.active.source, "the cleared notebook is still being dealt").toBe(fixtureSource());
  expect(after.api.cards.some((c) => c.id === "f-volume"), "a card of the cleared notebook is on the board").toBe(false);

  await expect.poll(async () => (await readActiveNotebook("an-reset"))?.kind).toBe("replay");
  h.unmount();

  // A fresh mount after the clear reads the disk and agrees.
  const remount = await board("an-reset").settleUp();
  expect(remount.active.source).toBe(fixtureSource());
});

test("case 4: a reset issued while a mount's read is in flight is not undone by that read", async () => {
  await landLive("an-race");
  const h = board("an-race");
  const pending = h.settleUp(); // first pass ran synchronously: the read is issued
  resetLive("an-race");
  await pending;
  const out = await h.settleUp();
  expect(out.active.source, "a read issued before the clear resurrected the cleared notebook").toBe(fixtureSource());
  h.unmount();
});

test("case 4: the pin is the rollback - a pinned resolver deals the replay over any record", async () => {
  const notebook = liveNotebook();
  const record = { topic: "t", notebook, engine: RECEIPT };
  expect(activeSourceOf(record).kind).toBe("reasoned");
  expect(activeSourceOf(record, true)).toBe(fixtureSource());
  // Memoised on the record's notebook, so the board is dealt once per record.
  expect(activeSourceOf(record)).toBe(activeSourceOf({ ...record }));
});

/* ─────────────────────────── case 5: orphaned scopes ──────────────────────── */

test("case 5: a scope saved against digest X, loaded against digest Y, is orphaned and applies no verdicts", async () => {
  await landLive("an-orphan");
  await saveStep<ScopeStepData>("an-orphan", "research-scope", {
    scope: { "f-volume": { descoped: true, liked: false, deepen: false } },
    confirmed: null,
    digest: "not-this-notebook",
  });

  const h = board("an-orphan");
  const { api } = await h.settleUp();
  expect(api.source.kind).toBe("reasoned");
  expect(api.orphaned, "a scope from another notebook was applied").not.toBeNull();
  expect(api.orphaned!.digest).toBe("not-this-notebook");
  expect(api.orphaned!.decisions).toBe(1);
  expect(api.scope).toEqual({});
  expect(stateOf(api.scope, "f-volume", api.optIn).descoped).toBe(false);
  expect(api.summary.descoped).toBe(0);
  expect(api.confirmed).toBeNull();

  // And it is left where it is: an orphan is never re-stamped by being looked at.
  await new Promise((r) => setTimeout(r, 50));
  expect((await scopeOnDisk("an-orphan"))?.digest).toBe("not-this-notebook");
  h.unmount();
});

test("case 5: a digest-less scope (written before stage 3) applies on the replay and is orphaned against a live notebook", async () => {
  const legacy = { scope: { "f-ath": { descoped: true, liked: false, deepen: false } }, confirmed: null };

  await saveStep("an-legacy-replay", "research-scope", legacy);
  const replay = await board("an-legacy-replay").settleUp();
  expect(replay.api.source).toBe(fixtureSource());
  expect(replay.api.orphaned).toBeNull();
  expect(stateOf(replay.api.scope, "f-ath", replay.api.optIn).descoped, "the legacy scope stopped applying on the replay").toBe(true);
  expect(replay.api.summary.descoped).toBe(1);
  // Re-saved on hydration as it always was, now carrying the fixture's digest.
  await expect.poll(async () => (await scopeOnDisk("an-legacy-replay"))?.digest).toBe(fixtureSource().digest);

  await landLive("an-legacy-live");
  await saveStep("an-legacy-live", "research-scope", legacy);
  const live = await board("an-legacy-live").settleUp();
  expect(live.api.orphaned?.digest).toBe(fixtureSource().digest);
  expect(live.api.scope).toEqual({});
});

test("case 5: a decision on an orphaned board starts this notebook's scope, stamped with its digest", async () => {
  await landLive("an-claim");
  await saveStep("an-claim", "research-scope", { scope: { "f-ath": { descoped: true, liked: false, deepen: false } }, confirmed: null });
  const h = board("an-claim");
  const { api } = await h.settleUp();
  expect(api.orphaned).not.toBeNull();

  api.toggle("f-volume", "descoped");
  const next = (await h.settleUp()).api;
  expect(next.orphaned).toBeNull();
  expect(stateOf(next.scope, "f-volume", next.optIn).descoped).toBe(true);
  expect(Object.keys(next.scope), "the orphan's decisions were re-applied to this notebook").toEqual(["f-volume"]);
  await expect.poll(async () => (await scopeOnDisk("an-claim"))?.digest).toBe(next.source.digest);
  h.unmount();
});

test("case 5: a caller dealt the fixture by default (Script, until stage 4) cannot overwrite a live notebook's scope", async () => {
  await landLive("an-script");
  const src = (await readActiveNotebook("an-script"))!;
  await saveStep<ScopeStepData>("an-script", "research-scope", {
    scope: { "f-volume": { descoped: true, liked: false, deepen: false } },
    confirmed: null,
    digest: src.digest,
  });

  const h = harness(() => useScope("an-script"));
  const api = await h.settleUp();
  expect(api.source).toBe(fixtureSource());
  expect(api.orphaned).not.toBeNull();
  api.toggle("f-ath", "descoped");
  const after = await h.settleUp();
  expect(after.scope, "an orphaned scope took a decision from a board dealt another notebook").toEqual({});
  await new Promise((r) => setTimeout(r, 50));
  const disk = await scopeOnDisk("an-script");
  expect(disk?.digest).toBe(src.digest);
  expect(Object.keys(disk?.scope ?? {})).toEqual(["f-volume"]);
  h.unmount();
});

test("case 5: the scope record's parser keeps the digest and refuses one that is not text", () => {
  const ok = RESEARCH_SCOPE.parse({ scope: {}, confirmed: null, digest: "abc12345" });
  expect("refused" in ok ? null : (ok as ScopeStepData).digest).toBe("abc12345");
  const legacy = RESEARCH_SCOPE.parse({ scope: {}, confirmed: null });
  expect("refused" in legacy ? "refused" : (legacy as ScopeStepData).digest).toBeUndefined();
  const bad = RESEARCH_SCOPE.parse({ scope: {}, confirmed: null, digest: 7 });
  expect("refused" in bad).toBe(true);
});

/* ─────────────────────────── the live notebook is dealt ───────────────────── */

test("a live notebook that tags every card is dealt alone: its cards, no fixture conclusion, nothing untagged, no fixture id", async () => {
  const notebook = await landLive("an-dealt");
  const { api } = await board("an-dealt").settleUp();

  const ids = api.cards.map((c) => c.id);
  expect(ids.length, "the board dealt nothing - this test proves nothing").toBeGreaterThan(5);
  expect(ids).toEqual(buildCards(sourceOf(notebook)).map((c) => c.id));
  expect(api.cards.filter((c) => c.kind === "conclusion").map((c) => c.id)).toEqual([OWN_CONCLUSION.id]);
  expect(api.cards.filter((c) => c.dimension === UNTAGGED_DIMENSION_ID)).toEqual([]);
  expect(ids.filter((id) => FIXTURE_IDS.has(id)), "a fixture card rode in behind the live notebook").toEqual([]);

  // The arithmetic is the live notebook's too: its conclusion is the opt-in set.
  expect([...api.optIn]).toEqual([OWN_CONCLUSION.id]);
  expect(api.summary.notTaken).toBe(1);
  expect(api.summary.byDim.map((d) => d.id)).toEqual(["volume", "rate"]);
});

test("project A's live notebook does not reach project B, which still deals the fixture", async () => {
  await landLive("an-project-a");
  const a = await board("an-project-a").settleUp();
  const b = await board("an-project-b").settleUp();

  expect(a.active.source.kind).toBe("reasoned");
  expect(b.active.source).toBe(fixtureSource());
  expect(b.api.cards).toEqual(buildCards(fixtureSource()));
  expect(b.api.cards.some((c) => c.id === "f-volume")).toBe(false);
});

/* ─────────────────────────── the replay is unchanged ──────────────────────── */

test("with no live notebook the board is today's board exactly, and the hook hands useScope the fixture object", async () => {
  const withSource = await board("an-replay").settleUp();
  expect(withSource.active.source).toBe(fixtureSource());

  const byDefault = await harness(() => useScope("an-replay-default")).settleUp();
  expect(withSource.api.cards).toEqual(byDefault.cards);
  expect(withSource.api.cards).toEqual(buildCards());
  expect(withSource.api.summary).toEqual(byDefault.summary);
  expect([...withSource.api.optIn].sort()).toEqual([...byDefault.optIn].sort());
});

/* ─────────────────────────── the wiring ──────────────────────────────────── */

const code = (rel: string) => stripComments(readFileSync(path.join(ROOT, rel), "utf8")).replace(/\s+/g, "");

test("wiring: the Research step deals the active notebook into its scope", () => {
  expect(code("app/_phases/research/guided/useEducationalResearch.ts")).toContain("useActiveNotebook(projectId)");
  expect(code("app/_phases/research/ResearchStep.tsx")).toContain("useScope(projectId,research.source)");
});
