import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { voiceOf } from "@gt/catalog/partOptions";
import { expectedSecondsOf, judgeAcceptance, type Acceptance, type AudioMeasureFull } from "@gt/domain/audio.accept";
import type { BlobRef } from "@gt/domain/blob";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { ResourceLane } from "@gt/domain/lane";
import type { ModelOption } from "@gt/domain/produce";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { quote } from "@gt/kernel/pricing/quote";
import type { NotPromise, Store, Tx } from "@gt/kernel/store";
import { meteredCall } from "@gt/producers/research/metered";
import { madeFree, madePaid, type ActAsk, type ActPlan } from "@gt/producers/research/partAct";
import { landPart, projectOf } from "@gt/producers/research/partJob";
import { defineVoice, NO_VOICE_ENGINE, voicePlan, type LinePrice, type VoiceLine } from "@gt/producers/voice/define";

import { recordAcceptance } from "@/lib/audio/acceptLedger";
import { measureFile } from "@/lib/audio/sidecar";
import { linesOf, spokenS, type ExplainerCard } from "@/lib/cut/explainer";
import { speak, ttsCharacters, type SpokenLine } from "@/lib/music/elevenlabs";

import { asData, field, partFactsIn, priceOf, text, written, type DriveHooks, type PartFacts } from "./research.ts";
import { musicFailure } from "./score.ts";

// THE VOICE PRODUCER, BOUND (Phase 4 wave C, L37; spoken 2026-10-24, spark audio-postproduction
// -research WP2). A line is a strip card's caption or the operator's rewrite of it, keyed
// `line-<cardId>` by lib/cut/explainer.ts `linesOf` - the SAME derivation the cut and the cut
// gate read, so a take lands on the line they look for (the script beats this read before keyed
// `<renderId>:<at>`, and an explainer plans no script part: every plan refused). One unit per
// line, each priced by ITS characters x the price table's rate (the vendor bills characters).
//
//   perform  DRY: a silent take of the line's spoken length, the vendor never asked. LIVE (armed
//            only by the voice act's receipt, app/(studio)/projects/[id]/_part/real.ts): ElevenLabs
//            text-to-speech in the catalog's one voice (lib/music/elevenlabs.ts `speak`, behind
//            its own character ceiling). Then the bytes in hand are MEASURED by the audio sidecar
//            and the measure is booked with the unit, so a resumed job never re-measures and the
//            landing needs no blob read (a step context has none).
//   land     ONE transaction writes the VOICE record (packages/domain/src/steps/parts.ts): a take
//            per unit, appended to its line, the line's first take made active, the measure's
//            advisory verdict mirrored on the take. Then one `audio.accept` row per measured take
//            (lib/audio/acceptLedger.ts, keyed by the bytes and the profile). An unmeasured take -
//            no sidecar, a decode it refused - lands with NO verdict and NO row: absent, never a
//            fabricated pass. A take's id derives from the job and the unit, so a re-land writes
//            nothing new (the record is unchanged, the rows dedupe on their key).

/** What a live unit calls and what measures its bytes - a test's fake vendor and fake sidecar. */
export type VoiceEngines = {
  readonly speak: (text: string, o: { readonly voiceId: string; readonly modelId: string }) => Promise<SpokenLine>;
  readonly measure: (file: string) => Promise<Result<AudioMeasureFull>>;
};
const LIVE: VoiceEngines = { speak, measure: (file) => measureFile(file) };

/** The option that speaks (packages/kernel/src/router/tables.ts `elevenlabs-voice`). */
const SPEAKS = "elevenlabs-voice";
/** The profile a narration take is judged against: a stem entering the mix (audio.accept.ts). */
const PROFILE = "voice-take";

/** A silent mono 16-bit 8 kHz WAV of `seconds`: the stand-in take's bytes. */
export function silentWav(seconds: number): Uint8Array {
  const samples = Math.max(1, Math.round(seconds * 8000));
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const ascii = (at: number, s: string): void => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, samples * 2, true);
  return new Uint8Array(buf);
}

/** The strip cards' lines with words to say, as the cut keys them. */
export function linesIn(records: PartFacts["records"]): VoiceLine[] {
  const c = records.get("strips")?.["cards"];
  const cards = Array.isArray(c) ? written<ExplainerCard[]>(c) : [];
  const rewrites = field(records.get("voice")?.["text"]) ?? {};
  const own: Record<string, string> = {};
  for (const [k, v] of Object.entries(rewrites)) if (typeof v === "string") own[k] = v;
  return linesOf(cards, { text: own, takes: {}, byLine: {} })
    .filter((l) => l.text.trim() !== "")
    .map((l) => ({ id: l.id, text: l.text }));
}

/** The wire model that speaks for this option, or null when it has none. */
const engineOf = (o: ModelOption): string | null => (o.provider === SPEAKS ? o.model : null);

/**
 * Each line at its own price: the line's characters through the price table's `quote` - the
 * function the Plan's option figure comes from - so the receipt and the table cannot disagree.
 * The table's speech row carries no expiry, so the day only matters once one does.
 */
export function linePrice(option: ModelOption, on: string = new Date().toISOString()): LinePrice {
  if (option.provider !== SPEAKS) return () => priceOf(option);
  return (l) => {
    const q = quote({ provider: option.provider, model: option.model, usage: { character: ttsCharacters(l.text) }, on });
    return q.usd === null ? { seconds: option.secondsPerUnit, usd: null, unpricedReason: q.note } : { seconds: option.secondsPerUnit, usd: Math.round(q.usd * 1e6) / 1e6 };
  };
}

export function voiceUnits(_s: unknown, f: PartFacts, ask: Pick<ActAsk, "act" | "target">, dry = true): Result<ActPlan> {
  const voice = voiceOf("voice", f.option.provider);
  return voicePlan({ lines: linesIn(f.records), engine: engineOf(f.option), dry }, ask.act, linePrice(f.option), ask.target, (l) => ({
    chars: ttsCharacters(l.text),
    provider: f.option.provider,
    model: f.option.model,
    ...(voice === undefined ? {} : { voiceId: voice.voiceId }),
  }));
}

/* ── perform: speak (or stand in), then measure the bytes in hand ─────────── */

export const STAND_IN_UNMEASURED = "a dry stand-in is silence, not narration: not measured";

const round1 = (n: number): number => Math.round(n * 10) / 10;
/** An mp3_44100_128 take's length from its size: constant 128 kbit/s, so 16,000 bytes a second. */
const mp3Seconds = (bytes: number): number => round1(bytes / 16_000);

/** The bytes through the sidecar, from a temp file named for their type (the sidecar reads a path). */
async function measureBytes(eng: VoiceEngines, bytes: Uint8Array, mime: string): Promise<Result<AudioMeasureFull>> {
  const dir = await mkdtemp(path.join(tmpdir(), "gt-voice-measure-"));
  try {
    const file = path.join(dir, mime === "audio/mpeg" ? "take.mp3" : "take.wav");
    await writeFile(file, bytes);
    return await eng.measure(file);
  } catch (e) {
    return err("unavailable", `the take could not be handed to the sidecar: ${errorMessage(e)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function performLine(ctx: StepContext, unit: ActPlan["units"][number], eng: VoiceEngines): Promise<StepOutcome> {
  const line = String(unit.input["text"] ?? "");
  const provider = text(unit.input["provider"]) ?? "voice";
  const model = text(unit.input["model"]) ?? "none";
  const voiceId = text(unit.input["voiceId"]);
  const spoken = await meteredCall<SpokenLine | null>(ctx, {
    provider: provider === SPEAKS ? "elevenlabs" : provider,
    model,
    payload: { voiceId: voiceId ?? null, model, text: line },
    estimate: unit.estimate,
    stand: () => null,
    live: async () => {
      // The plan refuses a live job on an option with no engine; this is the same sentence, kept
      // here so no path can reach a vendor the catalog names no voice for.
      if (provider !== SPEAKS || voiceId === undefined) throw new Error(NO_VOICE_ENGINE);
      const s = await eng.speak(line, { voiceId, modelId: model });
      return { value: s, ...(s.usd === undefined ? { unpriced: s.unpriced ?? `${model} reached no price for ${s.characters} characters` } : { usd: s.usd }) };
    },
  });
  const bytes = spoken?.bytes ?? silentWav(spokenS(line));
  const mime = spoken?.mime ?? "audio/wav";
  const blob = await ctx.fx.blob(bytes, mime);
  if (!blob.ok) return { kind: "fatal", code: blob.error.code, message: blob.error.message };
  // A dry stand-in is silence by construction: measuring it would file a loudness fail for audio
  // nobody spoke, and the Ledger would teach that narration fails (lib/sound/sfxJob.ts keeps its
  // stand-ins out of the ledger for the same reason). So it is not measured and gets no row.
  const m = spoken === null ? err<AudioMeasureFull>("unavailable", STAND_IN_UNMEASURED) : await measureBytes(eng, bytes, mime);
  const seconds = spoken === null ? spokenS(line) : m.ok ? round1(m.value.durationS) : mp3Seconds(bytes.byteLength);
  const engine =
    spoken === null
      ? { provider: provider === SPEAKS ? "elevenlabs" : provider, model, ...(voiceId === undefined ? {} : { voiceId }), mode: "dry", usd: null, unpricedReason: "dry run", seconds: 0 }
      : { provider: "elevenlabs", model, ...(voiceId === undefined ? {} : { voiceId }), mode: "live", usd: spoken.usd ?? null, ...(spoken.usd === undefined ? { unpricedReason: spoken.unpriced ?? "unpriced" } : {}), seconds: round1(spoken.ms / 1000) };
  const out = asData({ id: unit.input["id"], text: line, blob: blob.value, seconds, at: Date.now(), engine, ...(m.ok ? { measure: m.value } : { unmeasured: m.error.message }) });
  return spoken === null ? madeFree(out) : madePaid(out, ctx);
}

/* ── land: the VOICE record, then the acceptance rows ─────────────────────── */

type Take = Readonly<Record<string, unknown>> & { readonly id: string };
type VoiceRec = { readonly text: Readonly<Record<string, string>>; readonly takes: Readonly<Record<string, Take>>; readonly byLine: Readonly<Record<string, { readonly takeIds: readonly string[]; readonly active: string | null }>> };
export type AcceptRow = { readonly sha: string; readonly subject: { readonly kind: "voice-take"; readonly id: string }; readonly measure: AudioMeasureFull; readonly acceptance: Acceptance };

/** A take's id: the job and the unit, so landing the same booking twice names the same take. */
export const takeIdOf = (jobId: string, unit: string): string => `vtake-${createHash("sha256").update(`${jobId}/${unit}`).digest("hex").slice(0, 16)}`;

const recOf = (raw: Readonly<Record<string, unknown>> | undefined): VoiceRec => ({
  ...raw,
  text: written<VoiceRec["text"]>(field(raw?.["text"]) ?? {}),
  takes: written<VoiceRec["takes"]>(field(raw?.["takes"]) ?? {}),
  byLine: written<VoiceRec["byLine"]>(field(raw?.["byLine"]) ?? {}),
});

/** Pure: the record after the job's takes land on it, and the rows their measures earn. */
export function landVoice(projectId: string, jobId: string, plan: ActPlan, made: ReadonlyMap<string, EventData>, raw: Readonly<Record<string, unknown>> | undefined): { readonly voice: VoiceRec; readonly rows: readonly AcceptRow[] } {
  let v = recOf(raw);
  const rows: AcceptRow[] = [];
  for (const u of plan.units) {
    const m = made.get(u.name);
    const lineId = text(u.input["id"]);
    const blob = field(m?.["blob"]);
    if (m === undefined || lineId === undefined || blob === undefined) continue;
    const id = takeIdOf(jobId, u.name);
    const measure = field(m["measure"]) === undefined ? undefined : written<AudioMeasureFull>(m["measure"]);
    const accept = measure === undefined ? undefined : judgeAcceptance(measure, PROFILE, expectedSecondsOf(String(m["text"] ?? u.input["text"] ?? "")));
    if (measure !== undefined && accept !== undefined) rows.push({ sha: String(blob["sha256"]), subject: { kind: "voice-take", id: `${projectId}:${lineId}:${id}` }, measure, acceptance: accept });
    if (Object.hasOwn(v.takes, id)) continue;
    const slot = v.byLine[lineId] ?? { takeIds: [], active: null };
    const seconds = typeof m["seconds"] === "number" ? m["seconds"] : null;
    const take: Take = {
      id,
      label: `take ${slot.takeIds.length + 1}`,
      at: typeof m["at"] === "number" ? m["at"] : 0,
      seconds,
      mark: null,
      blob: written<BlobRef>(blob),
      sections: seconds === null ? [] : [{ name: "line", startMs: 0, endMs: Math.round(seconds * 1000) }],
      ...(field(m["engine"]) === undefined ? {} : { engine: m["engine"] }),
      ...(accept === undefined ? {} : { accept: { profile: accept.profile, verdict: accept.verdict, reasons: [...accept.reasons] } }),
    };
    v = { ...v, takes: { ...v.takes, [id]: take }, byLine: { ...v.byLine, [lineId]: { takeIds: [...slot.takeIds, id], active: slot.active ?? id } } };
  }
  return { voice: v, rows };
}

/** A step's effect port as the acceptance writer's transaction runner. */
const txOf = (ctx: StepContext): Pick<Store, "tx"> => ({ tx: <T,>(fn: (t: Tx) => NotPromise<T>) => ctx.fx.tx("audio.accept", fn) });

export function voiceProducer(lane: ResourceLane = "cloud.elevenlabs", hooks: DriveHooks = {}, engines: Partial<VoiceEngines> = {}): Producer {
  const eng: VoiceEngines = { ...LIVE, ...engines };
  return defineVoice(lane, {
    async plan(job, ask, ctx) {
      const r = ctx.fx.tx("voice.plan", (t) => voiceUnits(null, partFactsIn(t, projectOf(job), job.of.id, Date.parse(t.at)), ask, job.mode.kind === "dry"));
      return r.ok ? r.value : r;
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        return await performLine(ctx, unit, eng);
      } catch (e) {
        return musicFailure(e);
      }
    },
    async land(job, plan, made, ctx) {
      let rows: readonly AcceptRow[] = [];
      const l = landPart(ctx, plan.act, (s) => {
        const r = landVoice(projectOf(job), job.id, plan, made, s.records.get("voice"));
        rows = r.rows;
        return ok({ voice: r.voice });
      });
      if (!l.ok) return l;
      // After the take, never before: a row that failed says the take landed and it did not.
      for (const row of rows) {
        const a = recordAcceptance(txOf(ctx), { ...row, actor: { kind: "machine", id: job.id } });
        if (!a.ok) return a;
      }
      return l;
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
