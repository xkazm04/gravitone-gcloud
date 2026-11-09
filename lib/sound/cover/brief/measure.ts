import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

// THE BRIEF'S MEASUREMENTS (cover brief WP-A): pipeline/track-mirror/analyze.py over the cover's source, run by the
// track-mirror venv's interpreter - this app's own PYTHON has no librosa. Spawned WITHOUT a shell, its arguments whole
// (repo law: a shell split a prompt at its first space once). The report is the analyzer's own JSON, kept whole; the
// door below reads only what the brief leans on - the length and the section boundaries the writer picks from.

export const TRACK_MIRROR_PYTHON = "TRACK_MIRROR_PYTHON";
export const ANALYZE_PY = path.join("pipeline", "track-mirror", "analyze.py");

/** The interpreter: the env var's, else the venv the track-mirror session built (pipeline/track-mirror/render.py's default). */
export function trackMirrorPython(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const set = env[TRACK_MIRROR_PYTHON]?.trim();
  return set !== undefined && set !== "" ? set : path.join(os.homedir(), "ai", "tools", "track-mirror-venv", "Scripts", "python.exe");
}

export type SpawnOut = { readonly code: number | null; readonly stderr: string };
/** One process, no shell: what a test replaces. */
export type Spawn = (bin: string, args: readonly string[], timeoutMs: number) => Promise<SpawnOut>;

const MEASURE_TIMEOUT_MS = 15 * 60_000;

export const spawnNoShell: Spawn = (bin, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(bin, [...args], { shell: false, windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (e, _stdout, stderr) => {
      const code = e === null ? 0 : typeof (e as { code?: unknown }).code === "number" ? ((e as { code: number }).code) : null;
      resolve({ code, stderr: String(stderr ?? "") || (e?.message ?? "") });
    });
  });

const sectionRow = z.looseObject({ start: z.number().min(0), end: z.number().min(0) });
/** What the brief reads of the analyzer's report; every other key is kept as the analyzer wrote it. */
export const measureReportSchema = z.looseObject({
  duration_s: z.number().positive(),
  tempo: z.looseObject({ bpm: z.number() }),
  key: z.looseObject({ key: z.string().nullable() }),
  sections: z.array(sectionRow),
});
export type MeasureReport = {
  readonly duration_s: number;
  readonly tempo: { readonly bpm: number };
  readonly key: { readonly key: string | null };
  readonly sections: readonly { readonly start: number; readonly end: number }[];
};

export function parseMeasureReport(text: string): Result<MeasureReport> {
  const r = parseJsonAt("measure", measureReportSchema, text);
  return r.ok ? ok(r.value as unknown as MeasureReport) : r;
}

const tail = (s: string): string => s.trim().split(/\r?\n/).slice(-6).join("\n").slice(-1500);

/** Measure one file: the report's text and its door's reading, or the refusal in words. */
export async function measureSong(sourceAbs: string, o: { readonly python?: string; readonly spawn?: Spawn; readonly cwd?: string } = {}): Promise<Result<{ readonly text: string; readonly report: MeasureReport }>> {
  const python = o.python ?? trackMirrorPython();
  if (!existsSync(python)) return err("unavailable", `the measuring interpreter ${python} is not there: set ${TRACK_MIRROR_PYTHON} to a Python that has librosa (pipeline/track-mirror/analyze.py)`);
  const script = path.join(o.cwd ?? process.cwd(), ANALYZE_PY);
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-cover-measure-"));
  try {
    const out = path.join(dir, "measure.json");
    const r = await (o.spawn ?? spawnNoShell)(python, ["-I", script, sourceAbs, out], MEASURE_TIMEOUT_MS);
    if (r.code !== 0) return err("internal", `analyze.py exited ${r.code ?? "without a code"}: ${tail(r.stderr) || "no sentence on stderr"}`);
    if (!existsSync(out)) return err("internal", "analyze.py exited 0 and wrote no report");
    const text = await readFile(out, "utf8");
    const report = parseMeasureReport(text);
    return report.ok ? ok({ text, report: report.value }) : report;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
