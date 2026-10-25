import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { failureOf, meteredCall } from "@gt/producers/research/metered";
import { madeFree, type ActAsk, type ActPlan } from "@gt/producers/research/partAct";
import { projectOf } from "@gt/producers/research/partJob";
import { defineVoice, NO_VOICE_ENGINE, voicePlan, type VoiceLine } from "@gt/producers/voice/define";

import type { ScriptRender } from "@/lib/script/types";

import { asData, partFactsIn, priceOf, text, written, type DriveHooks, type PartFacts } from "./research.ts";

// THE VOICE PRODUCER, BOUND (Phase 4 wave C, L37). Lines are the adopted script render's spoken
// beats (this project's `script-versions` + `script-adopted`); a take per line is one unit and
// lands as a blob on the job. v1 had no speech engine (lib/cut/deriveTimeline.ts: "NOTHING
// RECORDS A VOICE"), so the only call here is the DRY stand-in - a silent take of the line's
// spoken length - and a live job is refused at its plan step (packages/producers/src/voice).

/** Spoken pace for a stand-in take's length: 2.5 words a second, the explainer read rate. */
const WORDS_PER_S = 2.5;

/** A stand-in take's length: the line's words at the read rate, a second at least. */
export const standInSeconds = (line: string): number => Math.max(1, line.trim().split(/\s+/).length / WORDS_PER_S);

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

/** The adopted render's beats with words to say, as lines. */
export function linesIn(records: PartFacts["records"]): VoiceLine[] {
  const adopted = text(records.get("script-adopted")?.["renderId"]) ?? "";
  const candidates = records.get("script-versions")?.["candidates"];
  const render = (Array.isArray(candidates) ? written<ScriptRender[]>(candidates) : []).find((c) => c.id === adopted);
  return (render?.beats ?? []).filter((b) => b.text.trim() !== "").map((b) => ({ id: `${render?.id ?? "r"}:${b.at}`, text: b.text }));
}

/** Engines that can speak: none yet (see the header). */
const ENGINE: string | null = null;

export function voiceUnits(_s: unknown, f: PartFacts, ask: Pick<ActAsk, "act" | "target">, dry = true): Result<ActPlan> {
  return voicePlan({ lines: linesIn(f.records), engine: ENGINE, dry }, ask.act, priceOf(f.option), ask.target);
}

export function voiceProducer(lane: ResourceLane = "cloud.elevenlabs", hooks: DriveHooks = {}): Producer {
  return defineVoice(lane, {
    async plan(job, ask, ctx) {
      const r = ctx.fx.tx("voice.plan", (t) => voiceUnits(null, partFactsIn(t, projectOf(job), job.of.id, Date.parse(t.at)), ask, job.mode.kind === "dry"));
      return r.ok ? r.value : r;
    },
    async perform(job, _plan, unit, ctx) {
      try {
        const line = String(unit.input["text"] ?? "");
        const seconds = standInSeconds(line);
        const bytes = await meteredCall(ctx, {
          provider: "voice",
          model: "none",
          payload: { line },
          estimate: unit.estimate,
          stand: () => silentWav(seconds),
          live: () => Promise.reject(new Error(NO_VOICE_ENGINE)),
        });
        const blob = await ctx.fx.blob(bytes, "audio/wav");
        if (!blob.ok) return { kind: "fatal", code: blob.error.code, message: blob.error.message };
        return madeFree(asData({ id: unit.input["id"], blob: blob.value, seconds, standIn: job.mode.kind === "dry" }));
      } catch (e) {
        return failureOf(e);
      }
    },
    // The VOICE record exists (@gt/domain/steps/parts.ts: takes and the active one per line), but this
    // landing does not write it yet: the takes stay on the job (blobs), where cut reads them.
    async land() {
      return ok({ rev: 0, unchanged: true });
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
