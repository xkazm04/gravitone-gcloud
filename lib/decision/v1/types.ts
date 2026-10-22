import "server-only";

import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { Consequence, ConsequenceItem } from "@gt/domain/board";
import type { Decision } from "@gt/domain/decision";
import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type AppErrorCode, type Result } from "@gt/domain/errors";
import type { PacketId } from "@gt/domain/ids";
import { packetSchema, type Packet } from "@gt/domain/packet";
import type { PacketSource } from "@gt/domain/source";
import { canonical, sha256Hex } from "@gt/kernel/canonical";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import { consequenceToken } from "@gt/kernel/decision/consequence";
import type { By, InitialDecision, OpenInput } from "@gt/kernel/decision/driver";
import type { Loss as PresentLoss, Presentation } from "@gt/ui/board/port";

// THE DECISION ADAPTER CONTRACT (Phase 3 wave B) - one v1 decision surface
// as a kernel packet, and the kernel's committed outcome back into v1. One
// file per source under ./sources/, each registered in ./registry.ts.
//
// The direction of authority is decision 1: the KERNEL owns the decision and
// v1 receives the outcome. So an adapter is two pure halves and two I/O
// halves, and only `apply` writes to v1:
//
//   read         v1's own readers (lib/foundry/store.ts getRun, ...), bounded,
//                read-only - never a second parse of a file v1 already parses.
//   packet       PURE: the pile to open (items, rows, mode, machine picks), the
//                verdicts v1 already holds as the packet's first decisions
//                (decision 3: nothing judged in v1 is lost), what the desks
//                draw (L21's Presentation), and every loss the conversion made.
//   consequence  PURE over v1's own planners (planForgeCommit, ...): what a
//                commit WOULD do, and the digest of the v1 state it planned
//                from, which the kernel folds into the preview token so a
//                commit over a v1 that moved is refused (decision 6).
//   apply        v1's own writers, exactly as v1's UI called them, and
//                IDEMPOTENT: a second call after success, or a call after a
//                crash part-way through v1's commit, ends in the same v1 state.
//                A duplicate of the SAME outcome is success; v1 already holding
//                a DIFFERENT outcome is a loud refusal, never an overwrite
//                (hitl-approval: resume-after-decision). Failure carries v1's
//                sentence verbatim (decision 2).
//
// Two things the brief's sketch did not carry, added here and why:
//   `urls`    PacketView.items[].url comes from the caller's `mediaUrl(blob,
//             candidate)` (@gt/kernel/decision/view); the bytes stay in v1's
//             stores and are served by v1's file routes, so the adapter that
//             knows the v1 path hands the URL over by candidate.
//   `losses`  import-normalization: lossy-conversion-disclosure. A v1 record
//             that does not fit the kernel's vocabulary (an extract tag that is
//             not a reason, a v1 verdict with no instant, a dojo pair judged
//             `both-bad` where v1 has only A/B/tie) is graded and named, not
//             absorbed.
//
// This module also holds the few helpers every adapter needs - the media door,
// the v1 error mapping, the digest - because a seam with one copy of a rule is
// the point of a seam; they are below the contract.

/* ── the contract ──────────────────────────────────────────────────────────── */

/** What names a Weir pile in v1: the run (cycle, aggregate) id after `pkt:<source>:`. */
export type AdapterRef = { readonly runId: string };

/** One thing the v1 -> kernel conversion could not carry whole (lossy-conversion-disclosure grades).
 *  Spelled once, in the Board's Presentation, because the gate draws it (wave B ruling 8). */
export type Loss = PresentLoss;

export type OpenPlan = {
  /** Minted at the kernel's packet door (packetSchema), so its ids are branded. */
  readonly packet: Packet;
  /** v1's existing verdicts, as v1 recorded them (`by`, `at`). */
  readonly initial: readonly InitialDecision[];
  readonly machinePicks?: OpenInput["machinePicks"];
  /** What the desks draw that the kernel does not hold (L21's Presentation). */
  readonly present: Presentation;
  /** By candidate id: where the browser fetches the bytes (v1's file routes; the client adds its credential). */
  readonly urls: Readonly<Record<string, string>>;
  readonly losses: readonly Loss[];
};

/** The decisions a preview is taken over, as the kernel holds them now. */
export type DecisionsAt = { readonly packetId: PacketId; readonly rev: number; readonly decisions: readonly Decision[] };

export type Preview = { readonly consequence: Consequence; readonly v1Digest: string };

/**
 * One v1 decision surface. Methods, not function properties, on purpose (the
 * lib/ledger/v1 Source rule): a method's parameter is checked bivariantly, so
 * `DecisionAdapter<ForgeV1>` sits in the registry's `DecisionAdapter<unknown>`
 * slot without a cast while each adapter keeps its own v1 type end to end.
 */
export interface DecisionAdapter<V1> {
  readonly source: PacketSource;
  /** v1 record(s) behind a Weir pile, through v1's own readers (bounded, read-only). */
  read(ref: AdapterRef): Promise<Result<V1>>;
  /** Pure. An err when the v1 record is not decidable as a packet (nothing judgeable, not committable). */
  packet(v1: V1): Result<OpenPlan>;
  /** Pure + v1's planners: what commit would do, and the digest of the v1 state it read. */
  consequence(v1: V1, at: DecisionsAt): Result<Preview>;
  /** v1's own writers, idempotent; v1's sentence verbatim on failure. */
  apply(claim: ApplyClaim): Promise<Result<void>>;
}

/* ── the packet door ───────────────────────────────────────────────────────── */

/** A packet minted through the kernel's own schema: an adapter never builds a branded id by hand. */
export function mintPacket(raw: unknown): Result<Packet> {
  return parseAt("packet", packetSchema, raw);
}

/** The candidate a decision key names (`<packetId>::<candidateId>`; the first `::` splits). */
export function candidateOf(d: Pick<Decision, "key">): string {
  const at = d.key.indexOf("::");
  return at < 0 ? d.key : d.key.slice(at + 2);
}

/** The final decision per candidate id. */
export function decisionMap(decisions: readonly Decision[]): ReadonlyMap<string, Decision> {
  return new Map(decisions.map((d) => [candidateOf(d), d]));
}

/** v1's `by` words to the ledger's actor words. Absent = a record older than the field: a human's. */
export const byOf = (v1: "human" | "model" | undefined): By => (v1 === "model" ? "agent" : "operator");
/** And back: the word v1's verdict writers take. */
export const v1By = (by: By): "human" | "model" => (by === "agent" ? "model" : "human");

/**
 * A v1 instant as the kernel's door takes it (ISO with an offset), or the
 * fallback when v1's is missing or unreadable - which the caller discloses as
 * a Loss, because the history then carries an observed instant, not v1's.
 */
export function instantOr(v1At: string | undefined, fallback: string): { readonly at: string; readonly exact: boolean } {
  if (v1At !== undefined && /^\d{4}-\d{2}-\d{2}T/.test(v1At)) {
    const t = Date.parse(v1At);
    if (Number.isFinite(t)) return { at: new Date(t).toISOString(), exact: true };
  }
  return { at: fallback, exact: false };
}

/* ── media: v1's bytes, addressed by what they are ─────────────────────────── */

const MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".json": "application/json",
  ".md": "text/markdown",
  ".html": "text/html",
};

export function mimeOf(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** sha256 by (path, size, mtime): a pile is re-read on every preview and apply, and its plates do not change. */
const digests = new Map<string, string>();
/** Bounded: a long-lived server walks many runs. */
const DIGEST_CACHE_MAX = 4096;

async function sha256File(abs: string): Promise<string> {
  const h = createHash("sha256");
  const fh = await open(abs, "r");
  try {
    for await (const chunk of fh.createReadStream()) h.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  } finally {
    await fh.close();
  }
  return h.digest("hex");
}

/**
 * The BlobRef of a v1 file: its real sha256 (a Candidate's media is a content
 * address, @gt/domain/blob - a digest of the PATH would be a second identity
 * that drifts from the bytes), its size, and the mime its extension names.
 * `not-found` when the file is gone, which the caller treats as "not judgeable".
 */
export async function mediaRef(abs: string): Promise<Result<BlobRef>> {
  let s: { size: number; mtimeMs: number; isFile(): boolean };
  try {
    s = await stat(abs);
  } catch (e) {
    return err("not-found", `${abs}: ${errorMessage(e)}`, { cause: e });
  }
  if (!s.isFile()) return err("not-found", `${abs} is not a file`);
  const key = `${abs}\u0000${s.size}\u0000${s.mtimeMs}`;
  let sha = digests.get(key);
  if (sha === undefined) {
    try {
      sha = await sha256File(abs);
    } catch (e) {
      return err("unavailable", `${abs}: ${errorMessage(e)}`, { cause: e });
    }
    if (digests.size >= DIGEST_CACHE_MAX) digests.clear();
    digests.set(key, sha);
  }
  return ok({ sha256: sha, bytes: s.size, mime: mimeOf(abs) });
}

/** Many files at once, bounded; the absent ones are simply absent from the map. */
export async function mediaRefs(files: readonly { readonly key: string; readonly abs: string }[], concurrency = 8): Promise<Result<ReadonlyMap<string, BlobRef>>> {
  const out = new Map<string, BlobRef>();
  let next = 0;
  let failure: Result<never> | undefined;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < files.length) {
      const f = files[next++];
      if (f === undefined) return;
      const r = await mediaRef(f.abs);
      if (r.ok) out.set(f.key, r.value);
      else if (r.error.code !== "not-found") failure = err(r.error.code, r.error.message, { cause: r.error });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return failure ?? ok(out);
}

/** v1's file route for a run file (app/api/foundry/file). No credential: the browser's own `withAccess` adds it. */
export function foundryFileUrl(run: string, rel: string, kind?: "extract" | "training" | "strips"): string {
  const q = new URLSearchParams({ run, path: rel, ...(kind === undefined ? {} : { kind }) });
  return `/api/foundry/file?${q.toString()}`;
}

/* ── v1's failures, in the one taxonomy ────────────────────────────────────── */

const BY_STATUS: Readonly<Record<number, AppErrorCode>> = { 400: "invalid", 401: "unauthenticated", 402: "budget", 403: "refused", 404: "not-found", 409: "conflict", 503: "unavailable" };

/**
 * A throw from a v1 writer, classified by the HTTP status v1 attached to it
 * (FoundryError, VerdictRevConflict, ...) and carrying v1's sentence verbatim.
 * The apply outbox retries what is not permanent (@gt/kernel apply-core: a
 * `conflict` - a stale verdict base, a run mid-commit - heals on retry; an
 * `invalid` or `refused` does not), so the class matters as much as the words.
 */
export function fromV1(e: unknown): Result<never> {
  const message = errorMessage(e);
  const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : undefined;
  const code: AppErrorCode = status === undefined ? "internal" : (BY_STATUS[status] ?? (status >= 500 ? "unavailable" : "internal"));
  return err(code, message, { cause: e });
}

/** Run a v1 writer; its throw becomes the Result the outbox records. */
export async function v1Call<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return fromV1(e);
  }
}

/* ── the blast radius ──────────────────────────────────────────────────────── */

/** JSON's own reading of `undefined`: an absent key, a null array slot. canonical() refuses it. */
function jsonish(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : jsonish(x)));
  if (typeof v === "object" && v !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = jsonish(x);
    return out;
  }
  return v;
}

/** sha256 over the canonical JSON (RFC 8785) of what the adapter read from v1. */
export function v1DigestOf(parts: unknown): string {
  return sha256Hex(canonical(jsonish(parts)));
}

export type ConsequenceParts = {
  readonly deletes?: readonly ConsequenceItem[];
  readonly writes?: Consequence["writes"];
  readonly promotions?: readonly ConsequenceItem[];
  readonly renames?: Consequence["renames"];
  readonly nearDuplicates?: Consequence["nearDuplicates"];
  readonly outward?: Consequence["outward"];
};

/**
 * The Consequence record: counts from the KERNEL's decisions over the packet's
 * items (what the commit will write), the adapter's planned effects, and the
 * token the commit must carry back (@gt/kernel/decision/consequence).
 */
export function buildConsequence(at: DecisionsAt, items: readonly string[], parts: ConsequenceParts, v1Digest: string): Consequence {
  const byCandidate = decisionMap(at.decisions);
  let kept = 0;
  let rejected = 0;
  for (const id of items) {
    const v = byCandidate.get(id)?.verdict ?? null;
    if (v === "keep") kept++;
    else if (v === "reject") rejected++;
  }
  return {
    packetId: at.packetId,
    rev: at.rev,
    counts: { kept, rejected, undecided: items.length - kept - rejected },
    deletes: parts.deletes ?? [],
    writes: parts.writes ?? [],
    promotions: parts.promotions ?? [],
    renames: parts.renames ?? [],
    nearDuplicates: parts.nearDuplicates ?? [],
    outward: parts.outward ?? [],
    v1Digest,
    token: consequenceToken(at.decisions, v1Digest),
  };
}

/** A commit's apply only: the review return is article's (Lot 23), refused elsewhere. */
export function committedOutcome(claim: ApplyClaim): Result<Extract<ApplyClaim["outcome"], { act: "commit" }>> {
  return claim.outcome.act === "commit" ? ok(claim.outcome) : err("refused", `a ${claim.packet.source} packet is committed, never returned for another turn`);
}

/** The v1 run a packet stands for: its `runId`, which every Weir packet carries. */
export function runIdOf(claim: ApplyClaim): Result<string> {
  const id = claim.packet.runId;
  return id === undefined ? err("invalid", `packet ${claim.packetId} names no v1 run`) : ok(id);
}
