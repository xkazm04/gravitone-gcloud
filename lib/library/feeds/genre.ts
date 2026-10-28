import "server-only";

import { errorMessage } from "@gt/domain/errors";
import { PIECE_TRIALS, type Venture } from "@gt/domain/genre";
import { genreItemId, genreLibraryState, nightOfRef, ventureItemId, ventureLibraryState, type GenreExtras, type LibraryOrigin } from "@gt/domain/library";
import { listGenres, listVentures } from "@gt/kernel/ventures/store";

import { genreViews, type GenreView } from "../../foundry/scout/genres.ts";
import { listNights, readNight, resolveInNight } from "../../foundry/scout/store.ts";
import type { Night } from "../../foundry/scout/types.ts";
import { wingRunId } from "../../foundry/scout/wing.ts";
import { withWing } from "../../foundry/scout/wingScope.ts";
import { isoOf, mimeOf, type Feed, type FeedCtx, type FeedItem, type FeedRead } from "./types.ts";

// THE SCOUT'S GENRES AND VENTURES, AS LIBRARY ITEMS (spark scout-vision S2) - the kernel's heads
// (packages/kernel/src/ventures/ listGenres, listVentures) with what the scout wing's nights derive about
// each genre (lib/foundry/scout/genres.ts genreViews): one `genre` item per genre, one `venture` item per
// venture, retired ones included (state `rejected`, the ladder facet `retired`).
//
// A GENRE's media is the first panel of the kept storyboard it was born from (a night file the existing
// /api/foundry/file door serves, kind=scout); its piece's cut is linked the same way. A VENTURE's media is its
// first genre's. A storyboard never drawn, a panel that failed, a file that escapes its night: no media, the
// key omitted - the item is words first, and the Library draws a designed face for it.
//
// The scout wing only: genres are born from the scout loop's storyboards, never the muse wing's.

const ORIGIN: LibraryOrigin = "scout";
const NIGHT_CAP = 120;

/** The file route that serves a scout night's file (app/api/foundry/file `kind=scout`). */
export const scoutFileUrl = (night: string, rel: string): string => `/api/foundry/file?kind=scout&run=${encodeURIComponent(wingRunId("scout", night))}&path=${encodeURIComponent(rel)}`;

const ladderWords = (s: string): string => s.replace(/-/g, " ");

/** The candidate a `<night>/<c-id>` ref names, when the nights hold it. */
function candidateAt(nights: readonly Night[], ref: string): { readonly night: Night; readonly c: Night["candidates"][number] } | undefined {
  const night = nights.find((n) => n.id === nightOfRef(ref));
  const id = ref.slice(ref.indexOf("/") + 1);
  const c = night?.candidates.find((x) => x.id === id);
  return night === undefined || c === undefined ? undefined : { night, c };
}

type Panel = { readonly url: string; readonly abs: string; readonly mime: string };

/**
 * Pure: the genres (with their evidence, from genreViews) and the ventures as feed items. `resolve` turns a
 * night-relative file into the path on disk (it throws for one that escapes the night).
 */
export function shelveGenres(views: readonly GenreView[], ventures: readonly Venture[], nights: readonly Night[], resolve: (night: string, rel: string) => string, universe: "real" | "fixture"): FeedRead {
  const skipped: { id: string; reason: string }[] = [];
  const nameOfVenture = new Map(ventures.map((v) => [v.id, v.name]));
  const panels = new Map<string, Panel>();
  const items: FeedItem[] = [];

  for (const g of views) {
    const born = candidateAt(nights, g.bornFrom);
    const rel = born?.c.kind === "storyboard" ? (born.c.images?.[0] ?? undefined) : undefined;
    let panel: Panel | undefined;
    if (born !== undefined && rel !== undefined && rel !== null) {
      try {
        const abs = resolve(born.night.id, rel);
        const mime = mimeOf(abs);
        if (mime !== undefined) panel = { url: scoutFileUrl(born.night.id, rel), abs, mime };
      } catch (e) {
        skipped.push({ id: g.id, reason: `${rel}: ${errorMessage(e)}` });
      }
    }
    if (panel !== undefined) panels.set(g.id, panel);
    const p = g.evidence.piece;
    const pieceAt = p === undefined ? undefined : candidateAt(nights, p.ref);
    const cut = pieceAt?.c.kind === "piece" ? pieceAt.c.video : undefined;
    const ventureName = g.ventureId === undefined ? undefined : nameOfVenture.get(g.ventureId);
    const extras: GenreExtras = {
      state: g.state,
      use: g.use,
      look: g.look,
      grammar: g.grammar,
      keptTrials: g.evidence.keptTrials,
      ...(p === undefined ? {} : { piece: { ref: p.ref, verdict: p.verdict, ...(cut === undefined || pieceAt === undefined ? {} : { video: scoutFileUrl(pieceAt.night.id, cut) }) } }),
      bornFrom: { ref: g.bornFrom, ...(panel === undefined ? {} : { image: panel.url }) },
      proposal: g.proposal,
      ...(g.ventureId === undefined ? {} : { venture: { id: g.ventureId, name: ventureName ?? g.ventureId } }),
      ...(g.retiredAt === undefined ? {} : { retiredAt: g.retiredAt }),
    };
    const run = wingRunId("scout", nightOfRef(g.bornFrom));
    const at = isoOf(g.bornAt);
    items.push({
      item: {
        kind: "genre",
        id: genreItemId(g.id),
        title: g.name,
        state: genreLibraryState(g.state),
        collections: [{ kind: "run", id: run }],
        origin: ORIGIN,
        rights: { use: "publishable" },
        source: universe,
        lineage: [
          { kind: "run", id: run },
          { kind: "candidate", id: g.bornFrom },
        ],
        vocabulary: { ladder: g.state, ...(g.ventureId === undefined ? {} : { venture: g.ventureId }), ...(ventureName === undefined ? {} : { ventureName }) },
        ...(at === undefined ? {} : { at }),
      },
      meta: `${ladderWords(g.state)} · ${g.evidence.keptTrials.length}/${PIECE_TRIALS} trials`,
      extras: { genre: extras },
      ...(panel === undefined ? {} : { file: { abs: panel.abs, mime: panel.mime } }),
    });
  }

  const nameOfGenre = new Map(views.map((g) => [g.id, g.name]));
  for (const v of ventures) {
    const first = v.frame.genres[0];
    const panel = first === undefined ? undefined : panels.get(first);
    const at = isoOf(v.bornAt);
    const n = v.frame.genres.length;
    items.push({
      item: {
        kind: "venture",
        id: ventureItemId(v.id),
        title: v.name,
        state: ventureLibraryState(v.retiredAt),
        collections: [],
        origin: ORIGIN,
        rights: { use: "publishable" },
        source: universe,
        lineage: [{ kind: "candidate", id: v.proposal }],
        vocabulary: { type: v.kind },
        ...(at === undefined ? {} : { at }),
      },
      meta: `${v.kind} · ${n} ${n === 1 ? "genre" : "genres"}`,
      extras: {
        venture: {
          kind: v.kind,
          tone: v.frame.tone,
          audience: v.frame.audience,
          format: v.frame.format,
          look: v.frame.look,
          genres: v.frame.genres.map((id) => ({ id, name: nameOfGenre.get(id) ?? id })),
          ...(v.frame.characters === undefined ? {} : { characters: v.frame.characters }),
          proposal: v.proposal,
          ...(v.retiredAt === undefined ? {} : { retiredAt: v.retiredAt }),
        },
      },
      ...(panel === undefined ? {} : { file: { abs: panel.abs, mime: panel.mime } }),
    });
  }
  return { items, skipped };
}

async function readGenres(ctx: FeedCtx): Promise<FeedRead> {
  const store = ctx.store;
  if (store === undefined) return { items: [], skipped: [{ id: "genre", reason: "no kernel store in this sync" }] };
  const heads = store.read((r) => ({ genres: listGenres(r), ventures: listVentures(r) }));
  if (!heads.ok) return { items: [], skipped: [{ id: "genre", reason: heads.error.message }] };
  const nights: Night[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const summary of (await listNights()).slice(0, NIGHT_CAP)) {
    try {
      nights.push(await readNight(summary.id));
    } catch (e) {
      skipped.push({ id: summary.id, reason: errorMessage(e) });
    }
  }
  const r = shelveGenres(genreViews(nights, heads.value.genres), heads.value.ventures, nights, resolveInNight, ctx.universe);
  return { items: r.items, skipped: [...skipped, ...r.skipped] };
}

export const genreFeed: Feed = {
  id: "genre",
  read: (ctx) => withWing("scout", () => readGenres(ctx)),
};
