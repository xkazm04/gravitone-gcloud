// A REFERENCE'S FOUR LAYERS (lib/audio/layers.ts): a generated two-tone track - 60 Hz under 4 kHz -
// split by ffmpeg lands each tone in its own band, the shares say so, and every layer comes back
// as a WAV a browser can play. Skips where ffmpeg is not on the PATH.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { bandChain, LAYER_BANDS, percents } from "../../packages/ui/src/components/audio/layers.ts";
import { layersOf, wavOf } from "../../lib/audio/layers.ts";

const FF = process.env["FFMPEG"] ?? "ffmpeg";
const ready = spawnSync(FF, ["-version"], { windowsHide: true }).status === 0;
const TMP = mkdtempSync(path.join(tmpdir(), "gt-layers-"));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("the layers' arithmetic", () => {
  test("percents add to a hundred and keep their order", () => {
    expect(percents([0.7, 0.26, 0.03, 0.01])).toEqual([70, 26, 3, 1]);
    expect(percents([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(percents([0, 0])).toEqual([0, 0]);
  });

  test("a band's chain is 24 dB/oct at each closed edge", () => {
    expect(bandChain(LAYER_BANDS[0]!)).toBe("lowpass=f=150,lowpass=f=150");
    expect(bandChain(LAYER_BANDS[2]!)).toBe("highpass=f=2000,highpass=f=2000,lowpass=f=6000,lowpass=f=6000");
  });
});

describe.skipIf(!ready)("a two-tone track, split", () => {
  test("60 Hz lands in low, 4 kHz in bite, and each layer is a playable WAV", async () => {
    const rate = 44_100;
    const x = new Float32Array(rate * 20);
    for (let i = 0; i < x.length; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 60 * i) / rate) + 0.3 * Math.sin((2 * Math.PI * 4000 * i) / rate);
    const file = path.join(TMP, "two-tone.wav");
    writeFileSync(file, wavOf(x, rate, 1));
    const r = await layersOf(file, 20, FF);
    if (!r.ok) throw new Error(r.error.message);
    const by = Object.fromEntries(r.value.map((l) => [l.id, l]));
    expect(by["low"]!.share).toBeGreaterThan(0.4);
    expect(by["bite"]!.share).toBeGreaterThan(0.4);
    expect(by["body"]!.share + by["air"]!.share).toBeLessThan(0.05);
    for (const l of r.value) expect(Buffer.from(l.href.replace("data:audio/wav;base64,", ""), "base64").subarray(0, 4).toString("latin1")).toBe("RIFF");
  });

  test("a file ffmpeg cannot read is refused in ffmpeg's words, not thrown", async () => {
    const bad = path.join(TMP, "not-audio.wav");
    writeFileSync(bad, "not audio");
    const r = await layersOf(bad, 20, FF);
    expect(r.ok).toBe(false);
  });
});
