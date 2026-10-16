import "server-only";

// THE REAL SIDE (Phase 5 wave B, L53) - the Library over the kernel's `library` module (L49):
// `queryLibrary` for the page, `libraryDetail` for one item, `actOnItem` for the acts, each
// presented through the same pure mapping the fixture uses (./present.ts), so the screen cannot
// tell the two apart. What only this side has to decide:
//
//   the look      a row carries its face data (a take's peaks, a style's palette) and its cover by
//                 blob; a detail carries its media and that media's facts. The look is read from
//                 those - a clip plays from /api/blob/<sha>, its poster is the keyframe the
//                 media-facts producer cut (MediaFacts.posterSha) - never from a side table.
//   the acts      an act is an event in the same transaction as the mark (kernel write.ts). The
//                 kernel answers a repeated pin as "nothing changed"; the screen's contract (the
//                 fixture's) is a refusal in the work's words, so a second tab's stale button says
//                 what happened instead of silently agreeing.
//   the covers    a style has no picture of its own; its tile leads with the plate the kernel's
//                 `chooseCover` picks from its newest kept plates (never a near-black render
//                 while a bright one exists), and keeps its swatch when none decodes.
//   the projects  "Use in project" names the projects the records module lists (not discarded),
//                 newest first, bounded - read as their titles only, never a plan build per render.

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { LibraryAct, LibraryQuery, LibraryRow } from "@gt/domain/library";
import type { LibraryItemDetail } from "@gt/domain/libraryItem";
import { libraryDetail, styleCovers } from "@gt/kernel/library/detail";
import { queryLibrary } from "@gt/kernel/library/query";
import { actOnItem } from "@gt/kernel/library/write";
import type { Store } from "@gt/kernel/store";
import type { Palette } from "@gt/ui/components/library/Face.tsx";

import { blobRoute } from "../../../../lib/library/media.ts";
import { ledgerFor } from "../../_shell/links.ts";
import type { ActOutcome, Choice, ShownDetail, ShownPage } from "./contract.ts";
import { cardOf, detailOf, type Media } from "./present.ts";

/** Who acts, as the ledger names the operator. A principal without a uid is the operator. */
export type Who = { readonly who?: string };

export type ServerLibrary = {
  readonly query: (q: LibraryQuery) => Result<ShownPage>;
  readonly detail: (id: string, held: Readonly<Record<string, readonly string[] | undefined>>) => Result<ShownDetail>;
  readonly act: (id: string, act: LibraryAct, held: Readonly<Record<string, readonly string[] | undefined>>, who?: Who) => Result<ActOutcome>;
};

/** The most projects "Use in project" offers (registry bounded-enumeration). */
export const PROJECT_CHOICES = 50;

const POSTER_TYPE = "image/jpeg";

const paletteOf = (p: readonly string[] | undefined): Palette | undefined => {
  const a = p?.[0];
  if (a === undefined) return undefined;
  return [a, p?.[1] ?? a];
};

type Look = ReturnType<Media["look"]>;

function lookOfRow(row: LibraryRow): Look {
  const palette = paletteOf(row.palette);
  return { ...(row.peaks === undefined ? {} : { peaks: row.peaks }), ...(palette === undefined ? {} : { palette }) };
}

function lookOfDetail(d: LibraryItemDetail): Look {
  const media = d.item.media;
  const video = media !== undefined && media.mime.startsWith("video/") ? blobRoute(media.sha256, media.mime) : null;
  const poster = d.media?.posterSha === undefined || d.media.posterSha === null ? null : blobRoute(d.media.posterSha, POSTER_TYPE);
  return { ...lookOfRow(d.row), ...(video === null ? {} : { video }), ...(poster === null ? {} : { poster }) };
}

const mediaOf = (looks: ReadonlyMap<string, Look>): Media => ({
  url: (sha, mime) => blobRoute(sha, mime),
  look: (id) => looks.get(id) ?? {},
  ledger: ledgerFor,
});

const actorOf = (w: Who | undefined): Actor => ({ kind: "operator", id: w?.who ?? "operator" });

function projectsIn(store: Store): Result<Choice[]> {
  return store.read((r) =>
    r
      .all("SELECT id, json_extract(record, '$.title') AS title FROM projects WHERE listed = 1 ORDER BY updated_at DESC, id LIMIT ?", PROJECT_CHOICES)
      .map((x) => ({ value: String(x["id"]), label: typeof x["title"] === "string" ? x["title"] : String(x["id"]) })),
  );
}

function projectTitle(store: Store, id: string): Result<string | null> {
  return store.read((r) => {
    const row = r.get("SELECT json_extract(record, '$.title') AS title FROM projects WHERE id = ? AND listed = 1", id);
    return row === undefined ? null : typeof row["title"] === "string" ? row["title"] : id;
  });
}

const STYLE_PREFIX = "style:";

/** The page's style rows with the cover their plates give them. */
function withStyleCovers(store: Store, rows: readonly LibraryRow[]): Result<LibraryRow[]> {
  const ids = rows.filter((r) => r.kind === "style" && r.cover.blobSha === null && r.id.startsWith(STYLE_PREFIX)).map((r) => r.id.slice(STYLE_PREFIX.length));
  if (ids.length === 0) return ok([...rows]);
  const covers = styleCovers(store, ids);
  if (!covers.ok) return covers;
  return ok(rows.map((r) => (r.kind === "style" ? { ...r, cover: covers.value.get(r.id.slice(STYLE_PREFIX.length)) ?? r.cover } : r)));
}

const everythingIn = (store: Store): Result<number> => store.read((r) => Number(r.get("SELECT count(*) AS n FROM library_items")?.["n"] ?? 0));

export type RealDeps = {
  /** The process's kernel store, or why it cannot be opened. */
  readonly store: () => Result<Store>;
  /** The atelier of a style (the route beside this one). */
  readonly atelierOf: (styleId: string) => string;
};

export function makeRealLibrary(deps: RealDeps): ServerLibrary {
  const shown = (store: Store, d: LibraryItemDetail, held: Readonly<Record<string, readonly string[] | undefined>>): Result<ShownDetail> => {
    const projects = projectsIn(store);
    if (!projects.ok) return projects;
    const row = withStyleCovers(store, [d.row]);
    if (!row.ok) return row;
    const covered = { ...d, row: row.value[0] ?? d.row };
    return ok(detailOf(covered, mediaOf(new Map([[d.row.id, lookOfDetail(d)]])), held, projects.value, deps.atelierOf));
  };

  return {
    query: (q) => {
      const s = deps.store();
      if (!s.ok) return s;
      const page = queryLibrary(s.value, q);
      if (!page.ok) return page;
      const all = everythingIn(s.value);
      if (!all.ok) return all;
      const rows = withStyleCovers(s.value, page.value.items);
      if (!rows.ok) return rows;
      const m = mediaOf(new Map(rows.value.map((row) => [row.id, lookOfRow(row)])));
      return ok({ ...page.value, items: rows.value.map((row) => cardOf(row, m)), everything: all.value });
    },
    detail: (id, held) => {
      const s = deps.store();
      if (!s.ok) return s;
      const d = libraryDetail(s.value, id);
      return d.ok ? shown(s.value, d.value, held) : d;
    },
    act: (id, act, held, who) => {
      const s = deps.store();
      if (!s.ok) return s;
      const store = s.value;
      const before = libraryDetail(store, id);
      if (!before.ok) return before;
      const title = before.value.row.title;
      let said: string;
      if (act.act === "use-in-project") {
        const p = projectTitle(store, act.projectId);
        if (!p.ok) return p;
        if (p.value === null) return err("not-found", `no project ${act.projectId}`);
        said = `${title} → ${p.value}`;
      } else said = `${act.act === "pin" ? "Pinned" : "Unpinned"} · ${title}`;
      const done = actOnItem(store, id, act, actorOf(who));
      if (!done.ok) return done;
      // Using an item in a project it is already in is the same answer twice; a pin is a toggle,
      // and a toggle that found the other state was pressed against a page that is out of date.
      if (!done.value.changed && act.act !== "use-in-project") return err("conflict", act.act === "pin" ? `${title} is already pinned` : `${title} is not pinned`);
      const after = libraryDetail(store, id);
      if (!after.ok) return after;
      const d = shown(store, after.value, held);
      return d.ok ? ok({ detail: d.value, said }) : d;
    },
  };
}
