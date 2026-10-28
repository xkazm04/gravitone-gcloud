// LOCAL SCORE SERVICE — deterministic score compilation, $0 receipt generation, stem caching,
// single-stem swaps, instrument audition previews, and SoundTake filing under `provider: "local"`.

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { FxChain } from "@gt/domain/audio.fx";
import { INSTRUMENT_CATALOG, SCORE_ROLES, instrumentById, parseScoreSpec, swapRoleInstrument, type InstrumentCatalogEntry, type ScoreRole, type ScoreSpec } from "@gt/domain/audio.score";
import { scoreSectionsMs, scoreTotalBars } from "@gt/domain/audio.score.templates";
import type { Triage } from "@gt/domain/audio.triage";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Receipt, ReceiptLine, ReceiptMode } from "@gt/domain/produce";
import { putAudioMeasures } from "@gt/kernel/library/measures";
import { putTriage, triageDigest } from "@gt/kernel/library/triage";

import { auditionInstrument, renderScore, type AuditionResult, type DeterminismReport, type RenderedStem } from "../audio/sidecar";
import { measureSignal } from "./measure";
import { buildScorePrompt, draftScoreFromBrief, proposeScoreSpec } from "./scorePropose";
import { filePathAbs, mintId, safeId, soundFailure, storeRoot, writeBytesAtomic } from "./store";
import { createTake, getTake, listTakes, patchTake } from "./takes";
import { triageContextOf } from "./triageContext";
import type { SoundTake, Stage, Verdict } from "./types";

export { buildScorePrompt, draftScoreFromBrief, proposeScoreSpec };

export type LocalScoreStemMeta = RenderedStem & {
  readonly fileRel: string;
  readonly midiRel: string;
  readonly audioUrl: string;
  readonly midiUrl: string;
};

export type LocalScorePlan = {
  readonly kind: "local-score";
  readonly chunks: readonly { readonly text: string; readonly duration_ms: number }[];
  readonly spec: ScoreSpec;
  readonly stems: readonly LocalScoreStemMeta[];
  readonly triage: Triage;
  readonly determinism: DeterminismReport | null;
  readonly mixSha256: string;
  readonly rppRel: string;
  readonly rppUrl: string;
  readonly reusedRoles: readonly ScoreRole[];
  readonly renderedRoles: readonly ScoreRole[];
  readonly totalRenderMs: number;
  readonly costUsd: 0;
};

/** Price a closed ScoreSpec as a $0 local Receipt on `box.render` before rendering. */
export function buildLocalScoreReceipt(
  specIn: unknown,
  opts: { readonly mode?: ReceiptMode; readonly nowMs?: number; readonly ceilingUsd?: number } = {},
): Result<Receipt> {
  const parsed = parseScoreSpec(specIn);
  if (!parsed.ok) return parsed;
  const spec = parsed.value;
  const now = opts.nowMs ?? Date.now();
  const totalBars = scoreTotalBars(spec);
  let cursorMs = now;
  const lines: ReceiptLine[] = spec.tracks.map((tr, idx) => {
    const inst = instrumentById(tr.instrument)!;
    const sec = Math.max(1, Math.round((inst.audition.loadMs * (idx === 0 ? 1 : 0.15) + inst.audition.renderMs) / 1000));
    const start = new Date(cursorMs).toISOString();
    cursorMs += sec * 1000;
    return {
      key: `stem:${tr.role}`,
      label: `${tr.role} · ${inst.name}`,
      lane: "box.render",
      provider: "local",
      model: inst.engine,
      units: totalBars,
      seconds: sec,
      usd: 0,
      src: "real",
      queuePos: idx + 1,
      start,
      end: new Date(cursorMs).toISOString(),
    };
  });
  const totalSeconds = lines.reduce((acc, l) => acc + l.seconds, 0);
  const token = `local:${createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 24)}`;
  return ok({
    token,
    subject: { kind: "run", lane: "audio" },
    mode: opts.mode ?? "dry",
    lines,
    totals: { seconds: totalSeconds, usd: 0, unpriced: 0, src: "real" },
    queuePos: 1,
    etaAt: new Date(now + totalSeconds * 1000).toISOString(),
    ...(opts.ceilingUsd === undefined ? {} : { ceilingUsd: opts.ceilingUsd }),
    overCeiling: false,
    readAt: new Date(now).toISOString(),
  });
}

/** Decode a 16-bit PCM RIFF WAV buffer into mono Float32 samples for waveform peak & RMS measurement. */
export function wavToMonoFloat32(wavBytes: Uint8Array): { readonly samples: Float32Array; readonly sampleRate: number } {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  if (wavBytes.byteLength < 44) return { samples: new Float32Array(0), sampleRate: 44_100 };
  let channels = 2;
  let sampleRate = 44_100;
  let bitsPerSample = 16;
  let offset = 12;
  while (offset + 8 <= wavBytes.byteLength) {
    const tag = String.fromCharCode(wavBytes[offset] ?? 0, wavBytes[offset + 1] ?? 0, wavBytes[offset + 2] ?? 0, wavBytes[offset + 3] ?? 0);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (tag === "fmt " && size >= 16 && body + 16 <= wavBytes.byteLength) {
      channels = Math.max(1, view.getUint16(body + 2, true));
      sampleRate = Math.max(8_000, view.getUint32(body + 4, true));
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (tag === "data") {
      const avail = Math.min(size, wavBytes.byteLength - body);
      const bytesPerSample = Math.max(2, bitsPerSample >> 3);
      const frameBytes = channels * bytesPerSample;
      const frames = Math.floor(avail / frameBytes);
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let acc = 0;
        const base = body + i * frameBytes;
        for (let c = 0; c < channels; c++) acc += view.getInt16(base + c * bytesPerSample, true) / 32768;
        out[i] = acc / channels;
      }
      return { samples: out, sampleRate };
    }
    offset = body + size + (size & 1);
  }
  return { samples: new Float32Array(0), sampleRate };
}

export function readLocalScorePlan(take: Pick<SoundTake, "plan">): LocalScorePlan | null {
  const p = take.plan as Partial<LocalScorePlan> | null;
  if (!p || typeof p !== "object" || p.kind !== "local-score" || !p.spec || !Array.isArray(p.stems)) return null;
  return p as LocalScorePlan;
}

export type RenderLocalScoreOpts = {
  readonly verifyDeterminism?: boolean;
  readonly fallbackDeterminism?: DeterminismReport | null;
  readonly parentId?: string | null;
  readonly op?: "compose" | "section-edit";
  readonly group?: string | null;
  readonly label?: string | null;
  readonly stage?: Stage | null;
  readonly verdict?: Verdict;
  readonly variation?: SoundTake["variation"];
};

export async function renderLocalScore(
  specIn: unknown,
  opts: RenderLocalScoreOpts = {},
): Promise<Result<{ readonly take: SoundTake; readonly plan: LocalScorePlan }>> {
  const parsed = parseScoreSpec(specIn);
  if (!parsed.ok) return parsed;
  const spec = parsed.value;

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "gt-local-score-"));
  try {
    const cacheDir = path.join(storeRoot(), "local-stem-cache");
    const rendered = await renderScore(spec, tmpDir, {
      cacheDir,
      verifyDeterminism: opts.verifyDeterminism ?? (opts.op !== "section-edit"),
    });
    if (!rendered.ok) return rendered;
    const res = rendered.value;

    const mixBytes = new Uint8Array(await readFile(res.mixPath));
    const id = mintId("st");

    const stemMetas: LocalScoreStemMeta[] = [];
    for (const st of res.stems) {
      const role = st.role;
      const stemRel = await writeBytesAtomic(path.join("files", `${safeId(id)}-${role}.wav`), new Uint8Array(await readFile(st.wavPath)));
      const midiRel = await writeBytesAtomic(path.join("files", `${safeId(id)}-${role}.mid`), new Uint8Array(await readFile(st.midiPath)));
      stemMetas.push({
        ...st, fileRel: stemRel, midiRel,
        audioUrl: `/api/sound/takes/${encodeURIComponent(id)}/file?stem=${encodeURIComponent(role)}`,
        midiUrl: `/api/sound/takes/${encodeURIComponent(id)}/file?artifact=midi&stem=${encodeURIComponent(role)}`,
      });
    }

    let rppText = await readFile(res.reaperProjectPath, "utf8");
    for (const st of stemMetas) rppText = rppText.replaceAll(st.wavPath, filePathAbs(st.fileRel));
    const rppRel = await writeBytesAtomic(path.join("files", `${safeId(id)}.rpp`), new TextEncoder().encode(rppText));
    const { samples, sampleRate } = wavToMonoFloat32(mixBytes);
    const sig = measureSignal(samples, sampleRate, true);
    const sectionsMs = scoreSectionsMs(spec);
    const styleTag = spec.style ?? "local-band";
    const chunks =
      spec.loop === true
        ? [{ text: `[loop] ${styleTag} (${scoreTotalBars(spec)} bars seamless loop)`, duration_ms: Math.max(100, Math.round(res.durationS * 1000)) }]
        : sectionsMs.map((s, idx) => ({
            text: `[${s.name}] ${styleTag} (${spec.sections[idx]?.bars ?? 2} bars, energy ${spec.sections[idx]?.energy ?? 0.5})`,
            duration_ms: Math.max(100, s.endMs - s.startMs),
          }));

    const plan: LocalScorePlan = {
      kind: "local-score", chunks, spec, stems: stemMetas, triage: res.triage,
      determinism: res.determinism ?? opts.fallbackDeterminism ?? null, mixSha256: res.mixSha256,
      rppRel, rppUrl: `/api/sound/takes/${encodeURIComponent(id)}/file?artifact=rpp`,
      reusedRoles: res.reusedRoles, renderedRoles: res.renderedRoles, totalRenderMs: res.totalRenderMs, costUsd: 0,
    };

    const instrumentsSummary = stemMetas.map((s) => `${s.role}: ${s.instrumentName}`).join(" · ");
    const prompt = `${spec.title} — ${styleTag} in ${spec.key} at ${spec.tempoBpm} BPM (${instrumentsSummary})`;
    const use = spec.loop === true ? `seamless loop bed (${styleTag})` : `local 4-stem score cue (${styleTag})`;
    const aim = `${spec.tempoBpm} BPM in ${spec.key}; sections [${spec.sections.map((s) => `${s.name}:${s.bars}b`).join(", ")}]; mastered -14 LUFS, 0 triage flags`;

    const created = await createTake(
      {
        id,
        kind: "music",
        title: spec.title,
        provider: "local",
        op: opts.op ?? "compose",
        origin: "lab",
        technique: ["local-score", styleTag, ...spec.tracks.map((t) => `${t.role}:${t.instrument}`)],
        prompt,
        terms: { genre: [styleTag], mood: ["deterministic", "local-band"], instrument: spec.tracks.map((t) => t.instrument), sfxCategory: null },
        tempoBpm: spec.tempoBpm,
        key: spec.key,
        durationS: res.durationS,
        loop: spec.loop ?? false,
        peaks: [...sig.peaks],
        measured: {
          tempoBpm: spec.tempoBpm,
          key: spec.key,
          energy: sig.energy,
          durationS: res.durationS,
          lufs: res.measure.integratedLufs,
          truePeakDb: res.measure.truePeakDb,
        },
        use,
        aim,
        verdict: opts.verdict ?? "unjudged",
        stage: opts.stage ?? null,
        group: opts.group ?? null,
        label: opts.label ?? null,
        parentId: opts.parentId ?? null,
        variation: opts.variation ?? null,
        plan,
        fileName: `${safeId(id)}.wav`,
      },
      { bytes: mixBytes, mime: "audio/wav", name: `${safeId(id)}.wav` },
    );

    try {
      const { kernel } = await import("../kernelStore");
      const k = kernel();
      if (k.ok) {
        putAudioMeasures(k.value.store, [{
          sha: res.mixSha256, peaks: [...sig.peaks], energy: sig.energy, durationS: res.durationS,
          tempoBpm: spec.tempoBpm, key: spec.key, measuredAt: created.take.createdAt, error: null,
          lufs: res.measure.integratedLufs, truePeakDb: res.measure.truePeakDb, lra: res.measure.lra,
          clippedSamples: res.measure.clippedSamples, tailSilenceS: res.measure.tailSilenceS,
        }]);
        putTriage(k.value.store, [{ sha: res.mixSha256, contextDigest: triageDigest(triageContextOf(created.take)), triage: res.triage, at: created.take.createdAt }]);
      }
    } catch {
      // Headless tsx CLI runs without Next's server-only shim; sound store files and measures are already persisted.
    }
    return ok({ take: created.take, plan });
  } catch (e) {
    return soundFailure(e);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export type SwapLocalStemInput = {
  readonly takeId: string;
  readonly role: ScoreRole;
  readonly instrumentId: string;
  readonly gainDb?: number;
  readonly pan?: number;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly fx?: FxChain;
};

/** Swap one stem's instrument, FX chain, or mute/solo state on an existing local take, reusing unchanged stems bit-for-bit. */
export async function swapLocalTakeStem(input: SwapLocalStemInput): Promise<Result<{ readonly take: SoundTake; readonly plan: LocalScorePlan }>> {
  if (!SCORE_ROLES.includes(input.role)) return err("invalid", `unknown stem role: ${String(input.role)}`);
  let parent: SoundTake;
  try {
    parent = await getTake(input.takeId);
  } catch (e) {
    return soundFailure(e);
  }
  const prevPlan = readLocalScorePlan(parent);
  if (!prevPlan) return err("invalid", `take ${input.takeId} does not carry a local ScoreSpec`);
  const prevTrack = prevPlan.spec.tracks.find((t) => t.role === input.role);
  const swapped = swapRoleInstrument(prevPlan.spec, input.role, input.instrumentId, input.fx);
  if (!swapped.ok) return swapped;
  const nextSpec: ScoreSpec = {
    ...swapped.value,
    tracks: swapped.value.tracks.map((t) =>
      t.role === input.role
        ? { ...t, ...(input.gainDb !== undefined ? { gainDb: input.gainDb } : {}), ...(input.pan !== undefined ? { pan: input.pan } : {}), ...(input.muted !== undefined ? { muted: input.muted } : {}), ...(input.solo !== undefined ? { solo: input.solo } : {}) }
        : t,
    ),
  };
  return renderLocalScore(nextSpec, {
    verifyDeterminism: false,
    fallbackDeterminism: prevPlan.determinism,
    parentId: parent.id,
    op: "section-edit",
    group: parent.group,
    variation: { axis: `stem:${input.role}`, diff: [`${prevTrack?.instrument ?? "previous"} -> ${input.instrumentId}`] },
  });
}

/** Render a short audition preview WAV for a ready catalog instrument, or refuse with its measured A0 gate reason. */
export async function auditionLocalInstrument(instrumentId: string): Promise<
  Result<{ readonly instrumentId: string; readonly name: string; readonly role: ScoreRole; readonly audioUrl: string; readonly audition: AuditionResult["audition"]; readonly source: string }>
> {
  const cat = instrumentById(instrumentId);
  if (!cat) return err("invalid", `unknown instrument: ${instrumentId}`);
  if (cat.audition.status !== "ready" || !cat.audition.noteOnWorks) {
    return err("invalid", `${cat.name} (${cat.id}) refused by A0 gate: ${cat.audition.refusalReason ?? "audition failed"}`);
  }
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "gt-audition-"));
  try {
    const outWav = path.join(tmpDir, `${safeId(cat.id)}.wav`);
    const res = await auditionInstrument(cat.id, outWav);
    if (!res.ok) return res;
    if (res.value.audition.status !== "ready" || !res.value.outPath) {
      return err("invalid", `${cat.name} refused: ${res.value.audition.refusalReason ?? "silent render"}`);
    }
    await writeBytesAtomic(path.join("files", `audition-${safeId(cat.id)}.wav`), new Uint8Array(await readFile(res.value.outPath)));
    return ok({
      instrumentId: cat.id,
      name: cat.name,
      role: cat.role,
      audioUrl: `/api/sound/takes/audition/file?instrument=${encodeURIComponent(cat.id)}`,
      audition: res.value.audition,
      source: res.value.source,
    });
  } catch (e) {
    return err("internal", errorMessage(e));
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function promoteLocalTakeToArrange(input: {
  readonly takeId: string;
  readonly group?: string | null;
  readonly label?: string | null;
  readonly finalize?: boolean;
}): Promise<Result<SoundTake>> {
  try {
    const current = await getTake(input.takeId);
    const plan = readLocalScorePlan(current);
    const styleGroup = plan?.spec.style === "chill-hiphop" ? "hip hop" : plan?.spec.style === "calm-bed" ? "ambient" : plan?.spec.style === "warm-acoustic" ? "cinematic" : "electronic";
    const label = (input.label ?? current.label ?? current.title).trim() || "local-band-cue";
    const group = (input.group ?? current.group ?? styleGroup).trim() || styleGroup;
    let parentId = current.parentId;
    const seen = new Set<string>([current.id]);
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      try {
        const p = await getTake(parentId);
        if (p.verdict !== "kept") await patchTake(p.id, { verdict: "kept", stage: "pending", group });
        parentId = p.parentId;
      } catch {
        break;
      }
    }
    return ok(await patchTake(input.takeId, { verdict: "kept", stage: input.finalize ? "finalized" : "pending", group, label }));
  } catch (e) {
    return soundFailure(e);
  }
}

export async function listLocalScoreTakes(limit = 12): Promise<readonly { readonly take: SoundTake; readonly plan: LocalScorePlan }[]> {
  const all = await listTakes({ provider: "local" });
  const out: { readonly take: SoundTake; readonly plan: LocalScorePlan }[] = [];
  for (const t of all) {
    const plan = readLocalScorePlan(t);
    if (plan && out.push({ take: t, plan }) >= limit) break;
  }
  return out;
}

export const listInstrumentCatalog = (): readonly InstrumentCatalogEntry[] => INSTRUMENT_CATALOG;
