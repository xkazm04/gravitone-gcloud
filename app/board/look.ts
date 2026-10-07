// THE BOARD'S LOOK, AS DATA — which glyph a source wears, which picture an
// item is shown by, and the facts a card reads by name. Pure lookups the sheet
// and the loupe share, so a triage card cannot wear one icon on a frame and
// another in the loupe.
//
// THE COVER IS THE WORK'S OWN PICTURE, never a decoration. An item with an
// image or a video is shown by its first one. An ADOPTION item has no picture
// in its media — a candidate script is words — but it IS a pick between
// narrative engines, and each engine has one committed still in public/deck-art,
// keyed `engine-<render id>` (app/_studio/deckArt.ts:53, "engine keys from the
// script render ids"). The adoption key is `<project>::<render id>`
// (lib/board/sources/adoption.ts), so the still the user saw when the engine was
// offered is the still the Board shows for it. Everything else that is words
// stays words, drawn as a typographic card (./parts.tsx TextArt).

import {
  CalendarClock,
  Dumbbell,
  Flag,
  Layers,
  ListChecks,
  Newspaper,
  Pipette,
  Quote,
  Repeat2,
  Scale,
  ScanEye,
  ScrollText,
  Shield,
  Stamp,
  Workflow,
  type LucideIcon,
  AudioLines,
} from "lucide-react";

import { DECK_ART } from "@/app/_studio/deckArt";
import { keyOfItem, type BoardEntry } from "@/lib/board/source";
import type { BoardItem, BoardMedia, BoardSourceId } from "@/lib/board/types";

export const SOURCE_ICON: Record<BoardSourceId, LucideIcon> = {
  cull: ScanEye,
  extract: Pipette,
  dojo: Dumbbell,
  proof: Stamp,
  adoption: ScrollText,
  alternative: Layers,
  triage: ListChecks,
  publish: CalendarClock,
  articles: Newspaper,
  audio: AudioLines,
};

/** A research card's kind (app/_phases/_shared/notebook/cards.ts CardKind). */
export const KIND_ICON: Record<string, LucideIcon> = {
  fact: Quote,
  mechanism: Workflow,
  reversal: Repeat2,
  "steel-man": Shield,
  counter: Scale,
  conclusion: Flag,
};

/** One named fact off an entry, verbatim, or null. */
export function fact(entry: BoardEntry, name: string): string | null {
  return entry.facts.find((f) => f.name === name)?.value ?? null;
}

export const picturesOf = (item: BoardItem): BoardMedia[] => item.media.filter((m) => (m.kind === "image" || m.kind === "video") && m.src);
export const wordsOf = (item: BoardItem): BoardMedia[] => item.media.filter((m) => m.kind === "text" && m.text);

/** The picture an item is shown by, or null when it is words alone. */
export function coverOf(item: BoardItem): BoardMedia | null {
  const pic = picturesOf(item)[0];
  if (pic) return pic;
  if (item.source === "adoption") {
    const key = keyOfItem(item.id);
    const render = key.slice(key.indexOf("::") + 2);
    const art = DECK_ART[`engine-${render}`];
    if (art) return { kind: "image", src: art.src };
  }
  return null;
}

/** The engine half of an adoption title (`${engineLabel} · ${title}`). */
export function splitTitle(item: BoardItem): { kicker: string | null; title: string } {
  if (item.source !== "adoption") return { kicker: null, title: item.title };
  const at = item.title.indexOf(" · ");
  return at < 0 ? { kicker: null, title: item.title } : { kicker: item.title.slice(0, at), title: item.title.slice(at + 3) };
}

/** What a picture in a two-up is, where the adapter's order says so: a dojo
 *  pair is baseline then challenger (lib/board/sources/dojo.ts entriesOf). */
export function roleOf(item: BoardItem, index: number, count: number): string | null {
  if (item.source === "dojo" && count === 2) return index === 0 ? "baseline" : "challenger";
  return null;
}

/** A words-only item with no cover (a research card, a publish slot) is
 *  drawn as a plate that carries its own title large; the surface around it
 *  then keeps its heading for screen readers only, rather than print the
 *  claim twice. */
export const plateOwnsTitle = (item: BoardItem): boolean => coverOf(item) === null;

/** The line under a contact-sheet frame. A picture's title; for a card that
 *  already shows its words, where they came from instead. */
export function captionOf(entry: BoardEntry): string {
  const { item } = entry;
  // An adoption frame is one engine among three for the same project — the
  // roll names the project, the caption names the engine.
  if (item.source === "adoption") return splitTitle(item).kicker ?? item.title;
  if (coverOf(item)) return splitTitle(item).title;
  if (item.source === "triage") return fact(entry, "source") ?? fact(entry, "kind") ?? item.title;
  if (item.source === "publish") return [fact(entry, "channel"), fact(entry, "publish at")].filter(Boolean).join(" · ") || item.title;
  return item.title;
}
