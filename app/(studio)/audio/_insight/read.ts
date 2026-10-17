import "server-only";

import { measuresByItem, type AudioMeasureRow } from "@gt/kernel/library/measures";
import { briefCheck, type BriefCheck } from "@gt/ui/components/audio/brief.ts";
import { readRubric, rubricMean, type RubricRead } from "@gt/ui/components/audio/rubric.ts";
import type { EvidenceTake, StrengthCell } from "@gt/ui/components/audio/strengths.ts";

import { FIXTURE_MODE } from "../../../../lib/fixtures/mode.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { batchEngine } from "../../../../lib/sound/batch.ts";
import type { EngineDef } from "../../../../lib/sound/engines.ts";
import { computeInsights } from "../../../../lib/sound/insights.ts";
import { readLedger } from "../../../../lib/sound/store.ts";
import { listTakes } from "../../../../lib/sound/takes.ts";
import type { SoundTake } from "../../../../lib/sound/types.ts";
import type { Kind } from "../_audio/desk.ts";
import type { Read } from "../_audio/read.ts";

// THE AUDIO DESK'S INSIGHT SECTIONS, READ ON THE SERVER (Phase 6, L66) - strengths, rubric and
// batch, each from v1's own stores through their own readers, one kind at a time:
//   strengths  lib/sound/insights.ts `computeInsights` over the git-tracked ledger's verdict rows
//              (the ONE count the knowledge generator and the CLI read too), per provider, and
//              the judged takes behind the cells as narrow evidence rows (@gt/ui strengths.ts);
//   rubric     the judged takes of the kind, unscored first, each with its rubric breakdown and
//              its brief held against the ingest measure of its bytes (kernel audio_measures by
//              Library item, lib/sound/measureRun.ts wrote it), else what v1 measured on it;
//   batch      which engine a batch of the kind runs on, from the desk's registry.
// Each part fails on its own: an unreadable ledger is a line over the table, not a blank page.

export type StrengthsView = {
  readonly kind: Kind;
  readonly cells: Read<readonly StrengthCell[]>;
  /** Takes the ledger holds a verdict on, of this kind: the only total the table has. */
  readonly judged: number;
  readonly evidence: readonly EvidenceTake[];
  readonly lessons: Read<readonly LessonRow[]>;
};

export type LessonRow = { readonly id: string; readonly claim: string; readonly provider: string | null; readonly source: string; readonly n: number; readonly keepRate: number | null; readonly meanScore: number | null; readonly technique: readonly string[]; readonly at: string };

export type RubricTake = {
  readonly id: string;
  readonly title: string;
  readonly kind: Kind;
  readonly provider: string;
  readonly verdict: "kept" | "rejected";
  readonly loop: boolean | null;
  readonly src: string | null;
  readonly prompt: string;
  readonly rubric: RubricRead;
  readonly ratings: Readonly<Record<string, number | null>>;
  readonly brief: BriefCheck;
  readonly judgedAt: string | null;
};

export type RubricView = { readonly kind: Kind; readonly takes: Read<readonly RubricTake[]>; readonly measures: string | null };

export type BatchView = { readonly kind: Kind; readonly engine: Read<{ readonly id: "suno" | "elevenlabs"; readonly name: string }> };

/** Takes the rubric pile draws: unscored first, then the newest verdicts. */
export const RUBRIC_ROWS = 60;

const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function read<T>(fn: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: words(e) };
  }
}

const judged = (t: SoundTake): t is SoundTake & { verdict: "kept" | "rejected" } => t.verdict !== "unjudged";

export const evidenceOf = (t: SoundTake): EvidenceTake => ({
  id: t.id,
  provider: t.provider,
  verdict: t.verdict,
  origin: t.origin,
  technique: t.technique,
  terms: t.terms,
  mean: rubricMean(t.kind, t.ratings),
});

export async function readStrengths(kind: Kind): Promise<StrengthsView> {
  const ledger = await read(() => readLedger());
  const insights = ledger.ok ? computeInsights(ledger.value.verdicts, kind) : null;
  const takes = await read(() => listTakes({ kind, fixtures: false }));
  return {
    kind,
    cells: ledger.ok && insights !== null ? { ok: true, value: insights.cells } : { ok: false, error: ledger.ok ? "no insights" : ledger.error },
    judged: insights?.judged ?? 0,
    evidence: takes.ok ? takes.value.filter(judged).map(evidenceOf) : [],
    lessons: ledger.ok
      ? {
          ok: true,
          value: ledger.value.lessons
            .filter((l) => l.kind === kind)
            .map((l) => ({ id: l.id, claim: l.claim, provider: l.provider, source: l.source, n: l.evidence.n, keepRate: l.evidence.keepRate, meanScore: l.evidence.meanScore, technique: l.technique, at: l.confirmedAt }))
            .reverse(),
        }
      : ledger,
  };
}

/** The brief held against the bytes: the ingest measure wins, v1's own measure fills what it lacks. */
export function briefOf(t: SoundTake, m: AudioMeasureRow | undefined): BriefCheck {
  const own = t.measured;
  const ingest = m !== undefined && m.error === null ? m : null;
  const measured =
    ingest === null && own === null
      ? null
      : { tempoBpm: ingest?.tempoBpm ?? own?.tempoBpm ?? null, key: ingest?.key ?? own?.key ?? null, durationS: ingest?.durationS ?? own?.durationS ?? null };
  return briefCheck(t.kind, { tempoBpm: t.tempoBpm, key: t.key, durationS: t.durationS }, measured);
}

export function rubricTake(t: SoundTake & { verdict: "kept" | "rejected" }, m: AudioMeasureRow | undefined): RubricTake {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    provider: t.provider,
    verdict: t.verdict,
    loop: t.loop,
    src: t.file === null ? null : `/api/sound/takes/${encodeURIComponent(t.id)}/file`,
    prompt: t.prompt,
    rubric: readRubric(t),
    ratings: t.ratings,
    brief: briefOf(t, m),
    judgedAt: t.judgedAt,
  };
}

/** Unscored before partly scored before fully scored; then the newest verdict first. */
export function rubricOrder(a: RubricTake, b: RubricTake): number {
  const left = (r: RubricTake): number => r.rubric.of - r.rubric.scored;
  return left(b) - left(a) || (b.judgedAt ?? "").localeCompare(a.judgedAt ?? "") || a.id.localeCompare(b.id);
}

export async function readRubricPile(kind: Kind): Promise<RubricView> {
  let takes: (SoundTake & { verdict: "kept" | "rejected" })[];
  try {
    takes = (await listTakes({ kind, fixtures: FIXTURE_MODE })).filter(judged);
  } catch (e) {
    return { kind, takes: { ok: false, error: words(e) }, measures: null };
  }
  const k = kernel();
  const m = k.ok ? measuresByItem(k.value.store, takes.map((t) => `audio:${t.id}`)) : k;
  const by = m.ok ? m.value : new Map<string, AudioMeasureRow>();
  const rows = takes.map((t) => rubricTake(t, by.get(`audio:${t.id}`))).sort(rubricOrder).slice(0, RUBRIC_ROWS);
  return { kind, takes: { ok: true, value: rows }, measures: m.ok ? null : m.error.message };
}

/** How many judged takes of a kind still have a dimension unscored: the rubric tab's tally. */
export async function unscoredCount(kind: Kind): Promise<Read<number>> {
  return read(async () => (await listTakes({ kind, fixtures: FIXTURE_MODE })).filter(judged).filter((t) => readRubric(t).scored < readRubric(t).of).length);
}

export function readBatch(kind: Kind, reg: readonly EngineDef[]): BatchView {
  const e = batchEngine(reg, kind);
  const name = (id: string): string => reg.find((x) => x.id === id)?.name ?? id;
  return { kind, engine: e.ok ? { ok: true, value: { id: e.value, name: name(e.value) } } : { ok: false, error: e.error.message } };
}
