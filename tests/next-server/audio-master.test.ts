// THE UNIVERSAL MASTER, THROUGH ITS NODE DOOR (lib/audio/sidecarMaster.ts -> pipeline/audio/master.py).
// Every fixture is GENERATED here - a hot noise-and-tones mix, a quiet one with sharp transients that
// only reaches the target through the limiter, a 44.1 kHz source - and every master is RE-MEASURED by
// the sidecar's own `measure` verb, as the trial's acceptance is. The --adopt step runs against a temp
// SOUND_STORE_DIR and SOUND_LEDGER_PATH; nothing in the real stores is touched.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });

import { MASTER_TARGET } from "@gt/domain/release";

import { measureFile, SIDECAR_SCRIPT } from "../../lib/audio/sidecar.ts";
import { masterFile } from "../../lib/audio/sidecarMaster.ts";
import { comparePage, matchedVolume } from "../../lib/audio/masterCompare.ts";
import { adoptMaster, judge, matchTake, masterName } from "../../lib/audio/masterTrial.ts";

const PY = process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");
function probeSidecar(): string | null {
  const r = spawnSync(PY, [SIDECAR_SCRIPT, "doctor", "--json"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  const last = (r.stdout ?? "").trim().split(/\r?\n/).at(-1) ?? "";
  try {
    const d = JSON.parse(last) as { ok?: boolean; missing?: string[] };
    return d.ok === true && (d.missing ?? []).length === 0 ? null : `doctor answered ${last}`;
  } catch {
    return `${PY} did not run the sidecar`;
  }
}
const NOT_READY = probeSidecar();
if (NOT_READY !== null) console.warn(`audio-master lanes skipped: ${NOT_READY}`);

/** A 16-bit PCM WAV of interleaved stereo. */
function wav16(file: string, rate: number, l: Float32Array, r: Float32Array): void {
  const data = Buffer.alloc(l.length * 4);
  for (let i = 0; i < l.length; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((l[i] ?? 0) * 32767))), i * 4);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((r[i] ?? 0) * 32767))), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}

/** Deterministic noise (an LCG), so a failure reproduces. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  };
}

/** `seconds` of tones + noise, scaled so the sample peak is `peak`; `clicks` adds 2 ms bursts every 0.5 s. */
function mix(rate: number, seconds: number, peak: number, clicks: boolean, seed: number): [Float32Array, Float32Array] {
  const n = Math.round(rate * seconds);
  const rnd = noise(seed);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const tones = 0.5 * Math.sin(2 * Math.PI * 55 * t) + 0.3 * Math.sin(2 * Math.PI * 440 * t) + 0.15 * Math.sin(2 * Math.PI * 3300 * t);
    const env = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t);
    const burst = clicks && t % 0.5 < 0.002 ? 8 * rnd() : 0;
    l[i] = (tones * env + 0.25 * rnd() + burst) * (clicks ? 0.05 : 1);
    r[i] = (tones * env * 0.9 + 0.25 * rnd() + burst) * (clicks ? 0.05 : 1);
  }
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(l[i] ?? 0), Math.abs(r[i] ?? 0));
  for (let i = 0; i < n; i++) {
    l[i] = ((l[i] ?? 0) / max) * peak;
    r[i] = ((r[i] ?? 0) / max) * peak;
  }
  return [l, r];
}

let dir: string;
const at = (name: string): string => path.join(dir, name);
const prevEnv = { store: process.env["SOUND_STORE_DIR"], ledger: process.env["SOUND_LEDGER_PATH"] };
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-audio-master-"));
  process.env["SOUND_STORE_DIR"] = at("sound");
  process.env["SOUND_LEDGER_PATH"] = at("sound-ledger.json");
  const [hl, hr] = mix(48_000, 6, 0.999, false, 7);
  wav16(at("hot.wav"), 48_000, hl, hr);
  const [ql, qr] = mix(48_000, 6, 0.89, true, 11);
  wav16(at("peaky.wav"), 48_000, ql, qr);
  const [cl, cr] = mix(44_100, 5, 0.7, false, 13);
  wav16(at("cd.wav"), 44_100, cl, cr);
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  if (prevEnv.store === undefined) delete process.env["SOUND_STORE_DIR"];
  else process.env["SOUND_STORE_DIR"] = prevEnv.store;
  if (prevEnv.ledger === undefined) delete process.env["SOUND_LEDGER_PATH"];
  else process.env["SOUND_LEDGER_PATH"] = prevEnv.ledger;
});

const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

describe.skipIf(NOT_READY !== null)("master uni-1", () => {
  it("a hot source lands at -14 +/- 0.5 LUFS and <= -1 dBTP, re-measured on the written 24-bit 48 kHz file", async () => {
    const out = at(masterName(at("hot.wav"), "uni-1"));
    const m = must(await masterFile(at("hot.wav"), out, "uni-1"));
    expect(m.recipe).toBe("uni-1");
    expect(m.before.lufs).toBeGreaterThan(-10);
    const re = must(await measureFile(out));
    expect(judge(re, MASTER_TARGET)).toBeNull();
    expect(Math.abs((re.integratedLufs ?? 0) - -14)).toBeLessThanOrEqual(0.5);
    expect(re.truePeakDb ?? 0).toBeLessThanOrEqual(-1);
    expect(re.clippedSamples).toBe(0);
    const head = readFileSync(out).subarray(0, 36);
    expect(head.readUInt32LE(24)).toBe(48_000);
    expect(head.readUInt16LE(22)).toBe(2);
    expect(head.readUInt16LE(34)).toBe(24);
  });

  it("a quiet source with transients reaches the target only through the limiter, and the peaks stay under the ceiling", async () => {
    const out = at("peaky.uni-1.wav");
    const m = must(await masterFile(at("peaky.wav"), out, "uni-1"));
    expect(m.limitDb).toBeGreaterThan(1);
    const re = must(await measureFile(out));
    expect(judge(re, MASTER_TARGET)).toBeNull();
  });

  it("a 44.1 kHz source is resampled to 48 kHz", async () => {
    const out = at("cd.uni-1.wav");
    must(await masterFile(at("cd.wav"), out, "uni-1"));
    expect(readFileSync(out).readUInt32LE(24)).toBe(48_000);
    expect(judge(must(await measureFile(out)), MASTER_TARGET)).toBeNull();
  });

  it("an unknown recipe and a master over its own source are refused, in the sidecar's words", async () => {
    const r1 = await masterFile(at("hot.wav"), at("x.wav"), "uni-9" as "uni-1");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.message).toMatch(/unknown master recipe 'uni-9'/);
    const r2 = await masterFile(at("hot.wav"), at("hot.wav"), "uni-1");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.message).toMatch(/overwrite its source/);
  });

  it("--adopt files the master as a kept `remaster` child of the matching take, in a temp store", async () => {
    const { createTake, listTakes } = await import("../../lib/sound/takes.ts");
    const { take: parent } = await createTake({ title: "hot", origin: "suno-return", provider: "suno" }, { bytes: new Uint8Array(readFileSync(at("hot.wav"))), mime: "audio/wav", name: "hot.wav" });
    const m = must(await masterFile(at("hot.wav"), at("hot.uni-1.wav"), "uni-1"));
    const a = await adoptMaster(at("hot.wav"), m);
    expect(a.error).toBeNull();
    expect(a.parentId).toBe(parent.id);
    const child = (await listTakes()).find((t) => t.id === a.takeId);
    expect(child).toMatchObject({ parentId: parent.id, stage: "remaster", verdict: "kept", origin: "suno-return", fileName: "hot.uni-1.wav" });
    expect("error" in matchTake(await listTakes(), at("nothing-like-it.wav"))).toBe(true);
  });
});

describe("comparison page", () => {
  it("plays the original and every recipe side by side, matched to the quietest, from disk only", () => {
    const before = { lufs: -16, truePeakDb: -3, lra: 8 };
    const row = (recipe: "uni-1" | "uni-2", lufs: number) => ({
      title: "Song <1>",
      input: path.join(tmpdir(), "src", "Song.wav"),
      output: path.join(tmpdir(), "out", `Song.${recipe}.wav`),
      master: { recipe, input: "i", output: "o", before, after: { lufs, truePeakDb: -1.2, lra: 6 }, ms: 1, limitDb: 0, passes: 1 },
      remeasure: { integratedLufs: lufs, truePeakDb: -1.2, lra: 6, clippedSamples: 0 },
      gainDb: lufs - before.lufs,
      pass: true,
      error: null,
      adopt: null,
    });
    const page = comparePage(
      {
        at: "2026-11-16T00:00:00Z",
        target: { lufs: -14, truePeakDb: -1, tolLu: 0.5 },
        recipes: ["uni-1", "uni-2"],
        totalMs: 1,
        tracks: [{ title: "Song <1>", input: path.join(tmpdir(), "src", "Song.wav"), before, versions: [{ recipe: "uni-1", row: row("uni-1", -14) }, { recipe: "uni-2", row: row("uni-2", -14) }] }],
      },
      path.join(tmpdir(), "out"),
    );
    // the original (-16) is the quietest: it plays at 1, each -14 master is turned down 2 dB
    expect(page).toContain('src="Song.uni-1.wav" data-matched="' + (10 ** (-2 / 20)).toFixed(4) + '"');
    expect(page).toContain('src="Song.uni-2.wav"');
    expect(page).toMatch(/src="file:\/\/\/[^"]*Song\.wav" data-matched="1\.0000"/);
    expect(page).toContain("Song &#60;1&#62;");
    expect(page).toContain('value="delivered"');
    expect(page).not.toMatch(/https?:\/\//);
  });

  it("never turns a version up, and leaves an unmeasured one alone", () => {
    expect(matchedVolume(-14, -16)).toBeCloseTo(10 ** (-2 / 20), 6);
    expect(matchedVolume(-16, -16)).toBe(1);
    expect(matchedVolume(null, -16)).toBe(1);
  });
});
