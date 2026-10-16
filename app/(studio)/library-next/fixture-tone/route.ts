// GET /library-next/fixture-tone - the fixture universe's one take sound: 0.6 s at 440 Hz,
// 8 kHz 8-bit mono WAV. The repo ships no audio, and a take that plays something is what lets
// the detail's preview be driven (board/_port/fixtureData.ts `toneWav`, served as a file here
// so 1,125 fixture takes name one address instead of each carrying a data URL). The real side
// serves a take's own file; this route retires with the fixture side.

export function GET(): Response {
  const rate = 8000;
  const n = Math.floor(0.6 * rate);
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = Math.round(128 + 60 * Math.sin((2 * Math.PI * 440 * i) / rate) * Math.min(1, (n - i) / 400));
  return new Response(new Uint8Array(b), { headers: { "content-type": "audio/wav", "cache-control": "public, max-age=86400" } });
}
