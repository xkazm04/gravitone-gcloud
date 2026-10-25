import "server-only";

import { errorMessage } from "@gt/domain/errors";
import { buildOf, corePrompt, normText, type CharacterLook, type LibraryOrigin } from "@gt/domain/library";

import { ideaCell } from "../../decision/v1/sources/scoutPlan.ts";
import { getCatalogue } from "../../foundry/store.ts";
import { keptCharacters, rootedRunId, type RootedNight } from "../../foundry/scout/characters.ts";
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

async function readBoth(universe: "real" | "fixture"): Promise<FeedRead> {
  const [scout, archive] = await Promise.all([readRoot("scout"), readRoot("archive")]);
  const styleBySource = new Map<string, string>();
  for (const s of (await getCatalogue()).styles) if (s.origin.source !== undefined) styleBySource.set(s.origin.source, s.id);
  const r = shelveCharacters([...scout.nights, ...archive.nights], styleBySource, resolveIn, universe);
  return { items: r.items, skipped: [...scout.skipped, ...archive.skipped, ...r.skipped] };
}

export const characterFeed: Feed = {
  id: "character",
  read: (ctx) => readBoth(ctx.universe),
};
