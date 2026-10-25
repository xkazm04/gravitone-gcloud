// A GENRE'S PIECE (spark scout-vision S2): the best kept trial rendered in full - only the clips the operator rejected
// on it re-made on LTX - and cut with the clips' own audio into one 15-30 s mp4 (`pieces/c-NN/piece.mp4`). Kept on the
// Board, the genre is publishable.
//
// THE ACT - `pipeline/scout.mts piece <night> [--genre gn-...]`. Every genre ./genres.ts `piecesDue` names (state
// piece-due, no piece of it pending or still unjudged on any night) - or only `--genre`'s, refused with its state when
// it is not due - becomes ONE `piece` candidate {genre, fromTrial, title (the trial's), clips} and ONE scout-piece job
// on gpu.local (lib/producers/scoutPiece.ts): the trial's rejected or failed clips re-made, the kept ones reused, all
// cut in panel order. The night's rules are the other launches' (./acts.ts `launchable`); the candidates are written
// under the night's lock, which skips a genre that already holds a piece on the night.
//
// A DRY NIGHT CUTS NOTHING: its pieces are written `rendered` as words only (no clip, no video) and no job is launched.
//
// The clips and the cut cost $0 (a local model, a local tool); the night's Gemini ceiling is never asked.

import { parseAt } from "@gt/domain/door";
import { PIECE_TRIALS } from "@gt/domain/genre";
import { jobIdSchema } from "@gt/domain/ids";
import { get } from "@gt/kernel/job";
import type { Store } from "@gt/kernel/store";

import { drivePiece, launchPiece } from "../../producers/scoutPiece.ts";
import { settledPiece } from "../../producers/scoutPieceActs.ts";
import { launchable, Refusal, type ActContext } from "./acts";
import { genreViews, headsOf, piecesDue, storeOrProcess } from "./genres";
import { mutateNight, nextCandidateId, readAllNights, readNight, withCandidate } from "./store";
import { activeWing } from "./wingScope";
import type { CandidateId, Night, NightId, PieceCandidate, StoryboardCandidate } from "./types";

/** The piece's local engines, injectable for tests: one clip of a still, and the cut of clips into one video. */
export type PieceEngines = {
  /** One LTX clip of a still (PNG bytes): the mp4 bytes and its length. */
  readonly clip?: (still: Uint8Array, prompt: string, seed: number) => Promise<{ readonly bytes: Uint8Array; readonly durationS: number }>;
  /** Cut the clips (absolute paths, in order) into `out`, audio kept: the cut's length. */
  readonly cut?: (clips: readonly string[], out: string) => Promise<{ readonly durationS: number }>;
};

export type PieceResult = {
  readonly candidates: readonly PieceCandidate[];
  readonly jobIds: readonly string[];
  readonly outcome?: string;
  readonly dry?: boolean;
};

/** Why `genre` has no piece due, in the work's words. */
function notDue(genre: string, nights: readonly Night[], views: ReturnType<typeof genreViews>): string {
  const v = views.find((x) => x.id === genre);
  if (v === undefined) return `no genre ${genre}`;
  if (v.state !== "piece-due") return `genre ${genre} is ${v.state} (kept trials ${v.evidence.keptTrials.length}/${PIECE_TRIALS}); no piece is due`;
  for (const n of nights) for (const c of n.candidates) if (!n.dry && c.kind === "piece" && c.genre === genre && c.status !== "failed") return `genre ${genre} already has piece ${n.id}/${c.id} (${c.status}) waiting on its verdict`;
  return `genre ${genre} has no kept trial to render`;
}

function trialAt(nights: readonly Night[], ref: string): StoryboardCandidate | undefined {
  const cut = ref.lastIndexOf("/");
  const n = nights.find((x) => x.id === ref.slice(0, cut));
  return n?.candidates.find((c): c is StoryboardCandidate => c.id === ref.slice(cut + 1) && c.kind === "storyboard");
}

async function batchOf(id: NightId, cids: readonly string[]): Promise<PieceCandidate[]> {
  const n = await readNight(id);
  return cids.map((cid) => n.candidates.find((c): c is PieceCandidate => c.id === cid && c.kind === "piece")).filter((c): c is PieceCandidate => c !== undefined);
}

async function failPending(id: NightId, cid: CandidateId, why: string): Promise<void> {
  await mutateNight(id, (n) => {
    const c = n.candidates.find((x) => x.id === cid);
    return c?.kind === "piece" && c.status === "pending" ? withCandidate(n, { ...c, status: "failed", error: why }) : n;
  });
}

/** Every due piece (genres.ts piecesDue), or only `genre`'s: one candidate and one job each. */
export async function pieceAct(ctx: ActContext, id: NightId, o: { readonly genre?: string }, engines: PieceEngines = {}): Promise<PieceResult> {
  if (activeWing() !== "scout") throw new Refusal(`the ${activeWing()} wing makes no piece`);
  const heads = headsOf(ctx.store);
  if (!heads.ok) throw new Refusal(`piece: the genres did not read: ${heads.error.message}`);
  const nights = await readAllNights();
  let due = piecesDue(nights, heads.value.genres);
  if (o.genre !== undefined) {
    due = due.filter((d) => d.genre === o.genre);
    if (due.length === 0) throw new Refusal(notDue(o.genre, nights, genreViews(nights, heads.value.genres)));
  }
  const { mode } = await launchable(ctx, id);
  if (due.length === 0) return { candidates: [], jobIds: [] };

  let made: PieceCandidate[] = [];
  await mutateNight(id, (n) => {
    let next = n;
    made = [];
    for (const d of due) {
      if (n.candidates.some((c) => c.kind === "piece" && c.genre === d.genre && c.status !== "failed")) continue;
      const trial = trialAt(nights, d.trial);
      if (trial === undefined) continue;
      const c: PieceCandidate = {
        id: nextCandidateId(next),
        kind: "piece",
        sourceIds: [],
        status: n.dry ? "rendered" : "pending",
        genre: d.genre,
        fromTrial: d.trial,
        title: trial.title,
        clips: [],
        ...(trial.fromSeed === undefined ? {} : { fromSeed: trial.fromSeed }),
        ...(trial.use === undefined ? {} : { use: trial.use }),
        ...(trial.app === undefined ? {} : { app: trial.app }),
        ...(trial.venture === undefined ? {} : { venture: trial.venture }),
      };
      next = { ...next, candidates: [...next.candidates, c] };
      made.push(c);
    }
    return next;
  });
  const cids = made.map((c) => c.id);
  if (made.length === 0) return { candidates: [], jobIds: [] };
  if (mode === "dry") {
    ctx.say(`night ${id} is dry: ${made.length} piece(s) written as words only; no clip is made, nothing is cut and nothing is launched`);
    return { candidates: await batchOf(id, cids), jobIds: [], dry: true };
  }

  const opts = { mode, actor: ctx.actor, dryOnly: ctx.dryOnly };
  const jobIds: string[] = [];
  const refused: string[] = [];
  for (const c of made) {
    const target = { nightId: id, candidateId: c.id };
    const r0 = await launchPiece(ctx.store, target, opts);
    const why0 = !r0.ok ? r0.error.message : r0.value.kind !== "receipt" ? `piece launch answered ${r0.value.kind} before its receipt` : undefined;
    if (why0 !== undefined || !r0.ok || r0.value.kind !== "receipt") {
      await failPending(id, c.id, why0 ?? "no receipt");
      refused.push(`${c.id}: ${why0 ?? "no receipt"}`);
      continue;
    }
    const rc = r0.value.receipt;
    const remade = rc.lines.find((l) => l.key.endsWith("/clip"))?.units ?? 0;
    ctx.say(`receipt (${rc.mode}): piece ${c.id} of ${c.genre} · ${remade} clip(s) re-made + one cut on ${rc.lines[0]?.lane ?? "gpu.local"} · $0 (free: local) · ~${Math.ceil(rc.totals.seconds / 60)} min`);
    const r1 = await launchPiece(ctx.store, target, { ...opts, token: rc.token });
    const why1 = !r1.ok ? r1.error.message : r1.value.kind !== "launched" ? `the receipt moved while it was confirmed (${r1.value.kind}); nothing launched` : undefined;
    if (why1 !== undefined || !r1.ok || r1.value.kind !== "launched") {
      await failPending(id, c.id, why1 ?? "not launched");
      refused.push(`${c.id}: ${why1 ?? "not launched"}`);
      continue;
    }
    ctx.say(`launched ${c.id} as ${r1.value.jobId}`);
    jobIds.push(r1.value.jobId);
  }
  if (refused.length > 0) throw new Refusal([...refused, ...jobIds.map((j) => `${j} launched`)].join("; "));
  if (ctx.detach) return { candidates: await batchOf(id, cids), jobIds, outcome: "detached" };

  let outcome = "done";
  for (const jobId of jobIds) {
    const d = await drivePiece(ctx.store, ctx.location, jobId, { dryOnly: ctx.dryOnly, engines });
    const said = d.ok ? d.value.outcome : d.error.message;
    if (outcome === "done" && said !== "done") outcome = said;
  }
  return { candidates: await batchOf(id, cids), jobIds, outcome };
}

/**
 * A detached piece job's results into the night. The job writes its clips and its cut into the night itself, so
 * collecting is settling: every pending piece whose job has finished is told its ending (`settledPiece`). A cancelled
 * job is a failure.
 */
export async function collectPieces(id: NightId, o: { readonly store?: Store } = {}): Promise<PieceCandidate[]> {
  const n = await readNight(id);
  if (n.state === "committed") throw new Refusal(`night ${id} is committed; its packet is decided and nothing more is collected into it`);
  const waiting = n.candidates.filter((c): c is PieceCandidate & { readonly jobId: string } => c.kind === "piece" && c.status === "pending" && c.jobId !== undefined);
  if (waiting.length === 0) return [];
  const store = storeOrProcess(o.store);
  const out: CandidateId[] = [];
  for (const c of waiting) {
    out.push(c.id);
    const jid = parseAt("job id", jobIdSchema, c.jobId);
    if (!jid.ok) continue;
    const r = get(store, jid.value);
    if (!r.ok) continue;
    const job = r.value.job;
    const ending = job.state === "cancelled" ? "failed" : job.state;
    const said = job.state === "cancelled" ? { id: job.id, error: { message: `job ${job.id} was cancelled` } } : { id: job.id, ...(job.error === undefined ? {} : { error: job.error }) };
    await mutateNight(id, (m) => {
      const now = m.candidates.find((x): x is PieceCandidate => x.id === c.id && x.kind === "piece");
      const next = now === undefined || now.status !== "pending" ? null : settledPiece(now, ending, said);
      return next === null ? m : withCandidate(m, next);
    });
  }
  return batchOf(id, out);
}
