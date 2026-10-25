import "server-only";

import { errorMessage } from "@gt/domain/errors";
import type { EngineRow } from "@gt/ui/components/audio/EngineList.tsx";
import type { CardTake } from "@gt/ui/components/audio/TakeCard.tsx";
import { measuresByItem, type AudioMeasureRow } from "@gt/kernel/library/measures";

import { FIXTURE_MODE } from "../../../../lib/fixtures/mode.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { deploymentFacts, serverCapabilities } from "../../../../lib/serverCapabilities.ts";
import { engineRegistry, engineState, type EngineDef } from "../../../../lib/sound/engines.ts";
import { readGroups } from "../../../../lib/sound/store.ts";
import { listTakes } from "../../../../lib/sound/takes.ts";
import { takeFileHref } from "../../../../lib/sound/takeHref.ts";
import type { SoundTake } from "../../../../lib/sound/types.ts";
import type { Kind } from "./desk.ts";
import type { Read } from "./read.ts";

// THE ARRANGE BOARD, READ ON THE SERVER (Phase 6, L60): the KEPT takes of one kind from the sound
// store (v1's reader, lib/sound/takes.ts; fixtures only in the fixture universe, as /audio's
// composer reads them), that kind's rows from the groups file, and each take's ingest measure
// from the kernel's Library index (lib/sound/measureRun.ts wrote it) - the waveform and length a
// card draws. The browser decodes nothing (v1 measured on open and PATCHed the take back).
//
// The engines are the registry's rows for this deployment (lib/sound/engines.ts): the board
// offers the Suno round trip only while `can(suno, "file-return")`.
//
// Each part fails on its own: a kernel that will not open is a line over the board, and the
// cards still draw what the takes carry; a groups file that will not read is a line too, and the
// board draws the rows the cards themselves name.

export type ArrangeView = {
  readonly kind: Kind;
  readonly takes: Read<readonly CardTake[]>;
  readonly groups: readonly string[];
  /** Why the groups file could not be read, when it could not. */
  readonly rows: string | null;
  /** Why the ingest measures could not be read, when they could not. */
  readonly measures: string | null;
  readonly engines: readonly EngineRow[];
  readonly registry: readonly EngineDef[];
};

export function engineRows(reg: readonly EngineDef[]): EngineRow[] {
  return reg.map((e) => ({ id: e.id, name: e.name, transport: e.transport, state: engineState(e), ops: [...e.ops], withheld: e.withheld.map((w) => ({ ...w })), ...(e.needs === undefined ? {} : { needs: [...e.needs] }) }));
}

export function deskEngines(): readonly EngineDef[] {
  return engineRegistry(serverCapabilities(), deploymentFacts());
}

function cardOf(t: SoundTake, m: AudioMeasureRow | undefined): CardTake {
  const ok = m !== undefined && m.error === null;
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    stage: t.stage,
    group: t.group,
    label: t.label,
    parentId: t.parentId,
    createdAt: t.createdAt,
    loop: t.loop,
    terms: { genre: [...t.terms.genre], mood: [...t.terms.mood], instrument: [...t.terms.instrument], sfxCategory: t.terms.sfxCategory },
    verdict: t.verdict,
    src: t.file === null ? null : takeFileHref(t.id),
    peaks: ok && m.peaks.length > 0 ? [...m.peaks] : (t.peaks ?? []),
    lengthS: (ok ? m.durationS : null) ?? t.measured?.durationS ?? t.durationS,
    prompt: t.prompt,
    origin: t.origin,
    fileName: t.fileName,
  };
}

export async function readArrange(kind: Kind): Promise<ArrangeView> {
  const registry = deskEngines();
  const base = { kind, engines: engineRows(registry), registry };
  const [read, groups] = await Promise.all([
    listTakes({ kind, verdict: "kept", fixtures: FIXTURE_MODE }).then(
      (t): Read<SoundTake[]> => ({ ok: true, value: t }),
      (e: unknown): Read<SoundTake[]> => ({ ok: false, error: errorMessage(e) }),
    ),
    readGroups().then(
      (g): Read<readonly string[]> => ({ ok: true, value: g.groups[kind] }),
      (e: unknown): Read<readonly string[]> => ({ ok: false, error: errorMessage(e) }),
    ),
  ]);
  const rowsOf = { groups: groups.ok ? groups.value : [], rows: groups.ok ? null : groups.error };
  if (!read.ok) return { ...base, ...rowsOf, takes: read, measures: null };
  const takes = read.value;
  const k = kernel();
  const m = k.ok ? measuresByItem(k.value.store, takes.map((t) => `audio:${t.id}`)) : k;
  const by = m.ok ? m.value : new Map<string, AudioMeasureRow>();
  return { ...base, ...rowsOf, takes: { ok: true, value: takes.map((t) => cardOf(t, by.get(`audio:${t.id}`))) }, measures: m.ok ? null : m.error.message };
}

/** The finalized stacks' heads of a kind: the pool agents select from (`sound.mts finalized`). */
export function finalizedCount(kind: Kind): Promise<Read<number>> {
  return listTakes({ kind, verdict: "kept", stage: "finalized", fixtures: FIXTURE_MODE }).then(
    (t) => ({ ok: true, value: t.length }),
    (e: unknown) => ({ ok: false, error: errorMessage(e) }),
  );
}
