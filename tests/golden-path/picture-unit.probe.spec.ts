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

import { test, expect } from "@playwright/test";
import * as React from "react";

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
import { __resetSaveSlots, saveStep, type ScriptAdoptionStepData } from "@/app/_phases/_shared/stepStore";
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

/** What `useAuth` reads. Signed out: `useThemes(null)` then reads nothing. */
const AUTH = { user: null, loading: false };

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
  const { unitsFromRender, framesFromUnits } = await import("@/app/_phases/frames/picture/unit");
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
  const { unitsFromRender, framesFromUnits } = await import("@/app/_phases/frames/picture/unit");
  const [a, b] = RENDERS;
  const idsA = new Set(framesFromUnits(unitsFromRender(explainerRender(a), a)).map((f) => f.id));
  const idsB = framesFromUnits(unitsFromRender(explainerRender(b), b)).map((f) => f.id);
  // The premise, stated: positional ids collide across every pair of renders.
  expect(framesFromRender(b).some((f) => framesFromRender(a).some((g) => g.id === f.id))).toBe(true);
  expect(idsB.filter((id) => idsA.has(id)), "a unit id names one beat of one render").toEqual([]);
});

/* ── 2 · a trailer shot is a unit, on one clock ────────────────────────────── */

test("case 2: trailer (3 beats → 7 shots, 30s) → 7 units, start strictly increasing, holds sum to the film", async () => {
  const { unitsFromRender } = await import("@/app/_phases/frames/picture/unit");
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
  const { unitsFromRender } = await import("@/app/_phases/frames/picture/unit");
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
