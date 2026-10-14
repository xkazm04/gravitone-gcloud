// LANE — ONE PICTURE UNIT: an explainer beat and a trailer shot are the same
// noun, with an identity that is not a position (dynamic, card frames-phase-A,
// stage 1).
//
// THE DEFECTS THIS GUARDS:
//
//   · A FRAME'S IDENTITY WAS ITS INDEX. `framesFromRender` named every frame
//     `fr-${i}`, and alternatives (`frames-alts`) are keyed by frame id. So a
//     project that switched its adopted render showed the NEW render's `fr-3`
//     the kept plates of the OLD render's `fr-3` — paid pictures of a different
//     beat, offered as alternatives for this one.
//   · A TRAILER CUT HAD NO PICTURE AT ALL. `framesFor` answers `[]` for every
//     origin but the explainer fixture, so nothing downstream of a trailer's
//     shot list had a clock to read. A unit per shot, with its own start and
//     hold, is what Score and Cut will read in the next stage.
//   · THE STORED SHAPE HAD NO MIGRATION SEAM. `withClips` was a hand migration
//     run inline at the read; the frames record now has a def, a version, and a
//     v1 → v2 step that runs at the read seam and writes NOTHING until somebody
//     edits — the record is money (plates), and a rewrite on open is a rewrite
//     nobody asked for.
//
// Cases 1, 2 and the record half of 3 import the new module DYNAMICALLY, so a
// missing module fails those cases rather than the whole file. Cases 3 (hook)
// and 4 drive only APIs that existed before this card, so they go red for the
// behaviour, not for an import.
//
// HOW THE HOOKS ARE DRIVEN: the minimal-dispatcher technique of
// step-records.probe.spec.ts (no DOM in this lane), plus `useContext`, because
// `useFrames` reads the auth context. React's scheduling is not exercised.
//
// The import below has a SIDE EFFECT and must come first.
import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";
import * as React from "react";

import { stripComments } from "./_helpers";

import { compileCut } from "@/app/_phases/cut/cutDocument";
import { deriveTimeline } from "@/app/_phases/cut/deriveTimeline";

import { useAlternatives } from "@/app/_phases/frames/alternatives/useAlternatives";
import type { AltsStepData } from "@/app/_phases/frames/alternatives/alts";
import {
  durationOf,
  emptyClip,
  explainerRender,
  framesFromRender,
  type Frame,
  type FramesRender,
} from "@/app/_phases/frames/frames";
import { shotsFromBeats, type ShotSourceBeat } from "@/app/_phases/frames/shots";
import { useFrames } from "@/app/_phases/frames/useFrames";
import { pictureFromFrames } from "@/app/_phases/score/picture";
import type { TrailerCut } from "@/app/_phases/script/trailer/types";
import {
  __resetSaveSlots,
  readStep,
  saveStep,
  type ScriptAdoptionStepData,
  type TrailerCutStepData,
} from "@/app/_phases/_shared/stepStore";
import { newProject, putProject } from "@/lib/projects";
import { ADOPTION_PHASE } from "@/app/_phases/script/candidates/adoption";
import { RENDERS } from "@/app/_phases/script/renders";
import { getRecord, openDb, runTx, STEPS_STORE } from "@/lib/studioDb";
import type { StyleBlock } from "@/lib/themes";

/* ────────────────────────────── the harness ───────────────────────────────── */

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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What `useAuth` reads. Signed out: `useThemes(null)` then reads nothing.
 *
 *  The harness answers EVERY `useContext` with this one object, and since AIO-A
 *  stage 3 `useFrames` also reads the jobs context (its direction pass is a
 *  watched turn), so the object carries the part of `useJobs()` it reads too:
 *  no jobs, nothing busy. Its mount-time ledger read goes to a relative URL Node
 *  cannot fetch, and is swallowed exactly as an offline browser's would be. */
const AUTH = { user: null, loading: false, jobs: [], busy: () => false, track: () => undefined, cancel: () => undefined };

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
    useContext() {
      return AUTH;
    },
    // useFrames reads the active notebook through a store (useActiveNotebook);
    // the snapshot is all this lane needs of it.
    useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) {
      return getSnapshot();
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

/* ──────────────────────────────── the store ───────────────────────────────── */

async function clearSteps() {
  const db = await openDb();
  try {
    await runTx(db, STEPS_STORE, "readwrite", (s) => {
      s.clear();
    });
  } finally {
    db.close();
  }
}

/** Write a record exactly as an older build left it — bypassing every seam. */
async function putRaw(projectId: string, phase: string, data: Record<string, unknown>) {
  const db = await openDb();
  try {
    await runTx(db, STEPS_STORE, "readwrite", (s) => {
      s.put({ id: `${projectId}:${phase}`, projectId, phase, data });
    });
  } finally {
    db.close();
  }
}

async function getRaw<T = Record<string, unknown>>(projectId: string, phase: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    const row = await getRecord<{ data: T }>(db, STEPS_STORE, `${projectId}:${phase}`);
    return row?.data;
  } finally {
    db.close();
  }
}

/** Every `put` into the steps store, by key, counted at the engine. */
let puts: string[] = [];
const realPut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
  if (this.name === STEPS_STORE) puts.push(String((args[0] as { id?: unknown })?.id));
  return realPut.apply(this, args);
};
const framePuts = (pid: string) => puts.filter((k) => k === `${pid}:frames`).length;

test.beforeEach(async () => {
  __resetSaveSlots();
  await clearSteps();
  puts = [];
});

/* ──────────────────────────────── fixtures ────────────────────────────────── */

/** Strip the one field the card allows to differ. */
const sansId = <T extends { id: string }>(x: T): Omit<T, "id"> => {
  const { id: _drop, ...rest } = x;
  void _drop;
  return rest;
};

const BLOCK = {} as StyleBlock;
const noAdopt = () => undefined;

/** Three beats, seven shots, thirty seconds — with a peak whose span (5 s over
 *  3 shots) does not divide evenly, so a unit clock built from the shot layer's
 *  ROUNDED holds (1.7 × 3 = 5.1) drifts off the film and this case says so. */
const TRAILER_BEATS: ShotSourceBeat[] = [
  { id: "b-rung-1", at: "0:00", kind: "rung", label: "the threat has a direction", text: "It moves.", role: "rung" },
  { id: "b-peak", at: "0:10", kind: "peak", label: "climax montage", text: "Everything at once.", role: "peak" },
  { id: "b-rung-2", at: "0:15", kind: "rung", label: "and it is closer", text: "Closer.", role: "rung" },
];
const TRAILER_SOURCE: FramesRender = {
  id: "cut-probe",
  title: "probe trailer",
  engineLabel: "probe",
  template: "trailer",
  durationS: 30,
  beats: TRAILER_BEATS,
  origin: "trailer-cut",
};

/* ── 1 · an explainer unit IS today's frame, apart from its id ─────────────── */

test("case 1: explainer → one unit per beat, byte-identical to framesFromRender apart from id", async () => {
  const { unitsFromRender, framesFromUnits } = await import("@/lib/frames/picture/unit");
  let n = 0;
  for (const r of RENDERS) {
    const seeds = framesFromRender(r);
    const units = unitsFromRender(explainerRender(r), r);
    expect(units.length, `${r.id} count`).toBe(seeds.length);

    const frames = framesFromUnits(units);
    expect(frames.map(sansId), `${r.id}: the projection is today's frames, field for field`).toEqual(
      seeds.map(sansId),
    );
    for (const [i, u] of units.entries()) {
      const f = seeds[i];
      expect(u.kind).toBe("beat");
      expect(u.beatRef.at).toBe(f.at);
      expect(u.line).toBe(f.line);
      expect(u.elements).toEqual(f.elements);
      expect(u.texts).toEqual(f.texts);
      // On the clock, explicitly — the same numbers the readers derive today.
      expect(u.startS, `${r.id} ${f.at} start`).toBe(f.atS);
      expect(u.holdS, `${r.id} ${f.at} hold`).toBe(durationOf(seeds, i, r.durationS));
      // THE ONE DIFFERENCE: derived from the beat, never from the index.
      expect(u.id).toBe(`${r.id}:${f.at}:${u.ordinal}`);
      expect(u.id).not.toMatch(/^fr-\d+$/);
      n++;
    }
    expect(new Set(units.map((u) => u.id)).size, `${r.id} ids are unique`).toBe(units.length);
  }
  expect(n, "the walk read every shipped render's beats").toBeGreaterThan(20);
  console.log(`[case 1] ${RENDERS.map((r) => `${r.id}:${r.beats.length}`).join(" ")} units, byte-identical apart from id`);
});

test("case 1: the frames the step derives carry unit ids — two renders share none", async () => {
  const { unitsFromRender, framesFromUnits } = await import("@/lib/frames/picture/unit");
  const [a, b] = RENDERS;
  const idsA = new Set(framesFromUnits(unitsFromRender(explainerRender(a), a)).map((f) => f.id));
  const idsB = framesFromUnits(unitsFromRender(explainerRender(b), b)).map((f) => f.id);
  // The premise, stated: positional ids collide across every pair of renders.
  expect(framesFromRender(b).some((f) => framesFromRender(a).some((g) => g.id === f.id))).toBe(true);
  expect(idsB.filter((id) => idsA.has(id)), "a unit id names one beat of one render").toEqual([]);
});

/* ── 2 · a trailer shot is a unit, on one clock ────────────────────────────── */

test("case 2: trailer (3 beats → 7 shots, 30s) → 7 units, start strictly increasing, holds sum to the film", async () => {
  const { unitsFromRender } = await import("@/lib/frames/picture/unit");
  const shots = shotsFromBeats(TRAILER_BEATS, TRAILER_SOURCE.durationS);
  expect(shots, "the fixture decomposes as designed").toHaveLength(7);

  const units = unitsFromRender(TRAILER_SOURCE, RENDERS[0]);
  expect(units).toHaveLength(7);
  expect(units.every((u) => u.kind === "shot")).toBe(true);

  const starts = units.map((u) => u.startS);
  for (let i = 1; i < starts.length; i++)
    expect(starts[i]!, `unit ${i} starts after unit ${i - 1}`).toBeGreaterThan(starts[i - 1]!);
  const sum = units.reduce((s, u) => s + (u.holdS ?? NaN), 0);
  expect(Math.abs(sum - 30), `Σ holdS = ${sum}`).toBeLessThanOrEqual(0.01);
  // Each unit ends where the next begins — one clock, not seven estimates.
  for (let i = 1; i < units.length; i++)
    expect(Math.abs(units[i - 1].startS! + units[i - 1].holdS! - units[i].startS!)).toBeLessThanOrEqual(0.001);

  // Identity from the beat, not the position: three shots under one beat have
  // three ids, and every one names its beat.
  expect(units.map((u) => u.id)).toEqual(
    shots.map((s) => `${TRAILER_SOURCE.id}:${s.beatId}:${s.ordinal}`),
  );
  expect(units.filter((u) => u.beatRef.beatId === "b-peak").map((u) => [u.ordinal, u.ofBeat])).toEqual([
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
  // The shot's staging travels on the unit; its picture starts empty.
  expect(units[0].staging?.role).toBe("rung");
  expect(units.every((u) => u.plate.state === "empty" && u.clip.motion === "")).toBe(true);
  console.log(`[case 2] ${units.length} units · Σhold ${sum.toFixed(3)}s · starts ${starts.map((s) => s?.toFixed(2)).join(" ")}`);
});

test("case 2: a trailer with no spine, and an unplaceable beat, derive no units at the wrong time", async () => {
  const { unitsFromRender } = await import("@/lib/frames/picture/unit");
  expect(unitsFromRender({ ...TRAILER_SOURCE, beats: [], origin: "no-spine" }, RENDERS[0])).toEqual([]);
  const withTbd = [TRAILER_BEATS[0], { ...TRAILER_BEATS[1], at: "tbd" }, TRAILER_BEATS[2]];
  const units = unitsFromRender({ ...TRAILER_SOURCE, beats: withTbd }, RENDERS[0]);
  expect(units.some((u) => u.beatRef.beatId === "b-peak"), "an unplaceable beat has no place on the clock").toBe(false);
  expect(units.every((u) => u.startS !== null && u.holdS !== null)).toBe(true);
});

/* ── 3 · v1 → v2 at the read seam, and no write until somebody edits ───────── */

/** A v1 record as the last build wrote it: positional ids, one paid plate, and
 *  no `clip` key anywhere (the shape before Frames inherited motion). */
function v1Record() {
  const r = RENDERS[0];
  const frames = framesFromRender(r).map((f, i) => {
    const { clip: _clip, ...rest } = f;
    void _clip;
    return i === 0 ? { ...rest, plate: { state: "ready", src: "data:image/png;base64,UEFJRA==", costUsd: 0.04, subject: "s" } } : rest;
  });
  return { frames, renderId: r.id, savedAt: 1 } as Record<string, unknown>;
}

test("case 3: the frames def reads a v1 record as v2 units — plates kept, emptyClip filled — and writes nothing", async () => {
  const { readRecord } = await import("@/app/_phases/_shared/records/registry");
  const { FRAMES_RECORD } = await import("@/app/_phases/frames/records");
  expect(FRAMES_RECORD.version).toBe(2);

  await putRaw("p-v1", "frames", v1Record());
  puts = [];
  const r = await readRecord(FRAMES_RECORD, "p-v1");
  expect(r.ok, "a v1 record is readable").toBe(true);
  if (!r.ok || !r.data) throw new Error("no record");
  const { units } = r.data;
  expect(units).toHaveLength(RENDERS[0].beats.length);
  expect(units[0].plate.src, "the paid plate survives the migration").toBe("data:image/png;base64,UEFJRA==");
  expect(units[0].plate.costUsd).toBe(0.04);
  expect(units.every((u) => JSON.stringify(u.clip) === JSON.stringify(emptyClip())), "every unit has a clip").toBe(true);
  // Identity is NOT rewritten by a migration: kept alternatives, Score spots and
  // board items all point at these ids, and a v1 record is only ever reused for
  // the render it was derived from.
  expect(units.map((u) => u.id)).toEqual(RENDERS[0].beats.map((_, i) => `fr-${i}`));
  expect(units[3].holdS).toBe(durationOf(framesFromRender(RENDERS[0]), 3, RENDERS[0].durationS));

  expect(puts, "a read is not a write").toEqual([]);
  const raw = await getRaw("p-v1", "frames");
  expect(raw?.v, "disk still holds the v1 record").toBeUndefined();
  expect(raw?.units).toBeUndefined();
});

test("case 3: useFrames over a v1 record shows plates and clips, writes NOTHING on open, and v2 on the first edit", async () => {
  await putRaw("p-v1", "frames", v1Record());
  puts = [];

  const h = harness(() => useFrames("p-v1"));
  let ctl = await h.settleUp();
  // Past the 600ms save debounce: a save armed by the read itself lands here.
  await wait(900);
  ctl = await h.settleUp();

  expect(ctl.loadTrouble).toBeNull();
  expect(ctl.frames).toHaveLength(RENDERS[0].beats.length);
  expect(ctl.frames[0].plate.src).toBe("data:image/png;base64,UEFJRA==");
  expect(ctl.frames.every((f) => f.clip && f.clip.motion === "")).toBe(true);
  expect(framePuts("p-v1"), "opening the step must not rewrite a record nobody edited").toBe(0);
  expect((await getRaw("p-v1", "frames"))?.v).toBeUndefined();

  // The first edit is what writes, and it writes the new shape.
  ctl.setMotion(ctl.frames[0].id, "slow push in");
  await h.settleUp();
  await wait(900);
  await h.settleUp();
  h.unmount();

  expect(framePuts("p-v1"), "one edit, one write").toBe(1);
  const raw = await getRaw<{ v: number; units: { id: string; plate: Frame["plate"]; clip: Frame["clip"] }[]; frames: Frame[] }>(
    "p-v1",
    "frames",
  );
  expect(raw?.v).toBe(2);
  expect(raw?.units).toHaveLength(RENDERS[0].beats.length);
  expect(raw?.units[0].plate.src, "the plate rode through the migration onto disk").toBe("data:image/png;base64,UEFJRA==");
  expect(raw?.units[0].clip.motion).toBe("slow push in");
  // The shadow the not-yet-converted readers (Score, Cut, the board) still read.
  expect(raw?.frames[0].clip.motion).toBe("slow push in");
});

/* ── 4 · a switched render shows none of the old render's alternatives ─────── */

async function adopt(pid: string, renderId: string) {
  expect((await saveStep<ScriptAdoptionStepData>(pid, ADOPTION_PHASE, { renderId })).ok).toBe(true);
}

test("case 4: adopted render A → B: none of A's kept alternatives appears under B's units", async () => {
  const pid = "p-switch";
  const [A, B] = RENDERS;

  // Render A: derive, buy a plate for its first beat, keep it as an alternative.
  await adopt(pid, A.id);
  const fa = harness(() => useFrames(pid));
  let a = await fa.settleUp();
  expect(a.render.id).toBe(A.id);
  a.setFrames((fs) => fs.map((f, i) => (i === 0 ? { ...f, plate: { state: "ready", src: "/p/a0.png", costUsd: 0.04 } } : f)));
  a = await fa.settleUp();
  await wait(900);
  a = await fa.settleUp();
  const aFrames = a.frames;
  fa.unmount();

  const altsA = harness(() => useAlternatives({ projectId: pid, frames: aFrames, block: BLOCK, onAdopt: noAdopt }));
  await altsA.settleUp();
  await wait(900);
  await altsA.settleUp();
  altsA.unmount();
  const kept = await getRaw<AltsStepData>(pid, "frames-alts");
  expect(Object.keys(kept?.byFrame ?? {}), "A's plate was kept as an alternative").toEqual([aFrames[0].id]);

  // The creator adopts render B in Script and comes back to Frames.
  await adopt(pid, B.id);
  const fb = harness(() => useFrames(pid));
  const b = await fb.settleUp();
  expect(b.render.id).toBe(B.id);
  expect(b.frames).toHaveLength(B.beats.length);
  fb.unmount();

  const altsB = harness(() => useAlternatives({ projectId: pid, frames: b.frames, block: BLOCK, onAdopt: noAdopt }));
  const ctl = await altsB.settleUp();
  altsB.unmount();
  const leaked = ctl.columns.filter((c) => c.alts.some((x) => x.plate.src === "/p/a0.png"));
  expect(
    leaked.map((c) => `${c.frame.id} (${c.frame.title})`),
    "A's paid plate must not be offered as an alternative for one of B's beats",
  ).toEqual([]);
  expect(ctl.columns.every((c) => c.alts.length === 0)).toBe(true);
  // ...and it is not gone: it is still kept, under the unit it was bought for.
  expect((await getRaw<AltsStepData>(pid, "frames-alts"))?.byFrame[aFrames[0].id]?.alts[0]?.plate.src).toBe("/p/a0.png");
});

test("case 4 control: a v1 cut for the SAME render keeps its alternatives visible after the upgrade", async () => {
  const pid = "p-same";
  await putRaw(pid, "frames", v1Record());
  await putRaw(pid, "frames-alts", {
    byFrame: {
      "fr-0": {
        activeId: "a-1",
        alts: [{ id: "a-1", plate: { state: "ready", src: "/p/kept.png", costUsd: 0.04 }, createdAt: 1, seeded: true }],
      },
    },
    v: 1,
  });
  const f = harness(() => useFrames(pid));
  const ctl = await f.settleUp();
  f.unmount();
  const alts = harness(() => useAlternatives({ projectId: pid, frames: ctl.frames, block: BLOCK, onAdopt: noAdopt }));
  const view = await alts.settleUp();
  alts.unmount();
  expect(view.columns[0].alts.map((x) => x.plate.src), "an upgrade must not strand plates the creator kept").toEqual([
    "/p/kept.png",
  ]);
});

/* ══════════════════════ STAGE 2 · THE PICTURE READERS ═══════════════════════
 *
 * Trailer shot units reach disk, and Score and Cut read units rather than
 * re-deriving a picture from the `frames` shadow (spec:
 * critic-2026-10-07-picture-chain.md, "frames-phase-A next stage 2"). The
 * defects:
 *
 *   · SHOT UNITS NEVER REACHED DISK. Stage 1's save rebuilt `units` from the
 *     beat-only `frames` shadow, so a trailer's record held `units: []`,
 *     `sameCut` was never true, and every open re-derived.
 *   · A v1 WRITER WOULD ERASE THEM. Motion's accept and the board's decision
 *     save through the def-less store, stamped v1, and the migration rebuilt
 *     units from `frames` alone.
 *   · SCORE AND CUT HAD NO TRAILER PICTURE. Both read the `frames` shadow raw,
 *     so a trailer project's Cut was `origin: "empty"` and its Score had
 *     nothing to spot against.
 *
 * In this file rather than a probe of its own: a new probe file needs an entry
 * in tests/mutants/registry.ts, which this stage's write set does not hold.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Three beats, seven shots (2 · 3 · 2), thirty seconds. The peak's five
 *  seconds over three shots do not divide evenly, so a clock built from rounded
 *  holds drifts and says so. */
const TRAILER_CUT = {
  form: "trailer",
  id: "cut-probe",
  title: "probe trailer",
  rung: "full",
  movements: [],
  beats: [
    { id: "b-rung-1", movement: "m1", at: "0:00", kind: "rung", connector: null, label: "the threat has a direction", text: "It moves." },
    { id: "b-peak", movement: "m2", at: "0:10", kind: "peak", connector: "but", label: "climax montage", text: "Everything at once." },
    { id: "b-rung-2", movement: "m2", at: "0:15", kind: "rung", connector: "so", label: "and it is closer", text: "Closer." },
  ],
} as unknown as TrailerCut;

const SHOT_IDS = [
  "cut-probe:b-rung-1:1",
  "cut-probe:b-rung-1:2",
  "cut-probe:b-peak:1",
  "cut-probe:b-peak:2",
  "cut-probe:b-peak:3",
  "cut-probe:b-rung-2:1",
  "cut-probe:b-rung-2:2",
];

/** A trailer project with a composed spine, as Step 2 leaves it. */
async function trailerProject(): Promise<string> {
  const p = await putProject(
    newProject("u1", { title: "Probe trailer", logline: "", template: "trailer", discipline: "trailer", targetS: 30 }),
  );
  expect(
    (await saveStep<TrailerCutStepData>(p.id, "script-trailer", { cut: TRAILER_CUT, budget: { campaignId: "c", assets: [] } }))
      .ok,
  ).toBe(true);
  return p.id;
}

interface StoredUnit {
  id: string;
  kind: string;
  sourceId: string;
  startS: number | null;
  holdS: number | null;
  plate: { state: string };
}
interface StoredFrames {
  v?: number;
  units: StoredUnit[];
  frames: unknown[];
  renderId: string;
}

/** Open Frames on a trailer project, let its save land, close it. */
async function openFrames(pid: string) {
  const h = harness(() => useFrames(pid));
  let ctl = await h.settleUp();
  await wait(900);
  ctl = await h.settleUp();
  h.unmount();
  return ctl;
}

const readerModule = () => import("@/app/_phases/frames/picture/read");

/* ── stage 2 · 1 · shot units persist, and a second open is the same cut ─────────────── */

test("stage 2 case 1: useFrames on a trailer project saves its 7 shot units; a second open re-derives nothing and writes nothing", async () => {
  const pid = await trailerProject();

  const first = await openFrames(pid);
  expect(first.loadTrouble).toBeNull();
  expect(first.render.origin).toBe("trailer-cut");
  const raw = await getRaw<StoredFrames>(pid, "frames");
  expect(raw?.units.map((u) => u.kind), "a trailer's record holds its shots").toEqual(Array(7).fill("shot"));
  expect(raw?.units.map((u) => u.id)).toEqual(SHOT_IDS);
  expect(raw?.renderId).toBe("cut-probe");
  expect(raw?.v).toBe(2);
  const sum = raw!.units.reduce((s, u) => s + (u.holdS ?? NaN), 0);
  expect(Math.abs(sum - 30), `Σ holdS = ${sum}`).toBeLessThanOrEqual(0.01);

  puts = [];
  await openFrames(pid);
  expect(framePuts(pid), "the stored cut IS this cut: opening it again must not rewrite it").toBe(0);
  console.log(`[stage 2 case 1] ${raw?.units.length} shot units on disk · Σhold ${sum.toFixed(3)}s · reopen wrote 0`);
});

test("stage 2 case 1 control: a trailer edited after the save re-derives its shots, and the record follows", async () => {
  const pid = await trailerProject();
  await openFrames(pid);

  // Step 2 moves the peak and drops a beat; the cut's id is the project's and
  // does not change, so this is the same `renderId` with a different spine.
  const edited = { ...TRAILER_CUT, beats: TRAILER_CUT.beats.slice(0, 2) } as TrailerCut;
  await saveStep<TrailerCutStepData>(pid, "script-trailer", { cut: edited, budget: { campaignId: "c", assets: [] } });
  puts = [];
  await openFrames(pid);
  const raw = await getRaw<StoredFrames>(pid, "frames");
  expect(raw?.units.some((u) => u.id.includes("b-rung-2")), "a beat that left the spine leaves the record").toBe(false);
  expect(framePuts(pid)).toBe(1);
});

/* ── stage 2 · 2 · a v1 writer keeps the shots ───────────────────────────────────────── */

test("stage 2 case 2: a def-less v1 save over a record holding 7 shot units reads back with the same 7", async () => {
  const pid = await trailerProject();
  await openFrames(pid);
  const before = (await getRaw<StoredFrames>(pid, "frames"))!;
  expect(before.units).toHaveLength(7);

  // Exactly how useMotion's accept and the board's decision write today.
  const stored = await readStep<Record<string, unknown>>(pid, "frames");
  if (!stored.ok || !stored.data) throw new Error("no record");
  expect((await saveStep(pid, "frames", { ...stored.data, frames: stored.data.frames })).ok).toBe(true);
  expect((await getRaw<StoredFrames>(pid, "frames"))?.v, "the v1 stamp the def-less store applies").toBe(1);

  const { readUnits } = await readerModule();
  const back = await readUnits(pid);
  expect(back.ok).toBe(true);
  if (!back.ok) return;
  expect(back.units?.map((u) => u.id), "a v1 write must not erase the shots riding on it").toEqual(SHOT_IDS);
  expect(back.units?.every((u) => u.kind === "shot")).toBe(true);
});

test("stage 2 case 2 control: shot units derived from a DIFFERENT chain are not carried by a v1 record", async () => {
  const pid = await trailerProject();
  await openFrames(pid);
  const stored = await readStep<Record<string, unknown>>(pid, "frames");
  if (!stored.ok || !stored.data) throw new Error("no record");
  await saveStep(pid, "frames", { ...stored.data, renderId: "cut-elsewhere" });
  const { readUnits } = await readerModule();
  const back = await readUnits(pid);
  expect(back.ok && back.units?.length, "units are only kept for the chain they were derived from").toBe(0);
});

/* ── stage 2 · 3 · card case 5: the Cut lays out a trailer ───────────────────────────── */

test("stage 2 case 3: deriveTimeline over a trailer project's units → origin project, 7 missing picture clips, 30s; compileCut → 7 gaps", async () => {
  const pid = await trailerProject();
  await openFrames(pid);
  const { readUnits } = await readerModule();
  const read = await readUnits(pid);
  if (!read.ok) throw new Error("unreadable");

  const cut = deriveTimeline({
    projectId: pid,
    project: { title: "Probe trailer", logline: "", targetS: 30 },
    frames: null,
    units: read.units,
    spots: null,
  });
  expect(cut.origin).toBe("project");
  const pics = cut.clips.filter((c) => c.track === "video");
  expect(pics).toHaveLength(7);
  expect(pics.map((c) => c.ref)).toEqual(SHOT_IDS);
  expect(pics.every((c) => c.status === "missing" && c.why === "no plate")).toBe(true);
  const sum = pics.reduce((s, c) => s + c.durS, 0);
  expect(Math.abs(sum - 30), `Σ picture = ${sum}`).toBeLessThanOrEqual(0.01);
  expect(Math.abs(cut.totalS - 30)).toBeLessThanOrEqual(0.01);
  // One voice line per BEAT, not one per shot: a line is said once.
  expect(cut.clips.filter((c) => c.track === "vo").map((c) => c.note)).toEqual(["It moves.", "Everything at once.", "Closer."]);

  const doc = compileCut(cut, {}, {});
  expect(doc.picture.map((s) => s.kind)).toEqual(Array(7).fill("gap"));
  expect(doc.picture.map((s) => s.unitRef)).toEqual(SHOT_IDS);
  console.log(`[stage 2 case 3] ${pics.length} picture clips · Σ ${sum.toFixed(3)}s · ${doc.picture.length} gaps`);
});

/* ── stage 2 · 4 · the explainer does not move ───────────────────────────────────────── */

test("stage 2 case 4: on every shipped render, pictureFromUnits gives pictureFromFrames' scenes, starts and holds", async () => {
  const { pictureFromUnits } = await import("@/lib/score/picture");
  const { unitsFromRender } = await import("@/lib/frames/picture/unit");
  for (const r of RENDERS) {
    const units = unitsFromRender(explainerRender(r), r);
    const frames = framesFromRender(r).map((f, i) => ({ ...f, id: units[i].id }));
    // Three closing lengths: the render's own, a different project target, and
    // an unread project record (0) — Score's clock closes against the project.
    for (const targetS of [r.durationS, r.durationS + 7, 0]) {
      const want = pictureFromFrames(frames, targetS);
      const got = pictureFromUnits(units, targetS);
      expect(got.scenes, `${r.id} @ ${targetS}`).toEqual(want.scenes);
      expect(got.totalS).toBe(want.totalS);
      expect(got.unplaced.map((u) => u.id)).toEqual(want.unplaced.map((f) => f.id));
    }
  }
});

/* ── stage 2 · 5 · Score draws the trailer ───────────────────────────────────────────── */

test("stage 2 case 5: Score's picture of a trailer project is 7 scenes at the shot boundaries", async () => {
  const pid = await trailerProject();
  await openFrames(pid);
  const { readUnits } = await readerModule();
  const { pictureFromUnits } = await import("@/lib/score/picture");
  const read = await readUnits(pid);
  if (!read.ok || !read.units) throw new Error("unreadable");

  const picture = pictureFromUnits(read.units, 30);
  expect(picture.scenes.map((s) => s.id)).toEqual(SHOT_IDS);
  let t = 0;
  for (const [i, s] of picture.scenes.entries()) {
    const u = read.units[i];
    expect(Math.abs(t - u.startS!), `${s.id} starts at its shot's boundary`).toBeLessThanOrEqual(0.001);
    expect(s.targetS).toBe(u.holdS);
    t += s.targetS;
  }
  expect(Math.abs(picture.totalS - 30)).toBeLessThanOrEqual(0.01);
  expect(picture.unplaced).toEqual([]);
});

/* ── stage 2 · 6 · a refused record is refused downstream ────────────────────────────── */

test("stage 2 case 6: a frames record stamped v99 is read trouble for Score and Cut, never an empty picture", async () => {
  const pid = await trailerProject();
  // Straight to disk: the store would stamp its own `v` over the future one.
  const db = await openDb();
  try {
    await runTx(db, STEPS_STORE, "readwrite", (s) => {
      s.put({ id: `${pid}:frames`, projectId: pid, phase: "frames", data: { v: 99, units: [], frames: [], renderId: "cut-probe" } });
    });
  } finally {
    db.close();
  }

  const { readUnits } = await readerModule();
  const read = await readUnits(pid);
  expect(read.ok, "a newer build's record is not 'no frames'").toBe(false);
  if (read.ok) return;
  expect(read.trouble.op).toBe("read");
  expect(read.trouble.phase).toBe("frames");
  expect(read.trouble.message).toMatch(/future|newer|v99|99/i);
});

/* ── stage 2 · 7 · the raw readers fall ──────────────────────────────────────────────── */

test("stage 2 case 7: Score and Cut read the frames record through its def, not readStep<FramesStepData>", () => {
  for (const rel of ["app/_phases/score/ScoreSpotting.tsx", "app/_phases/cut/useCut.ts"]) {
    const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
    expect(/readStep\s*<\s*FramesStepData\s*>/.test(src), `${rel} still casts the raw frames record`).toBe(false);
    expect(/\breadUnits\s*\(/.test(src), `${rel} reads frames through the owner's reader`).toBe(true);
    expect(/\bpictureFromFrames\s*\(/.test(src), `${rel} still re-derives the picture from the frames shadow`).toBe(false);
  }
});
