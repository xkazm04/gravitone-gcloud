import { z } from "zod";

import { audioIntentSchema, audioPaletteInputSchema } from "@gt/domain/audio.intent.schema";
import { scoreNoteSchema } from "@gt/domain/audio.score";
import { err, ok, type Result } from "@gt/domain/errors";
import { compileIntent, steerIntent, suggestPalettes, type AudioIntent } from "@gt/ui/components/audio/intent.ts";

import { SAMPLE_ROOTS_ENV } from "../../../../lib/audio/atlas.ts";
import { previewFor, sampleRoots } from "../../../../lib/sound/audioPreview.ts";
import type { LocalScorePlan } from "../../../../lib/sound/localScorePlan.ts";
import type { SoundTake } from "../../../../lib/sound/types.ts";
import { defineOp, READS, WRITES, type McpToolSpec, type Obj } from "../op.ts";
import { takeAnswer } from "./audioTake.ts";

// AUDIO ON THE AGENT DOOR (spark audio-agent-studio S2). Two halves:
//
//   read    choosing and compiling, free and pure: three instrument palettes for mood words, an intent
//           compiled to a deterministic brief, an intent steered by plain complaints (ported from
//           hackathon audio-steer-1028 entry e4; its `audio_steer` is `intent_steer` here, as `read.steer`
//           is the composer's sentence compile).
//   launch  the LOCAL BAND's verbs - render a ScoreSpec, remix a take, rewrite one track, audition one
//           instrument. Each runs on this machine's engine and costs $0; nothing here reaches a vendor.
//           Every answer's hrefs are this server's paths, ready to copy into an `audio_turn`.
//
// The engine modules load on a verb's first call: their graphs (the render worker, the sidecar) are
// not the door's, and a call that only reads need not load them. The studio's conversation ops
// (inbox, guide, turn) are ./audioStudio.ts.

const VIEW = "/audio?s=studio";

const withPreviews = (palettes: ReturnType<typeof suggestPalettes>): Obj[] => {
  const seen = new Set<string>();
  return palettes.map((p) => ({
    id: p.id,
    label: p.label,
    plain: p.plain,
    genres: p.genres,
    instruments: p.instruments.map((e) => {
      const file = previewFor(e.keywords, e.role, seen);
      if (file) seen.add(file);
      return { id: e.id, name: e.name, plain: e.plain, role: e.role, sunoWord: e.suno, ...(file ? { previewFile: file } : {}) };
    }),
  }));
};

const answer = async (r: Promise<Result<{ readonly take: SoundTake; readonly plan: LocalScorePlan }>>): Promise<Result<Obj>> => {
  const v = await r;
  return v.ok ? ok({ ...takeAnswer(v.value.take, v.value.plan), view: VIEW }) : v;
};

export const AUDIO_READ_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "read",
    op: "audio_palette",
    title: "Audio palettes",
    description: "Three instrument palettes for plain mood words, each instrument in plain words, with a local sample file to hear when sample roots are set. Let the person hear and choose; never invent an instrument outside the catalog.",
    input: audioPaletteInputSchema,
    annotations: READS,
    writes: false,
    run: ({ mood = [], use, energy, limit }) => {
      const palettes = suggestPalettes({ mood, ...(use ? { use } : {}), ...(energy ? { energy } : {}) }).slice(0, limit ?? 3);
      const roots = sampleRoots();
      return ok({
        palettes: withPreviews(palettes),
        previewRoots: roots,
        ...(mood.length === 0 ? { moodNote: "no mood words given; these are the catalog's first fits - ask how it should feel (calm, hopeful, night, driving) for palettes that fit the piece" } : {}),
        ...(palettes.length < (limit ?? 3) ? { paletteNote: `only ${palettes.length} palettes fit these words` } : {}),
        ...(roots.length === 0 ? { previewNote: `no sample roots configured: set ${SAMPLE_ROOTS_ENV} to hear previews` } : {}),
      });
    },
  }),
  defineOp({
    family: "read",
    op: "audio_compile",
    title: "Compile an audio intent",
    description: "Compile an intent (use, plain mood words, lengthS, loop, avoid) to a deterministic brief: hash, seed, section plan, Suno fields, ElevenLabs sentence and lint. The same intent always gives the same hash.",
    input: z.object({ intent: audioIntentSchema }).strict(),
    annotations: READS,
    writes: false,
    run: ({ intent }) => {
      const brief = compileIntent(intent as AudioIntent);
      return brief.ok ? ok({ ...brief.value, view: VIEW }) : brief;
    },
  }),
  defineOp({
    family: "read",
    op: "intent_steer",
    title: "Steer an intent by complaint",
    description: "Steer an audio intent with plain complaints (too slow, too dark, add strings, swap marimba for cello): one variant per complaint, each moving exactly one axis, with its new intent and hash to compile next.",
    input: z.object({ intent: audioIntentSchema, complaints: z.array(z.string().trim().min(1).max(200)).min(1).max(6) }).strict(),
    annotations: READS,
    writes: false,
    run: ({ intent, complaints }) => {
      const r = steerIntent(intent as AudioIntent, complaints);
      if (!r.ok) return r;
      const v = r.value;
      return ok({
        baseHash: v.base.hash,
        variants: v.variants,
        ...(v.combined ? { combined: v.combined } : {}),
        ...(v.noop.length ? { noop: v.noop, noopNote: "already at the limit for those words; the brief cannot move that way" } : {}),
        ...(v.unrecognised.length ? { unrecognised: v.unrecognised, tryInstead: "plain words like too slow, too short, too dark, too busy, repetitive, add strings, swap marimba for cello, remove hand percussion" } : {}),
        view: VIEW,
      });
    },
  }),
];

const trackId = z.string().regex(/^[a-z0-9-]{1,24}$/, "a track id is 1..24 lower-case letters, digits or dashes");
const takeId = z.string().trim().min(1).max(120);
const mixChange = z.strictObject({ gainDb: z.number().optional(), pan: z.number().optional(), muted: z.boolean().optional(), solo: z.boolean().optional(), enters: z.array(z.boolean()).min(1).max(8).optional() });

/** The score's own mix ranges (@gt/domain/audio.score scoreTrackSchema): a mix outside them is refused in words, never clamped. */
const GAIN_DB = [-24, 12] as const;
const PAN = [-1, 1] as const;

/** Why a remix cannot be baked as asked; null when every value is in range. */
export function mixRangeFault(tracks: Readonly<Record<string, z.output<typeof mixChange> | undefined>>): string | null {
  const faults: string[] = [];
  for (const [id, c] of Object.entries(tracks)) {
    if (c === undefined) continue;
    if (c.gainDb !== undefined && (c.gainDb < GAIN_DB[0] || c.gainDb > GAIN_DB[1]))
      faults.push(`${id}: a level of ${c.gainDb} dB is outside what a score holds (${GAIN_DB[0]} to +${GAIN_DB[1]} dB)${c.gainDb < GAIN_DB[0] ? " - to silence it, mute it instead" : ""}`);
    if (c.pan !== undefined && (c.pan < PAN[0] || c.pan > PAN[1])) faults.push(`${id}: a pan of ${c.pan} is outside -1 (left) to 1 (right)`);
  }
  return faults.length === 0 ? null : `nothing was remixed: ${faults.join("; ")}`;
}

export const AUDIO_LAUNCH_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "launch",
    op: "audio_render",
    title: "Render a score locally",
    description: "Render a ScoreSpec (shape: read audio_guide) on this machine's band, $0: a new take with its mix href and one pre-fader stem per track (href, levelDb, pan, source). A missing instrument is refused unless allowFallback.",
    input: z.object({ spec: z.record(z.string(), z.unknown()), allowFallback: z.boolean().optional() }).strict(),
    annotations: WRITES,
    writes: true,
    run: async ({ spec, allowFallback }) => {
      const { renderLocalScore } = await import("../../../../lib/sound/localScore.ts");
      return answer(renderLocalScore(spec, { op: "compose", ...(allowFallback === true ? { allowFallback: true } : {}) }));
    },
  }),
  defineOp({
    family: "launch",
    op: "audio_mix",
    title: "Remix a take",
    description: "Remix a local take by track id: gainDb (-24..12), pan (-1..1), muted, solo, enters (one flag per section). Level and pan re-render nothing; enters re-renders that track only. Out of range is refused, not clamped.",
    input: z.object({ takeId, tracks: z.record(trackId, mixChange) }).strict(),
    annotations: WRITES,
    writes: true,
    run: async ({ takeId: id, tracks }) => {
      const fault = mixRangeFault(tracks);
      if (fault !== null) return err("invalid", fault);
      const { mixLocalTake } = await import("../../../../lib/sound/localScoreVerbs.ts");
      return answer(mixLocalTake({ takeId: id, tracks: tracks as Parameters<typeof mixLocalTake>[0]["tracks"] }));
    },
  }),
  defineOp({
    family: "launch",
    op: "audio_rewrite",
    title: "Rewrite one track",
    description: "Rewrite one track of a local take by id: new notes (bar, beat, durationBeats, midi, velocity), or another pattern word. Only that stem re-renders; every other is reused bit-exact. Give notes or pattern, not both.",
    input: z.object({ takeId, track: trackId, notes: z.array(scoreNoteSchema).min(1).max(512).optional(), pattern: z.string().trim().min(1).max(40).optional() }).strict(),
    annotations: WRITES,
    writes: true,
    run: async ({ takeId: id, track, notes, pattern }) => {
      if ((notes === undefined) === (pattern === undefined)) return err("invalid", "a rewrite gives the track new notes or a new pattern - exactly one of the two");
      const { rewriteLocalStem } = await import("../../../../lib/sound/localScoreVerbs.ts");
      return answer(rewriteLocalStem(notes !== undefined ? { takeId: id, track, notes } : { takeId: id, track, pattern: pattern ?? "" }));
    },
  }),
  defineOp({
    family: "launch",
    op: "audio_audition",
    title: "Audition an instrument",
    description: "Render a short phrase of one catalog instrument (ids: audio_guide catalog) on this machine, $0: its href to hear alone and the source that played it. A refused instrument answers why.",
    input: z.object({ instrumentId: z.string().trim().min(1).max(120) }).strict(),
    annotations: WRITES,
    writes: true,
    run: async ({ instrumentId }) => {
      const { auditionLocalInstrument } = await import("../../../../lib/sound/localScore.ts");
      const r = await auditionLocalInstrument(instrumentId);
      if (!r.ok) return r;
      const v = r.value;
      return ok({ instrumentId: v.instrumentId, name: v.name, role: v.role, href: v.audioUrl, source: v.source, fallback: v.fallback, ...(v.fallback ? { standInNote: `a stand-in synth played ${v.name}: say so to the person` } : {}) });
    },
  }),
];
