import "server-only";

import { kernel } from "@/lib/kernelStore";
import { LIVE_GATES, openReadyGates, type GateDeps } from "@/lib/parts/gates";
import { undoPart, writePartIn } from "@gt/kernel/parts/driver";
import type { Reader, Store } from "@gt/kernel/store";
import { driveStep, launchPartAct, partActReceipt, researchProducer, researchUnits, withRecords, type StepFactory, type StepReceipt, type UnitsFn } from "@/lib/producers/research";
import { scriptProducer, scriptUnits } from "@/lib/producers/script";
import { voiceProducer, voiceUnits } from "@/lib/producers/voice";
import { wordsProducer, wordsUnits } from "@/lib/producers/words";
import { scoreProducer, scoreUnits } from "@/lib/producers/score";
import { cutProducer, cutUnits } from "@/lib/producers/cut";
import { framesProducer, framesUnits } from "@/lib/producers/frames";
import { motionProducer, motionUnits } from "@/lib/producers/motion";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { EditorKind, PartActKind, PartOp, PartReceipt, PartView } from "@gt/domain/partView";

import type { ServerPart } from "./port.ts";
import { receiptOf } from "./fixtureActs.ts";
import { basisOf, OPERATOR, opPlan, sceneOf, unwrap, viewOf, type OpPlan, type Scene } from "./realScene.ts";

// THE REAL PART SIDE (L36) - the PartPort over the kernel's `parts` module: the part's records
// are rows under their v1 keys, every edit is a row in an append-only op log, undo appends the
// prior value (refused when a job rewrote the record since), a stale base is a conflict that
// hands back the view as it is now. What each op MEANS, each act's units and dry landing, each
// verdict and each view are the per-kind modules' (./fixtureResearch.ts, ./fixtureScript.ts,
// ./kinds.ts), called, not forked; the records of each kind map to and from their working
// records in ./realResearch.ts, ./realScript.ts and each later kind's module, and ./realScene.ts
// reads one part in one reader - this project's plan and records, and nothing else.
//
// Every act is a kernel job under the part kind's producer (L37); its output lands the same way.

export type RealDeps = {
  readonly store: () => Result<Store>;
  readonly now: () => number;
  readonly gates: GateDeps;
  /** How long a confirm waits for its job to end before answering with it running (default ACT_WAIT_MS). */
  readonly actWaitMs?: number;
};

/** A dry act lands in milliseconds; a live turn takes minutes and is answered as running. */
const ACT_WAIT_MS = 2500;

/** The producer each editor kind's acts run under (L37), built for the job's own lane, and the
 *  units its receipt and its job's plan step share. A kind absent here has no producer bound yet. */
const FACTORIES: Readonly<Partial<Record<EditorKind, StepFactory>>> = { research: researchProducer, script: scriptProducer, words: wordsProducer, voice: voiceProducer, score: scoreProducer, cut: cutProducer, frames: framesProducer, motion: motionProducer };
const UNITS: Readonly<Partial<Record<EditorKind, UnitsFn>>> = { research: withRecords(researchUnits), script: withRecords(scriptUnits), words: wordsUnits, voice: voiceUnits, score: scoreUnits, cut: cutUnits, frames: framesUnits, motion: motionUnits };

export function makeRealPart(deps: RealDeps): ServerPart {
  const withStore = <T,>(fn: (s: Store) => Result<T>): Result<T> => {
    const k = deps.store();
    return k.ok ? fn(k.value) : k;
  };
  const kick = (store: Store, projectId: string): void => {
    void openReadyGates({ ...deps.gates, store: () => ok(store) }, projectId, { by: "agent", surface: "parts", who: "part-gates" }).then((r) => {
      if (!r.ok) console.error(`[part-gates] ${projectId}: ${r.error.message}`);
    });
  };
  const read = (store: Store, projectId: string, key: string): Result<PartView> =>
    unwrap(
      store.read((r) => {
        const s = sceneOf(r, projectId, key, deps.now());
        return s.ok ? ok(viewOf(r, s.value)) : s;
      }),
    );
  const write = (projectId: string, key: string, baseRev: number, op: PartOp | null, run: (t: Reader, s: Scene) => OpPlan) =>
    withStore((store) => {
      const w = store.tx((t) => {
        const s = sceneOf(t, projectId, key, deps.now());
        if (!s.ok) return s;
        const plan = run(t, s.value);
        return writePartIn(t, { projectId, partId: s.value.part.id, baseRev: op === null ? "current" : baseRev, act: plan.act, op: plan.raw, label: plan.label, by: plan.by, next: () => plan.next });
      });
      const o = unwrap(w);
      if (!o.ok) return o;
      kick(store, projectId);
      const view = read(store, projectId, key);
      if (!view.ok) return view;
      return ok({ outcome: o.value, view: view.value });
    });

  return {
    loadPart: ({ projectId, key }) => withStore((store) => read(store, projectId, key)),
    opPart: ({ projectId, key, baseRev, op }) => {
      const w = write(projectId, key, baseRev, op, (_t, s) => opPlan(s, op));
      if (!w.ok) return w;
      return ok(w.value.outcome.kind === "conflict" ? { kind: "conflict", current: w.value.view } : { kind: "applied", view: w.value.view });
    },
    undoPart: ({ projectId, key, baseRev }) =>
      withStore((store) => {
        const at = store.read((r) => {
          const s = sceneOf(r, projectId, key, deps.now());
          return s.ok ? ok(s.value.part.id) : s;
        });
        const partId = unwrap(at);
        if (!partId.ok) return partId;
        const u = undoPart(store, { projectId, partId: partId.value, baseRev, by: OPERATOR });
        if (!u.ok) return u;
        kick(store, projectId);
        const view = read(store, projectId, key);
        if (!view.ok) return view;
        return ok(u.value.kind === "conflict" ? { kind: "conflict", current: view.value } : { kind: "applied", view: view.value });
      }),
    actReceipt: ({ projectId, key, act, target }) => receiptFor(deps, projectId, key, act, target),
    act: async ({ projectId, key, act, token, target }) => {
      const store = deps.store();
      if (!store.ok) return store;
      const launched = launchAct(deps, store.value, projectId, key, act, token, target);
      if (!launched.ok) return launched;
      if (launched.value.kind === "stale") return ok(launched.value);
      const { jobId, kind_: kind } = launched.value;
      // The job is the act (decision 3): driven here so a studio with no worker running still
      // lands it, and fenced by the lane slot so a worker that claims it first wins and this drive
      // reads `busy`. The confirm answers when the job ends or the wait runs out, whichever is
      // first; a longer act shows in the view's `running` and lands where the editor reads it.
      const factory = FACTORIES[kind];
      if (factory === undefined) return err("unavailable", `no producer is bound for a ${kind} part yet`);
      const drive = driveStep(factory, store.value, jobId, { hooks: { onSettled: async () => kick(store.value, projectId) } }).then(
        (r) => {
          if (!r.ok) console.error(`[part-act] ${jobId}: ${r.error.message}`);
        },
        (e: unknown) => console.error(`[part-act] ${jobId}: ${errorMessage(e)}`),
      );
      await Promise.race([drive, new Promise((res) => setTimeout(res, deps.actWaitMs ?? ACT_WAIT_MS).unref())]);
      const view = read(store.value, projectId, key);
      return view.ok ? ok({ kind: "launched", jobId, view: view.value }) : view;
    },
  };
}

/**
 * The confirm half of an act, in ONE transaction: the receipt is recomputed from what this
 * transaction reads, a stale token answers the fresh receipt and writes nothing, and only then is
 * the act's job enqueued (L37 `enqueueActIn`: the same act on the same unit while its job is live
 * is that job - a double click is one purchase). The job runs under the part kind's producer on
 * the chosen option's lane; the receipt's mode decides dry or live (live needs an arm, refused
 * under GRAVITONE_DRY_ONLY).
 */
function launchAct(deps: RealDeps, store: Store, projectId: string, key: string, act: PartActKind, token: string, target?: string): Result<{ kind: "stale"; fresh: PartReceipt } | { kind: "go"; jobId: string; kind_: EditorKind }> {
  const now = deps.now();
  const scene = unwrap(store.read((r) => sceneOf(r, projectId, key, now)));
  if (!scene.ok) return scene;
  const kind = scene.value.kind;
  const units = UNITS[kind];
  if (units === undefined) return err("unavailable", `no producer is bound for a ${kind} part yet`);
  const ref = { projectId, partId: scene.value.part.id, act, ...(target === undefined ? {} : { target }) };
  const l = launchPartAct(store, ref, units, { mode: "dry", now, token, actor: OPERATOR });
  if (!l.ok) return l;
  return l.value.kind === "stale" ? ok({ kind: "stale", fresh: partReceiptOf(l.value.fresh, act) }) : ok({ kind: "go", jobId: l.value.jobId, kind_: kind });
}

/** The lib receipt in the editor contract's words (its act is this editor's own). */
function partReceiptOf(r: StepReceipt, act: PartActKind): PartReceipt {
  const { target: _target, ...subject } = r.subject;
  return { ...r, subject: { ...subject, act } };
}

/**
 * An act's receipt. A kind with a bound producer (L37) is priced from THAT producer's units - the
 * same function its job's plan step books - placed among the live queue (lib/producers
 * `partActReceipt`). A kind whose producer is not bound yet keeps the editor side's static receipt.
 * Every receipt reads `dry` until the editor can arm live (decision 4: a confirm of a live receipt).
 */
function receiptFor(deps: RealDeps, projectId: string, key: string, act: PartActKind, target?: string): Result<PartReceipt> {
  const k = deps.store();
  if (!k.ok) return k;
  const now = deps.now();
  const scene = unwrap(k.value.read((r) => sceneOf(r, projectId, key, now)));
  if (!scene.ok) return scene;
  const units = UNITS[scene.value.kind];
  if (units !== undefined) {
    const r = partActReceipt(k.value, { projectId, partId: scene.value.part.id, act, ...(target === undefined ? {} : { target }) }, units, { mode: "dry", now });
    return r.ok ? ok(partReceiptOf(r.value, act)) : r;
  }
  const b = unwrap(k.value.read((r) => basisOf(r, projectId, key, act, now, target)));
  return b.ok ? ok(receiptOf(b.value, act)) : b;
}

export const realPart: ServerPart = makeRealPart({
  store: () => {
    const k = kernel();
    return k.ok ? ok(k.value.store) : k;
  },
  now: () => Date.now(),
  gates: LIVE_GATES,
});
