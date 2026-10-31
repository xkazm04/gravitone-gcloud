// THE ONE VENDOR TURN: Gemini listens to the mp3 and says when each lyric line
// is sung. It is asked for times and trusted for none of them until they pass
// `validateLineTimes` and the onset snap in align.ts.
//
// Why Gemini and not forced alignment: no stems and no ML aligner live on
// this box (a non-goal of the spark), and a multimodal model hears screamed
// words in a dense mix better than anything we could stand up for one track.
// Why it is not trusted: on 250 s of guttural vocals over downtuned guitars a
// listener model drifts by seconds, invents order, and sometimes answers past
// the end of the file. So: strict JSON, hard validation (in range, end after
// start, monotone in file order - the longest increasing run is kept, every
// line outside it falls back to its section), and the section boundaries it
// reports are a CROSS-CHECK only, never an override.
//
// The audio rides inline as base64: the vendor's ceiling is 20 MB per request
// (ai.google.dev/gemini-api/docs/audio, read 2026-10-29, held in
// lib/text/providers/google.ts), so an mp3 up to ~14 MB fits; past it this
// refuses rather than uploading through the Files API, which nothing here
// needs for a 6 MB track.
//
// `fetch` is injectable so the tests hand in a stand-in and never touch the
// network. The key is passed in, never read or logged here.

export type FetchLike = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** lib/text/providers/google.ts SUNO_LISTEN_MODEL: the model this repo already
 *  sends audio to and has a price row for. Not imported, to keep this module
 *  free of the text engine's dependency graph; keep the two in step. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const INLINE_MAX_BYTES = 20_000_000;

export interface GeminiLineTimesAsk {
  audio: Uint8Array;
  mimeType: string;
  lines: { id: string; text: string; tag?: string }[];
  durationS: number;
  apiKey: string;
  model?: string;
  fetch?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface GeminiLineTimesRaw {
  lines: { id: string; startS: number; endS: number }[];
  sections: { label: string; startS: number }[];
}

export type GeminiAnswer = { ok: true; value: unknown; model: string } | { ok: false; error: string };

const SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, startS: { type: "number" }, endS: { type: "number" } }, required: ["id", "startS", "endS"] },
    },
    sections: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, startS: { type: "number" } }, required: ["label", "startS"] },
    },
  },
  required: ["lines", "sections"],
};

function prompt(ask: GeminiLineTimesAsk): string {
  const body = ask.lines.map((l) => `${l.id}${l.tag ? ` [${l.tag}]` : ""}: ${l.text}`).join("\n");
  return [
    `This audio is a ${ask.durationS.toFixed(1)} s song. Below are its lyric lines, each with an id and the song section it belongs to.`,
    "For every line, give the time in seconds from the start of the audio when the singer begins the line (startS) and ends it (endS).",
    "Lines are sung in the order given. If a line is not audible, omit it rather than guess.",
    "Also list where each song section starts (label, startS), as you hear it.",
    "Answer with JSON only.",
    "",
    body,
  ].join("\n");
}

/** One generateContent call. Never throws: a refusal, a timeout, a non-JSON
 *  answer are all `{ ok: false, error }` with the vendor's words kept. */
export async function askGeminiForLineTimes(ask: GeminiLineTimesAsk): Promise<GeminiAnswer> {
  const model = ask.model?.trim() || DEFAULT_GEMINI_MODEL;
  const b64 = Buffer.from(ask.audio).toString("base64");
  if (b64.length + 64_000 > INLINE_MAX_BYTES) return { ok: false, error: `audio is ${ask.audio.length} bytes; inline requests stop at ${INLINE_MAX_BYTES} and this pass does not upload` };
  const doFetch: FetchLike = ask.fetch ?? ((url, init) => fetch(url, init));
  const base = ask.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: ask.mimeType, data: b64 } }, { text: prompt(ask) }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
  });
  try {
    const res = await doFetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": ask.apiKey },
      body,
      signal: AbortSignal.timeout(ask.timeoutMs ?? 240_000),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `gemini ${model} answered ${res.status}: ${text.slice(0, 400)}` };
    const j = JSON.parse(text) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const answer = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!answer.trim()) return { ok: false, error: `gemini ${model} returned no text` };
    return { ok: true, value: JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, "")), model };
  } catch (e) {
    return { ok: false, error: `gemini ${model}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface ValidatedLineTimes {
  /** Accepted per-line times, by id, in file order. */
  times: Map<string, { startS: number; endS: number }>;
  sections: { label: string; startS: number }[];
  dropped: { id: string; why: string }[];
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Hold Gemini's answer to the rules: a known id, once; finite times; 0 <=
 * startS < endS; endS within the track (half a second of grace, clamped);
 * and start times increasing in FILE order. Monotonicity keeps the longest
 * increasing run of starts (not "drop whatever follows the first backstep",
 * which would throw away a whole chorus for one misplaced line).
 */
export function validateLineTimes(raw: unknown, lineIds: string[], durationS: number): ValidatedLineTimes {
  const dropped: { id: string; why: string }[] = [];
  const obj = (raw ?? {}) as { lines?: unknown; sections?: unknown };
  const byId = new Map<string, { startS: number; endS: number }>();
  const known = new Set(lineIds);
  for (const item of Array.isArray(obj.lines) ? obj.lines : []) {
    const it = (item ?? {}) as { id?: unknown; startS?: unknown; endS?: unknown };
    const id = typeof it.id === "string" ? it.id : undefined;
    if (!id || !known.has(id)) continue;
    if (byId.has(id)) {
      dropped.push({ id, why: "answered twice" });
      byId.delete(id);
      known.delete(id);
      continue;
    }
    const s = num(it.startS);
    const e = num(it.endS);
    if (s === undefined || e === undefined) dropped.push({ id, why: "times not numbers" });
    else if (s < 0 || s >= durationS) dropped.push({ id, why: `start ${s} outside 0..${durationS}` });
    else if (e <= s) dropped.push({ id, why: `end ${e} not after start ${s}` });
    else if (e > durationS + 0.5) dropped.push({ id, why: `end ${e} past the track's ${durationS}` });
    else byId.set(id, { startS: s, endS: Math.min(e, durationS) });
  }
  const ordered = lineIds.filter((id) => byId.has(id));
  const keep = new Set(longestIncreasing(ordered.map((id) => byId.get(id)!.startS)).map((i) => ordered[i]));
  const times = new Map<string, { startS: number; endS: number }>();
  for (const id of lineIds) {
    const t = byId.get(id);
    if (!t) {
      if (!dropped.some((d) => d.id === id)) dropped.push({ id, why: "not answered" });
    } else if (!keep.has(id)) dropped.push({ id, why: "out of order" });
    else times.set(id, t);
  }
  const sections: { label: string; startS: number }[] = [];
  for (const item of Array.isArray(obj.sections) ? obj.sections : []) {
    const it = (item ?? {}) as { label?: unknown; startS?: unknown };
    const s = num(it.startS);
    if (typeof it.label === "string" && s !== undefined && s >= 0 && s <= durationS) sections.push({ label: it.label, startS: s });
  }
  return { times, sections, dropped };
}

/** Indices of one longest strictly increasing subsequence (patience, n log n). */
export function longestIncreasing(xs: number[]): number[] {
  const tails: number[] = [];
  const prev = new Array<number>(xs.length).fill(-1);
  for (let i = 0; i < xs.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[tails[mid]] < xs[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out: number[] = [];
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}
