// A KEPT CHARACTER'S REFERENCE SHEET (spark scout-vision S3): one neutral 1:1 still on local Flux, her kept portrait
// admitted late as the reference (OUR picture - never a source file), the prompt her identity block plus the neutral
// framing (rest expression, three-quarter head, even light, plain field, invariant wardrobe). Judged on the Board; a
// kept sheet becomes her reference for every Flux frame she is cast in.
//
// THE ACT - `pipeline/scout.mts sheet <night> [--character <name>]`. Every kept character (./characters.ts
// keptCharacters, over the scout nights and the muse archive) with NO kept sheet and none in flight - or only
// `--character`'s, refused with why when she is not due - becomes ONE `sheet` candidate {character, name, fromPortrait}
// and ONE scout-sheet job on gpu.local (lib/producers/scoutSheet.ts). IN FLIGHT: a sheet of hers on a scout night that is
// pending, or rendered and not yet decided (a night still open, or the cell left on a remainder). A REJECTED sheet makes
// her due again (taste `## Sheets to draw`, `sheetsToDraw`, says with which reasons); a failed one too. A dry night's
// sheet holds nothing up. The night's rules are the other launches' (./acts.ts `launchable`); the candidates are
// written under the night's lock, which skips a character the night already holds a live sheet for.
//
// A DRY NIGHT DRAWS NOTHING: its sheets are written `rendered` as words only and no job is launched.
//
// KEPT = HER REFERENCE, derived by keptCharacters from the night's verdict (cell `c-NN/sheet`); nothing is written on
// a keep. The still costs $0 (a local model); the night's Gemini ceiling is never asked.

import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import { get } from "@gt/kernel/job";
import type { Store } from "@gt/kernel/store";

import { REFERENCE_LATE } from "../../imaging/local/flux2.ts";
import { driveSheet, launchSheet } from "../../producers/scoutSheet.ts";
import { settledSheet } from "../../producers/scoutSheetActs.ts";
import { launchable, Refusal, type ActContext } from "./acts";
import { rootedNights } from "./cast";
import { characterKey, identityBlock, keptCharacters, type KeptCharacter, type RootedNight } from "./characters";
import { storeOrProcess } from "./genres";
import type { CharacterCard } from "./muse";
import { mutateNight, nextCandidateId, readNight, withCandidate } from "./store";
import { cellId, type CandidateId, type Night, type NightId, type SheetCandidate } from "./types";
import { activeWing } from "./wingScope";

/** The sheet's local engine, injectable for tests: one Flux still from a prompt and our own reference stills. */
export type SheetEngines = {
  readonly draw?: (prompt: string, o: { readonly refs: readonly Uint8Array[]; readonly late: number; readonly seed?: number }) => Promise<{ readonly png: Uint8Array; readonly seed: number }>;
};

export type SheetResult = {
  readonly candidates: readonly SheetCandidate[];
  readonly jobIds: readonly string[];
  readonly outcome?: string;
  readonly dry?: boolean;
};

/** The sheet's one packet cell is `c-NN/sheet`. */
export const SHEET_PART = "sheet";
export const sheetCell = (cid: CandidateId): string => cellId(cid, SHEET_PART);
/** Night-relative: `sheets/c-07.png`. */
export const sheetFile = (cid: CandidateId): string => `sheets/${cid}.png`;
/** Where her portrait joins the sheet's denoise: the model's frozen value (flux2.ts REFERENCE_LATE). */
export const SHEET_LATE = REFERENCE_LATE;

/**
 * The neutral framing after her identity block (registry reference-shows-only-invariants: the sheet carries identity
 * and nothing else worth copying - no pose, no scene, no light direction, no garment but the one her look names).
 */
export const SHEET_FRAMING =
  "Character reference sheet, square: head and shoulders turned three-quarters, resting neutral expression, even soft frontal light, plain mid-grey background, wearing only the signature garment named above, no props, no text.";

/** Her sheet's prompt: the identity block verbatim, then the framing (and how she is drawn, when her card says). */
export function sheetPrompt(card: CharacterCard): string {
  const render = card.render === "photoreal" ? " Photoreal." : card.render === "stylised" ? " Stylised illustration." : "";
  return `${identityBlock(card)} ${SHEET_FRAMING}${render}`;
}

/* ── Who is due ───────────────────────────────────────────────────────────── */

/** The verdict a night holds for `cell`: kept, rejected, or still open (no commit yet, a dry one, or on a remainder). */
function verdictOf(n: Night, cell: string): "kept" | "rejected" | "open" {
  const k = n.committed;
  if (k === undefined || k.dry || (k.open ?? []).includes(cell)) return "open";
  return k.kept.includes(cell) ? "kept" : k.rejected.includes(cell) ? "rejected" : "open";
}

type Sheeted = { readonly night: Night; readonly sheet: SheetCandidate };

/** Every sheet of `key` on a live (not dry) scout night, oldest night first. */
function sheetsOf(nights: readonly RootedNight[], key: string): Sheeted[] {
  const out: Sheeted[] = [];
  for (const { root, night } of nights) {
    if (root !== "scout" || night.dry) continue;
    for (const c of night.candidates) if (c.kind === "sheet" && c.character === key) out.push({ night, sheet: c });
  }
  return out.sort((a, b) => (a.night.startedAt < b.night.startedAt ? -1 : a.night.startedAt > b.night.startedAt ? 1 : 0));
}

/** Her sheet that still holds a verdict back: pending, or rendered and undecided. */
function inFlight(sheets: readonly Sheeted[]): Sheeted | undefined {
  return sheets.find(({ night, sheet }) => sheet.status === "pending" || (sheet.status === "rendered" && verdictOf(night, sheetCell(sheet.id)) === "open"));
}

export type SheetDue = {
  readonly character: KeptCharacter;
  /** Her newest rejected sheet and why, when one was. */
  readonly rejected?: { readonly ref: string; readonly reasons: readonly string[]; readonly note?: string };
};

/** Every kept character with no kept sheet and none in flight, in keptCharacters' order. Pure. */
export function sheetsDue(nights: readonly RootedNight[], kept: readonly KeptCharacter[]): SheetDue[] {
  const out: SheetDue[] = [];
  for (const k of kept) {
    if (k.sheet !== undefined) continue;
    const sheets = sheetsOf(nights, k.key);
    if (inFlight(sheets) !== undefined) continue;
    const last = [...sheets].reverse().find(({ night, sheet }) => verdictOf(night, sheetCell(sheet.id)) === "rejected");
    const cell = last === undefined ? undefined : sheetCell(last.sheet.id);
    const note = cell === undefined ? undefined : last?.night.committed?.notes[cell];
    out.push({ character: k, ...(last === undefined || cell === undefined ? {} : { rejected: { ref: `${last.night.id}/${last.sheet.id}`, reasons: last.night.committed?.reasons[cell] ?? [], ...(note === undefined ? {} : { note }) } }) });
  }
  return out;
}

/** Why `name` has no sheet due, in the work's words. */
function notDue(name: string, nights: readonly RootedNight[], kept: readonly KeptCharacter[]): string {
  const k = kept.find((x) => x.key === characterKey(name));
  if (k === undefined) return `${name} is not a kept character (kept: ${kept.map((x) => x.card.name).join(", ") || "none"})`;
  if (k.sheet !== undefined) return `${k.card.name} already has her kept sheet ${k.sheet.ref}`;
  const held = inFlight(sheetsOf(nights, k.key));
  return held === undefined ? `${k.card.name} has no sheet due` : `${k.card.name} already has sheet ${held.night.id}/${held.sheet.id} (${held.sheet.status}) waiting on its verdict`;
}

/**
 * THE TASTE'S `## Sheets to draw` (WP2 wires it into the brief): every character due a sheet, her portrait, and the
 * reasons her last sheet was rejected; `- none` when nobody is due.
 */
export function sheetsToDraw(nights: readonly RootedNight[], kept: readonly KeptCharacter[]): string[] {
  const lines = sheetsDue(nights, kept).map(({ character: k, rejected: r }) => {
    const why = r === undefined ? "" : ` · last sheet ${r.ref} rejected: ${r.reasons.length > 0 ? r.reasons.join(", ") : "no reason given"}${r.note === undefined ? "" : ` - note: ${r.note}`}`;
    return `- ${k.card.name} · portrait ${k.portrait.ref}${why}`;
  });
  return ["## Sheets to draw", "", ...(lines.length === 0 ? ["- none"] : lines), ""];
}

/* ── The act ──────────────────────────────────────────────────────────────── */

async function batchOf(id: NightId, cids: readonly string[]): Promise<SheetCandidate[]> {
  const n = await readNight(id);
  return cids.map((cid) => n.candidates.find((c): c is SheetCandidate => c.id === cid && c.kind === "sheet")).filter((c): c is SheetCandidate => c !== undefined);
}

async function failPending(id: NightId, cid: CandidateId, why: string): Promise<void> {
  await mutateNight(id, (n) => {
    const c = n.candidates.find((x) => x.id === cid);
    return c?.kind === "sheet" && c.status === "pending" ? withCandidate(n, { ...c, status: "failed", error: why }) : n;
  });
}

/** A sheet for every kept character with no kept sheet and none in flight (or only `character`'s): one candidate each. */
export async function sheetAct(ctx: ActContext, id: NightId, o: { readonly character?: string }, engines: SheetEngines = {}): Promise<SheetResult> {
  if (activeWing() !== "scout") throw new Refusal(`the ${activeWing()} wing draws no sheet; a sheet is a scout night's`);
  const nights = await rootedNights();
  const kept = keptCharacters(nights);
  let due = sheetsDue(nights, kept);
  if (o.character !== undefined) {
    const key = characterKey(o.character);
    due = due.filter((d) => d.character.key === key);
    if (due.length === 0) throw new Refusal(notDue(o.character, nights, kept));
  }
  const { mode } = await launchable(ctx, id);
  if (due.length === 0) return { candidates: [], jobIds: [] };

  let made: { readonly c: SheetCandidate; readonly k: KeptCharacter }[] = [];
  await mutateNight(id, (n) => {
    let next = n;
    made = [];
    for (const { character: k } of due) {
      if (n.candidates.some((c) => c.kind === "sheet" && c.character === k.key && c.status !== "failed")) continue;
      const c: SheetCandidate = { id: nextCandidateId(next), kind: "sheet", sourceIds: [], status: n.dry ? "rendered" : "pending", character: k.key, name: k.card.name, fromPortrait: k.portrait.ref };
      next = { ...next, candidates: [...next.candidates, c] };
      made.push({ c, k });
    }
    return next;
  });
  const cids = made.map((m) => m.c.id);
  if (made.length === 0) return { candidates: [], jobIds: [] };
  if (mode === "dry") {
    ctx.say(`night ${id} is dry: ${made.length} sheet(s) written as words only; no still is drawn and nothing is launched`);
    return { candidates: await batchOf(id, cids), jobIds: [], dry: true };
  }

  const opts = { mode, actor: ctx.actor, dryOnly: ctx.dryOnly };
  const jobIds: string[] = [];
  const refused: string[] = [];
  for (const { c, k } of made) {
    const target = { nightId: id, candidateId: c.id };
    const r0 = await launchSheet(ctx.store, target, k, opts);
    const why0 = !r0.ok ? r0.error.message : r0.value.kind !== "receipt" ? `sheet launch answered ${r0.value.kind} before its receipt` : undefined;
    if (why0 !== undefined || !r0.ok || r0.value.kind !== "receipt") {
      await failPending(id, c.id, why0 ?? "no receipt");
      refused.push(`${c.id}: ${why0 ?? "no receipt"}`);
      continue;
    }
    const rc = r0.value.receipt;
    ctx.say(`receipt (${rc.mode}): sheet ${c.id} of ${c.name} · 1 still on ${rc.lines[0]?.lane ?? "gpu.local"} · her portrait ${c.fromPortrait} late ${SHEET_LATE} · comfyui · $0 (free: a local model) · ~${Math.ceil(rc.totals.seconds / 60)} min`);
    const r1 = await launchSheet(ctx.store, target, k, { ...opts, token: rc.token });
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
    const d = await driveSheet(ctx.store, ctx.location, jobId, { dryOnly: ctx.dryOnly, ...(engines.draw === undefined ? {} : { engines: { draw: engines.draw } }) });
    const said = d.ok ? d.value.outcome : d.error.message;
    if (outcome === "done" && said !== "done") outcome = said;
  }
  return { candidates: await batchOf(id, cids), jobIds, outcome };
}

/**
 * A detached sheet job's results into the night. The job writes its still into the night itself, so collecting is
 * settling: every pending sheet whose job has finished is told its ending (`settledSheet`). A cancelled job is a failure.
 */
export async function collectSheets(id: NightId, o: { readonly store?: Store } = {}): Promise<SheetCandidate[]> {
  const n = await readNight(id);
  if (n.state === "committed") throw new Refusal(`night ${id} is committed; its packet is decided and nothing more is collected into it`);
  const waiting = n.candidates.filter((c): c is SheetCandidate & { readonly jobId: string } => c.kind === "sheet" && c.status === "pending" && c.jobId !== undefined);
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
      const now = m.candidates.find((x): x is SheetCandidate => x.id === c.id && x.kind === "sheet");
      const next = now === undefined || now.status !== "pending" ? null : settledSheet(now, ending, said);
      return next === null ? m : withCandidate(m, next);
    });
  }
  return batchOf(id, out);
}
