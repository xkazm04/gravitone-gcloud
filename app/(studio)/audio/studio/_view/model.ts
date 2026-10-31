// THE STUDIO VIEW'S PURE MODEL (spark audio-agent-studio, stage S2: canvas's frame, desk's pieces).
// The session's turns fold into result cards (the ask + the agent's answer, one card per agent turn,
// a pending card while an ask waits); each card's pieces follow the HOST'S CARRY-OVER RULE - the
// arrangement (track, sections, stems) and what was heard stay into a later card until a turn
// replaces them, marked "from an earlier answer", while choices (candidates, pull, duel) and
// readings (measures) belong only to the turn that offered them; and a proposal says what pressing
// it does from its resolved target (registry schema-driven-ui action-consent-wiring). No
// React here, so all of it is tested without a DOM.
import type { StudioAction, StudioNodeKind, StudioNodeOf, StudioTurn } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import { DESK_CARRY, deskPieces, levelWords, panWords, type DeskPieces } from "@gt/ui/components/studio-desk/desk.ts";

import { versionName } from "./thread.ts";

/** One card: the ask that opened it (null for an agent turn with no ask before it) and its answer
 *  (null while the agent is still working on the ask). */
export type CardModel = {
  readonly key: string;
  /** 1-based count of answered cards; the pending card carries the next number. */
  readonly n: number;
  readonly ask: StudioTurn | null;
  readonly answer: ParsedTurn | null;
};

export function cardsOf(turns: readonly ParsedTurn[]): readonly CardModel[] {
  const out: CardModel[] = [];
  let ask: StudioTurn | null = null;
  for (const t of turns) {
    if (t.turn.from === "user") {
      ask = t.turn;
      continue;
    }
    out.push({ key: t.turn.id, n: out.length + 1, ask, answer: t });
    ask = null;
  }
  if (ask !== null) out.push({ key: `pending:${ask.id}`, n: out.length + 1, ask, answer: null });
  return out;
}

/** The carry-over rule, per kind: does a piece of this kind stay into later cards until replaced. */
export const CARRY: Readonly<Record<StudioNodeKind, boolean>> = DESK_CARRY;

/** A card's pieces under the carry-over rule: its own, plus the arrangement and what was heard from
 *  the newest earlier answer that drew them (each marked `carried`). */
export const cardPieces = (turns: readonly ParsedTurn[], turnId: string): DeskPieces => deskPieces(turns, turnId);

/** Does a card have anything to draw on its timeline (a track, sections, parts or a choice of instrument). */
export const hasTimeline = (p: DeskPieces): boolean => p.track.length + p.sections.length + p.stems.length + p.candidates.length + p.duel.length > 0;

/** The turn's first piece of a kind. */
export const nodeOf = <K extends StudioNodeKind>(turn: Pick<StudioTurn, "show">, kind: K): StudioNodeOf<K> | undefined =>
  turn.show.find((n) => n.kind === kind) as StudioNodeOf<K> | undefined;

/** A card's name in a few words: the Suno prompt version it shows, else its track's title, else what its
 *  first choice is about, else its taste proposals, else its first sentence. */
export function cardTitle(turn: StudioTurn): string {
  const prompt = nodeOf(turn, "suno_prompt");
  if (prompt !== undefined) return versionName(prompt);
  for (const n of turn.show) {
    if (n.kind === "track") return n.title ?? "the track";
    if (n.kind === "candidates") return n.title ?? `choices: ${n.prompt ?? "a new sound"}`;
    if (n.kind === "duel" || n.kind === "pull") return n.title ?? n.question;
  }
  const taste = nodeOf(turn, "taste");
  if (taste !== undefined) return `taste: ${taste.rows.length} line${taste.rows.length === 1 ? "" : "s"} to keep`;
  const first = turn.text.split(/(?<=[.!?:])\s/)[0] ?? turn.text;
  return first.length > 60 ? `${first.slice(0, 57)}...` : first;
}

/** A stem's plain name, looked up in this turn first and then in earlier turns (newest first). */
export function stemLabel(turns: readonly ParsedTurn[], uptoId: string, stemId: string): string | null {
  const end = turns.findIndex((t) => t.turn.id === uptoId);
  for (let i = end === -1 ? turns.length - 1 : end; i >= 0; i--) {
    const t = turns[i];
    const stems = t === undefined ? undefined : nodeOf(t.turn, "stems");
    const row = stems?.rows.find((r) => r.id === stemId);
    if (row !== undefined) return row.label;
  }
  return null;
}

/** From this many parts on, a lane draws compact (one line of controls) so eight parts read on one screen. */
export const COMPACT_AT = 6;
export const compactLanes = (rows: number): boolean => rows >= COMPACT_AT;

/** Names the consent line reads from: the turn's pieces by id, the stems by id. */
export type Resolve = { readonly node: (id: string) => string | null; readonly stem: (id: string) => string | null; readonly side: (node: string, side: "a" | "b" | 0 | 1) => string | null };

export function resolverOf(turn: StudioTurn, stemName: (id: string) => string | null): Resolve {
  const find = (id: string) => turn.show.find((n) => n.id === id);
  return {
    node: (id) => {
      const n = find(id);
      if (n === undefined) return null;
      if (n.kind === "track") return n.title ?? "the track";
      if (n.kind === "stems") return "every part";
      if (n.kind === "duel" || n.kind === "pull") return n.question;
      return n.title ?? id;
    },
    stem: stemName,
    side: (id, side) => {
      const n = find(id);
      if (n?.kind === "duel") return side === "a" ? n.a.label : side === "b" ? n.b.label : null;
      if (n?.kind === "pull") return side === 0 ? n.sides[0].label : side === 1 ? n.sides[1].label : null;
      return null;
    },
  };
}

const q = (s: string | null, fallback: string): string => `"${s ?? fallback}"`;

/** What pressing a proposal does, derived from its kind and resolved targets (not from its label). */
export function doesWords(a: StudioAction, r: Resolve, candidateName: (node: string, id: string) => string | null): string {
  switch (a.kind) {
    case "play":
      return a.stem === undefined ? `plays ${q(r.node(a.node), a.node)} here` : `plays only ${q(r.stem(a.stem), a.stem)} here`;
    case "hear":
      return `plays ${q(candidateName(a.node, a.candidate), a.candidate)} ${a.mode === "alone" ? "on its own" : "inside the song"} here`;
    case "mute":
      return a.on ? `turns ${q(r.stem(a.stem), a.stem)} off here` : `turns ${q(r.stem(a.stem), a.stem)} back on here`;
    case "solo":
      return a.on ? `plays only ${q(r.stem(a.stem), a.stem)} when the parts play` : "lets every part play again";
    case "level":
      return `makes ${q(r.stem(a.stem), a.stem)} ${levelWords(a.db)} here`;
    case "pan":
      return `moves ${q(r.stem(a.stem), a.stem)} ${panWords(a.pan)} here`;
    case "use_candidate":
      return `asks the agent to use ${q(candidateName(a.node, a.candidate), a.candidate)}`;
    case "swap_stem":
      return `asks the agent to change ${q(r.stem(a.stem), a.stem)}`;
    case "settle_pull":
      return `tells the agent to lean ${q(r.side(a.node, a.side), String(a.side))}`;
    case "pick":
      return `tells the agent you prefer ${q(r.side(a.node, a.side), a.side)}`;
    case "render":
      return "asks the agent for a fresh take";
    case "say":
      return `says to the agent: "${a.text}"`;
  }
}

/** Why an agent-bound press cannot go now, in words; null when it can. Nobody listening yet is not a
 *  block: the ask waits in the inbox for the agent's next look. The offline preview is. */
export function askBlockedWords(state: string, presence: "listening" | "nobody"): string | null {
  if (state === "thinking") return "Wait for the agent to finish the last ask.";
  if (state === "offline" && presence !== "nobody") return "No agent is listening, so this cannot be sent.";
  return null;
}
