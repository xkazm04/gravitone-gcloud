"use client";

// THE LEDGER — the Audio Workbench's center table, ported from the contest
// winner's `app.js` (`.contest/arena/library-audio-workbench/entries/
// claude-claude-opus-5-5_high/variant-3/`, COLS at :94-107 and the grouping
// logic at :69-73). Wraps `kit/Table` rather than hand-rolling a second one —
// the kit governs that (components/kit/README.md).
//
// Caveat 2 (`.vault/Spark/ideas/library-audio-workbench-port.md`): Variations +
// Composer + Drafts move OFF the right panel and INTO a per-row expansion here.
// `renderExpansion` is therefore a passthrough prop, not a local default — WP3
// swaps it for the real `TakeExpansion` at the `<Ledger>` call site in
// `AudioWorkbench.tsx` without touching this file.

import { useMemo, useState } from "react";

import { Pager, Segmented, StatusPill, Table, useWindow } from "@/components/kit";
import type { StatusKind, TableColumn, TableSort } from "@/components/kit";
import { Tally } from "@/components/ui/signal";
import type { Asset, AudioMeta } from "@/lib/assets";

/** An `Asset` already narrowed to `kind: "audio"` — AudioWorkbench's filter,
 *  named so a reader does not have to re-derive what the narrowing means. */
export type AudioAsset = Asset & { kind: "audio" };

/**
 * Read `meta` as the ledger shape WP1 defined (`AudioMeta`, lib/assets.ts).
 * `meta` itself stays `Record<string, unknown>` — the contest-winning
 * variant's own accepted cost — so this is the cast/guard at the read site
 * WP1's risk note asks every reader to use. Absent fields fall back to the
 * least-committal reading (unjudged, zero duration), never a guess dressed as
 * data.
 */
export function audioMetaOf(asset: Asset): AudioMeta {
  const m = (asset.meta ?? {}) as Partial<AudioMeta>;
  return { ...m, verdict: m.verdict ?? "unjudged", duration_s: m.duration_s ?? 0 };
}

/**
 * `AudioMeta.verdict` has four states; `StatusKind` (components/kit/
 * StatusGlyph.tsx) has three that fit a verdict at all — "proven" compresses
 * onto "keep" rather than inventing a fourth glyph kind for a distinction the
 * rest of this package does not otherwise draw.
 */
const VERDICT_KIND: Record<AudioMeta["verdict"], StatusKind> = {
  unjudged: "undecided",
  kept: "keep",
  proven: "keep",
  rejected: "reject",
};

function scoreOf(meta: AudioMeta): number | null {
  const vals = [meta.ratings?.melody, meta.ratings?.instrument_choice, meta.ratings?.instrument_quality].filter(
    (v): v is number => typeof v === "number",
  );
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** `AudioMeta` carries no explicit track/sfx discriminant (WP1's model has no
 *  `kind` sub-field) — `sfx_category` is only ever set on an effect, so its
 *  presence is read as the signal rather than left unhandled. */
function isSfx(meta: AudioMeta): boolean {
  return meta.sfx_category !== undefined;
}

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** A reduced copy of the source's `FAMILY` map (`app.js:21-27`) — enough
 *  genres to make "genre family" grouping legible without carrying every
 *  entry the prototype's fixture data happened to use. */
const FAMILY: Record<string, string> = {
  "nu-disco": "House & disco",
  "80s french touch": "House & disco",
  "deep house": "House & disco",
  "melodic house": "House & disco",
  "progressive house": "House & disco",
  "organic house": "House & disco",
  synthwave: "Synth & retro",
  "retro electronic": "Synth & retro",
  outrun: "Synth & retro",
  "future bass": "Bass music",
  "melodic dubstep": "Bass music",
  chillstep: "Bass music",
  "drum and bass": "Bass music",
  "liquid dnb": "Bass music",
  trap: "Bass music",
  "dark trap": "Bass music",
  "808-driven": "Bass music",
  "boom bap": "Hip hop & downtempo",
  "jazz rap": "Hip hop & downtempo",
  "golden age hip hop": "Hip hop & downtempo",
  "lo-fi hip hop": "Hip hop & downtempo",
  "dusty sample": "Hip hop & downtempo",
  "trip hop": "Hip hop & downtempo",
  downtempo: "Hip hop & downtempo",
  "ambient drone": "Ambient & cinematic",
  textural: "Ambient & cinematic",
  "cinematic ambient": "Ambient & cinematic",
  "orchestral-electronic": "Ambient & cinematic",
};

function recipeOf(meta: AudioMeta): string {
  if (isSfx(meta)) return meta.draft_id ? "Effects · drafted" : "Effects · no recipe";
  if (meta.draft_id) return "Draft returns";
  if (meta.reference_track_id) return `Ref · ${meta.reference_track_id}`;
  if (meta.prompt_round) return `Round · ${meta.prompt_round}`;
  return meta.parent_id ? "Returns" : "Hand prompt";
}

function familyOf(meta: AudioMeta): string {
  if (isSfx(meta)) return "Effects";
  return FAMILY[(meta.genre_tags ?? [])[0] ?? ""] ?? "Other";
}

export type GroupMode = "recipe" | "family" | "sfx";

const GROUP_OPTIONS: ReadonlyArray<{ id: GroupMode; label: string }> = [
  { id: "recipe", label: "recipe" },
  { id: "family", label: "genre family" },
  { id: "sfx", label: "sfx category" },
];

function groupOf(meta: AudioMeta, mode: GroupMode): string {
  if (mode === "recipe") return recipeOf(meta);
  if (mode === "family") return familyOf(meta);
  return isSfx(meta) ? (meta.sfx_category ?? "uncategorized") : "Tracks";
}

function numCell(v: number | null | undefined, na = false) {
  if (na) return <span className="text-white/30">n/a</span>;
  if (v == null) return <span className="text-white/30">·</span>;
  return <span className={v >= 7 ? "text-emerald-300" : v <= 4 ? "text-rose-300" : ""}>{v}</span>;
}

const COLUMNS: ReadonlyArray<TableColumn<AudioAsset>> = [
  {
    id: "play",
    head: "",
    cell: () => (
      <span
        aria-label="Playback lives in the Inspector (WP3)"
        className="inline-grid h-6 w-6 place-items-center rounded-full border border-white/10 text-white/25"
      >
        <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
        </svg>
      </span>
    ),
  },
  {
    id: "title",
    head: "Title",
    cell: (r) => (
      <span className="flex items-center gap-2">
        <span className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">{r.name}</span>
        <span className="text-label text-white/40">{Math.round(audioMetaOf(r).duration_s)}s</span>
      </span>
    ),
    sortBy: (r) => r.name.toLowerCase(),
  },
  {
    id: "type",
    head: "Type",
    cell: (r) => <span className="font-jetbrains text-label">{isSfx(audioMetaOf(r)) ? "FX" : "T"}</span>,
    sortBy: (r) => (isSfx(audioMetaOf(r)) ? "fx" : "t"),
  },
  {
    id: "verdict",
    head: "Verdict",
    cell: (r) => {
      const v = audioMetaOf(r).verdict;
      return <StatusPill kind={VERDICT_KIND[v]}>{v}</StatusPill>;
    },
    sortBy: (r) => audioMetaOf(r).verdict,
  },
  {
    id: "melody",
    head: "Mel",
    num: true,
    cell: (r) => {
      const m = audioMetaOf(r);
      return numCell(m.ratings?.melody ?? null, isSfx(m) && !!m.loopable);
    },
    sortBy: (r) => audioMetaOf(r).ratings?.melody ?? null,
  },
  {
    id: "instrument_choice",
    head: "Cho",
    num: true,
    cell: (r) => numCell(audioMetaOf(r).ratings?.instrument_choice ?? null),
    sortBy: (r) => audioMetaOf(r).ratings?.instrument_choice ?? null,
  },
  {
    id: "instrument_quality",
    head: "Qua",
    num: true,
    cell: (r) => numCell(audioMetaOf(r).ratings?.instrument_quality ?? null),
    sortBy: (r) => audioMetaOf(r).ratings?.instrument_quality ?? null,
  },
  {
    id: "score",
    head: "Score",
    num: true,
    cell: (r) => {
      const s = scoreOf(audioMetaOf(r));
      return <span className="font-jetbrains font-semibold">{s == null ? "—" : s.toFixed(1)}</span>;
    },
    sortBy: (r) => scoreOf(audioMetaOf(r)),
  },
  {
    id: "vendor",
    head: "Vendor",
    cell: (r) => audioMetaOf(r).vendor ?? <span className="text-white/30">—</span>,
    sortBy: (r) => audioMetaOf(r).vendor ?? null,
  },
  {
    id: "src",
    head: "Source",
    cell: (r) => <span className="text-label">{recipeOf(audioMetaOf(r))}</span>,
    sortBy: (r) => recipeOf(audioMetaOf(r)),
  },
  {
    id: "age",
    head: "Age",
    num: true,
    cell: (r) => <span className="text-white/40">{ago(r.createdAt)}</span>,
    sortBy: (r) => r.createdAt,
  },
];

/** The same stable sort `Table` runs internally (Table.tsx's `sorted` memo),
 *  duplicated here because grouping and pagination both need the shelf in
 *  FINAL order before it is sliced — `useWindow` must page across the sorted
 *  list, not the list's insertion order, and a bucket's membership has to be
 *  decided after that ordering, not before it. The per-bucket `<Table>`
 *  instances below re-run this same sort on their own subset (controlled by
 *  the same `sort` state), which is a no-op once the rows are already in
 *  order — accepted here rather than adding a second, Table-shaped way to
 *  read a pre-sorted list out of the component. */
function sortRows(rows: readonly AudioAsset[], sort: TableSort): AudioAsset[] {
  const col = COLUMNS.find((c) => c.id === sort.column);
  if (!col?.sortBy) return [...rows];
  const key = col.sortBy;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, k: key(r) }))
    .sort((a, b) => {
      const an = a.k === null || a.k === undefined;
      const bn = b.k === null || b.k === undefined;
      if (an !== bn) return an ? 1 : -1;
      if (!an && !bn) {
        const d =
          typeof a.k === "number" && typeof b.k === "number"
            ? a.k - b.k
            : String(a.k).localeCompare(String(b.k), undefined, { numeric: true });
        if (d !== 0) return d * sign;
      }
      return a.r.id.localeCompare(b.r.id) || a.i - b.i;
    })
    .map((x) => x.r);
}

export interface LedgerProps {
  /** The real audio shelf — `listAssets(uid)` filtered to `kind === "audio"`,
   *  read by `AudioWorkbench`. No fixture rows ship: an empty array is the
   *  real, intentional starting state, not a loading placeholder. */
  assets: readonly AudioAsset[];
  /** The single expanded row (an accordion, per `kit/Table`'s own doctrine).
   *  Lifted to `AudioWorkbench` — see that file for why it is shared with the
   *  WP3 Inspector slot rather than kept local to this component. */
  expandedId?: string;
  onExpand?: (id: string | null) => void;
  /** WP3 swaps this for the real `TakeExpansion` at the `<Ledger>` call site;
   *  this component only owns the seam, never a default for it. */
  renderExpansion?: (row: AudioAsset) => React.ReactNode;
}

export default function Ledger({ assets, expandedId, onExpand, renderExpansion }: LedgerProps) {
  const [mode, setMode] = useState<GroupMode>("recipe");
  const [sort, setSort] = useState<TableSort>({ column: "age", dir: "desc" });

  const ordered = useMemo(() => sortRows(assets, sort), [assets, sort]);
  const win = useWindow(ordered, { size: 24 });

  // Grouping runs over the WINDOWED page, not the whole shelf: `kit/Table` has
  // no group-header row of its own — a gap worth a kit proposal, not a WP2
  // fork of Table — so grouping here is one `<Table>` per bucket rather than a
  // second table implementation. "Masses of items" stays bounded because the
  // window is taken first; the cost is that a bucket's count reflects what is
  // currently paged in, not the whole shelf, which is the honest reading of a
  // paginated grouped view and is stated here rather than silently approximated.
  const groups = useMemo(() => {
    const m = new Map<string, AudioAsset[]>();
    for (const a of win.visible) {
      const g = groupOf(audioMetaOf(a), mode);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(a);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [win.visible, mode]);

  return (
    <div aria-label="Ledger">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tally value={win.shown} of={win.total} label="shown" />
        <span className="grow" />
        <Segmented label="Group" value={mode} onChange={setMode} options={GROUP_OPTIONS} />
      </div>

      {assets.length === 0 ? (
        <Table label="Ledger" columns={COLUMNS} rows={[]} empty="no takes yet" />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([group, rows]) => (
            <div key={group}>
              <div className="mb-1 flex items-center gap-2 text-label uppercase tracking-[0.08em] text-white/50">
                <span>{group}</span>
                <Tally value={rows.length} />
              </div>
              <Table
                label={`Ledger — ${group}`}
                columns={COLUMNS}
                rows={rows}
                sort={sort}
                onSort={setSort}
                expandedId={expandedId}
                onExpand={onExpand}
                renderExpansion={renderExpansion}
              />
            </div>
          ))}
        </div>
      )}

      {assets.length > 0 && (
        <div className="mt-4">
          <Pager shown={win.shown} total={win.total} onMore={win.more} onAll={win.all} noun="takes" />
        </div>
      )}
    </div>
  );
}
