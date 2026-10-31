import { z } from "zod";

import { ok } from "@gt/domain/errors";
import { auditionHref, playableIds, sketchHref, standInsOf } from "@gt/ui/components/audio/atlas.ts";
import { PRESETS } from "@gt/ui/components/audio/shape.ts";
import { steerBrief } from "@gt/ui/components/audio/steer.ts";

import { audibleIds } from "../../../../lib/audio/atlas.ts";
import { priceCall } from "../../../../lib/music/pricing.ts";
import { defineOp, READS, type McpToolSpec } from "../op.ts";

// gt_read steer - a sentence compiled the way /audio compose compiles it (@gt/ui steer.ts): the
// terms with the words behind each, the words nothing matched, the seed, Suno's fields, the
// sections and the ElevenLabs plan with its credit quote - and, for every instrument this machine
// can play, the audition to hear (and the sketch of them together over the shape). It reads and
// computes; it launches nothing and spends nothing (the receipt is launch.composer_receipt's).

const PRESET_IDS = PRESETS.map((p) => p.id) as [string, ...string[]];

export const STEER_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "read",
    op: "steer",
    title: "Steer a music brief",
    description: "A sentence compiled into a music seed: heard terms and their words, unheard words, slips, the key, words pulling tempo or key two ways, Suno fields, sections, an ElevenLabs quote, audition paths. Spends nothing.",
    input: z.object({ sentence: z.string().trim().min(1).max(300), shape: z.enum(PRESET_IDS).optional(), length_s: z.number().int().min(10).max(600).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: async (a) => {
      const b = steerBrief({ sentence: a.sentence, ...(a.shape === undefined ? {} : { shape: a.shape }), ...(a.length_s === undefined ? {} : { lengthS: a.length_s }) });
      const can = new Set(await audibleIds());
      const playable = playableIds(b.seed.instruments, can);
      const quote = b.plan === null ? null : priceCall({ op: "compose", seconds: b.planSeconds });
      return ok({
        heard: b.heard,
        unheard: b.unheard,
        near: b.near,
        key: b.key,
        pulls: b.pulls,
        seed: b.seed,
        suno: b.suno,
        sections: b.sections.map((s) => ({ name: s.label, start_s: Math.round(s.startS * 10) / 10, end_s: Math.round(s.endS * 10) / 10, bars: s.bars, level: s.level })),
        elevenlabs: b.plan === null ? null : { plan: b.plan, seconds: Math.round(b.planSeconds), credits: quote?.credits ?? null, basis: quote?.basis ?? "unpriced", dry: true },
        auditions: b.instruments.map((i) => ({ term: i.term, path: i.atlas !== null && can.has(i.atlas) ? auditionHref(i.atlas, b.seed.bpm, b.seed.key) : null })),
        sketch: playable.length === 0 ? null : sketchHref(playable, b.levels ?? [3], b.seed.bpm, b.seed.key),
        // A word with no samples here sounds in the sketch through its register's nearest: said.
        stand_ins: standInsOf(b.seed.instruments, can).map((x) => ({ word: x.word, as: x.as.term })),
      });
    },
  }),
];
