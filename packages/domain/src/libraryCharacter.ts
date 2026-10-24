// THE CHARACTER KIND'S WORDS (spark scout-use-aim): one Library item per kept /scout-muse woman -
// her card, the stills she was kept in, and the core prompt that draws her. A leaf, pure: it
// imports nothing, and ./libraryMedia.ts holds the item's extras over the types here.
//
// The facets are read off the card: an age band from her age, a build from the word her look puts
// before "build" (the muse door keeps no structured build; techniques.md has the card state it in
// the look), the look directions she was kept in and the applications those stills served come from
// the feed (lib/library/feeds/character.ts).

/** The age facet's bands. Never open-ended below: a card outside the muse door's 25-50 still lands. */
export const AGE_BANDS = ["under 30", "30–34", "35–39", "40–44", "45+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export function ageBand(n: number): AgeBand {
  return n < 30 ? "under 30" : n < 35 ? "30–34" : n < 40 ? "35–39" : n < 45 ? "40–44" : "45+";
}

const NOT_A_BUILD: ReadonlySet<string> = new Set(["a", "an", "the", "her", "their", "body", "same", "this", "that", "and"]);

/** The build a card's look names: the word before "build" (`slim build`, `lean build`). Absent when it names none. */
export function buildOf(look: string): string | undefined {
  for (const m of look.toLowerCase().matchAll(/\b([a-z][a-z-]*) build\b/g)) {
    const w = m[1];
    if (w !== undefined && !NOT_A_BUILD.has(w)) return w;
  }
  return undefined;
}

/** A muse wing's character card (lib/foundry/scout/muse.ts CharacterCard), restated: a package cannot import lib/. */
export type CharacterCardFacts = { readonly name: string; readonly age: number; readonly look: string; readonly personality: string };

/** One kept still of her: which night and cell, the look direction it tried (absent on a legacy night),
 *  the genre rung, the still as an address a page can draw, and the catalogue style the look became. */
export type CharacterLook = {
  readonly night: string;
  readonly cell: string;
  readonly look?: string;
  readonly genre?: string;
  readonly image: string;
  readonly styleId?: string;
};

/** The character kind's extras: her card, the core prompt (corePrompt) and her kept stills, newest first. */
export type CharacterExtras = {
  readonly card: CharacterCardFacts;
  readonly prompt: string;
  readonly looks: readonly CharacterLook[];
};

const flat = (s: string): string => s.replace(/\s+/g, " ").trim();
const SENTENCE_END = /^[^.!?]*[.!?]/;

/**
 * Her core prompt: the CARD block verbatim, then the LOOK block of a still's prompt - that prompt
 * with the sentence that restates her card taken out. The sentence is found by the card's look text
 * (the prompts restate it verbatim, knowledge/scout-muse/techniques.md) and cut from the end of the
 * sentence before it to its own end; a prompt that restated nothing verbatim loses the sentences
 * that state her age instead. Pure.
 */
export function corePrompt(card: Pick<CharacterCardFacts, "name" | "age" | "look">, prompt: string): string {
  const p = flat(prompt);
  const needle = flat(card.look).replace(/[.!?]+$/, "");
  const at = needle === "" ? -1 : p.indexOf(needle);
  let look: string;
  if (at >= 0) {
    const before = p.slice(0, at);
    const cut = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
    const after = p.slice(at + needle.length);
    const end = SENTENCE_END.exec(after);
    look = flat(`${cut < 0 ? "" : before.slice(0, cut + 1)} ${end === null ? "" : after.slice(end[0].length)}`);
  } else {
    look = p
      .split(/(?<=[.!?])\s+/)
      .filter((x) => !x.includes(`aged ${card.age}`))
      .join(" ");
  }
  const block = `${card.name}, aged ${card.age}, ${flat(card.look).replace(/[.!?]*$/, ".")}`;
  return look === "" ? block : `${block}\n\n${look}`;
}
