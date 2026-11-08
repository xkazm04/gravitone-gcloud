// THE FIXTURE'S SOUND (./fixture.ts): a little tune written as a WAV, in the browser. No file, no store.
const RATE = 16_000;
const NOTES = [220, 246.9, 277.2, 329.6, 370, 440, 493.9, 554.4];

/** A 16-bit mono WAV of a little tune: phrases of eighth notes, louder in its middle third, the timbre the seed's.
 *  Past `phraseS` the tune repeats under a slow swell, so a five-minute song costs a copy, not a synth. */
export function wav(seconds: number, seed: number, rate = RATE, phraseS = seconds): string {
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  const beat = 0.25;
  const bright = 1 + (seed % 4);
  const pn = Math.min(n, Math.floor(phraseS * rate));
  const phrase = new Float32Array(pn);
  for (let i = 0; i < pn; i++) {
    const t = i / rate;
    const k = Math.floor(t / beat);
    const f = NOTES[(k * 3 + Math.floor(k / 8) + seed) % NOTES.length] ?? 220;
    const inNote = (t % beat) / beat;
    const env = Math.exp(-inNote * 4) * (0.35 + 0.65 * Math.abs(Math.sin((t / phraseS) * Math.PI * 1.5)));
    let s = 0;
    for (let h = 1; h <= bright; h++) s += Math.sin(2 * Math.PI * f * h * t) / h;
    const kick = t % 1 < 0.08 ? Math.sin(2 * Math.PI * 55 * t) * (1 - (t % 1) / 0.08) : 0;
    phrase[i] = s * env * 0.3 + kick * 0.5;
  }
  const swells = pn < n;
  for (let i = 0; i < n; i++) {
    const swell = swells ? 0.45 + 0.55 * Math.abs(Math.sin((i / n) * Math.PI * 3)) : 1;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, (phrase[i % pn] ?? 0) * swell)) * 32_767, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

/** `songs`: each history cover's source at its own length, by id; `source`: the 64 s song a fixture upload stands on. */
export type Sounds = { readonly source: string; readonly songs: ReadonlyMap<string, string>; readonly takes: readonly string[]; readonly remix: string };
