// LANE — STEP RECORDS: the versioned read seam, the atomic patch, and the save
// that is never armed by a read that did not happen (dynamic, card phase-shared-A).
//
// THREE SILENT DATA-LOSS PATHS, each driven against the real hooks over a real
// IndexedDB engine (`fake-indexeddb`):
//
//   · A RECORD FROM THE FUTURE. `readStep` returned `req.result?.data as T` with
//     no version check, so a record a newer build wrote (two tabs, two builds —
//     `e242b89`) was read as this build's shape, and the next save wrote the
//     downgrade over it. The persisted-payload-versioning ADR's rule 3 says
//     refuse; nothing did.
//   · THE NON-ATOMIC MERGE. `music-video-source` is grown by two steps through a
//     read-merge-write that was copied four times. Each copy read through
//     `loadStep`, which turns a FAILED read into `{}` — so a transient failure
//     wrote `{ style }` alone over the envelope, the poster and the seed.
//   · THE FAILED READ THAT ARMS A SAVE. `useAlternatives` loaded through
//     `loadStep`, set `loaded`, seeded, and saved 600ms later. A failed read
//     therefore wrote `{}`-plus-seeds over every kept alternative (≈1.5MB of
//     paid plates a scene).
//
// The records modules are imported DYNAMICALLY inside each case on purpose: a
// static import of a module that does not exist yet fails the whole file at
// load, which would report the hook cases as broken for the wrong reason.
//
// HOW THE HOOKS ARE DRIVEN: the same minimal-dispatcher technique as
// trailer-cut-lifecycle.probe.spec.ts (no DOM in this lane), extended with
// `useRef` because `useAlternatives` and `useLoadFor` call it. React's
// scheduling — batching, StrictMode's double invoke — is not exercised.
//
// The import below has a SIDE EFFECT and must come first.
import "fake-indexeddb/auto";

import { test, expect } from "@playwright/test";
import * as React from "react";

import { useAlternatives } from "@/app/_phases/frames/alternatives/useAlternatives";
import { useMusicVideoComposition } from "@/app/_phases/frames/music-video/useMusicVideoComposition";
import { useMusicVideoSource } from "@/app/_phases/research/useMusicVideoSource";
import type { Frame } from "@/app/_phases/frames/frames";
import type { AltsStepData } from "@/app/_phases/frames/alternatives/alts";
import { __resetSaveSlots, type MusicVideoSourceStepData } from "@/app/_phases/_shared/stepStore";
import { getRecord, openDb, runTx, STEPS_STORE } from "@/lib/studioDb";
import type { StyleBlock } from "@/lib/themes";
import type { useJobs } from "@/lib/jobs";

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
  };

  return {
    /** Render, commit effects, let their async bodies land; repeat until a pass
     *  changes no state. A deps-less effect re-runs every pass (as React's
     *  does), so "no effects fired" cannot be the stop condition here. */
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

/** Write a record exactly as a build (this one, an older one or a newer one)
 *  left it — bypassing every seam under test. */
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

/** Every `put` into the steps store, counted at the engine. Nothing above the
 *  engine can write without passing through here. */
let stepPuts = 0;
const realPut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
  if (this.name === STEPS_STORE) stepPuts++;
  return realPut.apply(this, args);
};

/** Make the steps store's reads fail. `readonly` fails only the plain reads (a
 *  hook's hydrate); `all` fails the read inside a write transaction too. Returns
 *  the restore. */
function failStepReads(which: "readonly" | "all"): () => void {
  const realGet = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
    if (this.name === STEPS_STORE && (which === "all" || this.transaction.mode === "readonly"))
      throw new DOMException("injected read failure", "UnknownError");
    return realGet.call(this, query);
  };
  return () => {
    IDBObjectStore.prototype.get = realGet;
  };
}

test.beforeEach(async () => {
  __resetSaveSlots();
  await clearSteps();
  stepPuts = 0;
});

/* ──────────────────────────────── fixtures ────────────────────────────────── */

const SOURCE: MusicVideoSourceStepData = {
  sourceAssetId: "asset-track",
  style: "chrome dusk",
  envelope: { durationS: 3, hopS: 0.5, rms: [0.1, 0.2], onsets: [] } as unknown as MusicVideoSourceStepData["envelope"],
  posterAssetId: "asset-poster",
  seed: 424242,
  effectParams: { glow: 0.4 },
};

const fakeJobs = {
  start: () => ({ id: "job-1" }),
  settle: () => undefined,
} as unknown as ReturnType<typeof useJobs>;

const FRAMES = [
  { id: "f1", title: "Opening", plate: { state: "ready", src: "/p/f1-new.png", costUsd: 0.04 } },
  { id: "f2", title: "Turn", plate: { state: "ready", src: "/p/f2.png", costUsd: 0.04 } },
] as unknown as Frame[];
const BLOCK = {} as StyleBlock;
const noAdopt = () => undefined;

const KEPT: AltsStepData = {
  byFrame: {
    f1: {
      activeId: "a-2",
      alts: [
        { id: "a-1", plate: { state: "ready", src: "/p/f1-old.png", costUsd: 0.04 }, createdAt: 1, seeded: true },
        { id: "a-2", plate: { state: "ready", src: "/p/f1-bought.png", costUsd: 0.12 }, createdAt: 2 },
      ],
    },
  },
};

/* ── 1 · a record from the future is refused, and never armed ─────────────── */

test("case 1: readRecord over a v:2 record while the def is at v1 → refused \"future\"", async () => {
  const { readRecord } = await import("@/app/_phases/_shared/records/registry");
  const { MUSIC_VIDEO_SOURCE } = await import("@/app/_phases/research/records");
  expect(MUSIC_VIDEO_SOURCE.version).toBe(1);

  await putRaw("p-future", "music-video-source", { ...SOURCE, v: 2, savedAt: 5 });
  const r = await readRecord(MUSIC_VIDEO_SOURCE, "p-future");
  expect(r.ok).toBe(false);
  expect(!r.ok && "refused" in r && r.refused, "a newer build's record must be refused, not read").toBe("future");

  // An absent `v` is v1 forever (ADR rule 1) — the same record without a stamp
  // reads clean.
  await putRaw("p-v1", "music-video-source", { ...SOURCE, savedAt: 5 });
  const v1 = await readRecord(MUSIC_VIDEO_SOURCE, "p-v1");
  expect(v1.ok && v1.data?.posterAssetId).toBe("asset-poster");
});

test("case 1: a record the def cannot parse → refused \"malformed\"", async () => {
  const { readRecord } = await import("@/app/_phases/_shared/records/registry");
  const { FRAMES_ALTS } = await import("@/app/_phases/frames/records");
  await putRaw("p-bad", "frames-alts", { byFrame: "not a map", v: 1 });
  const r = await readRecord(FRAMES_ALTS, "p-bad");
  expect(!r.ok && "refused" in r && r.refused).toBe("malformed");
});

test("case 1: useRecord over a future record never arms a save", async () => {
  const { useRecord } = await import("@/app/_phases/_shared/records/useRecord");
  const { MUSIC_VIDEO_SOURCE } = await import("@/app/_phases/research/records");
  await putRaw("p-future", "music-video-source", { ...SOURCE, v: 2, savedAt: 5 });
  stepPuts = 0;

  let applied = 0;
  const h = harness(() => useRecord(MUSIC_VIDEO_SOURCE, "p-future", () => void applied++));
  const api = await h.settleUp();
  expect(api.hydrated, "a refused read must not hydrate").toBe(false);
  expect(api.refused?.refused).toBe("future");
  expect(applied, "nothing from a refused read may reach the surface").toBe(0);

  const saved = await api.save({ style: "downgraded" });
  expect(saved.ok, "a save from an un-hydrated hook must be refused").toBe(false);
  expect(stepPuts, "zero writes after a refused read").toBe(0);
  expect((await getRaw("p-future", "music-video-source"))?.v).toBe(2);
  h.unmount();
});

test("case 1: the composition hook over a future record writes nothing", async () => {
  await putRaw("p-future", "music-video-source", { ...SOURCE, v: 2, savedAt: 5 });
  stepPuts = 0;
  const h = harness(() => useMusicVideoComposition("p-future", "u1", fakeJobs));
  await h.settleUp();
  h.current.setStyle("downgraded");
  await h.settleUp();
  await wait(50);
  expect(stepPuts, "a patch over a newer build's record must refuse in-transaction").toBe(0);
  const raw = await getRaw<MusicVideoSourceStepData & { v: number }>("p-future", "music-video-source");
  expect(raw?.v).toBe(2);
  expect(raw?.style).toBe("chrome dusk");
  h.unmount();
});

/* ── 3 · the patch is atomic ──────────────────────────────────────────────── */

test("case 3: two patchRecord calls in the same tick both land", async () => {
  const { patchRecord } = await import("@/app/_phases/_shared/records/patch");
  const { MUSIC_VIDEO_SOURCE } = await import("@/app/_phases/research/records");
  await putRaw("p-two", "music-video-source", { sourceAssetId: "asset-track", style: "x" });

  const [a, b] = await Promise.all([
    patchRecord(MUSIC_VIDEO_SOURCE, "p-two", (cur) => ({ ...cur, posterAssetId: "asset-poster" })),
    patchRecord(MUSIC_VIDEO_SOURCE, "p-two", (cur) => ({ ...cur, seed: 7 })),
  ]);
  expect(a.ok && b.ok).toBe(true);
  const raw = await getRaw<MusicVideoSourceStepData & { v: number }>("p-two", "music-video-source");
  expect(raw?.posterAssetId, "the first patch must survive the second").toBe("asset-poster");
  expect(raw?.seed).toBe(7);
  expect(raw?.sourceAssetId, "and neither may drop a field it did not touch").toBe("asset-track");
  expect(raw?.v).toBe(1);
});

test("case 3: same-field patches apply in issue order", async () => {
  const { patchRecord } = await import("@/app/_phases/_shared/records/patch");
  const { MUSIC_VIDEO_SOURCE } = await import("@/app/_phases/research/records");
  await Promise.all(
    ["n", "ne", "neo", "neon"].map((style) =>
      patchRecord(MUSIC_VIDEO_SOURCE, "p-keys", (cur) => ({ ...cur, style })),
    ),
  );
  expect((await getRaw<MusicVideoSourceStepData>("p-keys", "music-video-source"))?.style).toBe("neon");
});

test("case 3: composition setStyle while the merge's read fails writes nothing over the envelope", async () => {
  await putRaw("p-mv", "music-video-source", { ...SOURCE, v: 1 });
  const h = harness(() => useMusicVideoComposition("p-mv", "u1", fakeJobs));
  const api = await h.settleUp();
  expect(api.hydrated).toBe(true);
  expect(api.posterAssetId).toBe("asset-poster");

  stepPuts = 0;
  const restore = failStepReads("all");
  try {
    h.current.setStyle("neon");
    await h.settleUp();
    await wait(50);
  } finally {
    restore();
  }
  expect(stepPuts, "a merge whose read failed must not write").toBe(0);
  const raw = await getRaw<MusicVideoSourceStepData>("p-mv", "music-video-source");
  expect(raw?.envelope, "the envelope must survive").toBeTruthy();
  expect(raw?.posterAssetId).toBe("asset-poster");
  expect(raw?.seed).toBe(424242);
  h.unmount();
});

test("case 3: composition setStyle merges onto the stored record", async () => {
  await putRaw("p-mv", "music-video-source", { ...SOURCE, v: 1 });
  const h = harness(() => useMusicVideoComposition("p-mv", "u1", fakeJobs));
  await h.settleUp();
  h.current.setStyle("neon");
  await h.settleUp();
  await wait(50);
  const raw = await getRaw<MusicVideoSourceStepData>("p-mv", "music-video-source");
  expect(raw?.style).toBe("neon");
  expect(raw?.envelope).toBeTruthy();
  expect(raw?.sourceAssetId).toBe("asset-track");
  expect(raw?.posterAssetId).toBe("asset-poster");
  h.unmount();
});

test("case 3: research's setStyle while the merge's read fails writes nothing", async () => {
  await putRaw("p-mv", "music-video-source", { ...SOURCE, v: 1 });
  const h = harness(() => useMusicVideoSource("p-mv", "u1"));
  await h.settleUp();
  stepPuts = 0;
  const restore = failStepReads("all");
  try {
    h.current.setStyle("neon");
    await h.settleUp();
    await wait(50);
  } finally {
    restore();
  }
  expect(stepPuts).toBe(0);
  const raw = await getRaw<MusicVideoSourceStepData>("p-mv", "music-video-source");
  expect(raw?.posterAssetId).toBe("asset-poster");
  expect(raw?.envelope).toBeTruthy();
  h.unmount();
});

/* ── 4 · a failed read arms nothing ───────────────────────────────────────── */

test("case 4: alternatives hook with a read that fails → zero writes", async () => {
  await putRaw("p-alts", "frames-alts", { ...KEPT, v: 1 });
  stepPuts = 0;

  const restore = failStepReads("readonly");
  const h = harness(() =>
    useAlternatives({ projectId: "p-alts", frames: FRAMES, block: BLOCK, onAdopt: noAdopt }),
  );
  try {
    const api = await h.settleUp();
    expect(api.loaded, "a failed read must not count as loaded").toBe(false);
    // Past the 600ms save debounce: a save armed by the failed read lands here.
    await wait(900);
    await settle();
  } finally {
    restore();
    h.unmount();
  }
  expect(stepPuts, "a failed read must issue zero writes").toBe(0);
  const raw = await getRaw<AltsStepData>("p-alts", "frames-alts");
  expect(raw?.byFrame.f1.alts.map((a) => a.id), "the kept alternatives must survive").toEqual(["a-1", "a-2"]);
});

test("case 4 control: a clean read hydrates, seeds the unseen frame, and saves stamped", async () => {
  await putRaw("p-alts", "frames-alts", { ...KEPT, v: 1 });
  const h = harness(() =>
    useAlternatives({ projectId: "p-alts", frames: FRAMES, block: BLOCK, onAdopt: noAdopt }),
  );
  const api = await h.settleUp();
  expect(api.loaded).toBe(true);
  await wait(900);
  await settle();
  h.unmount();
  const raw = await getRaw<AltsStepData & { v: number }>("p-alts", "frames-alts");
  expect(raw?.byFrame.f1.alts.map((a) => a.id), "f1's kept alternatives are untouched").toEqual(["a-1", "a-2"]);
  expect(raw?.byFrame.f2?.alts[0]?.seeded, "f2 had none, so its plate is seeded").toBe(true);
  expect(raw?.v).toBe(1);
});
