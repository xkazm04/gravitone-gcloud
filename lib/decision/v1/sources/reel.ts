import "server-only";

import { stat } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";
import type { ItemWords } from "@gt/ui/board/port";
import { decodeSchedule, scheduleWords } from "@gt/ui/components/review/schedule.ts";

import { readJson } from "../../../foundry/runStore.ts";
import { kernel } from "../../../kernelStore.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import type { WeirItem } from "../../../ledger/v1/types.ts";
import { landReelCut, reelExportId, reelLandingProblem, reelScheduleOf, reelSlotId } from "../../../producers/reelActs.ts";
import { exportsRoot } from "../../../publish/exports.ts";
import { parseState } from "../../../reel/state.ts";
import { STOP_KEYS, listReelSlugs, parsePublish, parseStopRun, readVerdicts, recordVerdict, reelDir, reelsRoot, roundOf, stopMediaRel, stopOf, stopRunId, verdictClash, type ReelPublish, type ReelVerdict, type Stop } from "../../../reel/store.ts";
import { parseTable } from "../../../reel/table.ts";
import { CUTS, REEL_FPS, type Continuity, type ReelSource, type ReelState } from "../../../reel/types.ts";
import { buildConsequence, committedOutcome, decisionMap, foundryFileUrl, fromV1, mediaRef, mintPacket, runIdOf, v1Call, v1DigestOf, type AdapterRef, type DecisionAdapter, type DecisionsAt, type Loss, type OpenPlan, type Preview } from "../types.ts";

// A STAT REEL'S THREE OPERATOR STOPS AS PACKETS - `pkt:reel:<slug>:data`, `:<cut>:proof`, `:<cut>:cut`, read
// from the reel's folder (pipeline/reel.mts wrote it; lib/reel/store.ts says where it is and what a stop is).
// One packet per stop because a packet's items are frozen when it opens: the card, the sheet and the cut do
// not exist at the same time. One cell each, decided in a matrix cull: keep lets the reel go on, reject says
// what the next attempt must fix and owes a reason (@gt/domain/source `reel`, reasonOnReject).
//
// THE FOLDER IS v1 HERE and only `apply` writes to it: the verdict into <dir>/verdicts.json, and - for a kept
// cut - the cut onto the Calendar (lib/producers/reelActs.ts). Held from the registry's hitl-approval:
//   gate-state-machines  only the human path opens a gate: a KEEP is the operator's, at the preview and again
//                        at the apply (./final.ts); an agent may reject, with a reason, and may never keep.
//   decision-records     the record says who, what verdict, when, why, and WHAT EXACTLY: the sha256 of the
//                        file the packet froze. A subject made again is a new round, never a re-judged packet.
//   resume-after-decision  a duplicate of the same verdict is success, another verdict for the same round is a
//                        loud refusal; the slot is made BEFORE the verdict is recorded (./articleSlot.ts: the
//                        order a crash between the two heals from), from the bytes that were judged.
//
// THE PILES ARE READ BESIDE liveNow (app/(studio)/_shell/live.ts), as ./final.ts's are: a stop is not a job the
// ledger projects, so there is no ledger Source and no row in the runs probe's predicates.

const operatorOnly = (stop: Stop): string => `reel ${stop.slug}: only an operator keeps the ${stop.key} stop`;

type DataFacts = { readonly kind: "data"; readonly continuity: Continuity & { readonly accepted?: string }; readonly source: ReelSource; readonly granularity: string };
type ProofFacts = { readonly kind: "proof"; readonly frames: number };
type CutFacts = { readonly kind: "cut"; readonly frames: number; readonly gates: readonly { readonly name: string; readonly ok: boolean; readonly detail: string }[]; readonly renderer?: string; readonly silent: boolean; readonly publish: ReelPublish | string };

export type ReelV1 = {
  readonly stop: Stop;
  readonly round: number;
  readonly state: ReelState;
  /** Reel-relative: what the stop shows. */
  readonly rel: string;
  readonly media: BlobRef;
  /** The verdict an earlier round left (its subject has been made again since). */
  readonly held?: ReelVerdict;
  readonly facts: DataFacts | ProofFacts | CutFacts;
};

export type ReelDeps = { readonly store: () => Result<Store> };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const exists = (abs: string): Promise<boolean> => stat(abs).then((s) => s.isFile(), () => false);
/** Repo-relative where it is under the repo (what a consequence names), absolute elsewhere (a temp store). */
const shown = (abs: string): string => {
  const rel = path.relative(process.cwd(), abs).replace(/\\/g, "/");
  return rel.startsWith("..") || path.isAbsolute(rel) ? abs.replace(/\\/g, "/") : rel;
};

/* ── read ──────────────────────────────────────────────────────────────────── */

async function stateOf(slug: string): Promise<ReelState | undefined> {
  const parsed = parseState(await readJson<unknown>(path.join(reelDir(slug), "reel.json")).catch(() => null));
  return typeof parsed === "string" ? undefined : parsed;
}

/** Whether the reel has reached a stop: a card, a sheet or a cut left from before a new table or brief is not one. */
function reached(state: ReelState, stop: Stop): boolean {
  if (stop.cut === undefined) return state.tableSha !== undefined;
  const stage = state.cuts[stop.cut]?.stage;
  return stop.kind === "proof" ? stage === "proofed" || stage === "cut" : stage === "cut";
}

type Standing = { readonly rel: string; readonly media: BlobRef; readonly round: number; readonly open: boolean; readonly held?: ReelVerdict };

/** What a stop shows now and which round that is; undefined when there is nothing to judge yet. */
async function standing(state: ReelState, stop: Stop, verdicts: Awaited<ReturnType<typeof readVerdicts>>): Promise<Result<Standing | undefined>> {
  if (!reached(state, stop)) return ok(undefined);
  const dir = reelDir(stop.slug);
  const rel = stopMediaRel(stop, stop.kind === "cut" && (await exists(path.join(dir, stopMediaRel(stop, true)))));
  const media = await mediaRef(path.join(dir, rel));
  if (!media.ok) return media.error.code === "not-found" ? ok(undefined) : media;
  const held = verdicts.stops[stop.key];
  return ok({ rel, media: media.value, ...roundOf(held, media.value.sha256), ...(held === undefined ? {} : { held }) });
}

async function factsOf(state: ReelState, stop: Stop): Promise<Result<ReelV1["facts"]>> {
  const dir = reelDir(stop.slug);
  if (stop.cut === undefined) {
    const c = await readJson<unknown>(path.join(dir, "continuity.json"));
    if (!isObj(c) || typeof c["steps"] !== "number" || !Array.isArray(c["failures"])) return err("not-found", `reel ${stop.slug}: continuity.json does not read; run \`data\` again`);
    // The table's own door (lib/reel/table.ts), never a second reading of the source line.
    const table = parseTable(await readJson<unknown>(path.join(dir, "table.json")));
    if (typeof table === "string") return err("not-found", `reel ${stop.slug}: table.json: ${table}`);
    return ok({ kind: "data", continuity: c as unknown as DataFacts["continuity"], source: table.source, granularity: table.granularity });
  }
  const frames = state.cuts[stop.cut]?.frames ?? 0;
  if (stop.kind === "proof") return ok({ kind: "proof", frames });
  const g = await readJson<unknown>(path.join(dir, stop.cut, "render", "gates.json"));
  if (!isObj(g)) return err("not-found", `reel ${stop.slug}: ${stop.cut}/render/gates.json does not read; run \`cut\` again`);
  const gates = Object.entries(g).flatMap(([name, v]) => (isObj(v) && typeof v["ok"] === "boolean" && typeof v["detail"] === "string" ? [{ name, ok: v["ok"], detail: v["detail"] }] : []));
  const raw = await readJson<unknown>(path.join(dir, stop.cut, "publish.json")).catch(() => "unreadable");
  const publish = raw === null ? "publish.json is not written yet: run `cut` again" : parsePublish(raw);
  return ok({ kind: "cut", frames, gates, ...(typeof g["renderer"] === "string" ? { renderer: g["renderer"] } : {}), silent: state.tracks?.[stop.cut] === undefined, publish: typeof publish === "string" ? `${stop.cut}/${publish}` : publish });
}

async function read(ref: AdapterRef): Promise<Result<ReelV1>> {
  const stop = parseStopRun(ref.runId);
  if (stop === undefined) return err("invalid", `a reel packet is <slug>:data or <slug>:<short|long>:<proof|cut>, not ${ref.runId}`);
  const got = await v1Call(async (): Promise<Result<ReelV1>> => {
    const state = await stateOf(stop.slug);
    if (state === undefined) return err("not-found", `no reel ${stop.slug} in ${shown(reelsRoot())}`);
    const at = await standing(state, stop, await readVerdicts(reelDir(stop.slug)));
    if (!at.ok) return at;
    if (at.value === undefined) return err("not-found", `reel ${stop.slug}: there is nothing to judge at the ${stop.key} stop yet`);
    const { open, round, held, rel, media } = at.value;
    if (!open) return err("not-found", `reel ${stop.slug}: the ${stop.key} stop is decided (${held?.verdict ?? ""}, round ${round})`);
    if (stop.round !== undefined && stop.round !== round) return err("not-found", `reel ${stop.slug}: round ${stop.round} of the ${stop.key} stop is not the one waiting (${round})`);
    const facts = await factsOf(state, stop);
    if (!facts.ok) return facts;
    return ok({ stop: stopOf(stop.slug, stop.key), round, state, rel, media, ...(held === undefined ? {} : { held }), facts: facts.value });
  });
  return got.ok ? got.value : got;
}

/* ── packet ────────────────────────────────────────────────────────────────── */

const stopLabel = (stop: Stop): string => (stop.cut === undefined ? "table" : `${stop.cut} ${stop.kind}`);
const runOf = (v1: ReelV1): string => stopRunId(v1.stop.slug, v1.stop.key, v1.round);
const secondsOf = (frames: number): number => Math.round(frames / REEL_FPS);

function wordsOf(v1: ReelV1): { readonly item: ItemWords; readonly oracle?: { readonly passed: boolean; readonly summary: string } } {
  const { state, facts, stop } = v1;
  if (facts.kind === "data") {
    const c = facts.continuity;
    return {
      item: { label: state.idea.title, meta: `${c.steps} ${facts.granularity} steps · ${c.onScreen} on screen · ${c.leadChanges} lead changes · ${c.movements} overtakes · ${c.events} events`, prompt: `Source: ${facts.source.name} · ${facts.source.licence}` },
      oracle: { passed: c.ok, summary: c.ok ? `continuity gate passed · ${c.entities} entities` : `${c.failures.join("; ")}${c.accepted === undefined ? "" : ` · taken on: ${c.accepted}`}` },
    };
  }
  const spec = CUTS[stop.cut ?? "short"];
  if (facts.kind === "proof") return { item: { label: state.idea.title, meta: `${stop.cut} · ${spec.width}x${spec.height} · ${secondsOf(facts.frames)} s · 12 frames`, prompt: state.idea.hook } };
  return {
    item: { label: typeof facts.publish === "string" ? state.idea.title : facts.publish.title, meta: [stop.cut, `${secondsOf(facts.frames)} s`, ...(facts.renderer === undefined ? [] : [facts.renderer]), facts.silent ? "silent" : "with its bed"].join(" · "), prompt: state.idea.hook },
    ...(facts.gates.length === 0 ? {} : { oracle: { passed: facts.gates.every((g) => g.ok), summary: facts.gates.map((g) => `${g.name}: ${g.detail}`).join(" | ") } }),
  };
}

function packet(v1: ReelV1): Result<OpenPlan> {
  const { stop, state, held } = v1;
  const cell = stop.kind;
  const minted = mintPacket({
    id: packetIdOf("reel", runOf(v1)),
    lane: "video",
    source: "reel",
    mode: "matrix-cull",
    state: "open",
    runId: runOf(v1),
    title: `${state.idea.title} · ${stopLabel(stop)}`.slice(0, 200),
    items: [{ id: cell, jobId: `reel:${stop.slug}`, media: v1.media, row: cell, grades: [] }],
  });
  if (!minted.ok) return minted;
  const words = wordsOf(v1);
  const losses: Loss[] = v1.facts.kind === "cut" && typeof v1.facts.publish === "string" ? [{ candidate: cell, grade: "dropped", reason: `${v1.facts.publish}; a kept cut has no title to go on the Calendar with` }] : [];
  const before = held === undefined ? "" : ` · round ${v1.round} · round ${held.round} ${held.verdict === "keep" ? "kept" : `rejected${held.reasons.length === 0 ? "" : `: ${held.reasons.join(", ")}`}`}`;
  return ok({
    packet: minted.value,
    // A round is undecided by construction: an earlier round's verdict was of other bytes, and is another packet's.
    initial: [],
    present: { items: { [cell]: words.item }, rows: [{ id: cell, label: stopLabel(stop), group: stop.kind }], ...(words.oracle === undefined ? {} : { oracle: words.oracle }), meta: `reel · ${stop.slug}${before}` },
    // A reel's files are made again AT THE SAME PATH (a re-shot sheet, a re-rendered cut), and the file route lets
    // the browser hold what it fetched: the bytes' own digest in the address keeps a new round from drawing the old one.
    urls: { [cell]: `${foundryFileUrl(stop.slug, v1.rel, "reel")}&v=${v1.media.sha256.slice(0, 12)}` },
    losses,
  });
}

/* ── consequence ───────────────────────────────────────────────────────────── */

function consequence(v1: ReelV1, at: DecisionsAt): Result<Preview> {
  const { stop, facts } = v1;
  const cell = stop.kind;
  const d = decisionMap(at.decisions).get(cell);
  const writes: Preview["consequence"]["writes"][number][] = [];
  const record = `${shown(path.join(reelDir(stop.slug), "verdicts.json"))} ${stop.key}`;
  if (d?.verdict === "keep") {
    if (d.by !== "operator") return err("refused", operatorOnly(stop));
    writes.push({ kind: "index-row", target: record, candidate: cell, detail: `keep${v1.round > 1 ? ` · round ${v1.round}` : ""}` });
    if (facts.kind === "cut" && stop.cut !== undefined) {
      if (typeof facts.publish === "string") return err("invalid", `reel ${stop.slug}: ${facts.publish}`);
      // The instant is the commit's (reelActs.ts reelScheduleOf); a preview has none, so only the line is read here.
      const when = reelScheduleOf(d.note, new Date(0).toISOString());
      if (!when.ok) return when;
      const exportId = reelExportId(stop.slug, stop.cut, v1.round);
      const problem = reelLandingProblem(exportId, facts.publish);
      if (problem !== null) return err("invalid", `reel ${stop.slug}: ${stop.cut}/publish.json: ${problem}`);
      const proposed = decodeSchedule(d.note).kind === "none";
      writes.push({ kind: "file", target: `${shown(exportsRoot())}/${exportId}.mp4`, candidate: cell, detail: `copied: ${v1.rel}` });
      writes.push({ kind: "index-row", target: `calendar · ${proposed ? `${when.value.channel} · the day after the commit, 08:00 UTC` : scheduleWords(when.value)}`, candidate: cell, detail: `slot ${reelSlotId(stop.slug, stop.cut, v1.round)}: ${facts.publish.title}` });
    }
  } else if (d?.verdict === "reject") {
    const then = stop.kind === "proof" ? " · `cut` is refused until the frames are shot again" : "";
    writes.push({ kind: "index-row", target: record, candidate: cell, detail: `reject${d.reasons.length === 0 ? "" : ` (${d.reasons.join(", ")})`}${then}` });
  }
  // The words a slot would carry are part of what was shown: publish.json edited after the preview is a stale preview.
  const v1Digest = v1DigestOf({ source: "reel", run: runOf(v1), media: v1.media.sha256, held: v1.held ?? null, publish: facts.kind === "cut" ? facts.publish : null });
  return ok({ v1Digest, consequence: buildConsequence(at, [cell], { writes }, v1Digest) });
}

/* ── apply ─────────────────────────────────────────────────────────────────── */

export function makeReelAdapter(deps: ReelDeps): DecisionAdapter<ReelV1> {
  async function apply(claim: Parameters<DecisionAdapter<ReelV1>["apply"]>[0]): Promise<Result<void>> {
    const done = committedOutcome(claim);
    if (!done.ok) return done;
    const run = runIdOf(claim);
    if (!run.ok) return run;
    const stop = parseStopRun(run.value);
    const judged = claim.packet.items[0]?.media.sha256;
    if (stop === undefined || judged === undefined) return err("invalid", `packet ${claim.packetId} is not a reel stop`);
    const d = decisionMap(claim.decisions).get(stop.kind);
    if (d === undefined || d.verdict === null) return err("invalid", `packet ${claim.packetId} was committed with the ${stop.key} stop undecided`);
    if (d.verdict === "keep" && d.by !== "operator") return err("refused", operatorOnly(stop));
    const dir = reelDir(stop.slug);
    const round = stop.round ?? 1;
    const verdict: ReelVerdict = { verdict: d.verdict, reasons: d.reasons, ...(d.note === undefined ? {} : { note: d.note }), by: d.by, at: d.at, of: judged, round };
    const head = await v1Call(async () => (await readVerdicts(dir)).stops[stop.key]);
    if (!head.ok) return head;
    // A later round's verdict means this one landed whole, slot included: nothing is made twice.
    if (head.value !== undefined && head.value.round > round) return ok(undefined);
    // Refused BEFORE the Calendar is touched: a round that holds another verdict schedules nothing.
    const clash = verdictClash(stop.slug, stop.key, head.value, verdict);
    if (clash !== undefined) return err("refused", clash);
    if (d.verdict === "keep" && stop.kind === "cut" && stop.cut !== undefined) {
      const cut = stop.cut;
      const schedule = reelScheduleOf(d.note, done.value.result.at);
      if (!schedule.ok) return schedule;
      const publish = await v1Call(async () => parsePublish(await readJson<unknown>(path.join(dir, cut, "publish.json"))));
      if (!publish.ok) return publish;
      if (typeof publish.value === "string") return err("invalid", `reel ${stop.slug}: ${cut}/${publish.value}`);
      const store = deps.store();
      if (!store.ok) return store;
      const video = path.join(dir, stopMediaRel(stop, await exists(path.join(dir, stopMediaRel(stop, true)))));
      const slot = await landReelCut(store.value, { slug: stop.slug, cut, round, video, sha256: judged, publish: publish.value, schedule: schedule.value }, { kind: "machine", id: claim.holder });
      if (!slot.ok) return slot;
    }
    const recorded = await v1Call(() => recordVerdict(dir, stop.key, verdict));
    return recorded.ok ? ok(undefined) : recorded;
  }

  return { source: "reel", read, packet, consequence, apply };
}

const liveStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

export const reelAdapter: DecisionAdapter<ReelV1> = makeReelAdapter({ store: liveStore });

/* ── the piles ─────────────────────────────────────────────────────────────── */

/** Every stop that is waiting, across the reel folders, as Weir piles. A folder that is not a reel yet holds none. */
export async function liveReelPiles(): Promise<Result<WeirItem[]>> {
  try {
    const out: WeirItem[] = [];
    for (const slug of await listReelSlugs()) {
      const state = await stateOf(slug);
      if (state === undefined) continue;
      const verdicts = await readVerdicts(reelDir(slug));
      // WP-0 (spark reel-studio): the film and release stops have no media door here until WP1 builds them.
      for (const key of STOP_KEYS.filter((k) => k !== "film" && k !== "release")) {
        const stop = stopOf(slug, key);
        const at = await standing(state, stop, verdicts);
        if (!at.ok) return at;
        if (at.value === undefined || !at.value.open) continue;
        const packetId = packetIdOf("reel", stopRunId(slug, key, at.value.round));
        out.push({ source: "reel", id: stopRunId(slug, key, at.value.round), title: `${state.idea.title} · ${stopLabel(stop)}`, media: "video", kind: "cull", since: state.updatedAt, decided: 0, pending: 1, href: `/board/${encodeURIComponent(packetId)}`, packetId });
      }
    }
    return ok(out);
  } catch (e) {
    return fromV1(e);
  }
}
