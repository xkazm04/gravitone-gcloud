import "server-only";

import { kernel } from "@/lib/kernelStore";
import { LIVE_GATES, openReadyGates, type GateDeps } from "@/lib/parts/gates";
import { undoPart, writePartIn } from "@gt/kernel/parts/driver";
import type { Reader, Store } from "@gt/kernel/store";
import { driveStep, launchPartAct, partActReceipt, researchProducer, researchUnits, withRecords, type SplitFn, type StepFactory, type StepReceipt, type UnitsFn } from "@/lib/producers/research";
import { scriptProducer, scriptUnits } from "@/lib/producers/script";
import { voiceProducer, voiceUnits } from "@/lib/producers/voice";
import { wordsProducer, wordsUnits } from "@/lib/producers/words";
import { scoreProducer, scoreUnits } from "@/lib/producers/score";
import { cutProducer, cutUnits } from "@/lib/producers/cut";
import { framesProducer, framesUnits } from "@/lib/producers/frames";
import { motionProducer, motionUnits } from "@/lib/producers/motion";
import { stripCardsProducer, stripCardsSplit, stripCardsUnits } from "@/lib/producers/stripCards";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { isMusicConfigured } from "@/lib/music/elevenlabs";
import { listAdoptable, readAdoptable, type Adoptable, type AdoptedPost } from "@/lib/articles/adoptable";
import { explainerSectionsOf } from "@/lib/articles/sections";
import { ArticleError } from "@/lib/articles/store";
import type { AdoptSource, ArticleOp, EditorKind, PartActKind, PartOp, PartReceipt, PartView } from "@gt/domain/partView";

import type { ServerPart } from "./port.ts";
import { actModeOf } from "./actMode.ts";
import { receiptOf } from "./fixtureActs.ts";
import { basisOf, OPERATOR, opPlan, sceneOf, unwrap, viewOf, type OpPlan, type Scene } from "./realScene.ts";
import type { AdoptPost, ArticleInputs } from "./fixtureExplainer.ts";

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
//
// THE ARTICLE PART READS DISK BEFORE THE STORE: the posts it may adopt are files
// (lib/articles/adoptable.ts - article runs, the registry's publications), read with async calls
// that never run inside a store reader or transaction. So a verb on an article part reads them
// first - the list for its view, and for `article-adopt` the one post it names, cut into sections
// (lib/articles/sections.ts) - and hands them to the pure apply and the view through the scene's
// context (`ctx.article`). The op log keeps `{ op, source, id, postSha }`: the post's address and
// the digest it had when it was adopted, never its text. An id that names no final post is refused
// with lib/articles' own sentence before anything is written.

/** The finished posts an article part adopts, and one post's text (lib/articles/adoptable.ts). */
export type ArticleReads = {
  readonly list: () => Promise<readonly Adoptable[]>;
  readonly read: (source: AdoptSource, id: string) => Promise<AdoptedPost>;
};

export type RealDeps = {
  readonly store: () => Result<Store>;
  readonly now: () => number;
  readonly gates: GateDeps;
  /** How long a confirm waits for its job to end before answering with it running (default ACT_WAIT_MS). */
  readonly actWaitMs?: number;
  /** Where an article part's adoptable posts are read (default: this machine's, lib/articles). */
  readonly articles?: ArticleReads;
};

const ARTICLES: ArticleReads = { list: listAdoptable, read: readAdoptable };

/** A lib/articles refusal in the taxonomy: a post that is not there, or not final, is the op's input. */
function articleErr(e: unknown): Result<never> {
  if (e instanceof ArticleError) return err(e.status === 409 ? "refused" : e.status < 500 ? "invalid" : "unavailable", e.message);
  return err("unavailable", errorMessage(e));
}

/** The scene with the article inputs read before it (none for another kind). */
const withInputs = (s: Scene, a: ArticleInputs | undefined): Scene => (a === undefined ? s : { ...s, ctx: { ...s.ctx, article: a } });

/** The mode an act is priced and launched in: `live` for the acts ./actMode.ts names alone. */
const modeOf = (kind: EditorKind, act: PartActKind): "dry" | "live" => actModeOf(kind, act, { dryOnly: dryOnlyFrom(process.env), keyed: isMusicConfigured() });

/** A dry act lands in milliseconds; a live turn takes minutes and is answered as running. */
const ACT_WAIT_MS = 2500;

/** The producer each editor kind's acts run under (L37), built for the job's own lane, and the
 *  units its receipt and its job's plan step share. A kind absent here has no producer bound yet. */
const FACTORIES: Readonly<Partial<Record<EditorKind, StepFactory>>> = { research: researchProducer, script: scriptProducer, words: wordsProducer, voice: voiceProducer, score: scoreProducer, cut: cutProducer, frames: framesProducer, motion: motionProducer, strips: stripCardsProducer };
const UNITS: Readonly<Partial<Record<EditorKind, UnitsFn>>> = { research: withRecords(researchUnits), script: withRecords(scriptUnits), words: wordsUnits, voice: voiceUnits, score: scoreUnits, cut: cutUnits, frames: framesUnits, motion: motionUnits, strips: stripCardsUnits };
/** The kinds whose untargeted act fans out to one targeted job per unit, in the one confirm: a
 *  strips part draws a card a job (spark explainer-real-article-strips), so the cards run in
 *  parallel up to seat.text's slots, and a targeted `draw-strips` (a section id) redraws one card.
 *  The receipt is the whole act's: the sum of every card's. A confirm here names no ceiling, so
 *  every job runs uncapped as an unsplit act's does; a caller that passes one gets it SPLIT across
 *  the jobs, never copied (research/facts.ts `splitCeiling`). */
const SPLITS: Readonly<Partial<Record<EditorKind, SplitFn>>> = { strips: stripCardsSplit };

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
  const articles = deps.articles ?? ARTICLES;
  /** An article part's inputs, read before the store is; `adopt` also reads and cuts its post. */
  const inputsFor = async (store: Store, projectId: string, key: string, adopt?: ArticleOp): Promise<Result<ArticleInputs | undefined>> => {
    const kind = unwrap(
      store.read((r) => {
        const s = sceneOf(r, projectId, key, deps.now());
        return s.ok ? ok(s.value.kind) : s;
      }),
    );
    if (!kind.ok) return kind;
    if (kind.value !== "article") return ok(undefined);
    try {
      const adoptable = await articles.list();
      const got = adopt === undefined ? undefined : await articles.read(adopt.source, adopt.id);
      const cut: AdoptPost | undefined = adopt === undefined || got === undefined ? undefined : { source: adopt.source, id: adopt.id, title: got.title, sha: got.sha, sections: explainerSectionsOf(got.markdown) };
      return ok({ adoptable, post: (source, id) => (cut !== undefined && cut.source === source && cut.id === id ? cut : undefined) });
    } catch (e) {
      return articleErr(e);
    }
  };
  const read = (store: Store, projectId: string, key: string, a?: ArticleInputs): Result<PartView> =>
    unwrap(
      store.read((r) => {
        const s = sceneOf(r, projectId, key, deps.now());
        return s.ok ? ok(viewOf(r, withInputs(s.value, a))) : s;
      }),
    );
  const write = (projectId: string, key: string, baseRev: number, op: PartOp | null, run: (t: Reader, s: Scene) => OpPlan, a?: ArticleInputs) =>
    withStore((store) => {
      const w = store.tx((t) => {
        const s = sceneOf(t, projectId, key, deps.now());
        if (!s.ok) return s;
        const plan = run(t, withInputs(s.value, a));
        return writePartIn(t, { projectId, partId: s.value.part.id, baseRev: op === null ? "current" : baseRev, act: plan.act, op: plan.raw, label: plan.label, by: plan.by, next: () => plan.next });
      });
      const o = unwrap(w);
      if (!o.ok) return o;
      kick(store, projectId);
      const view = read(store, projectId, key, a);
      if (!view.ok) return view;
      return ok({ outcome: o.value, view: view.value });
    });

  return {
    loadPart: async ({ projectId, key }) => {
      const k = deps.store();
      if (!k.ok) return k;
      const a = await inputsFor(k.value, projectId, key);
      return a.ok ? read(k.value, projectId, key, a.value) : a;
    },
    opPart: async ({ projectId, key, baseRev, op }) => {
      const k = deps.store();
      if (!k.ok) return k;
      const adopt = op.op === "article-adopt" ? op : undefined;
      const a = await inputsFor(k.value, projectId, key, adopt);
      if (!a.ok) return a;
      // The log line is the op and the digest of the post it adopted - the post itself is a file.
      const sha = adopt === undefined ? undefined : a.value?.post(adopt.source, adopt.id)?.sha;
      const plan = (s: Scene): OpPlan => {
        const p = opPlan(s, op);
        return sha === undefined ? p : { ...p, raw: { ...op, postSha: sha } };
      };
      const w = write(projectId, key, baseRev, op, (_t, s) => plan(s), a.value);
      if (!w.ok) return w;
      return ok(w.value.outcome.kind === "conflict" ? { kind: "conflict", current: w.value.view } : { kind: "applied", view: w.value.view });
    },
    undoPart: async ({ projectId, key, baseRev }) => {
      const k = deps.store();
      if (!k.ok) return k;
      const store = k.value;
      const a = await inputsFor(store, projectId, key);
      if (!a.ok) return a;
      const at = store.read((r) => {
        const s = sceneOf(r, projectId, key, deps.now());
        return s.ok ? ok(s.value.part.id) : s;
      });
      const partId = unwrap(at);
      if (!partId.ok) return partId;
      const u = undoPart(store, { projectId, partId: partId.value, baseRev, by: OPERATOR });
      if (!u.ok) return u;
      kick(store, projectId);
      const view = read(store, projectId, key, a.value);
      if (!view.ok) return view;
      return ok(u.value.kind === "conflict" ? { kind: "conflict", current: view.value } : { kind: "applied", view: view.value });
    },
    actReceipt: ({ projectId, key, act, target }) => receiptFor(deps, projectId, key, act, target),
    act: async ({ projectId, key, act, token, target }) => {
      const store = deps.store();
      if (!store.ok) return store;
      const launched = launchAct(deps, store.value, projectId, key, act, token, target);
      if (!launched.ok) return launched;
      if (launched.value.kind === "stale") return ok(launched.value);
      const { jobIds, kind_: kind } = launched.value;
      // The job is the act (decision 3): driven here so a studio with no worker running still
      // lands it, and fenced by the lane slot so a worker that claims it first wins and this drive
      // reads `busy`. The confirm answers when the job ends or the wait runs out, whichever is
      // first; a longer act shows in the view's `running` and lands where the editor reads it.
      // A split act's jobs are driven side by side (each holds its own slot on the lane).
      const factory = FACTORIES[kind];
      if (factory === undefined) return err("unavailable", `no producer is bound for a ${kind} part yet`);
      const drives = jobIds.map((jobId) =>
        driveStep(factory, store.value, jobId, { hooks: { onSettled: async () => kick(store.value, projectId) } }).then(
          (r) => {
            if (!r.ok) console.error(`[part-act] ${jobId}: ${r.error.message}`);
          },
          (e: unknown) => console.error(`[part-act] ${jobId}: ${errorMessage(e)}`),
        ),
      );
      await Promise.race([Promise.all(drives), new Promise((res) => setTimeout(res, deps.actWaitMs ?? ACT_WAIT_MS).unref())]);
      const jobId = jobIds[0] ?? "";
      const a = await inputsFor(store.value, projectId, key);
      if (!a.ok) return a;
      const view = read(store.value, projectId, key, a.value);
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
function launchAct(deps: RealDeps, store: Store, projectId: string, key: string, act: PartActKind, token: string, target?: string): Result<{ kind: "stale"; fresh: PartReceipt } | { kind: "go"; jobIds: readonly string[]; kind_: EditorKind }> {
  const now = deps.now();
  const scene = unwrap(store.read((r) => sceneOf(r, projectId, key, now)));
  if (!scene.ok) return scene;
  const kind = scene.value.kind;
  const units = UNITS[kind];
  if (units === undefined) return err("unavailable", `no producer is bound for a ${kind} part yet`);
  const ref = { projectId, partId: scene.value.part.id, act, ...(target === undefined ? {} : { target }) };
  const split = SPLITS[kind];
  const confirm = { mode: modeOf(kind, act), now, token, actor: OPERATOR };
  const l = launchPartAct(store, ref, units, split === undefined ? confirm : { ...confirm, split });
  if (!l.ok) return l;
  return l.value.kind === "stale" ? ok({ kind: "stale", fresh: partReceiptOf(l.value.fresh, act) }) : ok({ kind: "go", jobIds: l.value.jobIds, kind_: kind });
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
 * Every receipt reads `dry` but the live acts' (./actMode.ts: the voice acts and `draw-strips`),
 * which read `live` where this process may spend: the confirm is the arm (decision 4).
 */
function receiptFor(deps: RealDeps, projectId: string, key: string, act: PartActKind, target?: string): Result<PartReceipt> {
  const k = deps.store();
  if (!k.ok) return k;
  const now = deps.now();
  const scene = unwrap(k.value.read((r) => sceneOf(r, projectId, key, now)));
  if (!scene.ok) return scene;
  const units = UNITS[scene.value.kind];
  if (units !== undefined) {
    const r = partActReceipt(k.value, { projectId, partId: scene.value.part.id, act, ...(target === undefined ? {} : { target }) }, units, { mode: modeOf(scene.value.kind, act), now });
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
