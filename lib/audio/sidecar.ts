import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import type { AudioMeasureFull } from "@gt/domain/audio.accept";
import { parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { FxChain } from "@gt/domain/audio.fx";
import { SCORE_ROLES, TRACK_ID_RE, instrumentById, parseScoreSpec, type ScoreRole, type ScoreSpec } from "@gt/domain/audio.score";
import { triageAnswerSchema, triageSchema, type Triage, type TriageContext } from "@gt/domain/audio.triage";

import { canSpawnLocalBinaries, describePosture } from "../deployment.ts";

// THE AUDIO SIDECAR, FROM NODE - the one door to pipeline/audio/sidecar.py (pedalboard +
// pyloudnorm on this box). Server-only by construction: it spawns a local binary, so it is
// reached only from producers and server code, never from a client module. docs/audio-sidecar.md
// is the operator's page (install, the stage map, what doctor reports).
//
// CONTRACT (the sidecar's stdout, LAST line, JSON; pipeline/audio/sidecar.py's docstring lists every verb):
//   measure --in <wav>                         -> {"ok":true,"measure":{integratedLufs,truePeakDb,lra,...}}
//   analyze --in <file>                        -> {"ok":true,"analyze":{durationS,tempo,key,measure}}   (librosa)
//   fx --in <wav> --chain <chain.json> --out   -> {"ok":true,"durationS":n,"gainDb":g,...}
//   triage --in <file> --context <ctx.json>    -> {"ok":true,"triage":{...}}
//   render-score --spec <spec.json> --out-dir [--cache-dir d] [--verify-determinism] [--allow-fallback]
//                                              -> {"ok":true,"mixPath":...,"stems":[{id,source,fallback,...}],"reusedIds":[...],...}
//   audition-instrument --instrument <id>      -> {"ok":true,"id":...,"audition":{...}}   (local-band catalog)
//   render --midi <mid> --instrument <id>      -> {"ok":true,...}
//   audition / sketch --spec <json> --out <wav> -> phrase renders, ./sidecarPhrase.ts (atlas families)
//   any failure -> {"ok":false,"error":"<the tool's own sentence>","kind":...} and exit code 1.
// The interpreter is `PYTHON` or the platform default (lib/producers/forge.ts:76).
//
// Every call is BOUNDED - a timeout (120 s by default, 180 s for render-score) and a cap on what is
// kept of stdout and stderr - and refuses before spawning when this deployment may not spawn a local
// binary (lib/deployment.ts), with that posture's own sentence. The sidecar's error is carried
// VERBATIM; a run that answered no JSON at all is reported with its exit and the last three
// lines of its stderr, which is where Python's traceback ends. The sidecar's `kind` picks the
// code: a chain or an argument it refused is `invalid`, everything else (a missing module, a
// decoder that said no, a timeout) is `unavailable` - the dependency, not the caller.

export type SidecarOptions = { readonly timeoutMs?: number };

const TIMEOUT_MS = 120_000;
const RENDER_SCORE_TIMEOUT_MS = 180_000;
const DOCTOR_TIMEOUT_MS = 30_000;
/** What is kept of each stream: the answer is one line at the end, the reason the last lines of stderr. */
const KEEP_BYTES = 64 * 1024;

export const SIDECAR_SCRIPT = path.join("pipeline", "audio", "sidecar.py");
const python = (): string => process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");

type Spawned = { readonly code: number | null; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean; readonly error?: string };

const lastLine = (s: string): string => s.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
const stderrTail = (s: string): string => s.trim().split(/\r?\n/).slice(-3).join(" | ");

function spawnSidecar(args: readonly string[], timeoutMs: number): Promise<Spawned> {
  return new Promise((resolve) => {
    let out = "";
    let errText = "";
    let timedOut = false;
    let settled = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let child: ReturnType<typeof spawn>;
    const finish = (res: Spawned): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (flushTimer !== null) clearTimeout(flushTimer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(res);
    };
    try {
      child = spawn(python(), [path.resolve(SIDECAR_SCRIPT), ...args], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: null, stdout: "", stderr: "", timedOut, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        // ignore kill error
      }
      finish({ code: null, stdout: out, stderr: errText, timedOut: true });
    }, timeoutMs);
    child.stdout?.on("data", (b: Buffer) => {
      out = (out + b.toString("utf8")).slice(-KEEP_BYTES);
      if (out.endsWith("\n")) {
        const line = lastLine(out);
        if (line.startsWith('{"ok":') && line.endsWith("}")) {
          if (flushTimer !== null) clearTimeout(flushTimer);
          flushTimer = setTimeout(() => {
            const okLine = line.startsWith('{"ok": true') || line.startsWith('{"ok":true');
            try {
              child.kill();
            } catch {
              // ignore
            }
            finish({ code: child.exitCode ?? (okLine ? 0 : 1), stdout: out, stderr: errText, timedOut });
          }, 150);
        }
      }
    });
    child.stderr?.on("data", (b: Buffer) => {
      errText = (errText + b.toString("utf8")).slice(-KEEP_BYTES);
    });
    child.on("error", (e) => {
      finish({ code: null, stdout: out, stderr: errText, timedOut, error: e.message });
    });
    child.on("close", (code) => {
      finish({ code, stdout: out, stderr: errText, timedOut });
    });
  });
}

const failSchema = z.object({ ok: z.literal(false), error: z.string(), kind: z.string().optional() });

/** Spawn one verb and read its last stdout line through `schema` (the success shape). */
async function call<S extends z.ZodType>(verb: string, args: readonly string[], schema: S, timeoutMs: number): Promise<Result<z.output<S>>> {
  if (!canSpawnLocalBinaries()) return err("unavailable", `audio sidecar ${verb}: ${describePosture()}`);
  const r = await spawnSidecar([verb, ...args, "--json"], timeoutMs);
  if (r.error !== undefined) return err("unavailable", `audio sidecar ${verb}: ${python()} could not start: ${r.error}`);
  const said = stderrTail(r.stderr);
  if (r.timedOut) return err("unavailable", `audio sidecar ${verb} did not finish in ${Math.round(timeoutMs / 1000)} s and was stopped${said === "" ? "" : `: ${said}`}`);
  const line = lastLine(r.stdout);
  const failed = parseJsonAt(`audio sidecar ${verb}`, failSchema, line === "" ? "{}" : line);
  if (failed.ok) return err(failed.value.kind === "refused" ? "invalid" : "unavailable", `audio sidecar ${verb}: ${failed.value.error}`);
  const doc = parseJsonAt(`audio sidecar ${verb}`, schema, line === "" ? "{}" : line);
  if (doc.ok && r.code === 0) return ok(doc.value as z.output<S>);
  return err("unavailable", `audio sidecar ${verb} exited ${String(r.code)}${said === "" ? (doc.ok ? "" : `: ${doc.error.message}`) : `: ${said}`}`);
}

const measureObjSchema = z.object({
  integratedLufs: z.number().nullable(),
  truePeakDb: z.number().nullable(),
  lra: z.number().nonnegative().nullable(),
  clippedSamples: z.number().int().nonnegative(),
  leadSilenceS: z.number().nonnegative(),
  tailSilenceS: z.number().nonnegative(),
  durationS: z.number().nonnegative(),
});

const measureSchema = z.object({
  ok: z.literal(true),
  measure: measureObjSchema,
});

/** A finished song's tempo and key (pipeline/audio/analyze.py says how each is found) with measure's loudness. */
const analyzeObjSchema = z.object({
  durationS: z.number().nonnegative(),
  analysisRate: z.number().int().positive(),
  /** null: no beat was found. `alt` are the octave neighbours (half / double) inside 60..200 bpm. */
  tempo: z.object({ bpm: z.number().positive(), trackerBpm: z.number().positive(), alt: z.array(z.number().positive()), beats: z.number().int().nonnegative(), method: z.string() }).nullable(),
  /** null: no pitch content. `strength` is (r1 - r2) / (1 - r2) over the Krumhansl-Kessler correlations, 0..1. */
  key: z
    .object({ name: z.string(), strength: z.number().min(0).max(1), correlation: z.number(), runnerUp: z.object({ name: z.string(), correlation: z.number() }), method: z.string() })
    .nullable(),
  measure: measureObjSchema,
});
const analyzeSchema = z.object({ ok: z.literal(true), analyze: analyzeObjSchema });
export type AudioAnalysis = z.output<typeof analyzeObjSchema>;

const fxSchema = z.object({ ok: z.literal(true), durationS: z.number().nonnegative(), gainDb: z.number().optional() });

const doctorSchema = z.object({
  ok: z.literal(true),
  python: z.string(),
  modules: z.array(z.string()),
  missing: z.array(z.string()),
  errors: z.record(z.string(), z.string()).optional(),
});

const stemResultSchema = z.object({
  /** The track's id (its role when the spec gave none): unique per take, the stem's file name. */
  id: z.string().regex(TRACK_ID_RE),
  role: z.enum(SCORE_ROLES),
  instrument: z.string(),
  instrumentName: z.string(),
  /** What really made the sound, a cache hit included (the renderer keeps it beside the cached stem). */
  source: z.string(),
  /** A stand-in played this track (a missing sample folder or plugin); only when the request allowed it. */
  fallback: z.boolean(),
  wavPath: z.string(),
  midiPath: z.string(),
  sha256: z.string(),
  trackHash: z.string(),
  reused: z.boolean(),
  muted: z.boolean(),
  solo: z.boolean(),
  gainDb: z.number(),
  pan: z.number(),
  noteCount: z.number().int().nonnegative(),
  renderMs: z.number().int().nonnegative(),
  durationS: z.number().nonnegative(),
  integratedLufs: z.number().nullable(),
  truePeakDb: z.number().nullable(),
});

const determinismResultSchema = z.object({
  bitIdentical: z.boolean(),
  maxAbsDiff: z.number().nonnegative(),
  rmsDiff: z.number().nonnegative(),
  firstSha256: z.string(),
  secondSha256: z.string(),
});

const renderScoreAnswerSchema = z.object({
  ok: z.literal(true),
  title: z.string(),
  tempoBpm: z.number().positive(),
  key: z.string(),
  loop: z.boolean(),
  totalBars: z.number().int().positive(),
  durationS: z.number().nonnegative(),
  mixPath: z.string(),
  mixSha256: z.string(),
  reaperProjectPath: z.string(),
  measure: measureObjSchema,
  triage: triageSchema,
  stems: z.array(stemResultSchema),
  reusedIds: z.array(z.string()),
  renderedIds: z.array(z.string()),
  /** Kept one release beside the ids (stage S2); a role that repeats appears once per track. */
  reusedRoles: z.array(z.enum(SCORE_ROLES)),
  renderedRoles: z.array(z.enum(SCORE_ROLES)),
  totalRenderMs: z.number().int().nonnegative(),
  determinism: determinismResultSchema.nullable(),
});

export type RenderedStem = z.output<typeof stemResultSchema>;
export type DeterminismReport = z.output<typeof determinismResultSchema>;
export type RenderScoreResult = z.output<typeof renderScoreAnswerSchema>;
/** The render-score answer's shape, for the warm worker (./renderWorker.ts) to read its answers through. */
export { renderScoreAnswerSchema };

export type RenderScoreOptions = SidecarOptions & {
  readonly cacheDir?: string;
  readonly verifyDeterminism?: boolean;
  /** Absent = false: a track whose sample folder or plugin is missing is refused, naming the path, never played by a stand-in. */
  readonly allowFallback?: boolean;
};

const auditionAnswerSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
  name: z.string(),
  role: z.enum(SCORE_ROLES),
  source: z.string(),
  outPath: z.string().nullable(),
  /** A stand-in synth played the preview (stage S2: the renderer says so instead of substituting silently). */
  fallback: z.boolean().optional(),
  audition: z.object({
    status: z.enum(["ready", "refused"]),
    noteOnWorks: z.boolean(),
    lufsAtVel100: z.number().nullable(),
    truePeakDb: z.number().nullable(),
    tailS: z.number().nonnegative(),
    renderMs: z.number().int().nonnegative(),
    deterministic: z.boolean(),
    maxDiff: z.number().nonnegative(),
    refusalReason: z.string().nullable(),
  }),
});
export type AuditionResult = z.output<typeof auditionAnswerSchema>;

/** Loudness, true peak, range, clipping, edge silence and length of one audio file. */
export async function measureFile(path: string, opts: SidecarOptions = {}): Promise<Result<AudioMeasureFull>> {
  const r = await call("measure", ["--in", path], measureSchema, opts.timeoutMs ?? TIMEOUT_MS);
  return r.ok ? ok(r.value.measure) : r;
}

/** Tempo (with its octave neighbours), key and loudness of one finished song, librosa's (spark suno-advisor). */
export async function analyzeFile(path: string, opts: SidecarOptions = {}): Promise<Result<AudioAnalysis>> {
  const r = await call("analyze", ["--in", path], analyzeSchema, opts.timeoutMs ?? TIMEOUT_MS);
  return r.ok ? ok(r.value.analyze) : r;
}

/**
 * Render `chain` over `inPath` into `outPath` (16-bit WAV, the input's rate and channels, true
 * peak held at or under -1 dBTP).
 */
export async function applyChain(inPath: string, chain: FxChain, outPath: string, opts: SidecarOptions = {}): Promise<Result<{ readonly durationS: number }>> {
  if (!canSpawnLocalBinaries()) return err("unavailable", `audio sidecar fx: ${describePosture()}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-fxchain-"));
  try {
    const file = path.join(dir, "chain.json");
    await writeFile(file, JSON.stringify(chain), "utf8");
    const r = await call("fx", ["--in", inPath, "--chain", file, "--out", outPath], fxSchema, opts.timeoutMs ?? TIMEOUT_MS);
    return r.ok ? ok({ durationS: r.value.durationS }) : r;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The triage findings for one file, judged against the brief it was made from.
 */
export async function triageFile(file: string, context: TriageContext, opts: SidecarOptions = {}): Promise<Result<Triage>> {
  if (!canSpawnLocalBinaries()) return err("unavailable", `audio sidecar triage: ${describePosture()}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-triage-"));
  try {
    const ctx = path.join(dir, "context.json");
    await writeFile(ctx, JSON.stringify(context), "utf8");
    const r = await call("triage", ["--in", file, "--context", ctx], triageAnswerSchema, opts.timeoutMs ?? TIMEOUT_MS);
    return r.ok ? ok(r.value.triage as Triage) : r;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The cold `render-score` argument list for a spec file (the warm worker sends the same facts as JSON). */
export function renderScoreArgs(specFile: string, outDir: string, opts: RenderScoreOptions): string[] {
  const args = ["--spec", specFile, "--out-dir", outDir];
  if (opts.cacheDir !== undefined) args.push("--cache-dir", opts.cacheDir);
  if (opts.verifyDeterminism === true) args.push("--verify-determinism");
  if (opts.allowFallback === true) args.push("--allow-fallback");
  return args;
}

/**
 * Compile and render a closed ScoreSpec into per-track stems and a mastered -14 LUFS mix in a fresh
 * process. When `cacheDir` is passed, unchanged stems are reused bit-for-bit so changing one track
 * re-renders only that track (gain / pan / mute / solo re-render nothing: they are mix-time).
 * ./renderWorker.ts `renderScoreWarm` is the warm path; this is its fallback.
 */
export async function renderScore(specInput: ScoreSpec, outDir: string, opts: RenderScoreOptions = {}): Promise<Result<RenderScoreResult>> {
  const checked = parseScoreSpec(specInput);
  if (!checked.ok) return checked;
  if (!canSpawnLocalBinaries()) return err("unavailable", `audio sidecar render-score: ${describePosture()}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-scorespec-"));
  try {
    const specFile = path.join(dir, "spec.json");
    await writeFile(specFile, JSON.stringify(checked.value), "utf8");
    const r = await call("render-score", renderScoreArgs(specFile, outDir, opts), renderScoreAnswerSchema, opts.timeoutMs ?? RENDER_SCORE_TIMEOUT_MS);
    return r.ok ? ok(r.value as RenderScoreResult) : r;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Render a 2.4 s audition preview of one catalog instrument and measure its audition card.
 */
export async function auditionInstrument(instrumentId: string, outPath?: string, opts: SidecarOptions = {}): Promise<Result<AuditionResult>> {
  const cat = instrumentById(instrumentId); if (!cat || cat.audition.status !== "ready" || !cat.licence.trim()) return err("invalid", `audio sidecar audition: instrument ${instrumentId} refused: ${cat?.audition.refusalReason ?? "not ready"}`); const args = ["--instrument", instrumentId];
  if (outPath !== undefined) args.push("--out", outPath);
  const r = await call("audition-instrument", args, auditionAnswerSchema, opts.timeoutMs ?? TIMEOUT_MS);
  return r.ok ? ok(r.value as AuditionResult) : r;
}

const renderMidiAnswerSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
  name: z.string(),
  role: z.enum(SCORE_ROLES),
  source: z.string(),
  outPath: z.string(),
  fallback: z.boolean().optional(),
  sha256: z.string(),
  noteCount: z.number().int().nonnegative(),
  tempoBpm: z.number().positive(),
  renderMs: z.number().int().nonnegative(),
  durationS: z.number().nonnegative(),
  measure: measureObjSchema,
});
export type RenderMidiResult = z.output<typeof renderMidiAnswerSchema>;

/**
 * Render an SMF .mid file through a catalog instrument (A0 render verb) with peak protection.
 */
export async function renderMidi(
  midiPath: string,
  instrumentId: string,
  outPath: string,
  opts: SidecarOptions & { readonly brightness?: number } = {},
): Promise<Result<RenderMidiResult>> {
  const cat = instrumentById(instrumentId); if (!cat || cat.audition.status !== "ready" || !cat.licence.trim()) return err("invalid", `audio sidecar render: instrument ${instrumentId} refused: ${cat?.audition.refusalReason ?? "not ready"}`); const args = ["--midi", midiPath, "--instrument", instrumentId, "--out", outPath];
  if (opts.brightness !== undefined) args.push("--brightness", String(opts.brightness));
  const r = await call("render", args, renderMidiAnswerSchema, opts.timeoutMs ?? TIMEOUT_MS);
  return r.ok ? ok(r.value as RenderMidiResult) : r;
}

export const renderStem = renderMidi;

/**
 * Is the sidecar runnable here: which interpreter, and which of its modules import.
 */
export async function sidecarDoctor(): Promise<Result<{ readonly python: string; readonly modules: readonly string[] }>> {
  const r = await call("doctor", [], doctorSchema, DOCTOR_TIMEOUT_MS);
  if (!r.ok) return r;
  const { python: version, modules, missing, errors } = r.value;
  if (missing.length > 0) {
    const why = missing.map((m) => `${m} (${errors?.[m] ?? "did not import"})`).join(", ");
    return err("unavailable", `audio sidecar: ${python()} is missing ${why}; python -m pip install -r pipeline/requirements.txt`);
  }
  return ok({ python: version, modules });
}

export type { ScoreRole, ScoreSpec };

/** The bounded call and its default timeout, for ./sidecarPhrase.ts (the atlas phrase renders). */
export { call as sidecarCall, TIMEOUT_MS as SIDECAR_TIMEOUT_MS };
