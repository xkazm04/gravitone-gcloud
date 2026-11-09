/**
 * Three independent listens to a reference track, for the vocabulary a brief is written in.
 *
 *   node --env-file=.env.local pipeline/track-mirror/listen.mts <audio.mp3> <out.json> [--reads 3]
 *
 * A listener's words are the only thing it is asked for. Its timeline drifts and it can invent order
 * (lib/music-clip/gemini.ts, suno-advisor's follow-up), so timing comes from analyze.py, and a claim
 * counts only when reads agree: agreement across independent reads is the trust figure on the page.
 *
 * It asks for no melody and no lyric transcript: a mirror brief carries neither.
 */
import { readFileSync, writeFileSync } from "node:fs";

const MODEL = "gemini-3.8-flash";
const MAX_BYTES = 20_000_000;

const PROMPT = `You are a session producer writing a brief for another producer who cannot hear this recording.
Describe the recording itself. Do not guess who made it, and do not transcribe its lyrics or its melody.
Answer only with JSON of this shape:
{
  "genres": ["most specific first, up to 5"],
  "era_and_scene": "short phrase",
  "mood": ["up to 6 words"],
  "tempo_feel": "e.g. half-time, four-on-the-floor, rubato",
  "vocals": {"present": true, "kind": "gender/register/delivery, or none", "language": "or none", "treatment": "e.g. pitched, reverb, chopped, autotune"},
  "instruments": [{"name": "specific sound, e.g. detuned supersaw lead", "role": "lead|bass|pad|drums|fx|vocal", "prominence": 1}],
  "drums": "pattern and sound in one sentence",
  "bass": "sound and movement in one sentence",
  "production": ["mix and mastering character, up to 6 phrases"],
  "form": ["section names in order, no timings"],
  "energy_arc": "one sentence on how intensity moves over the track",
  "exclude": ["sounds a generator might wrongly add, up to 6"],
  "suno_tags": "a comma-separated style line under 200 characters"
}
prominence is 1 (barely there) to 5 (dominates). Name only what you actually hear.`;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
}

async function main(): Promise<number> {
  const [audio, out] = process.argv.slice(2);
  const key = process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!audio || !out) {
    console.error("usage: listen.mts <audio.mp3> <out.json> [--reads 3]");
    return 2;
  }
  if (!key) {
    console.error("GOOGLE_AI_API_KEY is not set");
    return 2;
  }
  const bytes = readFileSync(audio);
  if (bytes.length > MAX_BYTES) {
    console.error(`${audio} is ${bytes.length} bytes, past the inline limit of ${MAX_BYTES}`);
    return 2;
  }
  const reads = Number(arg("--reads", "3"));
  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: "audio/mpeg", data: bytes.toString("base64") } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const answers = await Promise.all(
    Array.from({ length: reads }, async (_, read) => {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body });
      const text = await res.text();
      if (!res.ok) return { read, error: `${res.status}: ${text.slice(0, 400)}` };
      const parsed = JSON.parse(text);
      const answer = (parsed.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      try {
        return { read, usage: parsed.usageMetadata, answer: JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, "")) };
      } catch {
        return { read, usage: parsed.usageMetadata, error: "unparsed", raw: answer };
      }
    }),
  );
  writeFileSync(out, JSON.stringify({ model: MODEL, reads: answers }, null, 1));
  const failed = answers.filter((a) => "error" in a).length;
  console.log(`${reads - failed}/${reads} reads kept, written to ${out}`);
  for (const a of answers) if ("error" in a) console.error(`read ${a.read}: ${a.error}`);
  return failed === reads ? 1 : 0;
}

process.exit(await main());
