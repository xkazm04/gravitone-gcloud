import "server-only";

import { errorMessage } from "@gt/domain/errors";
import { getCatalogue } from "../../../../lib/foundry/store.ts";
import { articlesRoot, readArticles } from "../../../../lib/ledger/v1/sources/articles.ts";
import { FIXTURE_MODE } from "../../../../lib/fixtures/mode.ts";
import { listTakes } from "../../../../lib/sound/takes.ts";
import { ledgerFor } from "../../_shell/links.ts";

// THE LIBRARY / PROJECTS COLUMN - what each lane has ratified that the SERVER can read today,
// through v1's own readers (nothing here writes):
//
//   image    proven styles in pipeline/foundry/styles.json (lib/foundry/store.ts getCatalogue).
//            v1 has no "locked" state - a style is a candidate until a commit proves it - so the
//            shelf is the proven ones, and the candidates are a count beside them.
//   article  landed posts: runs whose status is `landed` (the PR into ai-registry was opened),
//            read through the ledger projection's reader so the fixture universe reads the
//            fixture store (lib/ledger/v1/sources/roots.ts says why v1's own reader cannot).
//   audio    kept takes (lib/sound/takes.ts listTakes, verdict `kept`), fixture takes only in
//            the fixture universe, as v1's own filter rule has it.
//   video    PROJECTS. v1 keeps projects in the browser (IndexedDB, lib/studioArchive.ts), so
//            the server cannot list them until Phase 4 imports them; the column draws its head
//            and a door to /projects, and no count - a count of zero would be a false claim.
//
// Each read fails on its own: one unreadable store is a line in that shelf, not a blank floor.

export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export type ShelfStyleRow = { readonly id: string; readonly name: string; readonly family: string };
export type ShelfPost = { readonly id: string; readonly title: string; readonly href: string; readonly pr?: string };
export type ShelfTake = { readonly id: string; readonly title: string; readonly kind: string; readonly durationS?: number; readonly peaks: readonly number[] };

export type Shelf = {
  readonly styles: Read<{ readonly proven: readonly ShelfStyleRow[]; readonly candidates: number }>;
  readonly posts: Read<readonly ShelfPost[]>;
  readonly takes: Read<{ readonly kept: readonly ShelfTake[]; readonly total: number }>;
};

/** Rows a shelf carries to the page; the head's count is always the whole. */
export const SHELF_ROWS = 24;
/** Bars in a take row's waveform (the prototype drew 74 px at 2 px a bar). */
export const PEAK_BARS = 37;


/** The loudest peak in each of `n` equal spans: the strip's shape survives, its size is bounded. */
export function downsample(peaks: readonly number[], n: number): number[] {
  if (peaks.length <= n) return [...peaks];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * peaks.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / n));
    out.push(Math.max(...peaks.slice(from, to)));
  }
  return out;
}

async function styles(): Promise<Shelf["styles"]> {
  try {
    const c = await getCatalogue();
    const proven = c.styles.filter((s) => s.status === "proven").map((s) => ({ id: s.id, name: s.name, family: s.family }));
    return { ok: true, value: { proven, candidates: c.styles.length - proven.length } };
  } catch (e) {
    return { ok: false, error: `styles: ${errorMessage(e)}` };
  }
}

async function posts(): Promise<Shelf["posts"]> {
  const r = await readArticles(articlesRoot());
  if (!r.ok) return { ok: false, error: r.error.message };
  const landed = r.value.runs
    .map((a) => a.run)
    .filter((run) => run.status === "landed")
    .sort((a, b) => (b.landedAt ?? b.createdAt).localeCompare(a.landedAt ?? a.createdAt))
    .map((run) => ({
      id: run.id,
      title: run.topic.subject ?? run.topic.text ?? run.id,
      // The run's history: v1's run page retired (Phase 6 wave C), and a run landed before the
      // Board would be refused as a packet. The PR rides beside it as the row's trail.
      href: ledgerFor(run.id),
      ...(run.landing?.prUrl === undefined ? {} : { pr: run.landing.prUrl }),
    }));
  return { ok: true, value: landed };
}

async function takes(): Promise<Shelf["takes"]> {
  try {
    const kept = await listTakes({ verdict: "kept", fixtures: FIXTURE_MODE });
    // Music before sfx, as the prototype's shelf ordered them.
    const rows = [...kept].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "music" ? -1 : 1));
    return {
      ok: true,
      value: {
        total: kept.length,
        kept: rows.slice(0, SHELF_ROWS).map((t) => ({
          id: t.id,
          title: t.title,
          kind: t.kind,
          ...(t.durationS === null ? {} : { durationS: t.durationS }),
          peaks: downsample(t.peaks ?? [], PEAK_BARS),
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: `kept takes: ${errorMessage(e)}` };
  }
}

export async function readShelf(): Promise<Shelf> {
  const [s, p, t] = await Promise.all([styles(), posts(), takes()]);
  return { styles: s, posts: p, takes: t };
}
