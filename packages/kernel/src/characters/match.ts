import { normText } from "@gt/domain/library";
import type { CharacterRecord } from "@gt/domain/production";

// TEXT MATCHING OVER CARDS (spark concept-casting-stages S2): a role's words against each character's card and slots,
// best first, each candidate saying which words matched where. No vision and no embedding: words only.
//
// A SEPARATE SCORER, NOT THE LIBRARY'S SEARCH. The Library's FTS is an AND of prefixes over a haystack of facets: it
// cannot say which field a word hit, and a role description of a dozen words would match nothing. There are a few
// hundred characters, so a scan per round costs nothing and needs no second index to keep in step.

/** A rarer word counts for more, and a word in the card counts for more than one in a passing slot. */
const FIELD_WEIGHT: Readonly<Record<string, number>> = { role: 4, look: 3, personality: 3, heritage: 2, wardrobe: 2, hair: 2, mark: 2, use: 2, name: 1 };
const SLOT_WEIGHT = 1;

const STOP: ReadonlySet<string> = new Set("the and with for who that this her his she him their they from into over under very has have had was were are not but out one two a an of in on at to is it as by".split(" "));

/** A plural, a verb ending and a final e folded, so `freckled` meets `freckles` and `mages` meets `mage`. Crude on purpose. */
function stem(w: string): string {
  if (w.length <= 3) return w;
  const bare = w.length > 4 ? w.replace(/(ing|ed)$/, "") : w;
  const single = bare.replace(/s$/, "");
  return single.length > 3 ? single.replace(/e$/, "") : single;
}

function wordsOf(s: string): string[] {
  return normText(s).split(/\s+/).filter((w) => w !== "" && w.length >= 3 && !STOP.has(w));
}

type Field = { readonly name: string; readonly weight: number; readonly stems: ReadonlySet<string> };

function fieldsOf(c: CharacterRecord): Field[] {
  const f = (name: string, text: string, weight: number): Field => ({ name, weight, stems: new Set(wordsOf(text).map(stem)) });
  const out = [f("name", c.card.name, FIELD_WEIGHT["name"] ?? 1), f("look", c.card.look, FIELD_WEIGHT["look"] ?? 1), f("personality", c.card.personality, FIELD_WEIGHT["personality"] ?? 1)];
  for (const [k, v] of Object.entries(c.slots ?? {})) out.push(f(k, v, FIELD_WEIGHT[k] ?? SLOT_WEIGHT));
  return out;
}

export type CharacterMatch = {
  readonly character: CharacterRecord;
  readonly score: number;
  /** Which of the role's words hit which field, strongest field first: the candidate's `match` line. */
  readonly why: readonly string[];
};

/**
 * The best matches for `brief`, at most `limit`. A word found in many characters counts for little. A character the
 * operator rated `no` still matches, but always after every other match. Ties go to the id, so a round is repeatable.
 */
export function matchCards(characters: readonly CharacterRecord[], brief: string, limit: number): readonly CharacterMatch[] {
  const terms = [...new Set(wordsOf(brief))];
  if (terms.length === 0 || limit <= 0) return [];
  const carded = characters.map((character) => ({ character, fields: fieldsOf(character) }));
  const rarity = new Map(
    terms.map((w) => {
      const s = stem(w);
      const having = carded.filter((c) => c.fields.some((f) => f.stems.has(s))).length;
      return [w, Math.log(1 + characters.length / Math.max(1, having))] as const;
    }),
  );
  const hits: { readonly m: CharacterMatch; readonly sunk: boolean }[] = [];
  for (const { character, fields } of carded) {
    let score = 0;
    const byField = new Map<string, { readonly weight: number; words: string[] }>();
    for (const w of terms) {
      const s = stem(w);
      const best = fields.filter((f) => f.stems.has(s)).sort((a, b) => b.weight - a.weight)[0];
      if (best === undefined) continue;
      score += best.weight * (rarity.get(w) ?? 1);
      const line = byField.get(best.name) ?? { weight: best.weight, words: [] };
      line.words.push(w);
      byField.set(best.name, line);
    }
    if (score === 0) continue;
    const why = [...byField.entries()].sort((a, b) => b[1].weight - a[1].weight).map(([f, l]) => `${f}: ${l.words.join(", ")}`);
    hits.push({ m: { character, score: Math.round(score * 100) / 100, why }, sunk: character.slots?.["rating"] === "no" });
  }
  hits.sort((a, b) => Number(a.sunk) - Number(b.sunk) || b.m.score - a.m.score || (a.m.character.id < b.m.character.id ? -1 : 1));
  return hits.slice(0, limit).map((h) => h.m);
}
