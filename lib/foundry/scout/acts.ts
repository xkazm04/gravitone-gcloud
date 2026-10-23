import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import type { RunReport } from "@gt/kernel/job-run";
import type { Store } from "@gt/kernel/store";

import { driveExtract, launchExtract } from "../../producers/extract.ts";
import { launchScene } from "../../producers/scoutScene.ts";
import { getExtractRun } from "../extract/store.ts";
import type { ExtractUpload } from "../extract/types.ts";
import { nightBudget, type NightBudget } from "./budget.ts";
import { MAX_PICTURE_BYTES } from "./ingest.ts";
import { mutateNight, nextCandidateId, nightDir, readNight, resolveInNight, withCandidate } from "./store.ts";
import { CANDIDATE_KINDS, CANDIDATE_STATUSES, STOP_REASONS, type Candidate, type CandidateId, type Night, type NightId, type SceneCandidate, type StopReason, type StyleCandidate } from "./types.ts";

// THE NIGHT'S LAUNCHING ACTS - what pipeline/scout.mts `style`, `scene` and `close`
// do, as functions a test drives without a process. Each launch is an ORDINARY
// producer launch (extract's `launchExtract`, the scene producer's `launchScene`):
// the night adds three things and only three -
//
//   1. a refusal before anything is written when the night is not open, is past its
//      deadline (and is then closed, `stop: "deadline"`), or when the receipt's
//      WORST CASE is over what the night has left (./budget.ts) - the numbers in
//      the sentence. A job ceiling is a stop point (Director's ruling, Phase 4);
//      the NIGHT's ceiling is a promise, so a launch that could break it is not made;
//   2. the job's ceiling is the night's remaining money;
//   3. the candidate row, its job id on `night.jobs`, and its outcome.
//
// The CLI confirms its own receipt (COMMON decision 3, as pipeline/foundry/extract.mts
// does): invoking a night's act is the consent, inside the operator's standing $15
// grant for this loop.

/** A launch refused: the CLI prints the sentence verbatim and exits 1. */
export class Refusal extends Error {}

export type ActContext = {
  readonly store: Store;
  readonly location: string;
  readonly actor: Actor;
  readonly dryOnly: boolean;
  /** `--live` was typed on this act. */
  readonly live: boolean;
  readonly detach: boolean;
  readonly say: (line: string) => void;
  readonly now?: () => Date;
};

const usd = (x: number): string => `$${x.toFixed(2)}`;
export const budgetLine = (b: NightBudget): string =>
  `remaining ${usd(b.remainingUsd)} of ${usd(b.ceilingUsd)} Gemini (settled ${usd(b.settledUsd)}, held ${usd(b.heldUsd)}) · uncapped ${usd(b.uncappedUsd)} · clips ${b.clipsUsed}/${b.clipCap}`;

export function money(ctx: Pick<ActContext, "store">, night: Night): NightBudget {
  const b = nightBudget(ctx.store, night);
  if (!b.ok) throw b.error;
  return b.value;
}

/** Close a night that is still open; idempotent on one already closed or committed. */
export async function closeWith(id: NightId, stop: StopReason, now: Date): Promise<Night> {
  return mutateNight(id, (n) => (n.state !== "open" ? n : { ...n, state: "closed", stop, closedAt: now.toISOString() }));
}

/**
 * The night, when a launch may still be made from it: open, before its deadline, and - for a
 * launch that `spends` - in a mode this shell may run. Ingest spends nothing and skips the last.
 */
export async function launchable(ctx: ActContext, id: NightId, o: { readonly spends: boolean } = { spends: true }): Promise<{ night: Night; mode: ReceiptMode }> {
  const night = await readNight(id);
  const now = ctx.now?.() ?? new Date();
  if (night.state !== "open") throw new Refusal(`night ${id} is ${night.state}${night.stop === undefined ? "" : ` (${night.stop})`}; nothing more is launched from it`);
  if (night.deadline !== undefined && Date.parse(night.deadline) <= now.getTime()) {
    await closeWith(id, "deadline", now);
    throw new Refusal(`night ${id} passed its deadline ${night.deadline}; it is closed (stop: deadline) and nothing was launched`);
  }
  if (!o.spends) return { night, mode: "dry" };
  if (ctx.live && night.dry) throw new Refusal(`night ${id} is dry: a dry night launches nothing live (open a night with --live)`);
  if (!night.dry && ctx.dryOnly) throw new Refusal(`night ${id} is live and GRAVITONE_DRY_ONLY=1 pins this shell dry; nothing was launched`);
  return { night, mode: night.dry ? "dry" : "live" };
}

export const worstOf = (r: Receipt): number => r.totals.usdRange?.[1] ?? r.totals.usd;

export function overBudget(what: string, worst: number, b: NightBudget): Refusal | null {
  if (b.remainingUsd <= 0) return new Refusal(`${what}: the night has nothing left - ${budgetLine(b)}; nothing launched`);
  if (worst > b.remainingUsd) return new Refusal(`${what}: its worst case ${usd(worst)} is over the night's ${budgetLine(b)}; nothing launched`);
  return null;
}

export async function setCandidate(id: NightId, c: Candidate, job?: string): Promise<void> {
  await mutateNight(id, (n) => {
    const next = withCandidate(n, c);
    return job === undefined || next.jobs.includes(job) ? next : { ...next, jobs: [...next.jobs, job] };
  });
}

export async function addCandidate<C extends Candidate>(id: NightId, make: (cid: CandidateId) => C): Promise<C> {
  let made: C | undefined;
  await mutateNight(id, (n) => {
    made = make(nextCandidateId(n));
    return { ...n, candidates: [...n.candidates, made] };
  });
  if (made === undefined) throw new Error(`night ${id}: the candidate was not written`);
  return made;
}

/* ── style ─────────────────────────────────────────────────────────────────── */

const MIME: Readonly<Record<string, ExtractUpload["mime"]>> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const EXTRACT_MAX_SOURCES = 60;

/** The imaging vendor a night's style replicas prefer (prefer-only in the router: nothing else is asked). */
export const STYLE_GENERATOR = "leonardo-flare" as const;

export type StyleResult = { readonly candidate: StyleCandidate; readonly outcome?: string };

/** An extract run over the named sources' pictures and keyframes, as one style candidate. */
export async function styleAct(ctx: ActContext, id: NightId, sourceIds: readonly string[], slug?: string, use?: string): Promise<StyleResult> {
  const { night, mode } = await launchable(ctx, id);
  const uploads: ExtractUpload[] = [];
  for (const sid of sourceIds) {
    const s = night.sources.find((x) => x.id === sid);
    if (s === undefined) throw new Refusal(`night ${id} has no source ${sid}`);
    if (s.status !== "ingested" || s.files.length === 0) throw new Refusal(`source ${sid} is ${s.status}${s.error === undefined ? "" : ` (${s.error})`}; only an ingested source makes a style`);
    for (const f of s.files) {
      const mime = MIME[path.extname(f).toLowerCase()];
      if (mime === undefined || uploads.length >= EXTRACT_MAX_SOURCES) continue;
      const bytes = await readFile(resolveInNight(id, f));
      if (bytes.length > MAX_PICTURE_BYTES) continue;
      uploads.push({ name: `${sid}-${path.basename(f)}`, mime, base64: bytes.toString("base64") });
    }
  }
  if (uploads.length === 0) throw new Refusal(`sources ${sourceIds.join(",")} hold no picture extract can read`);
  const b = money(ctx, night);
  // The replicas and transfers are drawn on Flare (operator, 2026-10-22); the reads stay on the plan.
  const target = { kind: "gallery" as const, slug: slug ?? `scout-${id}-${sourceIds.join("-")}`, uploads, options: { generator: STYLE_GENERATOR }, folder: nightDir(id) };
  const opts = { mode, actor: ctx.actor, dryOnly: ctx.dryOnly, ...(b.remainingUsd > 0 ? { ceilingUsd: b.remainingUsd } : {}) };
  const r0 = await launchExtract(ctx.store, target, opts);
  if (!r0.ok) throw new Refusal(r0.error.message);
  if (r0.value.kind !== "receipt") throw new Refusal(`extract launch answered ${r0.value.kind} before its receipt`);
  const rc = r0.value.receipt;
  const refused = overBudget(`style over ${sourceIds.join(",")}`, worstOf(rc), b);
  if (refused !== null) throw refused;
  ctx.say(`receipt (${rc.mode}): ${uploads.length} picture(s) · worst case ${usd(worstOf(rc))} · ceiling ${usd(b.remainingUsd)}`);
  let c: StyleCandidate = await addCandidate(id, (cid) => ({ id: cid, kind: "style", sourceIds: [...sourceIds], status: "pending", ...(use === undefined ? {} : { use }) }));
  const r1 = await launchExtract(ctx.store, target, { ...opts, token: rc.token });
  if (!r1.ok || r1.value.kind !== "launched") {
    const why = !r1.ok ? r1.error.message : `the receipt moved while it was confirmed (${r1.value.kind}); nothing launched`;
    await setCandidate(id, { ...c, status: "failed", error: why });
    throw new Refusal(why);
  }
  c = { ...c, extractRunId: r1.value.runId, jobId: r1.value.jobId };
  await setCandidate(id, c, r1.value.jobId);
  ctx.say(`launched ${c.id}: extract run ${r1.value.runId} as ${r1.value.jobId}`);
  if (ctx.detach) return { candidate: c, outcome: "detached" };
  const t0 = Date.now();
  const r = await driveExtract(ctx.store, ctx.location, r1.value.jobId, { dryOnly: ctx.dryOnly, onStep: (step) => ctx.say(`  ${Math.round((Date.now() - t0) / 1000)}s  ${step}`) });
  const settled = await settleStyle(id, c);
  return { candidate: settled, outcome: r.ok ? r.value.outcome : r.error.message };
}

/** A style candidate's status, read off its extract run: done is rendered, failed is failed with the run's sentence. */
export async function settleStyle(id: NightId, c: StyleCandidate): Promise<StyleCandidate> {
  if (c.status !== "pending" || c.extractRunId === undefined) return c;
  const { run } = await getExtractRun(c.extractRunId);
  const next: StyleCandidate | null =
    run.status === "done" || run.status === "committed" ? { ...c, status: "rendered" } : run.status === "failed" ? { ...c, status: "failed", error: run.error ?? `extract run ${run.id} failed` } : null;
  if (next === null) return c;
  await setCandidate(id, next);
  return next;
}

/* ── scene ─────────────────────────────────────────────────────────────────── */

export type SceneResult = { readonly candidate: SceneCandidate; readonly outcome?: string };

/** A scene candidate over one source's keyframes, launched through the scene producer's contract. */
export async function sceneAct(ctx: ActContext, id: NightId, sourceId: string, frames?: readonly string[], use?: string): Promise<SceneResult> {
  const { night, mode } = await launchable(ctx, id);
  const s = night.sources.find((x) => x.id === sourceId);
  if (s === undefined) throw new Refusal(`night ${id} has no source ${sourceId}`);
  if (s.status !== "ingested" || s.files.length === 0) throw new Refusal(`source ${sourceId} is ${s.status}${s.error === undefined ? "" : ` (${s.error})`}; only an ingested source makes a scene`);
  // Ingest keeps ONE frame per cut, so neighbouring keyframes are different shots (in a video
  // essay, different films): a scene is read from the frame the skill chose, and absent a choice
  // from the first. A run of five blended unrelated shots into one recipe (2026-10-22 dry campaign).
  const keyframes = frames === undefined ? s.files.slice(0, 1) : frames.map((f) => (f.includes("/") ? f : `sources/${sourceId}/${f}`));
  const missing = keyframes.find((f) => !s.files.includes(f));
  if (missing !== undefined) throw new Refusal(`source ${sourceId} holds no ${missing} (it holds ${s.files.map((f) => path.basename(f)).join(", ")})`);
  const b = money(ctx, night);
  if (b.remainingUsd <= 0) throw new Refusal(`scene from ${sourceId}: the night has nothing left - ${budgetLine(b)}; nothing launched`);
  let clip = b.clipsUsed < b.clipCap;
  let clipWhy = clip ? " with a clip" : " (clip cap spent: stills only)";
  let c: SceneCandidate = await addCandidate(id, (cid) => ({ id: cid, kind: "scene", sourceIds: [sourceId], status: "pending", keyframes, replicas: [], ...(use === undefined ? {} : { use }) }));
  const fail = async (why: string): Promise<never> => {
    await setCandidate(id, { ...c, status: "failed", error: why });
    throw new Refusal(why);
  };
  let opts = { mode, ceilingUsd: b.remainingUsd, clip, actor: ctx.actor, dryOnly: ctx.dryOnly };
  const target = { nightId: id, candidateId: c.id };
  let r0 = await launchScene(ctx.store, target, opts);
  if (!r0.ok) return fail(r0.error.message);
  if (r0.value.kind === "existing") return { candidate: { ...c, jobId: r0.value.jobId }, outcome: r0.value.state };
  if (r0.value.kind !== "receipt") return fail(`scene launch answered ${r0.value.kind} before its receipt`);
  // The night's last dollars: a clip's hold no longer fits but the stills do - the scene is still
  // worth its recipe and two replicas, so it is priced again without the clip rather than refused
  // (2026-10-22 dry campaign: $0.05 left refused a scene over its $3.84 clip worst case).
  if (clip && overBudget("", worstOf(r0.value.receipt), b) !== null) {
    const stills = await launchScene(ctx.store, target, { ...opts, clip: false });
    if (stills.ok && stills.value.kind === "receipt" && overBudget("", worstOf(stills.value.receipt), b) === null) {
      clip = false;
      clipWhy = " (a clip is over the remaining money: stills only)";
      opts = { ...opts, clip: false };
      r0 = stills;
    }
  }
  if (!r0.ok || r0.value.kind !== "receipt") return fail("scene launch lost its receipt");
  const rc = r0.value.receipt;
  const refused = overBudget(`scene ${c.id} from ${sourceId}`, worstOf(rc), b);
  if (refused !== null) return fail(refused.message);
  ctx.say(`receipt (${rc.mode}): scene ${c.id}${clipWhy} · worst case ${usd(worstOf(rc))} · ceiling ${usd(b.remainingUsd)}`);
  const r1 = await launchScene(ctx.store, target, { ...opts, token: rc.token });
  if (!r1.ok) return fail(r1.error.message);
  if (r1.value.kind !== "launched") return fail(`the receipt moved while it was confirmed (${r1.value.kind}); nothing launched`);
  // Re-read: the producer may have written the candidate since (its recipe, its status).
  const now = (await readNight(id)).candidates.find((x) => x.id === c.id);
  c = { ...(now?.kind === "scene" ? now : c), jobId: r1.value.jobId, ...(clip ? { clipRequested: true as const } : {}) };
  await setCandidate(id, c, r1.value.jobId);
  ctx.say(`launched ${c.id} as ${r1.value.jobId}`);
  if (ctx.detach) return { candidate: c, outcome: "detached" };
  // The scene producer's drive, when its module exports one (WP2): the contract names only
  // `launchScene`, so a checkout without it leaves the job queued for the worker.
  const mod = (await import("../../producers/scoutScene.ts")) as { readonly driveScene?: DriveScene };
  if (mod.driveScene === undefined) {
    ctx.say(`enqueued ${r1.value.jobId}; the worker drives it`);
    return { candidate: c, outcome: "enqueued" };
  }
  const r = await mod.driveScene(ctx.store, ctx.location, r1.value.jobId, { dryOnly: ctx.dryOnly });
  const after = (await readNight(id)).candidates.find((x) => x.id === c.id);
  return { candidate: after?.kind === "scene" ? after : c, outcome: r.ok ? r.value.outcome : r.error.message };
}

type DriveScene = (store: Store, location: string, jobId: string, opts: { readonly dryOnly: boolean }) => Promise<Result<RunReport>>;

/* ── close and the morning ─────────────────────────────────────────────────── */

export type Morning = {
  readonly night: NightId;
  readonly packet: string;
  readonly state: Night["state"];
  readonly stop?: StopReason;
  readonly byKind: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly settledUsd: number;
  readonly uncappedUsd: number;
  readonly heldUsd: number;
};

export function morning(n: Night, b: NightBudget): Morning {
  const byKind = Object.fromEntries(
    CANDIDATE_KINDS.map((k) => [k, Object.fromEntries(CANDIDATE_STATUSES.map((s) => [s, n.candidates.filter((c) => c.kind === k && c.status === s).length]))]),
  );
  return { night: n.id, packet: `pkt:scout:${n.id}`, state: n.state, ...(n.stop === undefined ? {} : { stop: n.stop }), byKind, settledUsd: b.settledUsd, uncappedUsd: b.uncappedUsd, heldUsd: b.heldUsd };
}

export const isStopReason = (s: string): s is StopReason => (STOP_REASONS as readonly string[]).includes(s);

/**
 * Settle the night's style candidates from their runs, then close it: the given stop, else target or
 * sources-exhausted. The target counts the plan's rows only: idea artboards are drawn beside it (up
 * to `ideaCap`), and twenty-five drawn ideas are not a night that studied twenty things.
 */
export async function closeAct(ctx: Pick<ActContext, "store" | "now">, id: NightId, stop?: StopReason): Promise<Morning> {
  for (const c of (await readNight(id)).candidates) if (c.kind === "style") await settleStyle(id, c).catch(() => c);
  const n = await readNight(id);
  const rendered = n.candidates.filter((c) => c.kind !== "idea" && c.status === "rendered").length;
  const closed = await closeWith(id, stop ?? (rendered >= n.target ? "target" : "sources-exhausted"), ctx.now?.() ?? new Date());
  return morning(closed, money(ctx, closed));
}
