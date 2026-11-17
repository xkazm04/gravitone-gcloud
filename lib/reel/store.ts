// THE REEL FOLDERS AS THE BOARD READS THEM - where a reel lives, which of its three operator stops is waiting,
// and the one writer of `<dir>/verdicts.json`. No `server-only` mark on purpose: pipeline/reel.mts reads the
// recorded verdicts through this module (`cut` refuses a rejected proof, `status` prints them) and a CLI cannot
// resolve that package. The CLI and the session only ever READ here; `recordVerdict` is called by the Board's
// apply (lib/decision/v1/sources/reel.ts) and by nothing else.
//
// A STOP is where the operator looks before the reel goes on: `data` (is this table worth a page), `<cut>:proof`
// (do the frames look right), `<cut>:cut` (is the cut good enough to publish). Each is one Board packet,
// `pkt:reel:<slug>:<stop>`.
//
// A VERDICT IS OF THE BYTES THAT WERE JUDGED (registry hitl-approval / decision-records: "identity without
// version lets an approval follow an object through arbitrary mutation"). `of` is the sha256 of the card, the
// sheet or the video the packet froze. So a verdict stops counting the moment its subject is made again: a
// rejected proof that was re-shot no longer blocks `cut`, and the re-made subject is a NEW ROUND of the same
// stop - `pkt:reel:<slug>:<stop>:2`, the spelling a /scout night's later parts use (lib/foundry/scout/parts.ts:
// round 1 is the bare run, `:1` is never written). Without the round a rejected cut could never be kept: a
// kernel packet is decided once.
//
// verdicts.json holds the HEAD per stop; verdicts.log.jsonl is the chain, appended before the head is written
// and never rewritten ("append-only, superseded not edited").

import { appendFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { outPath } from "../fixtures/roots.ts";
import { FoundryError, containedIn, readJson, writeJsonAtomic } from "../foundry/runStore.ts";
import { withRunLock } from "../foundry/verdictLog.ts";
import { CUT_NAMES } from "./state.ts";
import type { ReelCut } from "./types.ts";

/** The reels in this process's universe: REELS_STORE_DIR, else `<out>/reels`. Read per call. */
export function reelsRoot(): string {
  const o = process.env["REELS_STORE_DIR"]?.trim();
  return o ? path.resolve(o) : outPath("reels");
}

// A slug is a folder name and a segment of a packet id, an export id and a slot id: no colon, no dot, no slash.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;
export const isReelSlug = (x: string): boolean => SLUG_RE.test(x);

export function reelDir(slug: string): string {
  if (!isReelSlug(slug)) throw new FoundryError("That is not a reel.", 404);
  return path.join(reelsRoot(), slug);
}

/* ── the stops ─────────────────────────────────────────────────────────────── */

export const STOP_KINDS = ["data", "proof", "cut"] as const;
export type StopKind = (typeof STOP_KINDS)[number];
export type StopKey = "data" | `${ReelCut}:proof` | `${ReelCut}:cut`;
export const STOP_KEYS: readonly StopKey[] = ["data", ...CUT_NAMES.flatMap((c): StopKey[] => [`${c}:proof`, `${c}:cut`])];

export type Stop = { readonly slug: string; readonly key: StopKey; readonly kind: StopKind; readonly cut?: ReelCut };

export function stopOf(slug: string, key: StopKey): Stop {
  if (key === "data") return { slug, key, kind: "data" };
  const [cut, kind] = key.split(":") as [ReelCut, "proof" | "cut"];
  return { slug, key, kind, cut };
}

const RUN_RE = /^([^:]+):(data|(?:short|long):(?:proof|cut))(?::([1-9]\d*))?$/;

/** A packet's run id as its stop and the round it names (undefined: the bare run, whichever round is open). */
export function parseStopRun(runId: string): (Stop & { readonly round?: number }) | undefined {
  const m = RUN_RE.exec(runId);
  const slug = m?.[1];
  const key = m?.[2] as StopKey | undefined;
  if (slug === undefined || key === undefined || !isReelSlug(slug)) return undefined;
  const round = m?.[3] === undefined ? undefined : Number(m[3]);
  // `:1` is never spelled: round 1 is the bare run.
  if (round !== undefined && round < 2) return undefined;
  return { ...stopOf(slug, key), ...(round === undefined ? {} : { round }) };
}

export const stopRunId = (slug: string, key: StopKey, round: number): string => `${slug}:${key}${round > 1 ? `:${round}` : ""}`;

/** What a stop shows, reel-relative: the card `data` drew, the sheet `proof` tiled, the cut (with its bed when it has one). */
export function stopMediaRel(stop: Stop, hasFinal: boolean): string {
  if (stop.kind === "data" || stop.cut === undefined) return "data-card.png";
  return stop.kind === "proof" ? `${stop.cut}/proof/sheet.png` : `${stop.cut}/render/${hasFinal ? "final.mp4" : "strip.mp4"}`;
}

/* ── verdicts ──────────────────────────────────────────────────────────────── */

export type ReelVerdict = {
  readonly verdict: "keep" | "reject";
  readonly reasons: readonly string[];
  readonly note?: string;
  /** The ledger's word for who decided: a keep is only ever the operator's. */
  readonly by: "operator" | "agent";
  readonly at: string;
  /** sha256 of the file that was judged. A subject with other bytes is not what this verdict is about. */
  readonly of: string;
  /** Which look at this stop it was: 1, then 2 after the subject was made again. */
  readonly round: number;
};

export type ReelVerdicts = { readonly v: 1; readonly stops: Partial<Record<StopKey, ReelVerdict>> };

export const VERDICTS_FILE = "verdicts.json";
export const VERDICT_LOG = "verdicts.log.jsonl";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function parseVerdict(raw: unknown): ReelVerdict | undefined {
  if (!isObj(raw)) return undefined;
  const { verdict, reasons, note, by, at, of, round } = raw;
  if (verdict !== "keep" && verdict !== "reject") return undefined;
  if (!Array.isArray(reasons) || reasons.some((r) => typeof r !== "string")) return undefined;
  if (by !== "operator" && by !== "agent") return undefined;
  if (typeof at !== "string" || typeof of !== "string" || typeof round !== "number" || !Number.isInteger(round) || round < 1) return undefined;
  return { verdict, reasons: reasons as string[], ...(typeof note === "string" && note !== "" ? { note } : {}), by, at, of, round };
}

/** The recorded verdicts, or a sentence saying what is wrong with the file. A stop whose record does not read is an error, never "undecided". */
export function parseVerdicts(raw: unknown): ReelVerdicts | string {
  if (!isObj(raw) || raw["v"] !== 1 || !isObj(raw["stops"])) return "verdicts.json is not {v: 1, stops}";
  const stops: Partial<Record<StopKey, ReelVerdict>> = {};
  for (const [k, v] of Object.entries(raw["stops"])) {
    const key = STOP_KEYS.find((x) => x === k);
    if (key === undefined) return `verdicts.json names a stop this reel does not have: ${k}`;
    const parsed = parseVerdict(v);
    if (parsed === undefined) return `verdicts.json: the ${k} verdict does not read`;
    stops[key] = parsed;
  }
  return { v: 1, stops };
}

export async function readVerdicts(dir: string): Promise<ReelVerdicts> {
  let raw: unknown;
  try {
    raw = await readJson<unknown>(path.join(dir, VERDICTS_FILE));
  } catch (e) {
    throw new FoundryError(`${path.join(dir, VERDICTS_FILE)} is damaged: ${e instanceof Error ? e.message : String(e)}`, 503);
  }
  if (raw === null) return { v: 1, stops: {} };
  const parsed = parseVerdicts(raw);
  if (typeof parsed === "string") throw new FoundryError(`${dir}: ${parsed}`, 503);
  return parsed;
}

/** Where a stop stands against the bytes it would show now: the round that is waiting, or the round that decided them. */
export function roundOf(held: ReelVerdict | undefined, sha256: string): { readonly round: number; readonly open: boolean } {
  if (held === undefined) return { round: 1, open: true };
  return held.of === sha256 ? { round: held.round, open: false } : { round: held.round + 1, open: true };
}

const sameWords = (a: ReelVerdict, b: ReelVerdict): boolean => a.verdict === b.verdict && a.of === b.of && a.reasons.join("\u0000") === b.reasons.join("\u0000") && (a.note ?? "") === (b.note ?? "");

const said = (v: ReelVerdict): string => `${v.verdict}${v.reasons.length === 0 ? "" : ` (${v.reasons.join(", ")})`}`;

/** The sentence for a round that already holds ANOTHER verdict, or undefined when `v` may stand (new, the same, or older than the head). */
export function verdictClash(slug: string, key: StopKey, held: ReelVerdict | undefined, v: ReelVerdict): string | undefined {
  if (held === undefined || held.round !== v.round || sameWords(held, v)) return undefined;
  return `reel ${slug}: the ${key} stop already holds ${said(held)} for round ${held.round}; this packet says ${said(v)}`;
}

export type Recorded = "written" | "same" | "superseded";

/**
 * Record one round's verdict. IDEMPOTENT, AND NEVER AN OVERWRITE: the same verdict for the same round is `same`;
 * a round older than the head is `superseded` (it landed, and the stop has been decided again since); another
 * verdict for the round the head already holds is refused with both spelled. Run-locked, so two deliveries of one
 * commit cannot interleave their read and write.
 */
export function recordVerdict(dir: string, key: StopKey, v: ReelVerdict): Promise<Recorded> {
  return withRunLock(dir, async () => {
    if (!(await stat(dir).then((s) => s.isDirectory(), () => false))) throw new FoundryError(`${dir} is not a reel folder.`, 404);
    const cur = await readVerdicts(dir);
    const held = cur.stops[key];
    if (held !== undefined && held.round > v.round) return "superseded";
    const clash = verdictClash(path.basename(dir), key, held, v);
    if (clash !== undefined) throw new FoundryError(clash, 403);
    if (held !== undefined && held.round === v.round) return "same";
    // The chain leads the head: a line whose head never landed is a decision a reader can still see.
    await appendFile(path.join(dir, VERDICT_LOG), `${JSON.stringify({ stop: key, ...v })}\n`);
    await writeJsonAtomic(path.join(dir, VERDICTS_FILE), { v: 1, stops: { ...cur.stops, [key]: v } } satisfies ReelVerdicts);
    return "written";
  });
}

/* ── what `cut` wrote for the Calendar ─────────────────────────────────────── */

/** `<cut>/publish.json`: the words a slot carries. Written once by `cut`, the operator's to edit after. */
export type ReelPublish = { readonly title: string; readonly description: string; readonly tags: readonly string[] };

export function parsePublish(raw: unknown): ReelPublish | string {
  if (!isObj(raw)) return "publish.json is not an object";
  const { title, description, tags } = raw;
  if (typeof title !== "string" || title.trim() === "") return "publish.json has no title";
  if (typeof description !== "string") return "publish.json has no description";
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string" || t.trim() === "")) return "publish.json tags is not a list of words";
  return { title, description, tags: tags as string[] };
}

/* ── the folders ───────────────────────────────────────────────────────────── */

/** Every folder under the root that could be a reel, by name. A root that does not exist holds none. */
export async function listReelSlugs(): Promise<string[]> {
  const entries = await readdir(reelsRoot(), { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [];
    throw e;
  });
  return entries.filter((e) => e.isDirectory() && isReelSlug(e.name)).map((e) => e.name).sort();
}

/** The file route serves these for a reel: what a stop shows and its records. Never the page (`strip.html` is code). */
const REEL_SERVABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".json", ".mp4", ".webm"]);

/** Resolve a reel-relative file for the file route (app/api/foundry/file, `kind=reel`): contained, servable, a file. */
export async function reelFileStat(slug: string, rel: string): Promise<{ abs: string; size: number }> {
  const abs = containedIn(reelDir(slug), rel, false, "reel");
  if (!REEL_SERVABLE.has(path.extname(abs).toLowerCase())) throw new FoundryError("Not a servable file.", 400);
  try {
    const s = await stat(abs);
    if (!s.isFile()) throw new Error("not a file");
    return { abs, size: s.size };
  } catch {
    throw new FoundryError("No such file in the reel.", 404);
  }
}
