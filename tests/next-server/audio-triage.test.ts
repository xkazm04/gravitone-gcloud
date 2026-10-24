// THE TRIAGE DETECTORS, THROUGH THE NODE DOOR (lib/audio/sidecar.ts triageFile ->
// pipeline/audio/sidecar.py triage -> pipeline/audio/triage.py + triage_detect.py). One exact case
// per check on a GENERATED signal whose defect is known by construction - a 12-sample clip run at
// 3 s, a 1.5 s gap at 4 s, a click track that steps 120 -> 126 bpm, three timbres changing at 8 s
// and 16 s, a loop 6 dB quieter at its end than at its start, a right channel that is the left
// inverted - each beside its clean twin, so a detector that flags everything is as red as one that
// flags nothing. The signals are built in ./audio-triage-harness.ts and written as 16-bit WAV in a
// temp directory; nothing binary is committed and no store is opened.
//
// The detector lanes SKIP, saying why, when `doctor` finds this box's Python without the sidecar's
// requirements. The threshold-parity lane needs only a Python: pipeline/audio/triage.py keeps its
// own copy of TRIAGE_THRESHOLDS (the CLI takes no thresholds and the context is strict - its header
// says why), and this is the test that holds the two copies equal.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Each case spawns Python and decodes a file; a loaded box under the full parallel run is slow.
vi.setConfig({ testTimeout: 60_000 });

import { CHECK_DEFECT, TRIAGE_CHECKS, TRIAGE_THRESHOLDS, TRIAGE_VERSION, UNITS, type Finding, type TriageCheck, type TriageContext } from "@gt/domain/audio.triage";

import { SIDECAR_SCRIPT, triageFile } from "../../lib/audio/sidecar.ts";

import { R, wav16, signal, dbfs, sine, chord, concat, neg, clicks, syllables, drumLoop, type Signal } from "./audio-triage-harness.ts";

const PY = process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");

function probeSidecar(): string | null {
  const r = spawnSync(PY, [SIDECAR_SCRIPT, "doctor", "--json"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  const last = (r.stdout ?? "").trim().split(/\r?\n/).at(-1) ?? "";
  try {
    const d = JSON.parse(last) as { ok?: boolean; missing?: string[] };
    if (d.ok !== true) return `doctor answered ${last}`;
    return (d.missing ?? []).length === 0 ? null : `${PY} lacks ${(d.missing ?? []).join(", ")} (pip install -r pipeline/requirements.txt)`;
  } catch {
    return `${PY} did not run the sidecar: ${(r.error?.message ?? r.stderr ?? "").trim().slice(-200)}`;
  }
}
const NOT_READY = probeSidecar();
if (NOT_READY !== null) console.warn(`audio-triage detector lanes skipped: ${NOT_READY}`);

/** Three planned sections, the second starting at `b1` ms and the third at `b2`. */
const plan = (b1: number, b2: number): NonNullable<TriageContext["sections"]> => [
  { name: "intro", startMs: 0, endMs: b1 },
  { name: "verse", startMs: b1, endMs: b2 },
  { name: "chorus", startMs: b2, endMs: 24_000 },
];

let dir: string;
const file = (name: string): string => path.join(dir, `${name}.wav`);

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-audio-triage-"));
  const clipped = sine(10, 0.5);
  clipped.fill(1, 3 * R, 3 * R + 12);
  const write: Record<string, Signal[]> = {
    clean: [sine(10), sine(10)],
    clipped: [clipped, clipped],
    // fs/4 at 45 degrees: every sample sits at 0.707 of the crest, so the overs are BETWEEN samples
    "tp-over": [signal(10, (t) => dbfs(0.8) * Math.sin(2 * Math.PI * (R / 4) * t + Math.PI / 4))],
    "tp-under": [signal(10, (t) => dbfs(-0.8) * Math.sin(2 * Math.PI * (R / 4) * t + Math.PI / 4))],
    quiet: [sine(10, dbfs(-45), 1000), sine(10, dbfs(-45), 1000)],
    silence: [new Float64Array(R * 3)],
    gap: [concat(sine(4), new Float64Array(R * 1.5), sine(4.5))],
    twelve: [sine(12)],
    fade: [signal(10, (t) => 0.3 * Math.sin(2 * Math.PI * 440 * t) * Math.min(1, Math.max(0, (10 - t) / 2)))],
    steady: [clicks(24, () => 120)],
    drift: [clicks(24, (t) => (t < 8 ? 120 : t >= 16 ? 126 : 120 + (6 * (t - 8)) / 8))],
    sections: [concat(chord(8, [220, 277, 330]), chord(8, [880, 1100, 1320]), chord(8, [150, 3000, 3600]))],
    pad: [chord(24, [220, 277, 330])],
    // 440 Hz x 4 s is a whole number of cycles: the wrap is the waveform continuing
    seamless: [sine(4)],
    // 440.0625 Hz x 4 s ends a quarter-cycle past whole: the wrap jumps from the crest to zero
    "seam-jump": [signal(4, (t) => 0.3 * Math.sin(2 * Math.PI * 440.0625 * t))],
    "drum-loop": [drumLoop()],
    "drum-loop-level": [drumLoop((t) => (-6 * t) / 16)],
    "drum-loop-hats": [drumLoop(undefined, (t) => (-8 * t) / 16)],
    voice: [syllables(10, 5)],
    "voice-cut": [syllables(10, 5, 0.2 + 9 * 0.45 + 0.15)],
    // a held tone that has begun a 10 dB fall (40 dB/s) when the file stops: an ending, not a cut
    falling: [signal(3, (t) => 0.3 * Math.sin(2 * Math.PI * 440 * t) * dbfs(t < 2.75 ? 0 : (-10 * (t - 2.75)) / 0.25))],
    inverted: [sine(10), neg(sine(10))],
  };
  write["tail"] = [concat(write["fade"]?.[0] ?? new Float64Array(), new Float64Array(R * 4))];
  for (const [name, channels] of Object.entries(write)) wav16(file(name), channels);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Seen = { readonly flagged: number; readonly by: (c: TriageCheck) => Finding };

// One spawn per (file, context): several cases read different checks of the same answer.
const seen = new Map<string, Promise<Seen>>();
function triage(name: string, context: TriageContext): Promise<Seen> {
  const key = `${name} ${JSON.stringify(context)}`;
  const hit = seen.get(key) ?? judged(name, context);
  hit.catch(() => undefined); // a prefetch is awaited later; its rejection is that await's, not unhandled
  seen.set(key, hit);
  return hit;
}

async function judged(name: string, context: TriageContext): Promise<Seen> {
  const r = await triageFile(file(name), context);
  if (!r.ok) throw r.error;
  const t = r.value;
  expect(t.version).toBe(TRIAGE_VERSION);
  expect(t.findings.map((f) => f.check)).toEqual([...TRIAGE_CHECKS]);
  expect(t.flagged).toBe(t.findings.filter((f) => f.verdict === "flag").length);
  for (const f of t.findings) {
    expect(f.unit).toBe(UNITS[f.check]);
    expect(f.defect).toBe((CHECK_DEFECT as Partial<Record<TriageCheck, string>>)[f.check]);
    if (f.verdict === "skip") expect([f.value, typeof f.note]).toEqual([null, "string"]);
  }
  return { flagged: t.flagged, by: (c) => t.findings.find((f) => f.check === c) as Finding };
}

const near = (f: Finding, value: number, tolerance: number): void => {
  expect(f.value).not.toBeNull();
  expect(Math.abs((f.value ?? Number.NaN) - value)).toBeLessThanOrEqual(tolerance);
};

describe.skipIf(NOT_READY !== null)("technical checks", () => {
  it("clipping: a 12-sample run at full scale at 3.000 s flags, a clean sine has none", async () => {
    void triage("clean", { kind: "music" });
    const c = (await triage("clipped", { kind: "music" })).by("clipping");
    expect(c).toMatchObject({ verdict: "flag", value: 12, threshold: 3, atS: 3 });
    expect((await triage("clean", { kind: "music" })).by("clipping")).toMatchObject({ verdict: "pass", value: 0 });
  });

  it("true-peak-over: a 12 kHz tone with its crest at +0.8 dBTP between samples flags (read +0.91 - the 4x Kaiser oversampler over-reads by ~0.1 dB there); at -0.8 it passes", async () => {
    void triage("tp-under", { kind: "sfx" });
    const over = (await triage("tp-over", { kind: "sfx" })).by("true-peak-over");
    expect(over).toMatchObject({ verdict: "flag", threshold: 0 });
    near(over, 0.9, 0.12);
    expect((await triage("tp-over", { kind: "sfx" })).by("clipping").value).toBe(0); // no sample reaches full scale
    const under = (await triage("tp-under", { kind: "sfx" })).by("true-peak-over");
    expect(under.verdict).toBe("pass");
    near(under, -0.7, 0.12);
  });

  it("loudness-range: -45 LUFS flags against music's -30 floor; -20 passes; silence flags with no number", async () => {
    void triage("silence", { kind: "music" });
    const q = (await triage("quiet", { kind: "music" })).by("loudness-range");
    expect(q).toMatchObject({ verdict: "flag", threshold: -30 });
    near(q, -45, 0.2);
    const ok = (await triage("clean", { kind: "music" })).by("loudness-range");
    expect(ok.verdict).toBe("pass");
    const s = await triage("silence", { kind: "music" });
    expect(s.by("loudness-range")).toMatchObject({ verdict: "flag", value: null });
    expect(s.by("true-peak-over")).toMatchObject({ verdict: "skip", note: "no signal" });
  });

  it("dead-air: a 1.5 s gap at 4.0 s flags for voice and sfx (bar 1.5 s) and passes for music (bar 2 s)", async () => {
    for (const kind of ["voice", "sfx", "music"] as const) void triage("gap", { kind });
    void triage("tail", { kind: "music" });
    for (const kind of ["voice", "sfx"] as const) expect((await triage("gap", { kind })).by("dead-air")).toMatchObject({ verdict: "flag", value: 1.5, threshold: 1.5, atS: 4 });
    expect((await triage("gap", { kind: "music" })).by("dead-air")).toMatchObject({ verdict: "pass", value: 1.5, threshold: 2 });
    // lead and tail are not inside the take: a long silent tail is not dead air
    expect((await triage("tail", { kind: "music" })).by("dead-air")).toMatchObject({ verdict: "pass", value: 0 });
  });

  it("duration: 12 s against an asked 10 s is 0.2 off - flags for music (0.1), passes for voice (0.35)", async () => {
    void triage("twelve", { kind: "voice", durationS: 10 });
    void triage("twelve", { kind: "music", durationS: 12 });
    expect((await triage("twelve", { kind: "music", durationS: 10 })).by("duration")).toMatchObject({ verdict: "flag", value: 0.2, threshold: 0.1 });
    expect((await triage("twelve", { kind: "voice", durationS: 10 })).by("duration")).toMatchObject({ verdict: "pass", value: 0.2, threshold: 0.35 });
    expect((await triage("twelve", { kind: "music", durationS: 12 })).by("duration")).toMatchObject({ verdict: "pass", value: 0 });
  });
});

describe.skipIf(NOT_READY !== null)("structural checks", () => {
  it("broken-ending: a hard cut at body level flags at 10 s; a natural 2 s fade passes; the fade then 4 s of silence flags its tail", async () => {
    for (const name of ["fade", "tail"]) void triage(name, { kind: "music" });
    const cut = (await triage("clean", { kind: "music" })).by("broken-ending");
    expect(cut).toMatchObject({ defect: "broken-ending", verdict: "flag", threshold: -12, atS: 10 });
    near(cut, 0, 0.3);
    const fade = (await triage("fade", { kind: "music" })).by("broken-ending");
    expect(fade.verdict).toBe("pass");
    near(fade, -36.4, 1); // the last audible 10 ms frame, 45 dB under the take's loud frames, against the fade's median
    const tail = (await triage("tail", { kind: "music" })).by("broken-ending");
    expect(tail).toMatchObject({ verdict: "flag", note: "silent tail 4.0 s" });
    near(tail, -36.4, 1); // the ending itself is still a fade
  });

  it("broken-ending: a spoken take whose last syllable releases passes; the same take cut mid-vowel flags; a tone already falling 40 dB/s when the file stops passes as an ending", async () => {
    for (const name of ["voice-cut", "falling"]) void triage(name, { kind: "voice" });
    const voice = (await triage("voice", { kind: "voice" })).by("broken-ending");
    expect(voice.verdict).toBe("pass");
    near(voice, -37.8, 1.5);
    const cut = (await triage("voice-cut", { kind: "voice" })).by("broken-ending");
    expect(cut).toMatchObject({ verdict: "flag", atS: 4.4 });
    near(cut, 0, 1);
    const falling = (await triage("falling", { kind: "voice" })).by("broken-ending");
    expect(falling.verdict).toBe("pass");
    expect(falling.value ?? -99).toBeGreaterThanOrEqual(-12); // at body level by value - the fall is what passes it
    expect(falling.note).toMatch(/^falling \d+ dB\/s over its last 300 ms$/);

  });

  it("tempo-instability: a click track stepping 120 -> 126 bpm flags ~6 bpm; a steady 120 passes; a pad has no pulse to judge", async () => {
    for (const name of ["steady", "pad"]) void triage(name, { kind: "music" });
    const drift = (await triage("drift", { kind: "music" })).by("tempo-instability");
    expect(drift).toMatchObject({ defect: "tempo-instability", verdict: "flag", threshold: 3 });
    near(drift, 6, 0.5);
    const steady = (await triage("steady", { kind: "music" })).by("tempo-instability");
    expect(steady.verdict).toBe("pass");
    near(steady, 0, 0.5);
    expect(steady.note).toBe("first third 120.0 bpm, last third 120.0 bpm");
    expect((await triage("pad", { kind: "music" })).by("tempo-instability")).toMatchObject({ verdict: "skip", note: "no steady pulse" });
  });

  it("section-boundary: three timbres changing at 8 s and 16 s pass a plan at 8/16 and flag a plan at 8/20 by ~4 s at 20 s; one timbre throughout flags with no number", async () => {
    void triage("sections", { kind: "music", sections: plan(8000, 20_000) });
    void triage("pad", { kind: "music", sections: plan(8000, 16_000) });
    const on = (await triage("sections", { kind: "music", sections: plan(8000, 16_000) })).by("section-boundary");
    expect(on).toMatchObject({ defect: "off-brief", verdict: "pass", threshold: 2 });
    near(on, 0, 0.25);
    const off = (await triage("sections", { kind: "music", sections: plan(8000, 20_000) })).by("section-boundary");
    expect(off).toMatchObject({ verdict: "flag", atS: 20 });
    near(off, 4, 0.25);
    expect((await triage("pad", { kind: "music", sections: plan(8000, 16_000) })).by("section-boundary")).toMatchObject({ verdict: "flag", value: null, note: "no section change found" });
  });

  it("loop-seam: a drum loop starting on its downbeat passes; the same loop drifting 6 dB down, or its hats 8 dB down, across its length flags at the wrap", async () => {
    for (const name of ["drum-loop-level", "drum-loop-hats"]) void triage(name, { kind: "music", loop: true });
    const clean = (await triage("drum-loop", { kind: "music", loop: true })).by("loop-seam");
    expect(clean).toMatchObject({ defect: "loop-seam", verdict: "pass", threshold: 3, atS: 16 });
    expect(clean.value ?? 99).toBeLessThan(1); // 0.52: a seamless join reads ~0 though its first and last 100 ms differ by ~10 dB
    const level = (await triage("drum-loop-level", { kind: "music", loop: true })).by("loop-seam");
    expect(level).toMatchObject({ verdict: "flag", note: expect.stringMatching(/^drift across 8 repeats of 2\.00 s: level 6\.0 dB/) });
    near(level, 6, 0.3);
    const hats = (await triage("drum-loop-hats", { kind: "music", loop: true })).by("loop-seam");
    expect(hats).toMatchObject({ verdict: "flag", note: expect.stringMatching(/level 0\.\d dB, spectrum 8\.0 dB/) });
    near(hats, 8, 0.3);
  });

  it("loop-seam: a whole-cycle tone loop passes; one a quarter-cycle off jumps at the wrap and flags on the waveform", async () => {
    void triage("seam-jump", { kind: "sfx", loop: true });
    const seamless = await triage("seamless", { kind: "sfx", loop: true });
    expect(seamless.by("loop-seam").verdict).toBe("pass");
    expect(seamless.by("broken-ending")).toMatchObject({ verdict: "skip", note: "briefed as a loop: its end is its seam" });
    const jump = (await triage("seam-jump", { kind: "sfx", loop: true })).by("loop-seam");
    expect(jump.verdict).toBe("flag");
    // the value IS the waveform term: crest (0.3) to zero against a 440 Hz step of ~0.017 is ~+25 dB
    const said = Number(/waveform jump \+([\d.]+) dB/.exec(jump.note ?? "")?.[1]);
    expect(said).toBeGreaterThan(20);
    near(jump, said, 0.06);

  });

  it("mono-fold: a right channel that is the left inverted flags (it folds to silence); identical channels lose 0 dB; a mono file skips", async () => {
    for (const name of ["clean", "fade"]) void triage(name, { kind: "music" });
    expect((await triage("inverted", { kind: "music" })).by("mono-fold")).toMatchObject({ defect: "phase-width", verdict: "flag", value: null, threshold: 3 });
    expect((await triage("clean", { kind: "music" })).by("mono-fold")).toMatchObject({ verdict: "pass", value: 0 });
    expect((await triage("fade", { kind: "music" })).by("mono-fold")).toMatchObject({ verdict: "skip", note: "mono file" });
  });
});

describe.skipIf(NOT_READY !== null)("context that was never committed", () => {
  it("every context-bound check skips with its note, and nothing skipped carries a value", async () => {
    void triage("drift", { kind: "voice", sections: [{ name: "all", startMs: 0, endMs: 24_000 }] });
    const t = await triage("drift", { kind: "sfx" });
    expect(t.by("duration")).toMatchObject({ verdict: "skip", note: "no asked length" });
    expect(t.by("tempo-instability")).toMatchObject({ verdict: "skip", note: "sfx, not music" });
    expect(t.by("section-boundary")).toMatchObject({ verdict: "skip", note: "no section boundaries planned" });
    expect(t.by("loop-seam")).toMatchObject({ verdict: "skip", note: "not briefed as a loop" });
    expect((await triage("drift", { kind: "voice", sections: [{ name: "all", startMs: 0, endMs: 24_000 }] })).by("section-boundary").verdict).toBe("skip");
  });

  it("the clipped take's findings add up: flagged is the count of flags", async () => {
    const t = await triage("clipped", { kind: "music", durationS: 10 });
    // clipping, true peak (the clipped run overshoots between samples), the hard cut at the end
    expect(t.flagged).toBe(3);
    expect(["clipping", "true-peak-over", "broken-ending"].map((c) => t.by(c as TriageCheck).verdict)).toEqual(["flag", "flag", "flag"]);
  });

  it("a context that invents a key is refused by the sidecar as `invalid`, in the door's path spelling", async () => {
    const r = await triageFile(file("clean"), { kind: "sfx", loopy: true } as unknown as TriageContext);
    expect(r.ok ? null : [r.error.code, r.error.message]).toEqual(["invalid", "audio sidecar triage: context (root): unrecognized key 'loopy'"]);
    const s = await triageFile(file("clean"), { kind: "music", sections: [{ name: "a", startMs: -1, endMs: 10 }] });
    expect(s.ok ? null : s.error.message).toBe("audio sidecar triage: context sections.0.startMs: expected a non-negative number, got -1");
  });
});

// ---- the two threshold tables (needs a Python, not the sidecar's modules)

const PY_DUMP = [
  "import json, sys",
  "sys.path.insert(0, 'pipeline/audio')",
  "import triage",
  "print(json.dumps({'version': triage.TRIAGE_VERSION, 'checks': list(triage.TRIAGE_CHECKS), 'thresholds': triage.THRESHOLDS, 'units': triage.UNITS, 'defects': triage.CHECK_DEFECT}))",
].join("\n");

describe("pipeline/audio/triage.py holds @gt/domain's table, exactly", () => {
  const r = spawnSync(PY, ["-c", PY_DUMP], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  const noPython = r.status === 0 ? null : `${PY} did not dump the table: ${(r.error?.message ?? r.stderr ?? "").trim().slice(-200)}`;
  it.skipIf(noPython !== null)("thresholds per kind, units, defect codes, the check order and the version are the same in both", () => {
    const py = JSON.parse((r.stdout ?? "").trim().split(/\r?\n/).at(-1) ?? "{}") as Record<string, unknown>;
    expect(py).toEqual({ version: TRIAGE_VERSION, checks: [...TRIAGE_CHECKS], thresholds: TRIAGE_THRESHOLDS, units: UNITS, defects: CHECK_DEFECT });
  });
});
