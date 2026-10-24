import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import type { AudioMeasureFull } from "@gt/domain/audio.accept";
import { parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { FxChain } from "@gt/domain/audio.fx";
import { triageAnswerSchema, type Triage, type TriageContext } from "@gt/domain/audio.triage";

import { canSpawnLocalBinaries, describePosture } from "../deployment.ts";

// THE AUDIO SIDECAR, FROM NODE - the one door to pipeline/audio/sidecar.py (pedalboard +
// pyloudnorm on this box). Server-only by construction: it spawns a local binary, so it is
// reached only from producers and server code, never from a client module. docs/audio-sidecar.md
// is the operator's page (install, the stage map, what doctor reports).
//
// CONTRACT (the sidecar's stdout, LAST line, JSON):
//   python pipeline/audio/sidecar.py measure --in <wav> --json
//     -> {"ok":true,"measure":{integratedLufs,truePeakDb,lra,clippedSamples,leadSilenceS,tailSilenceS,durationS}}
//   python pipeline/audio/sidecar.py fx --in <wav> --chain <chain.json> --out <wav> --json
//     -> {"ok":true,"durationS":n,"gainDb":g,...}
//   any failure -> {"ok":false,"error":"<the tool's own sentence>","kind":...} and exit code 1.
// The interpreter is `PYTHON` or the platform default (lib/producers/forge.ts:76).
//
// Every call is BOUNDED - a timeout (60 s by default) and a cap on what is kept of stdout and
// stderr - and refuses before spawning when this deployment may not spawn a local binary
// (lib/deployment.ts), with that posture's own sentence. The sidecar's error is carried
// VERBATIM; a run that answered no JSON at all is reported with its exit and the last three
// lines of its stderr, which is where Python's traceback ends. The sidecar's `kind` picks the
// code: a chain or an argument it refused is `invalid`, everything else (a missing module, a
// decoder that said no, a timeout) is `unavailable` - the dependency, not the caller.

export type SidecarOptions = { readonly timeoutMs?: number };

const TIMEOUT_MS = 60_000;
const DOCTOR_TIMEOUT_MS = 30_000;
/** What is kept of each stream: the answer is one line at the end, the reason the last lines of stderr. */
const KEEP_BYTES = 64 * 1024;

export const SIDECAR_SCRIPT = path.join("pipeline", "audio", "sidecar.py");
const python = (): string => process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");

type Spawned = { readonly code: number | null; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean; readonly error?: string };

function spawnSidecar(args: readonly string[], timeoutMs: number): Promise<Spawned> {
  return new Promise((resolve) => {
    let out = "";
    let errText = "";
    let timedOut = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(python(), [path.resolve(SIDECAR_SCRIPT), ...args], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: null, stdout: "", stderr: "", timedOut, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout?.on("data", (b: Buffer) => {
      out = (out + b.toString("utf8")).slice(-KEEP_BYTES);
    });
    child.stderr?.on("data", (b: Buffer) => {
      errText = (errText + b.toString("utf8")).slice(-KEEP_BYTES);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout: out, stderr: errText, timedOut, error: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: out, stderr: errText, timedOut });
    });
  });
}

const lastLine = (s: string): string => s.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
const stderrTail = (s: string): string => s.trim().split(/\r?\n/).slice(-3).join(" | ");

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

const measureSchema = z.object({
  ok: z.literal(true),
  measure: z.object({
    integratedLufs: z.number().nullable(),
    truePeakDb: z.number().nullable(),
    lra: z.number().nonnegative().nullable(),
    clippedSamples: z.number().int().nonnegative(),
    leadSilenceS: z.number().nonnegative(),
    tailSilenceS: z.number().nonnegative(),
    durationS: z.number().nonnegative(),
  }),
});

const fxSchema = z.object({ ok: z.literal(true), durationS: z.number().nonnegative(), gainDb: z.number().optional() });

const doctorSchema = z.object({
  ok: z.literal(true),
  python: z.string(),
  modules: z.array(z.string()),
  missing: z.array(z.string()),
  errors: z.record(z.string(), z.string()).optional(),
});

/** Loudness, true peak, range, clipping, edge silence and length of one audio file. */
export async function measureFile(path: string, opts: SidecarOptions = {}): Promise<Result<AudioMeasureFull>> {
  const r = await call("measure", ["--in", path], measureSchema, opts.timeoutMs ?? TIMEOUT_MS);
  return r.ok ? ok(r.value.measure) : r;
}

/**
 * Render `chain` over `inPath` into `outPath` (16-bit WAV, the input's rate and channels, true
 * peak held at or under -1 dBTP). The chain goes to the sidecar as a temp file, never argv:
 * a Windows command line is 32 K and a quoted JSON on it is one escaping bug from a different
 * chain.
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
 * The triage findings for one file, judged against the brief it was made from (spark
 * audio-triage; @gt/domain/audio.triage holds the checks, units and thresholds). The context goes
 * to the sidecar as a temp file, never argv, for applyChain's reason. A check whose context was
 * not committed comes back `skip`, never guessed.
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

/**
 * Is the sidecar runnable here: which interpreter, and which of its modules import. A module
 * that does not import is a refusal naming it with Python's own sentence, so a caller that asks
 * first (the media-facts job's loudness port) knows why without spawning a measure per file.
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
