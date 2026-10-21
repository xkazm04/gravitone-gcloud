import "server-only";

import { errorMessage } from "@gt/domain/errors";
import type { AudioFacts } from "@gt/ui/components/audio/audio.ts";
import type { DraftRow, DraftState } from "@gt/ui/components/audio/DraftList.tsx";
import type { ReferenceRow } from "@gt/ui/components/audio/ReferenceList.tsx";
import type { Seed, Term } from "@gt/ui/components/audio/recipe.ts";
import type { ConceptTake } from "@gt/ui/components/audio/variations.ts";

import { FIXTURE_MODE } from "../../../../lib/fixtures/mode.ts";
import { readHands } from "../../../../lib/sound/hands.ts";
import { computeInsights } from "../../../../lib/sound/insights.ts";
import { rubricMean } from "../../../../lib/sound/ledger.ts";
import { readLedger } from "../../../../lib/sound/store.ts";
import { readSunoLive } from "../../../../lib/sound/suno/queue.ts";
import { listTakes } from "../../../../lib/sound/takes.ts";
import type { SoundTake } from "../../../../lib/sound/types.ts";
import { deriveVocabulary } from "../../../../lib/sound/vocabulary.ts";
import { SUNO_PHASE_WORD, type SunoJob } from "../../../../lib/suno/types.ts";
import { REFERENCES } from "./references.ts";

// THE AUDIO LANE'S COMPOSER, READ ON THE SERVER - every number the page draws, from v1's own
// stores through their own readers (lib/sound/*), in one render:
//   terms      the ONE vocabulary derivation (lib/sound/vocabulary.ts `deriveVocabulary` over
//              lib/sound/insights.ts cells of the git-tracked ledger), with the team's hand from
//              lib/sound/hands.ts laid over - never a second count;
//   takes      the kept music takes a seed can start from (fixtures only in the fixture
//              universe, v1's rule), each with what the Library detail shows for it;
//   drafts     the Suno queue's proposals with their latest job's running state overlaid from
//              the kernel (lib/sound/suno/queue.ts `readSunoLive`) and the clips they returned;
//   references the three measured references with how their descendants were judged.
// Each part fails on its own: an unreadable ledger is a line over the terms, not a blank page.

export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export type SeedTake = {
  readonly id: string;
  readonly title: string;
  readonly seed: Seed;
  readonly src: string | null;
  readonly peaks: readonly number[];
  readonly durationS: number | null;
  readonly prompt: string;
  readonly negative?: string;
  readonly reasons: readonly string[];
  readonly facts: AudioFacts;
};

export type AudioView = {
  readonly terms: Read<readonly Term[]>;
  readonly takes: Read<readonly SeedTake[]>;
  readonly concept: readonly ConceptTake[];
  readonly keys: readonly string[];
  readonly drafts: Read<readonly DraftRow[]>;
  readonly references: readonly ReferenceRow[];
};

/** Drafts shown, newest first; the queue's own column holds the rest. */
export const DRAFT_ROWS = 24;
/** Takes a seed can start from, newest first. */
export const SEED_TAKES = 40;

/** The request's clock for the receipt sheet (read once, outside render). */
export const audioNow = (): number => Date.now();


async function read<T>(fn: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export const seedOfTake = (t: SoundTake): Seed => ({ genres: [...t.terms.genre], moods: [...t.terms.mood], instruments: [...t.terms.instrument], bpm: t.tempoBpm, key: t.key, avoid: [] });

/** What the Library detail draws for a take (L50's panel reads the same three components). */
export function seedTake(t: SoundTake): SeedTake {
  const m = t.measured;
  return {
    id: t.id,
    title: t.title,
    seed: seedOfTake(t),
    src: t.file === null ? null : `/api/sound/takes/${encodeURIComponent(t.id)}/file`,
    peaks: t.peaks ?? [],
    durationS: m?.durationS ?? t.durationS,
    prompt: t.prompt,
    ...(t.negative === null || t.negative === "" ? {} : { negative: t.negative }),
    reasons: t.reasons,
    facts: {
      asked: { tempoBpm: t.tempoBpm, key: t.key, durationS: t.durationS },
      measured: m === null ? null : { tempoBpm: m.tempoBpm, key: m.key, durationS: m.durationS, lufs: m.lufs, truePeakDb: m.truePeakDb, energy: m.energy },
    },
  };
}

function draftState(j: SunoJob | undefined): DraftState {
  if (j === undefined) return "proposed";
  return j.state === "active" ? "running" : j.state;
}

export async function readAudio(): Promise<AudioView> {
  const all = await read(() => listTakes({ fixtures: FIXTURE_MODE }));
  const music = all.ok ? all.value.filter((t) => t.kind === "music") : [];
  const terms = await read(async () => {
    const [ledger, hands] = await Promise.all([readLedger(), readHands()]);
    return deriveVocabulary(computeInsights(ledger.verdicts).cells, hands)
      .filter((e) => e.n > 0)
      .map((e): Term => ({ id: e.id, term: e.term, facet: e.facet, n: e.n, kept: e.kept, rejected: e.rejected, keepRate: e.keepRate, stance: e.stance, phrase: e.phrase, topDefect: e.topDefect }));
  });
  const drafts = await read(async () => {
    const { file, jobs } = await readSunoLive();
    return [...file.proposals]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, DRAFT_ROWS)
      .map((p): DraftRow => {
        const mine = jobs.filter((j) => j.proposalId === p.id).sort((a, b) => b.enqueuedAt - a.enqueuedAt);
        const last = mine[0];
        const state = draftState(last);
        const clips = file.clips.filter((c) => mine.some((j) => j.id === c.jobId));
        const detail = state === "failed" ? (last?.error ?? p.error) : state === "running" && last?.phase !== undefined ? `${SUNO_PHASE_WORD[last.phase]}${last.model === undefined ? "" : ` ${last.model}`}` : p.note;
        return {
          id: p.id,
          title: p.fields.title ?? p.fields.style.split(",")[0] ?? p.id,
          style: p.fields.style,
          ...(p.fields.exclude === undefined || p.fields.exclude === "" ? {} : { exclude: p.fields.exclude }),
          origin: p.origin,
          state,
          ...(detail === undefined || detail === "" ? {} : { detail }),
          at: new Date(last?.enqueuedAt ?? p.createdAt).toISOString(),
          clips: clips.map((c) => ({ id: c.id, title: c.title, model: c.model, verdict: c.verdict })),
        };
      });
  });
  const concept: ConceptTake[] = music.map((t) => ({
    referenceTrackId: t.referenceTrackId,
    verdict: t.verdict,
    proven: t.verdict === "kept" && (rubricMean("music", t.ratings) ?? 0) >= 7,
    terms: { genre: t.terms.genre, mood: t.terms.mood, instrument: t.terms.instrument },
  }));
  const keys = [...new Set(music.flatMap((t) => [t.key, t.measured?.key ?? null]).filter((k): k is string => k !== null && k.trim() !== ""))].sort();
  const references = REFERENCES.map((r) => {
    const kids = music.filter((t) => t.referenceTrackId === r.id);
    return { ...r, kept: kids.filter((t) => t.verdict === "kept").length, rejected: kids.filter((t) => t.verdict === "rejected").length };
  });
  return {
    terms,
    takes: all.ok ? { ok: true, value: music.filter((t) => t.verdict === "kept").slice(0, SEED_TAKES).map(seedTake) } : all,
    concept,
    keys,
    drafts,
    references,
  };
}
