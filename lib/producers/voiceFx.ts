import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expectedSecondsOf, judgeAcceptance, type AudioMeasureFull } from "@gt/domain/audio.accept";
import type { FxChain } from "@gt/domain/audio.fx";
import type { BlobRef } from "@gt/domain/blob";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { BlobStore } from "@gt/kernel/blob";
import { madePaid, type ActPlan, type ActUnit } from "@gt/producers/research/partAct";
import { fxPlan, type FxAsk, type VoiceLine } from "@gt/producers/voice/define";

import { fxPrompt, promptText, proposeChain, VOICE_FX_TURN, type ReasonFn } from "@/lib/sound/voiceFx/propose";
import { FX_STAND_IN } from "@/lib/sound/voiceFx/standIn";
import type { TextProvenance } from "@/lib/text/types";

import { asData, field, meteredText, text, written, type PartFacts } from "./research.ts";

// THE VOICE PART'S `fx-line` ACT, BOUND (spark audio-postproduction-research WP3) - one take of
// one line re-voiced as a character, landed as a NEW take beside it. lib/producers/voice.ts runs
// it: the act is the voice producer's (packages/producers/src/voice/define.ts says why), so its
// job runs on the voice option's lane, `cloud.elevenlabs`. Its unit is FREE - the render is
// local, no vendor is billed and nothing is reserved for it - and the trade-off is accepted on
// purpose: a crash DURING an fx unit is the kernel's interruption, and on a paid lane the lane
// holds until the operator looks, so one failed render can hold a lane that speaks for money.
// Conservative, and the cost of not forking a producer for one act.
//
//   plan     the line's pending ask (VOICE `fxAsk[lineId]`, written by the `voice-fx-ask` op):
//            refused at plan time, with the sentence, when there is no ask, when its take is not
//            on the line, or when that take holds no bytes.
//   perform  the chain: DRY, the stand-in (lib/sound/voiceFx/standIn.ts - the router is never
//            asked); LIVE, a `voice-fx` text turn through the step's meter, its answer held to the
//            schema at the door and REFUSED past a bound (lib/sound/voiceFx/propose.ts). Then the
//            source take's bytes from the kernel's blob store to a temp file, the audio sidecar's
//            `applyChain`, the result blobbed as audio/wav. The measure follows WP2's rule: a take
//            rendered from a DRY stand-in is silence through a chain, not narration - it is not
//            measured and earns no row; one rendered from a spoken take is measured at perform
//            time (bytes in hand) and booked with the unit.
//   land     a new take on the same line - `fxOf` the source, `describe` the words (also its
//            label; the editor shortens it), `chain`, the source's `engine` with THIS job's mode -
//            appended to the line's takes and NOT made active (the operator picks it with
//            `voice-use`); the ask it answered is cleared. The source take is never written. Then
//            one `audio.accept` row per measured take, as record-line's are.

export type FxEngines = {
  readonly render: (inPath: string, chain: FxChain, outPath: string) => Promise<Result<{ readonly durationS: number }>>;
  readonly measure: (file: string) => Promise<Result<AudioMeasureFull>>;
  /** Where the source take's bytes are read from (the kernel's blob store). */
  readonly blobs: () => BlobStore;
  /** The text engine a LIVE unit asks (default: the router's `reason`) - a test's fake. */
  readonly reason?: ReasonFn;
};

export const FX_OF_STAND_IN_UNMEASURED = "rendered from a dry stand-in, which is silence: not measured";
const PROFILE = "voice-take";

const round1 = (n: number): number => Math.round(n * 10) / 10;
type Obj = Readonly<Record<string, unknown>>;

/* ── plan ─────────────────────────────────────────────────────────────────── */

function asksOf(raw: unknown): Record<string, FxAsk> {
  const out: Record<string, FxAsk> = {};
  for (const [line, a] of Object.entries(field(raw) ?? {})) {
    const from = text(field(a)?.["from"]);
    const describe = text(field(a)?.["describe"]);
    if (from !== undefined && describe !== undefined) out[line] = { from, describe };
  }
  return out;
}

/** The act's unit from the VOICE record as it is now, over the lines the cut keys. */
export function fxUnits(records: PartFacts["records"], lines: readonly VoiceLine[], target: string | undefined): Result<ActPlan> {
  const voice = records.get("voice");
  const takes = field(voice?.["takes"]) ?? {};
  const byLine = Object.entries(field(voice?.["byLine"]) ?? {});
  const lineOf = (id: string): string | null => byLine.find(([, slot]) => { const ids = field(slot)?.["takeIds"]; return Array.isArray(ids) && ids.includes(id); })?.[0] ?? null;
  return fxPlan(
    {
      lines,
      asks: asksOf(voice?.["fxAsk"]),
      take: (id) => {
        const t = field(takes[id]);
        if (t === undefined) return undefined;
        const blob = field(t["blob"]);
        const engine = field(t["engine"]);
        return { id, lineId: lineOf(id), ...(blob === undefined ? {} : { blob }), ...(engine === undefined ? {} : { engine }) };
      },
    },
    target,
  );
}

/* ── perform ──────────────────────────────────────────────────────────────── */

/** The take's engine: who spoke the source, with this job's mode and the chain turn's figures. */
function engineOf(ctx: StepContext, src: Obj | undefined, p: TextProvenance | undefined): EventData {
  const voiceId = text(src?.["voiceId"]);
  const base = { provider: text(src?.["provider"]) ?? "voice", model: text(src?.["model"]) ?? "none", ...(voiceId === undefined ? {} : { voiceId }), mode: ctx.job.mode.kind };
  if (p === undefined) return { ...base, usd: null, unpricedReason: ctx.job.mode.kind === "dry" ? "dry run" : "no text turn", seconds: 0 };
  return { ...base, usd: p.costUsd ?? null, ...(p.costUsd === undefined ? { unpricedReason: `${p.provider} reported no cost (${p.costBasis})` } : {}), seconds: round1(p.durationMs / 1000) };
}

export async function performFx(ctx: StepContext, unit: ActUnit, eng: FxEngines): Promise<StepOutcome> {
  const describe = text(unit.input["describe"]) ?? "";
  const src = field(unit.input["blob"]);
  const srcEngine = field(unit.input["engine"]);
  if (src === undefined) return { kind: "fatal", code: "invalid", message: `${unit.name}: the source take holds no audio` };
  const template = await promptText();
  if (!template.ok) return { kind: "fatal", code: template.error.code, message: template.error.message };
  let provenance: TextProvenance | undefined;
  const chain = await meteredText<FxChain>(ctx, unit, { turn: VOICE_FX_TURN, prompt: fxPrompt(template.value, describe) }, () => FX_STAND_IN, async () => {
    const r = await proposeChain(describe, eng.reason);
    if (!r.ok) throw r.error;
    provenance = r.value.provenance;
    return { value: r.value.chain, provenance: r.value.provenance };
  });
  const ref = written<BlobRef>(src);
  const bytes = await eng.blobs().read(ref);
  if (!bytes.ok) return { kind: "fatal", code: bytes.error.code, message: `take ${String(unit.input["from"])}: its audio could not be read: ${bytes.error.message}` };
  const r = await rendered(eng, ref, bytes.value, chain, srcEngine?.["mode"] === "dry");
  // The sidecar's sentence verbatim: a chain it refused, a module it could not import.
  if (!r.ok) return { kind: "fatal", code: r.error.code, message: r.error.message };
  const blob = await ctx.fx.blob(r.value.bytes, "audio/wav");
  if (!blob.ok) return { kind: "fatal", code: blob.error.code, message: blob.error.message };
  const m = r.value.measure;
  const seconds = m.ok ? round1(m.value.durationS) : round1(r.value.durationS);
  const chainBy = provenance === undefined ? {} : { chainBy: { provider: provenance.provider, model: provenance.model, rung: provenance.rung } };
  const booked = asData({ id: unit.input["id"], from: unit.input["from"], describe, text: unit.input["text"], chain, blob: blob.value, seconds, at: Date.now(), engine: engineOf(ctx, srcEngine, provenance), ...chainBy, ...(m.ok ? { measure: m.value } : { unmeasured: m.error.message }) });
  return madePaid(booked, ctx);
}

type Rendered = { readonly bytes: Uint8Array; readonly durationS: number; readonly measure: Result<AudioMeasureFull> };

/**
 * The chain over the source's bytes, in a temp dir the sidecar reads and writes (it takes paths),
 * measured while the file is in hand. Only file and sidecar failures are caught here - an effect
 * of the step (the blob write) stays outside, so a crash the kernel injects is never mistaken for
 * a render that failed.
 */
async function rendered(eng: FxEngines, ref: BlobRef, src: Uint8Array, chain: FxChain, fromStandIn: boolean): Promise<Result<Rendered>> {
  const dir = await mkdtemp(path.join(tmpdir(), "gt-voice-fx-"));
  try {
    const inFile = path.join(dir, ref.mime === "audio/mpeg" ? "take.mp3" : "take.wav");
    const outFile = path.join(dir, "fx.wav");
    await writeFile(inFile, src);
    const r = await eng.render(inFile, chain, outFile);
    if (!r.ok) return r;
    const bytes = new Uint8Array(await readFile(outFile));
    const measure = fromStandIn ? err<AudioMeasureFull>("unavailable", FX_OF_STAND_IN_UNMEASURED) : await eng.measure(outFile);
    return ok({ bytes, durationS: r.value.durationS, measure });
  } catch (e) {
    return err("unavailable", `the take could not be handed to the sidecar: ${errorMessage(e)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* ── land ─────────────────────────────────────────────────────────────────── */

type Take = Obj & { readonly id: string };
type Slot = { readonly takeIds: readonly string[]; readonly active: string | null };
export type FxVoiceRec = Obj & { readonly takes: Readonly<Record<string, Take>>; readonly byLine: Readonly<Record<string, Slot>>; readonly fxAsk?: Readonly<Record<string, FxAsk>> };
export type FxRow = { readonly sha: string; readonly subject: { readonly kind: "voice-take"; readonly id: string }; readonly measure: AudioMeasureFull; readonly acceptance: ReturnType<typeof judgeAcceptance> };

/** The record without the ask a landing answered (only if it is still the ask it rendered). */
function cleared(v: FxVoiceRec, lineId: string, from: string, describe: string): FxVoiceRec {
  const a = v.fxAsk?.[lineId];
  if (a === undefined || a.from !== from || a.describe !== describe) return v;
  const { [lineId]: _gone, ...rest } = v.fxAsk ?? {};
  const { fxAsk: _old, ...without } = v;
  return Object.keys(rest).length === 0 ? (without as FxVoiceRec) : { ...without, fxAsk: rest } as FxVoiceRec;
}

/** Pure: the record after the job's FX takes land on it, and the rows their measures earn. */
export function landFx(projectId: string, idOf: (unit: string) => string, plan: ActPlan, made: ReadonlyMap<string, EventData>, raw: Obj | undefined): { readonly voice: FxVoiceRec; readonly rows: readonly FxRow[] } {
  let v: FxVoiceRec = { ...raw, takes: written<FxVoiceRec["takes"]>(field(raw?.["takes"]) ?? {}), byLine: written<FxVoiceRec["byLine"]>(field(raw?.["byLine"]) ?? {}), ...(field(raw?.["fxAsk"]) === undefined ? {} : { fxAsk: asksOf(raw?.["fxAsk"]) }) };
  const rows: FxRow[] = [];
  for (const u of plan.units) {
    const m = made.get(u.name);
    const lineId = text(u.input["id"]);
    const from = text(u.input["from"]);
    const blob = field(m?.["blob"]);
    if (m === undefined || lineId === undefined || from === undefined || blob === undefined) continue;
    const describe = text(m["describe"]) ?? "";
    const id = idOf(u.name);
    const measure = field(m["measure"]) === undefined ? undefined : written<AudioMeasureFull>(m["measure"]);
    const accept = measure === undefined ? undefined : judgeAcceptance(measure, PROFILE, expectedSecondsOf(String(m["text"] ?? u.input["text"] ?? "")));
    if (measure !== undefined && accept !== undefined) rows.push({ sha: String(blob["sha256"]), subject: { kind: "voice-take", id: `${projectId}:${lineId}:${id}` }, measure, acceptance: accept });
    v = cleared(v, lineId, from, describe);
    if (Object.hasOwn(v.takes, id)) continue;
    const slot = v.byLine[lineId] ?? { takeIds: [], active: null };
    const seconds = typeof m["seconds"] === "number" ? m["seconds"] : null;
    const take: Take = {
      id,
      label: describe,
      at: typeof m["at"] === "number" ? m["at"] : 0,
      seconds,
      mark: null,
      blob: written<BlobRef>(blob),
      sections: seconds === null ? [] : [{ name: "line", startMs: 0, endMs: Math.round(seconds * 1000) }],
      fxOf: from,
      describe,
      chain: m["chain"],
      ...(field(m["engine"]) === undefined ? {} : { engine: m["engine"] }),
      ...(field(m["chainBy"]) === undefined ? {} : { chainBy: m["chainBy"] }),
      ...(accept === undefined ? {} : { accept: { profile: accept.profile, verdict: accept.verdict, reasons: [...accept.reasons] } }),
    };
    // Appended, never made active: the operator chooses an FX take with `voice-use`.
    v = { ...v, takes: { ...v.takes, [id]: take }, byLine: { ...v.byLine, [lineId]: { takeIds: [...slot.takeIds, id], active: slot.active } } };
  }
  return { voice: v, rows };
}
