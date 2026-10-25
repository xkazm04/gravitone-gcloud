// KEPT CHARACTERS (spark scout-vision S3) - one reader over the scout nights and the muse ARCHIVE (the four muse nights,
// read-only since the wings merged): a kept character is a `character` idea kept on a live committed night of either
// root, grouped by her card's folded name, with her newest kept portrait and her newest KEPT reference sheet. Cast
// briefs, sheets, the taste brief and the Library read this; nothing writes it. The signatures are final (WP0);
// identityBlock and characterKey are the contract's own; keptCharacters and castPrompt are WP1's.

import type { CharacterCard } from "./muse";
import { cellId, type IdeaCandidate, type Night, type SheetCandidate } from "./types";

/** A night as a reader sees it: which root it sits in (night ids COLLIDE across roots - key by both). */
export type RootedNight = { readonly root: "scout" | "archive"; readonly night: Night };

export type KeptCharacter = {
  /** characterKey(card.name). */
  readonly key: string;
  /** The newest kept card, as written. */
  readonly card: CharacterCard;
  /** Her newest kept portrait: `<runId>/<c-id>` (runId `muse:<night>` for the archive) and the night-relative file. */
  readonly portrait: { readonly ref: string; readonly root: "scout" | "archive"; readonly night: string; readonly file: string };
  /** Her newest KEPT reference sheet (scout root only); omitted until one is kept. */
  readonly sheet?: { readonly ref: string; readonly night: string; readonly file: string };
  /** Every `<runId>/<c-id>` she was kept on, oldest first. */
  readonly keptOn: readonly string[];
};

/** A card name folded for identity: case and runs of whitespace (`Mara  Vale` = `mara vale`). */
export function characterKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Her IDENTITY BLOCK - what is restated VERBATIM at the head of every prompt she is cast in, and nothing that varies
 * (registry image-prompt-composition / identity-split-from-state): name, stated age, look. The state (expression,
 * pose, situation, personality) goes in its own sentence after it.
 */
export function identityBlock(card: CharacterCard): string {
  return `${card.name}, aged ${card.age}: ${card.look.trim().replace(/\.$/, "")}.`;
}

/**
 * The prompt a cast brief draws (spark scout-vision S3): each cast member's identity block VERBATIM, in cast order, then
 * the brief's own words - the state - in a sentence of their own (registry identity-split-from-state).
 */
export function castPrompt(cast: readonly CharacterCard[], state: string): string {
  return [...cast.map(identityBlock), state.trim()].join(" ");
}

/** A night's run id as its packets, files and refs spell it: the archive's is `muse:<night>` forever. */
export const rootedRunId = (r: Pick<RootedNight, "root"> & { readonly night: Pick<Night, "id"> }): string => (r.root === "archive" ? `muse:${r.night.id}` : r.night.id);

/** One kept cell of a live committed night: its instant (the commit's), the night and the candidate. */
type Keep<C> = { readonly at: string; readonly r: RootedNight; readonly c: C };
type Portrait = IdeaCandidate & { readonly card: CharacterCard; readonly image: string };
type Sheet = SheetCandidate & { readonly image: string };

/** The kept cells of a night the Library would shelve: committed, neither the night nor its record dry, and not left open. */
function keptCells(n: Night): ReadonlySet<string> | undefined {
  const done = n.committed;
  if (n.state !== "committed" || n.dry || done === undefined || done.dry) return undefined;
  const open = new Set(done.open ?? []);
  return new Set(done.kept.filter((c) => !open.has(c)));
}

/** Oldest first: the commit's instant, then the root (scout after the archive), the night's id, the candidate. */
function olderFirst<C extends { readonly id: string }>(a: Keep<C>, b: Keep<C>): number {
  const ka = [a.at, a.r.root === "archive" ? "0" : "1", a.r.night.id, a.c.id];
  const kb = [b.at, b.r.root === "archive" ? "0" : "1", b.r.night.id, b.c.id];
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return (ka[i] ?? "") < (kb[i] ?? "") ? -1 : 1;
  return 0;
}

/**
 * Every kept character over both roots, oldest first by first keep. A kept character is an idea with target
 * `character`, a card and a drawn still whose board cell (`c-NN/board`) is kept on a live committed night - the Library's
 * character feed's rule (lib/library/feeds/character.ts) - grouped by characterKey(card.name): her newest card and
 * still win, and her sheet is the newest kept `sheet` candidate of her key (`c-NN/sheet`) on a scout night. Nights are
 * keyed by (root, id): the same id in both roots is two nights.
 */
export function keptCharacters(nights: readonly RootedNight[]): readonly KeptCharacter[] {
  const portraits = new Map<string, Keep<Portrait>[]>();
  const sheets = new Map<string, Keep<Sheet>[]>();
  for (const r of nights) {
    const kept = keptCells(r.night);
    if (kept === undefined) continue;
    const at = r.night.committed?.at ?? r.night.startedAt;
    for (const c of r.night.candidates) {
      if (c.kind === "idea" && c.target === "character" && c.card !== undefined && c.image !== undefined && kept.has(cellId(c.id, "board"))) {
        const key = characterKey(c.card.name);
        if (key !== "") portraits.set(key, [...(portraits.get(key) ?? []), { at, r, c: { ...c, card: c.card, image: c.image } }]);
      } else if (c.kind === "sheet" && r.root === "scout" && c.image !== undefined && kept.has(cellId(c.id, "sheet"))) {
        sheets.set(c.character, [...(sheets.get(c.character) ?? []), { at, r, c: { ...c, image: c.image } }]);
      }
    }
  }
  const out: { readonly first: Keep<Portrait>; readonly kc: KeptCharacter }[] = [];
  for (const [key, keeps] of portraits) {
    const ordered = [...keeps].sort(olderFirst);
    const first = ordered[0];
    const newest = ordered[ordered.length - 1];
    if (first === undefined || newest === undefined) continue;
    const sheet = [...(sheets.get(key) ?? [])].sort(olderFirst).pop();
    out.push({
      first,
      kc: {
        key,
        card: newest.c.card,
        portrait: { ref: `${rootedRunId(newest.r)}/${newest.c.id}`, root: newest.r.root, night: newest.r.night.id, file: newest.c.image },
        ...(sheet === undefined ? {} : { sheet: { ref: `${sheet.r.night.id}/${sheet.c.id}`, night: sheet.r.night.id, file: sheet.c.image } }),
        keptOn: ordered.map((k) => `${rootedRunId(k.r)}/${k.c.id}`),
      },
    });
  }
  return out.sort((a, b) => olderFirst(a.first, b.first)).map((x) => x.kc);
}
