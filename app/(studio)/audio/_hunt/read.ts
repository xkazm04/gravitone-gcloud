import "server-only";

import { buildTree, countsOf, reconcile, type HuntCardView, type HuntLeafView, type HuntOpenView, type Reach } from "@gt/ui/components/audio/hunt.ts";
import { measuresByItem, type AudioMeasureRow } from "@gt/kernel/library/measures";

import { kernel } from "../../../../lib/kernelStore.ts";
import { liveBlock, renderInFlight } from "../../../../lib/sound/huntRender.ts";
import { listLessons } from "../../../../lib/sound/lessons.ts";
import { readHunts, readTakes } from "../../../../lib/sound/store.ts";
import { TECHNIQUES, type Hunt, type HuntNode, type SoundTake } from "../../../../lib/sound/types.ts";
import { deskEngines } from "../_audio/arrangeRead.ts";
import type { Kind } from "../_audio/desk.ts";
import type { Read } from "../_audio/read.ts";

// THE HUNT SECTION, READ ON THE SERVER (Phase 6, L65): the hunts of one kind from the sound store
// (v1's reader), each squared with the takes filed against it (@gt/ui hunt.ts `reconcile` - a
// take that came back after its page closed is attached; a leaf left rendering by a render that
// is no longer in flight reads as interrupted), drawn as mini-maps; the one the URL opens
// (`?h=`), whole, with each heard take's bytes, ingest peaks and length (the browser decodes
// nothing); the confirmed lesson it carries; and how each provider is reached from a hunt.
//
// READS NEVER WRITE: a hunt whose leaves read interrupted is not rewritten here - the reconcile
// is a view, and the next render of the leaf is what changes the store (Director decision 2 for
// slots, the same rule).

export type HuntDeskView = {
  readonly kind: Kind;
  readonly hunts: Read<readonly HuntCardView[]>;
  /** The hunt `?h=` names; null when none is named. */
  readonly open: Read<HuntOpenView> | null;
  readonly reach: Readonly<Record<string, Reach>>;
  /** Why a live render is refused in this deployment, when it is (a dry render never is). */
  readonly liveBlock: string | null;
  /** The kind's technique slugs: the only ones a lesson may rest on. */
  readonly known: readonly string[];
};

const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const leafOf = (n: HuntNode): HuntLeafView => ({
  id: n.id,
  parentId: n.parentId,
  axis: n.axis,
  label: n.label,
  rationale: n.rationale,
  provider: n.provider,
  technique: [...n.technique],
  prompt: n.prompt,
  negative: n.negative,
  durationS: n.durationS,
  tempoBpm: n.tempoBpm,
  key: n.key,
  loop: n.loop,
  state: n.state,
  takeIds: [...n.takeIds],
  winner: n.winner,
  error: n.error,
});

function cardOf(h: Hunt, nodes: readonly HuntLeafView[]): HuntCardView {
  const t = buildTree(nodes);
  return {
    id: h.id,
    idea: h.idea,
    createdAt: h.createdAt,
    counts: countsOf(nodes),
    lessonId: h.lessonId,
    mini: t.columns.map((c) => ({ axis: c.axis, leaves: c.leafIds.map((id) => nodes.find((n) => n.id === id)).flatMap((n) => (n === undefined ? [] : [{ state: n.state, winner: n.winner }])) })),
  };
}

function auditionOf(t: SoundTake, m: AudioMeasureRow | undefined): HuntOpenView["takes"][string] {
  const ok = m !== undefined && m.error === null;
  return {
    id: t.id,
    title: t.title,
    src: t.file === null ? null : `/api/sound/takes/${encodeURIComponent(t.id)}/file`,
    peaks: ok && m.peaks.length > 0 ? [...m.peaks] : [...(t.peaks ?? [])],
    lengthS: (ok ? m.durationS : null) ?? t.measured?.durationS ?? t.durationS,
    verdict: t.verdict,
    stage: t.stage,
  };
}

export async function readHunt(kind: Kind, h: string | null): Promise<HuntDeskView> {
  const reg = deskEngines();
  const block = liveBlock(reg, kind) ?? null;
  const reach: Record<string, Reach> = { elevenlabs: "render", suno: "hand", local: "none" };
  const base = { kind, reach, liveBlock: block, known: TECHNIQUES[kind] };
  let hunts: Hunt[];
  let takes: SoundTake[];
  try {
    [hunts, takes] = await Promise.all([readHunts().then((f) => f.hunts.filter((x) => x.kind === kind)), readTakes().then((f) => f.takes)]);
  } catch (e) {
    const error = `the hunt store did not read: ${words(e)}`;
    return { ...base, hunts: { ok: false, error }, open: h === null ? null : { ok: false, error } };
  }
  const k = kernel();
  const squared = hunts
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((x) => {
      const flying = k.ok ? renderInFlight(k.value.store, x.id) : k;
      const inFlight = flying.ok && flying.value ? new Set(x.nodes.filter((n) => n.state === "rendering").map((n) => n.id)) : new Set<string>();
      return { hunt: x, nodes: reconcile(x.id, x.nodes.map(leafOf), takes, inFlight) };
    });
  const cards = squared.map((s) => cardOf(s.hunt, s.nodes));
  if (h === null) return { ...base, hunts: { ok: true, value: cards }, open: null };
  const one = squared.find((s) => s.hunt.id === h);
  if (one === undefined) return { ...base, hunts: { ok: true, value: cards }, open: { ok: false, error: `no ${kind} hunt ${h}` } };
  const ids = new Set(one.nodes.flatMap((n) => n.takeIds));
  const mine = takes.filter((t) => ids.has(t.id));
  const m = k.ok ? measuresByItem(k.value.store, mine.map((t) => `audio:${t.id}`)) : k;
  const by = m.ok ? m.value : new Map<string, AudioMeasureRow>();
  const lessons = await listLessons(kind);
  const lesson = one.hunt.lessonId === null || !lessons.ok ? null : (lessons.value.find((l) => l.id === one.hunt.lessonId) ?? null);
  return {
    ...base,
    hunts: { ok: true, value: cards },
    open: {
      ok: true,
      value: {
        id: one.hunt.id,
        kind: one.hunt.kind,
        idea: one.hunt.idea,
        createdAt: one.hunt.createdAt,
        draftedBy: one.hunt.draftedBy,
        nodes: one.nodes,
        takes: Object.fromEntries(mine.map((t) => [t.id, auditionOf(t, by.get(`audio:${t.id}`))])),
        lesson: lesson === null ? null : { id: lesson.id, claim: lesson.claim, technique: [...lesson.technique], n: lesson.evidence.n, keepRate: lesson.evidence.keepRate, confirmedAt: lesson.confirmedAt },
        inFlight: squared.find((s) => s.hunt.id === h)?.nodes.some((n) => n.state === "rendering") ?? false,
        measures: m.ok ? null : m.error.message,
      },
    },
  };
}
