// WHAT A LOCAL PRESS PLAYS (spark audio-agent-studio, stage S1), pure: a `play` or `hear` action
// against a turn becomes a key, the layers the transport plays and the section spans a stem's
// `enters` follows. The host's dispatch uses it; a variant uses the same functions to ask whether
// a piece is the one sounding (`transport.stateOf(soundKey(...))`) and to build its own local
// presses (`localPlay`, `localMix`), so a variant's play mark and a proposal's play are one sound.
import type { StudioAction, StudioActionOf, StudioNode, StudioNodeOf, StudioTurn } from "@gt/domain/audio.studio";
import { sectionSpans, type Span } from "@gt/ui/components/audio/mix.ts";
import type { MixLayer } from "@gt/ui/components/audio/useMix.ts";

export type Sound = { readonly key: string; readonly name: string; readonly layers: readonly MixLayer[]; readonly spans: readonly Span[] | null };

/** The transport key of a piece, a stem of it, or a candidate heard one way. */
export const soundKey = (turnId: string, nodeId: string, part?: string): string => (part === undefined ? `${turnId}/${nodeId}` : `${turnId}/${nodeId}/${part}`);

/** The turn's sections in seconds: its own seconds, else bars at the track's tempo; null when neither. */
export function spansOf(turn: Pick<StudioTurn, "show">): readonly Span[] | null {
  const sections = turn.show.find((n): n is StudioNodeOf<"sections"> => n.kind === "sections");
  const track = turn.show.find((n): n is StudioNodeOf<"track"> => n.kind === "track");
  return sections === undefined ? null : sectionSpans(sections.rows, track?.bpm);
}

/** Every stem with audio as a layer, carrying its as-rendered mix and its section entries. */
export function stemLayers(node: StudioNodeOf<"stems">, only?: string): readonly MixLayer[] {
  return node.rows
    .filter((r) => r.audio !== undefined && (only === undefined || r.id === only))
    .map((r) => ({
      id: r.id,
      href: r.audio?.href ?? "",
      mix: { ...(r.muted !== undefined ? { muted: r.muted } : {}), ...(r.solo !== undefined ? { solo: r.solo } : {}), ...(r.levelDb !== undefined ? { levelDb: r.levelDb } : {}), ...(r.pan !== undefined ? { pan: r.pan } : {}) },
      ...(r.enters !== undefined ? { enters: r.enters } : {}),
    }));
}

/** A piece's sound (a stem of it when `stem` is given); null for a piece with nothing to play. */
export function nodeSound(turn: Pick<StudioTurn, "id" | "show">, node: StudioNode, stem?: string): Sound | null {
  const spans = spansOf(turn);
  const at = (layers: readonly MixLayer[], name: string, part?: string): Sound | null => (layers.length === 0 ? null : { key: soundKey(turn.id, node.id, part), name, layers, spans });
  if (node.kind === "track") return at([{ id: "mix", href: node.mix.href }], node.title ?? "the track");
  if (node.kind === "stems") {
    const row = stem === undefined ? undefined : node.rows.find((r) => r.id === stem);
    return at(stemLayers(node, stem), row?.label ?? "every part", stem);
  }
  if (node.kind === "duel") return at([{ id: "a", href: node.a.audio.href }], node.a.label, "a");
  if (node.kind === "candidates") {
    const c = node.rows.find((r) => r.alone !== undefined);
    return c?.alone === undefined ? null : at([{ id: c.id, href: c.alone.href }], `${c.name} alone`, `${c.id}:alone`);
  }
  return null;
}

/** A candidate heard alone or inside the mix; null when that audio is not offered. */
export function hearSound(turn: Pick<StudioTurn, "id">, node: StudioNodeOf<"candidates">, candidate: string, mode: "alone" | "in_mix"): Sound | null {
  const c = node.rows.find((r) => r.id === candidate);
  const audio = mode === "alone" ? c?.alone : c?.inMix;
  if (c === undefined || audio === undefined) return null;
  return { key: soundKey(turn.id, node.id, `${c.id}:${mode}`), name: `${c.name} ${mode === "alone" ? "alone" : "in the mix"}`, layers: [{ id: c.id, href: audio.href }], spans: null };
}

/** The sound a play or hear action makes against a turn; null when it points at nothing audible. */
export function soundOf(turn: StudioTurn, a: StudioActionOf<"play"> | StudioActionOf<"hear">): Sound | null {
  const node = turn.show.find((n) => n.id === a.node);
  if (node === undefined) return null;
  if (a.kind === "hear") return node.kind === "candidates" ? hearSound(turn, node, a.candidate, a.mode) : null;
  return nodeSound(turn, node, a.stem);
}

/** A variant's own play mark, as an action (never sent to the agent: `play` is local). */
export const localPlay = (node: string, stem?: string): StudioActionOf<"play"> => ({ id: `local.play.${node}${stem === undefined ? "" : `.${stem}`}`, kind: "play", label: "play", node, ...(stem !== undefined ? { stem } : {}) });

/** A variant's own mixer press, as an action. */
export function localMix(stem: string, change: { readonly muted: boolean } | { readonly solo: boolean } | { readonly db: number } | { readonly pan: number }): StudioAction {
  const id = `local.mix.${stem}`;
  if ("muted" in change) return { id, kind: "mute", label: "mute", stem, on: change.muted };
  if ("solo" in change) return { id, kind: "solo", label: "solo", stem, on: change.solo };
  if ("db" in change) return { id, kind: "level", label: "level", stem, db: change.db };
  return { id, kind: "pan", label: "pan", stem, pan: change.pan };
}
