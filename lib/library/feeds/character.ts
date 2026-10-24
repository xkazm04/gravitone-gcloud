import "server-only";

import { errorMessage } from "@gt/domain/errors";
import { buildOf, corePrompt, normText, type CharacterLook, type LibraryOrigin } from "@gt/domain/library";

import { ideaCell } from "../../decision/v1/sources/scoutPlan.ts";
import { getCatalogue } from "../../foundry/store.ts";
import { listNights, readNight, resolveInNight } from "../../foundry/scout/store.ts";
import type { IdeaCandidate, Night } from "../../foundry/scout/types.ts";
import { wingRunId } from "../../foundry/scout/wing.ts";
import { withWing } from "../../foundry/scout/wingScope.ts";
import { isoOf, mimeOf, type Feed, type FeedItem, type FeedRead } from "./types.ts";

// THE KEPT MUSE CHARACTERS, AS LIBRARY ITEMS (spark scout-use-aim) - foundry-out/scout-muse/<night>/
// night.json (lib/foundry/scout/store.ts), read inside the muse wing's scope. The scout feed
// (./scout.ts) stays the scout wing's; this one is the muse wing's only.
//
// A KEPT CHARACTER is an idea with target `character` and a card, in a committed night that was not
// dry, whose decision cell (scoutPlan.ts ideaCell) is in the commit's kept list. One item per
// WOMAN: her cards group case-insensitively by name across nights, so a woman drawn in four looks
// is one item with four looks, newest first. The item's media is her newest kept still (a tile and
// a cover are the still itself); its title her name; its prompt the core prompt (corePrompt).
// Rights are publishable: the stills are OUR pictures from our own words, of nobody real.
//
// THE STYLE JOIN, only when it exists: a kept idea cell -> a night's StyleCandidate with
// fromIdea == "<night>/<c-id>" -> its extractRunId == the catalogue style's origin.source (the
// extract writes a subject-free look into the shared catalogue) -> that style's id. A look with no
// such chain carries no styleId; the key is omitted. `look` and `app` are absent on a legacy night
// (written before spark scout-use-aim) and are omitted the same way.
//
// knowledge/scout-muse/characters.md is not read: nothing parses it and it holds no pictures.

const ORIGIN: LibraryOrigin = "scout";
const NIGHT_CAP = 120;

/** The file route that serves a muse night's artboard (app/api/foundry/file `kind=scout`, run `muse:<night>`). */
export const characterImageUrl = (night: string, rel: string): string => `/api/foundry/file?kind=scout&run=${encodeURIComponent(wingRunId("muse", night))}&path=${encodeURIComponent(rel)}`;

/** The Library item id of a woman: her name, folded the way search folds it. */
export const characterItemId = (name: string): string => `character:muse:${normText(name).replace(/ /g, "-")}`;

type Drawn = IdeaCandidate & { readonly card: NonNullable<IdeaCandidate["card"]>; readonly image: string };
/** One kept still of hers, before the grouping. */
type Kept = { readonly night: Night; readonly at: string; readonly c: Drawn };

/** Newest first: the commit's instant, then the night's id, then the cell. */
function newerFirst(a: Kept, b: Kept): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  if (a.night.id !== b.night.id) return a.night.id < b.night.id ? 1 : -1;
  return a.c.id < b.c.id ? 1 : -1;
}

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/**
 * Pure: the muse nights as feed items, one per woman. `styleBySource` maps an extract run id to the
 * catalogue style it wrote; `resolve` turns a night-relative file into the path on disk (it throws
 * for one that escapes the night). Nights are given whole - the style candidates of a night that is
 * not committed yet still name the idea they develop - and only committed, non-dry ones shelve.
 */
export function shelveCharacters(nights: readonly Night[], styleBySource: ReadonlyMap<string, string>, resolve: (night: string, rel: string) => string, universe: "real" | "fixture"): FeedRead {
  const skipped: { id: string; reason: string }[] = [];
  const styleOf = new Map<string, string>();
  for (const n of nights)
    for (const c of n.candidates) {
      if (c.kind !== "style" || c.fromIdea === undefined || c.extractRunId === undefined) continue;
      const id = styleBySource.get(c.extractRunId);
      if (id !== undefined) styleOf.set(c.fromIdea, id);
    }

  const women = new Map<string, Kept[]>();
  for (const night of nights) {
    const done = night.committed;
    if (night.state !== "committed" || night.dry || done === undefined || done.dry) continue;
    const kept = new Set(done.kept);
    const at = isoOf(done.at) ?? isoOf(night.startedAt) ?? night.id;
    for (const c of night.candidates) {
      if (c.kind !== "idea" || c.target !== "character" || !kept.has(ideaCell(c.id))) continue;
      const where = `${night.id}/${c.id}`;
      if (c.card === undefined) {
        skipped.push({ id: where, reason: "kept as a character, but the idea carries no card" });
        continue;
      }
      if (c.image === undefined) {
        skipped.push({ id: where, reason: "kept as a character, but the artboard was never drawn" });
        continue;
      }
      const key = normText(c.card.name);
      if (key === "") {
        skipped.push({ id: where, reason: "kept as a character, but the card names nobody" });
        continue;
      }
      women.set(key, [...(women.get(key) ?? []), { night, at, c: { ...c, card: c.card, image: c.image } }]);
    }
  }

  const items: FeedItem[] = [];
  for (const stills of women.values()) {
    const ordered = [...stills].sort(newerFirst);
    const newest = ordered[0];
    if (newest === undefined) continue;
    const card = newest.c.card;
    let abs: string;
    try {
      abs = resolve(newest.night.id, newest.c.image);
    } catch (e) {
      skipped.push({ id: `${newest.night.id}/${newest.c.id}`, reason: `${newest.c.image}: ${errorMessage(e)}` });
      continue;
    }
    const mime = mimeOf(abs);
    const looks: CharacterLook[] = ordered.map((k) => {
      const styleId = styleOf.get(`${k.night.id}/${k.c.id}`);
      return {
        night: k.night.id,
        cell: ideaCell(k.c.id),
        ...(k.c.look === undefined ? {} : { look: k.c.look }),
        ...(k.c.genre === undefined ? {} : { genre: k.c.genre }),
        image: characterImageUrl(k.night.id, k.c.image),
        ...(styleId === undefined ? {} : { styleId }),
      };
    });
    const runs = uniq(ordered.map((k) => wingRunId("muse", k.night.id)));
    const styles = uniq(looks.flatMap((l) => (l.styleId === undefined ? [] : [l.styleId])));
    const jobs = uniq(ordered.flatMap((k) => (k.c.jobId === undefined ? [] : [k.c.jobId])));
    const build = buildOf(card.look);
    const slugs = uniq(ordered.flatMap((k) => (k.c.look === undefined ? [] : [k.c.look])));
    const apps = uniq(ordered.flatMap((k) => (k.c.app === undefined ? [] : [k.c.app])));
    items.push({
      item: {
        kind: "character",
        id: characterItemId(card.name),
        title: card.name,
        state: "ratified",
        collections: runs.map((id) => ({ kind: "run" as const, id })),
        origin: ORIGIN,
        rights: { use: "publishable" },
        source: universe,
        lineage: [...runs.map((id) => ({ kind: "run" as const, id })), ...jobs.map((id) => ({ kind: "job" as const, id })), ...styles.map((id) => ({ kind: "style" as const, id }))],
        vocabulary: { age: card.age, ...(build === undefined ? {} : { build }), looks: slugs, applications: apps },
        at: newest.at,
      },
      meta: `aged ${card.age}${build === undefined ? "" : ` · ${build} build`} · ${looks.length} ${looks.length === 1 ? "look" : "looks"}`,
      extras: { character: { card: { name: card.name, age: card.age, look: card.look, personality: card.personality }, prompt: corePrompt(card, newest.c.prompt), looks } },
      ...(mime === undefined ? {} : { file: { abs, mime } }),
    });
  }
  return { items, skipped };
}

async function readMuseWing(universe: "real" | "fixture"): Promise<FeedRead> {
  const nights: Night[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const summary of (await listNights()).slice(0, NIGHT_CAP)) {
    try {
      nights.push(await readNight(summary.id));
    } catch (e) {
      skipped.push({ id: summary.id, reason: errorMessage(e) });
    }
  }
  const styleBySource = new Map<string, string>();
  for (const s of (await getCatalogue()).styles) if (s.origin.source !== undefined) styleBySource.set(s.origin.source, s.id);
  const r = shelveCharacters(nights, styleBySource, resolveInNight, universe);
  return { items: r.items, skipped: [...skipped, ...r.skipped] };
}

export const characterFeed: Feed = {
  id: "character",
  read: (ctx) => withWing("muse", () => readMuseWing(ctx.universe)),
};
