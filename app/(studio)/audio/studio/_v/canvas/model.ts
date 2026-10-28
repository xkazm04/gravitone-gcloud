// THE CANVAS'S PURE MODEL (spark audio-agent-studio WP3, the "conversation canvas" variant): the
// session's turns folded into result cards (the user's ask + the agent's answer, one card per agent
// turn), the geometry a sections band and a stem's entry mask share, and the words a proposal shows
// about what pressing it will do (registry schema-driven-ui action-consent-wiring: what is displayed
// for consent is derived from the resolved action, never from its label alone). No React here.
import type { StudioAction, StudioNodeKind, StudioNodeOf, StudioStem, StudioTurn } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";

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

/** The turn's first piece of a kind. */
export const nodeOf = <K extends StudioNodeKind>(turn: Pick<StudioTurn, "show">, kind: K): StudioNodeOf<K> | undefined =>
  turn.show.find((n) => n.kind === kind) as StudioNodeOf<K> | undefined;

/** A card's name in a few words: its track's title, else what its first choice is about, else its first sentence. */
export function cardTitle(turn: StudioTurn): string {
  for (const n of turn.show) {
    if (n.kind === "track") return n.title ?? "the track";
    if (n.kind === "candidates") return n.title ?? `choices: ${n.prompt ?? "a new sound"}`;
    if (n.kind === "duel" || n.kind === "pull") return n.title ?? n.question;
  }
  const first = turn.text.split(/(?<=[.!?:])\s/)[0] ?? turn.text;
  return first.length > 60 ? `${first.slice(0, 57)}...` : first;
}

/** A stem's plain name, looked up in this turn first and then in earlier turns (newest first). */
export function stemLabel(turns: readonly ParsedTurn[], uptoId: string, stemId: string): string | null {
  const end = turns.findIndex((t) => t.turn.id === uptoId);
  for (let i = (end === -1 ? turns.length - 1 : end); i >= 0; i--) {
    const t = turns[i];
    const stems = t === undefined ? undefined : nodeOf(t.turn, "stems");
    const row = stems?.rows.find((r) => r.id === stemId);
    if (row !== undefined) return row.label;
  }
  return null;
}

/** One cell of a sections band, as fractions of the band's width. */
export type Cell = { readonly left: number; readonly width: number };

/**
 * Where each section sits across the band: by seconds when the sections have spans and the
 * track's length is known (so the band lines up under the waveform), else by bars end to end.
 */
export function bandCells(rows: readonly { readonly bars: number }[], spans: readonly { readonly startS: number; readonly endS: number }[] | null, lengthS: number | null): readonly Cell[] {
  if (spans !== null && spans.length === rows.length && lengthS !== null && lengthS > 0) {
    const end = Math.max(lengthS, spans[spans.length - 1]?.endS ?? 0);
    return spans.map((sp) => ({ left: sp.startS / end, width: (sp.endS - sp.startS) / end }));
  }
  const total = rows.reduce((a, r) => a + r.bars, 0) || 1;
  let at = 0;
  return rows.map((r) => {
    const c = { left: at / total, width: r.bars / total };
    at += r.bars;
    return c;
  });
}

/** How a stem's entries read in words ("plays in lift and outro"); null when it plays everywhere. */
export function entersWords(stem: Pick<StudioStem, "enters">, sections: readonly { readonly name: string }[] | null): string | null {
  if (stem.enters === undefined || sections === null || stem.enters.length !== sections.length) return null;
  const on = sections.filter((_, i) => stem.enters?.[i] === true).map((s) => s.name);
  if (on.length === sections.length) return null;
  if (on.length === 0) return "silent in every part of the song";
  return `plays in ${on.length === 1 ? on[0] : `${on.slice(0, -1).join(", ")} and ${on[on.length - 1]}`}`;
}

/** A level in plain words: "as made", "a little louder", "much quieter", "off". */
export function levelWords(db: number): string {
  if (db <= -60) return "off";
  if (db === 0) return "as made";
  const much = Math.abs(db) >= 6 ? "much" : "a little";
  return `${much} ${db > 0 ? "louder" : "quieter"} (${db > 0 ? "+" : ""}${db} dB)`;
}

/** A pan in plain words: "in the middle", "a little left", "far right". */
export function panWords(pan: number): string {
  if (Math.abs(pan) < 0.05) return "in the middle";
  const far = Math.abs(pan) >= 0.7 ? "far" : Math.abs(pan) >= 0.3 ? "to the" : "a little";
  return `${far} ${pan < 0 ? "left" : "right"}`;
}

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
      return a.on ? `plays only ${q(r.stem(a.stem), a.stem)} when the parts play` : `lets every part play again`;
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

/** A heard sentence cut into plain runs and linked runs (each link's first free occurrence, any case). */
export type Run = { readonly text: string; readonly link: number | null };

export function runsOf(sentence: string, links: readonly { readonly words: string }[]): readonly Run[] {
  const lower = sentence.toLowerCase();
  const hits: { start: number; end: number; link: number }[] = [];
  links.forEach((l, link) => {
    const w = l.words.toLowerCase();
    let from = 0;
    while (w !== "" && from <= lower.length) {
      const start = lower.indexOf(w, from);
      if (start === -1) return;
      const end = start + w.length;
      if (!hits.some((h) => start < h.end && end > h.start)) {
        hits.push({ start, end, link });
        return;
      }
      from = start + 1;
    }
  });
  hits.sort((a, b) => a.start - b.start);
  const out: Run[] = [];
  let at = 0;
  for (const h of hits) {
    if (h.start > at) out.push({ text: sentence.slice(at, h.start), link: null });
    out.push({ text: sentence.slice(h.start, h.end), link: h.link });
    at = h.end;
  }
  if (at < sentence.length) out.push({ text: sentence.slice(at), link: null });
  return out;
}
