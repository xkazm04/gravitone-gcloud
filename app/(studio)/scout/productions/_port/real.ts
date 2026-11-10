import "server-only";

// THE REAL SIDE - the kernel's production record (lib/producers/production.ts and @gt/kernel/productions/store), and
// the concepts that can Start from Scout's own files (lib/foundry/scout/concepts.ts). A stage is read from the record,
// never inferred from a night. A concept with a production no longer offers Start.
//
// Every stage reads the record (S1-S6). The scripted slate is only the fixture side's (./fixture.ts); this side never draws it.

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import type { Store } from "@gt/kernel/store";
import { listProductions } from "@gt/kernel/productions/store";
import { roundsOf } from "@gt/kernel/productions/cast";
import { lessonsOf } from "@gt/kernel/productions/lessons";
import { joinVentureIn, startVentureIn } from "@gt/kernel/productions/venture";
import { listVentures } from "@gt/kernel/ventures/store";

import { keptConcepts } from "../../../../../lib/foundry/scout/concepts.ts";
import { blobRoute } from "../../../../../lib/library/media.ts";
import { jobOfTake, markProven, moveProduction, requestTake, startProduction } from "../../../../../lib/producers/production.ts";
import { castJobsView, castRoundView, markHeard, pickCast, recastRole, requestAudition, requestRoles, requestRound, retryDesigns, retryVoiceCreate, retryVoices, saveRoles } from "../../../../../lib/producers/productionCast.ts";
import { decideAudio, productionVoiceRoute, requestSpeakingTake } from "../../../../../lib/producers/productionAudio.ts";
import { jobOfCut, requestCut } from "../../../../../lib/producers/productionCut.ts";
import { acceptLesson, editLesson, requestLessons } from "../../../../../lib/producers/productionLessons.ts";
import type { CastRound } from "@gt/domain/production";
import { kernel } from "../../../../../lib/kernelStore.ts";
import type { Production, ProductionId, ProductionLesson } from "@gt/domain/production";

import type { AudioDecisionInput, CastLaunchView, CutLaunchInput, CutLaunchView, KeptConcept, ProductionEntry, ProductionFrame, ProductionsView, RoleEditInput, TakeLaunchView, TakeProgress, TakeRequestInput } from "./contract.ts";
import type { ServerProductions } from "./port.ts";

const served = (sha: string, mime: string): string => blobRoute(sha, mime) ?? `/api/blob/${sha}`;

function lessonsOfEntry(store: Store, id: string): readonly ProductionLesson[] {
  const r = store.read((x) => lessonsOf(x, id));
  return r.ok ? r.value : [];
}

function framesOf(p: Production): readonly ProductionFrame[] {
  return p.board.panels.map((x) => ({ id: x.id, beat: x.beat, prompt: x.prompt, src: served(x.still.sha256, x.still.mime) }));
}

function entryOf(p: Production, store: Parameters<typeof jobOfTake>[0]): ProductionEntry {
  const frames = framesOf(p);
  const progress: Record<string, TakeProgress> = {};
  for (const t of p.takes) {
    if (t.state !== "rendering" || t.jobId === undefined) continue;
    const job = jobOfTake(store, t.jobId);
    if (job !== undefined) progress[t.id] = { jobState: job.state, done: job.progress.done, total: job.progress.total, ...(job.progress.stage === undefined ? {} : { step: job.progress.stage }) };
  }
  const first = frames[0];
  const stored = store.read((r) => roundsOf(r, p.id));
  const rounds: CastRound[] = [];
  if (stored.ok) {
    for (const round of stored.value) {
      const view = castRoundView(store, p, round);
      if (view.ok) rounds.push(view.value);
    }
  }
  const job = p.cut?.jobId === undefined ? undefined : jobOfCut(store, p.cut.jobId);
  const cutJob: TakeProgress | undefined = job === undefined ? undefined : { jobState: job.state, done: job.progress.done, total: job.progress.total, ...(job.progress.stage === undefined ? {} : { step: job.progress.stage }) };
  return { production: p, logline: p.board.logline, ...(first === undefined ? {} : { poster: first.src }), frames, progress, rounds, castJobs: castJobsView(store, p.id), lessons: lessonsOfEntry(store, p.id), ...(cutJob === undefined ? {} : { cutJob }) };
}

/** The screen's whole view: the record's productions, the concepts still to start, the live ventures. */
export async function realView(): Promise<Result<ProductionsView>> {
  const k = kernel();
  if (!k.ok) return k;
  const store = k.value.store;
  try {
    const productions = store.read((r) => listProductions(r));
    if (!productions.ok) return productions;
    const started = new Set(productions.value.map((p) => `${p.source.kind}:${p.source.ref}`));
    const kept: readonly KeptConcept[] = (await keptConcepts()).filter((c) => !started.has(`${c.source.kind}:${c.source.ref}`));
    const heads = store.read((r) => listVentures(r));
    if (!heads.ok) return heads;
    const ventures = heads.value.filter((v) => v.retiredAt === undefined).map((v) => ({ id: v.id, name: v.name }));
    const route = productionVoiceRoute(store);
    if (!route.ok) return route;
    return ok({ entries: productions.value.map((p) => entryOf(p, store)), kept, ventures, voiceRoute: route.value.route, ...(route.value.proof === undefined ? {} : { voiceProof: route.value.proof }) });
  } catch (e) {
    return err("unavailable", errorMessage(e));
  }
}

const storeOf = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

async function withStore<T>(f: (s: Store) => Result<T>): Promise<Result<ProductionsView>> {
  const s = storeOf();
  if (!s.ok) return s;
  const r = f(s.value);
  if (!r.ok) return r;
  return view();
}

async function view(): Promise<Result<ProductionsView>> {
  return realView();
}

async function then<T>(r: Result<T>): Promise<Result<ProductionsView>> {
  if (!r.ok) return r;
  return view();
}

export const realProductions: ServerProductions = {
  view,
  start: async (source, who) => then(await startProduction({ source, by: who.id })),
  launch: async (input: TakeRequestInput, who: Actor) => {
    const r = await requestTake({ id: input.id, kind: input.kind, frames: input.frames, ...(input.prompt === undefined ? {} : { prompt: input.prompt }), mode: input.mode, by: who.id, actor: who, ...(input.token === undefined ? {} : { token: input.token }), dryOnly: dryOnlyFrom(process.env) });
    if (!r.ok) return r;
    const v = await view();
    if (!v.ok) return v;
    const launch: TakeLaunchView["launch"] = r.value.kind === "launched" ? { kind: "launched", jobId: r.value.jobId, takeId: r.value.takeId } : r.value.kind === "stale" ? { kind: "stale", receipt: r.value.fresh } : { kind: "receipt", receipt: r.value.receipt };
    return ok({ view: v.value, launch });
  },
  proven: async (id: ProductionId, takeId: string, who: Actor) => then(await markProven({ id, takeId, by: who.id, actor: who.kind })),
  editLesson: async (id, lessonId, text, who) => withStore((s) => editLesson(s, id, lessonId, text, who)),
  acceptLesson: async (id, lessonId, text, who) => {
    const s = storeOf();
    if (!s.ok) return s;
    return then(await acceptLesson(s.value, id, lessonId, text, who));
  },
  joinVenture: async (id, ventureId, who) => withStore((s) => s.tx((t) => joinVentureIn(t, id, ventureId, who))),
  startVenture: async (id, words, who) => withStore((s) => s.tx((t) => startVentureIn(t, id, words, who))),
  drop: async (id: ProductionId, who: Actor) => then(await moveProduction({ id, to: "dropped", by: who.id, actor: who.kind })),
  move: async (id, to, who) => then(await moveProduction({ id, to, by: who.id, actor: who.kind })),
  castLaunch: async (input, who) => {
    const store = storeOf();
    if (!store.ok) return store;
    const ask = { mode: input.mode, by: who.id, actor: who, dryOnly: dryOnlyFrom(process.env), ...(input.token === undefined ? {} : { token: input.token }) };
    const r = input.kind === "lessons" ? requestLessons(store.value, input.id, ask) : input.kind === "roles" ? requestRoles(store.value, input.id, ask) : input.kind === "audition" ? requestAudition(store.value, input.id, input.roleId ?? "", ask) : input.kind === "round" ? requestRound(store.value, input.id, input.roleId ?? "", ask) : retryDesigns(store.value, input.id, input.roundId ?? "", ask);
    if (!r.ok) return r;
    const v = await view();
    if (!v.ok) return v;
    const launch: CastLaunchView["launch"] = r.value.kind === "launched" ? { kind: "launched", jobId: r.value.jobId } : r.value.kind === "stale" ? { kind: "stale", receipt: r.value.fresh } : { kind: "receipt", receipt: r.value.receipt };
    return ok({ view: v.value, launch });
  },
  saveRoles: async (id, roles: readonly RoleEditInput[], who) => withStore((s) => saveRoles(s, id, roles, who)),
  heard: async (id, roundId, voiceId, at, who) => withStore((s) => markHeard(s, id, roundId, voiceId, at, who)),
  pick: async (id, roundId, character, voice, saveToLibrary, who) => withStore((s) => pickCast(s, { id, roundId, character, voice, saveToLibrary, by: who.id, actor: who, dryOnly: dryOnlyFrom(process.env) })),
  recast: async (id, roleId, who) => withStore((s) => recastRole(s, id, roleId, who)),
  retryVoices: async (id, roundId, who) => withStore((s) => retryVoices(s, id, roundId, who)),
  retryCreate: async (id, roundId, who) => withStore((s) => retryVoiceCreate(s, id, roundId, who)),
  decideAudio: async (input: AudioDecisionInput, who) => then(decideAudio({ id: input.id, decision: { voice: input.voice, music: input.music, sound: input.sound, ...(input.musicRef === undefined ? {} : { musicRef: input.musicRef }), ...(input.note === undefined ? {} : { note: input.note }) }, actor: who })),
  cutLaunch: async (input: CutLaunchInput, who) => {
    const store = storeOf();
    if (!store.ok) return store;
    const ask = { mode: input.mode, by: who.id, actor: who, dryOnly: dryOnlyFrom(process.env), ...(input.token === undefined ? {} : { token: input.token }) };
    const r = input.kind === "speak" ? await requestSpeakingTake(store.value, { id: input.id, roleId: input.roleId ?? "", ...ask }) : await requestCut({ id: input.id, takes: input.takes ?? [], ...ask });
    if (!r.ok) return r;
    const v = await view();
    if (!v.ok) return v;
    const launch: CutLaunchView["launch"] = r.value.kind === "launched" ? { kind: "launched", jobId: r.value.jobId } : r.value.kind === "stale" ? { kind: "stale", receipt: r.value.fresh } : { kind: "receipt", receipt: r.value.receipt };
    return ok({ view: v.value, launch });
  },
};
