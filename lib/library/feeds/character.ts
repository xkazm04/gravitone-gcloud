import "server-only";

import { errorMessage } from "@gt/domain/errors";
import { buildOf, corePrompt, normText, type CharacterLook, type LibraryOrigin } from "@gt/domain/library";
import type { CharacterRecord, CharacterUse } from "@gt/domain/production";
import type { CharacterImage } from "@gt/kernel/characters/schema";
import { allCharacterUses, characterImages, savedCharacters, sourcesOfPool } from "@gt/kernel/characters/store";
import type { Store } from "@gt/kernel/store";

import { ideaCell } from "../../decision/v1/sources/scoutPlan.ts";
import { getCatalogue } from "../../foundry/store.ts";
import { characterKey, keptCharacters, rootedRunId, type RootedNight } from "../../foundry/scout/characters.ts";
import { listNights, readNight, resolveInNight } from "../../foundry/scout/store.ts";
import type { IdeaCandidate } from "../../foundry/scout/types.ts";
import { withWing } from "../../foundry/scout/wingScope.ts";
import { isoOf, mimeOf, type Feed, type FeedItem, type FeedRead } from "./types.ts";

// THE KEPT CHARACTERS, AS LIBRARY ITEMS (spark scout-use-aim; both roots since spark scout-vision S3) - the scout nights
// and the muse ARCHIVE's (lib/foundry/scout/store.ts), each read inside its own root's scope and kept apart by (root, id):
// night ids collide across the two.
//
// A KEPT CHARACTER is lib/foundry/scout/characters.ts keptCharacters' - an idea with target `character`, a card and a
// drawn still, in a committed night that was not dry, whose decision cell (scoutPlan.ts ideaCell) is kept - so the
// Library, the taste brief and a cast brief agree on who she is. One item per CHARACTER KEY (her card's name folded): a
// woman kept in both roots is one item. Her looks are every still she was kept in, newest first; the item's media is her
// newest kept still; its title her name; its prompt the core prompt (corePrompt). Rights are publishable: the stills are
// OUR pictures from our own words, of nobody real.
//
// HER ID. A character first kept on the archive keeps `character:muse:<name>` forever (the id the Library already holds);
// one first kept on a scout night is `character:<name>`. Her archive stills are served by run `muse:<night>`.
//
// THE STYLE JOIN, only when it exists: a kept idea cell -> a night's StyleCandidate (same root) with
// fromIdea == "<night>/<c-id>" -> its extractRunId == the catalogue style's origin.source (the
// extract writes a subject-free look into the shared catalogue) -> that style's id. A look with no
// such chain carries no styleId; the key is omitted. `look` and `app` are absent on a legacy night
// (written before spark scout-use-aim) and are omitted the same way.
//
// knowledge/scout-muse/characters.md is not read: nothing parses it and it holds no pictures.
//
// THE CHARACTER RECORDS (spark concept-casting-stages S2, packages/kernel/src/characters): every record saved to the
// library is a Library item, `character:<chr id>`, with its pictures already in blobs. A record imported from a kept
// Scout character is NOT a second item: the night's item keeps its id and takes the record's used-by list; only such a
// record whose night is gone is shelved from the record. Used-by is every `character.used` event: a pointer per
// production, labelled with its title, drawn as a link to it.

const ORIGIN: LibraryOrigin = "scout";
const NIGHT_CAP = 120;

/** The file route that serves a night's artboard (app/api/foundry/file `kind=scout`): `run` is the night's run id - `muse:<night>` for the archive. */
export const characterImageUrl = (run: string, rel: string): string => `/api/foundry/file?kind=scout&run=${encodeURIComponent(run)}&path=${encodeURIComponent(rel)}`;

/** The Library item id of a character: her name folded the way search folds it, under `muse:` when she was first kept on the archive. */
export const characterItemId = (name: string, first: RootedNight["root"]): string => `character:${first === "archive" ? "muse:" : ""}${normText(name).replace(/ /g, "-")}`;

type Drawn = IdeaCandidate & { readonly card: NonNullable<IdeaCandidate["card"]>; readonly image: string };
/** One kept still of hers: where it sits and the commit's instant. */
type Kept = { readonly r: RootedNight; readonly run: string; readonly at: string; readonly c: Drawn };

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/** Kept character cells keptCharacters cannot shelve (no card, no artboard, a card naming nobody): reported, never dropped silently. */
function unshelvable(nights: readonly RootedNight[]): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const r of nights) {
    const done = r.night.committed;
    if (r.night.state !== "committed" || r.night.dry || done === undefined || done.dry) continue;
    for (const c of r.night.candidates) {
      if (c.kind !== "idea" || c.target !== "character" || !done.kept.includes(ideaCell(c.id))) continue;
      const id = `${rootedRunId(r)}/${c.id}`;
      if (c.card === undefined) out.push({ id, reason: "kept as a character, but the idea carries no card" });
      else if (c.image === undefined) out.push({ id, reason: "kept as a character, but the artboard was never drawn" });
      else if (normText(c.card.name) === "") out.push({ id, reason: "kept as a character, but the card names nobody" });
    }
  }
  return out;
}

/**
 * Pure: the kept characters of both roots as feed items, one per character key. `styleBySource` maps an extract run id
 * to the catalogue style it wrote; `resolve` turns a root's night-relative file into the path on disk (it throws for one
 * that escapes the night). Nights are given whole - the style candidates of a night that is not committed yet still name
 * the idea they develop - and only committed, non-dry ones shelve.
 */
export function shelveCharacters(nights: readonly RootedNight[], styleBySource: ReadonlyMap<string, string>, resolve: (root: RootedNight["root"], night: string, rel: string) => string, universe: "real" | "fixture"): FeedRead {
  const skipped = unshelvable(nights);
  const byRun = new Map(nights.map((r) => [rootedRunId(r), r] as const));
  const styleOf = new Map<string, string>();
  for (const r of nights)
    for (const c of r.night.candidates) {
      if (c.kind !== "style" || c.fromIdea === undefined || c.extractRunId === undefined) continue;
      const id = styleBySource.get(c.extractRunId);
      if (id !== undefined) styleOf.set(r.root === "archive" ? `muse:${c.fromIdea}` : c.fromIdea, id);
    }

  const items: FeedItem[] = [];
  for (const k of keptCharacters(nights)) {
    // Her keeps, newest first (keptOn is oldest first), each found again in its own root.
    const stills: Kept[] = [];
    for (const ref of [...k.keptOn].reverse()) {
      const i = ref.lastIndexOf("/");
      const r = byRun.get(ref.slice(0, i));
      const c = r?.night.candidates.find((x) => x.id === ref.slice(i + 1));
      if (r === undefined || c?.kind !== "idea" || c.card === undefined || c.image === undefined) continue;
      stills.push({ r, run: ref.slice(0, i), at: isoOf(r.night.committed?.at) ?? isoOf(r.night.startedAt) ?? r.night.id, c: { ...c, card: c.card, image: c.image } });
    }
    const newest = stills[0];
    if (newest === undefined) continue;
    const card = k.card;
    let abs: string;
    try {
      abs = resolve(newest.r.root, newest.r.night.id, newest.c.image);
    } catch (e) {
      skipped.push({ id: `${newest.run}/${newest.c.id}`, reason: `${newest.c.image}: ${errorMessage(e)}` });
      continue;
    }
    const mime = mimeOf(abs);
    const looks: CharacterLook[] = stills.map((s) => {
      const styleId = styleOf.get(`${s.run}/${s.c.id}`);
      return {
        night: s.r.night.id,
        cell: ideaCell(s.c.id),
        ...(s.c.look === undefined ? {} : { look: s.c.look }),
        ...(s.c.genre === undefined ? {} : { genre: s.c.genre }),
        image: characterImageUrl(s.run, s.c.image),
        ...(styleId === undefined ? {} : { styleId }),
      };
    });
    const runs = uniq(stills.map((s) => s.run));
    const styles = uniq(looks.flatMap((l) => (l.styleId === undefined ? [] : [l.styleId])));
    const jobs = uniq(stills.flatMap((s) => (s.c.jobId === undefined ? [] : [s.c.jobId])));
    const build = buildOf(card.look);
    const slugs = uniq(stills.flatMap((s) => (s.c.look === undefined ? [] : [s.c.look])));
    const apps = uniq(stills.flatMap((s) => (s.c.app === undefined ? [] : [s.c.app])));
    const first = k.keptOn[0]?.startsWith("muse:") === true ? "archive" : "scout";
    items.push({
      item: {
        kind: "character",
        id: characterItemId(card.name, first),
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

/** One root's nights, the newest NIGHT_CAP; an unreadable night is a skip named by its run id. */
async function readRoot(root: RootedNight["root"]): Promise<{ nights: RootedNight[]; skipped: { id: string; reason: string }[] }> {
  return withWing(root === "archive" ? "muse" : "scout", async () => {
    const nights: RootedNight[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const summary of (await listNights()).slice(0, NIGHT_CAP)) {
      try {
        nights.push({ root, night: await readNight(summary.id) });
      } catch (e) {
        skipped.push({ id: rootedRunId({ root, night: summary }), reason: errorMessage(e) });
      }
    }
    return { nights, skipped };
  });
}

/** A root's night file on disk, inside that root's scope. */
const resolveIn = (root: RootedNight["root"], night: string, rel: string): string => withWing(root === "archive" ? "muse" : "scout", () => resolveInNight(night, rel));

/** What the Library needs of one saved record: its pictures with their blobs and where it was used. */
export type ShelfRecord = { readonly record: CharacterRecord; readonly images: readonly CharacterImage[]; readonly uses: readonly CharacterUse[] };

const RECORD_ORIGIN: Readonly<Record<CharacterRecord["origin"], LibraryOrigin>> = { "scout-character": "scout", "muse-army": "import", "codex-kept": "import", "casting-new": "studio" };

const productionPointers = (uses: readonly CharacterUse[]): { kind: "production"; id: string; label: string }[] => uses.flatMap((u) => (u.productionId === undefined ? [] : [{ kind: "production" as const, id: u.productionId, label: u.label }]));

/** One saved record as a Library item, or why not: the Library's age facet needs an age. */
function recordItem(s: ShelfRecord, universe: "real" | "fixture"): FeedItem | { readonly reason: string } {
  const { record, images, uses } = s;
  const { card } = record;
  if (card.age === undefined) return { reason: `${card.name} has no age; the Library shelves a character by her age` };
  const first = images[0];
  if (first === undefined) return { reason: `${card.name} has no picture` };
  const build = buildOf(card.look);
  const looks: CharacterLook[] = images.map((i) => ({ night: `${record.origin} ${i.role}`, cell: i.role, image: `/api/blob/${i.blob.sha256}?type=${encodeURIComponent(i.blob.mime)}` }));
  return {
    item: {
      kind: "character",
      id: `character:${record.id}`,
      title: card.name,
      state: "ratified",
      collections: [{ kind: "run", id: record.origin }],
      origin: RECORD_ORIGIN[record.origin],
      rights: { use: "publishable" },
      source: universe,
      lineage: productionPointers(uses),
      vocabulary: { age: card.age, ...(build === undefined || build.length < 3 ? {} : { build }), looks: [], applications: [] },
      media: first.blob,
      at: record.createdAt,
    },
    meta: `aged ${card.age} · ${record.origin} · ${images.length} ${images.length === 1 ? "picture" : "pictures"}`,
    extras: { character: { card: { name: card.name, age: card.age, look: card.look, personality: card.personality }, prompt: corePrompt({ name: card.name, age: card.age, look: card.look }, ""), looks } },
  };
}

/**
 * Pure: the nights' items and the saved records as one shelf. A night's item takes the used-by list of the record
 * imported from it, keeping its own id; every other saved record is its own item, once. `scoutRecord` maps a character
 * key to the record imported from that kept Scout character.
 */
export function shelveRecords(nights: FeedRead, saved: readonly ShelfRecord[], scoutRecord: ReadonlyMap<string, string>, universe: "real" | "fixture"): FeedRead {
  const byId = new Map(saved.map((s) => [s.record.id as string, s] as const));
  const skipped = [...nights.skipped];
  const onNight = new Set<string>();
  const items: FeedItem[] = nights.items.map((it) => {
    const id = scoutRecord.get(characterKey(it.item.title));
    const s = id === undefined ? undefined : byId.get(id);
    if (id === undefined || s === undefined) return it;
    onNight.add(id);
    return { ...it, item: { ...it.item, lineage: [...(it.item.lineage ?? []), ...productionPointers(s.uses)] } };
  });
  for (const s of saved) {
    if (onNight.has(s.record.id)) continue;
    const item = recordItem(s, universe);
    if ("reason" in item) skipped.push({ id: s.record.id, reason: item.reason });
    else items.push(item);
  }
  return { ...nights, items, skipped };
}

function readRecords(store: Store): { readonly saved: readonly ShelfRecord[]; readonly scoutRecord: ReadonlyMap<string, string> } {
  const r = store.read((x) => {
    const uses = allCharacterUses(x);
    const saved = savedCharacters(x).map((record): ShelfRecord => ({ record, images: characterImages(x, record.id), uses: uses.get(record.id) ?? [] }));
    const scoutRecord = new Map([...sourcesOfPool(x, "scout-character")].map(([key, id]) => [key.slice("scout-character:".length), id] as const));
    return { saved, scoutRecord };
  });
  if (!r.ok) throw r.error;
  return r.value;
}

async function readBoth(universe: "real" | "fixture"): Promise<FeedRead> {
  const [scout, archive] = await Promise.all([readRoot("scout"), readRoot("archive")]);
  const styleBySource = new Map<string, string>();
  for (const s of (await getCatalogue()).styles) if (s.origin.source !== undefined) styleBySource.set(s.origin.source, s.id);
  const r = shelveCharacters([...scout.nights, ...archive.nights], styleBySource, resolveIn, universe);
  return { items: r.items, skipped: [...scout.skipped, ...archive.skipped, ...r.skipped] };
}

export const characterFeed: Feed = {
  id: "character",
  read: async (ctx) => {
    const nights = await readBoth(ctx.universe);
    if (ctx.store === undefined) return nights;
    const { saved, scoutRecord } = readRecords(ctx.store);
    return shelveRecords(nights, saved, scoutRecord, ctx.universe);
  },
};
