"use client";

// THE LEDGER — the middle column. Every take as a row: play, title and length,
// type, verdict, the three rubric scores, the mean, tags, vendor, source, age.
// Grouped (by recipe, genre family or effect category) with each group's own
// verdict bar and mean, sortable on any head, and worked from the keyboard —
// the keys live on ./AudioWorkbench.tsx, which owns selection.
//
// A rejection needs a reason, and asks for it in a row that opens under the
// take (app.js#rowHTML): the reasons already in use are one press away,
// counted, so the vocabulary of failure converges instead of fragmenting.
//
// Not kit/Table: that part has no group rows, no per-cell keyboard focus and
// no width-dropped columns, and the entry's design is all three. Reported as
// a kit request rather than forked into components/kit from here.

import { Fragment } from "react";

import { Keycaps } from "@/components/ui/signal";

import RejectBox from "./RejectBox";
import PlayButton from "./PlayButton";
import {
  VORDER,
  counts,
  dur,
  ago,
  roundOf,
  score,
  tagsOf,
  verdict,
  OPENED_AT,
  type RatingKey,
  type Take,
} from "./book";
import { refById } from "./audioRefs";
import type { Engine } from "./engine";

export type ColId =
  | "play"
  | "title"
  | "type"
  | "verdict"
  | "melody"
  | "instrument_choice"
  | "instrument_quality"
  | "score"
  | "tags"
  | "vendor"
  | "src"
  | "age";

export interface Col {
  id: ColId;
  label: string;
  cls: string;
  plain?: boolean;
  num?: boolean;
  get?: (t: Take) => string | number | null;
}

export const COLS: readonly Col[] = [
  { id: "play", label: "", plain: true, cls: "play" },
  {
    id: "title",
    label: "Title",
    cls: "title",
    get: (t) => t.title.toLowerCase(),
  },
  { id: "type", label: "Type", cls: "type", get: (t) => t.kind },
  {
    id: "verdict",
    label: "Verdict",
    cls: "verdict",
    get: (t) => VORDER.indexOf(verdict(t)),
  },
  {
    id: "melody",
    label: "Mel",
    cls: "n3",
    num: true,
    get: (t) => t.ratings?.melody ?? null,
  },
  {
    id: "instrument_choice",
    label: "Cho",
    cls: "n3",
    num: true,
    get: (t) => t.ratings?.instrument_choice ?? null,
  },
  {
    id: "instrument_quality",
    label: "Qua",
    cls: "n3",
    num: true,
    get: (t) => t.ratings?.instrument_quality ?? null,
  },
  {
    id: "score",
    label: "Score",
    cls: "score",
    num: true,
    get: (t) => score(t),
  },
  { id: "tags", label: "Tags", plain: true, cls: "tags" },
  { id: "vendor", label: "Vendor", cls: "vendor", get: (t) => t.vendor ?? "~" },
  {
    id: "src",
    label: "Source",
    cls: "src",
    get: (t) => (t.reference_track_id ?? "") + (t.prompt_round ?? "~"),
  },
  { id: "age", label: "Age", cls: "age", num: true, get: (t) => t.created_at },
];

/** Columns drop by width, least-worked first: the inspector repeats every one
 *  of them (app.js#cols). `w` is the workbench's own width — the entry was a
 *  whole window, this module is a pane inside the studio frame. */
export function visibleCols(w: number): Col[] {
  const drop = new Set<ColId>();
  if (w < 2100) drop.add("tags");
  if (w < 1600) drop.add("vendor");
  if (w < 1440) {
    drop.add("age");
    drop.add("type");
  }
  if (w < 1280 && w >= 1000) drop.add("src");
  if (w < 1000) {
    drop.add("vendor");
    drop.add("src");
  }
  if (w < 720) {
    drop.add("age");
    drop.add("type");
  }
  return COLS.filter((c) => !drop.has(c.id));
}

export interface Sort {
  col: ColId;
  dir: "asc" | "desc";
}

/** Stable, nulls last in both directions (app.js#sorted). */
export function sortRows(rows: readonly Take[], s: Sort): Take[] {
  const c = COLS.find((x) => x.id === s.col);
  if (!c?.get) return rows.slice();
  const get = c.get;
  const d = s.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => [r, i] as const)
    .sort((a, b) => {
      const x = get(a[0]);
      const y = get(b[0]);
      if (x == null && y == null) return a[1] - b[1];
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * d || a[1] - b[1];
    })
    .map((p) => p[0]);
}

const KEYMAP = [
  { keys: ["↑", "↓"], does: "take" },
  { keys: ["←", "→", "Tab"], does: "MEL · CHO · QUA" },
  { keys: ["1", "–", "9", "0"], does: "score" },
  { keys: ["↵"], does: "keep" },
  { keys: ["X", "⌫"], does: "reject" },
  { keys: ["U"], does: "clear" },
  { keys: ["Space"], does: "play" },
  { keys: ["/"], does: "search" },
];

const GROUPINGS = [
  ["none", "none"],
  ["recipe", "recipe"],
  ["family", "genre family"],
  ["sfx", "sfx category"],
] as const;

function Score({ t, k, on }: { t: Take; k: RatingKey; on: boolean }) {
  const v = t.ratings?.[k] ?? null;
  const na = t.kind === "sfx" && t.loopable && k === "melody";
  const ring = on ? " dim-on" : "";
  if (na) return <span className={`sc na${ring}`}>n/a</span>;
  if (v == null) return <span className={`sc na${ring}`}>·</span>;
  return <span className={`sc${v >= 7 ? " hi" : v <= 4 ? " lo" : ""}${ring}`}>{v}</span>;
}

function Caret({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg viewBox="0 0 10 14" aria-hidden="true" className="ab-tbl__caret" data-dir={dir ?? "none"}>
      <path className="up" d="M5 1 L9 6 H1 Z" />
      <path className="dn" d="M5 13 L9 8 H1 Z" />
    </svg>
  );
}

export default function Ledger({
  groups,
  cols,
  total,
  corpus,
  sort,
  onSort,
  grouping,
  onGrouping,
  collapsed,
  onToggleGroup,
  queue,
  queueDone,
  queueable,
  onQueue,
  onExitQueue,
  sel,
  dim,
  kbd,
  flash,
  rejecting,
  reasons,
  onRowClick,
  onRejectCommit,
  onRejectCancel,
  engine,
  urlFor,
  onPlay,
  verdictOf,
}: {
  groups: { group: string | null; rows: Take[] }[];
  cols: Col[];
  total: number;
  corpus: number;
  sort: Sort;
  onSort: (col: ColId) => void;
  grouping: string;
  onGrouping: (g: (typeof GROUPINGS)[number][0]) => void;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (g: string) => void;
  queue: string[] | null;
  queueDone: number;
  queueable: number;
  onQueue: () => void;
  onExitQueue: () => void;
  sel: string | null;
  dim: number;
  kbd: boolean;
  flash: string | null;
  rejecting: string | null;
  reasons: [string, number][];
  onRowClick: (id: string) => void;
  onRejectCommit: (id: string, reason: string) => void;
  onRejectCancel: () => void;
  engine: Engine;
  urlFor: (t: Take) => string | null;
  onPlay: (t: Take) => void;
  verdictOf: (id: string) => ReturnType<typeof verdict> | null;
}) {
  return (
    <>
      <div className="colhead">
        <h2>Ledger</h2>
        <span className="tally">
          <b>{total}</b>
          <small>shown</small>
        </span>
        <span className="grow" />
        <div className="ledger-tools">
          <span className="caps">Group</span>
          <div className="seg" role="group" aria-label="Group by">
            {GROUPINGS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={grouping === k}
                disabled={!!queue}
                onClick={() => onGrouping(k)}
              >
                {l}
              </button>
            ))}
          </div>
          {!queue && (
            <button
              type="button"
              className="btn btn--cyan"
              disabled={!queueable}
              onClick={onQueue}
              data-testid="audio-queue"
            >
              Queue · {Math.min(20, queueable)} unjudged
            </button>
          )}
          <Keycaps map={KEYMAP} label="Ledger keys" />
        </div>
      </div>
      {queue && (
        <div className="queue">
          <span className="caps">Queue</span>
          <span className="pips" role="img" aria-label={`${queueDone} of ${queue.length} judged`}>
            {queue.map((id) => (
              <i key={id} className={`seg-${verdictOf(id) ?? "unjudged"}${id === sel ? " cur" : ""}`} />
            ))}
          </span>
          <span className="tally">
            <b>
              {queueDone}/{queue.length}
            </b>
          </span>
          <span className="grow" />
          <button type="button" className="btn" onClick={onExitQueue}>
            Exit queue
          </button>
        </div>
      )}
      <table className="ab-tbl" aria-label="Audio takes">
        <thead>
          <tr>
            {cols.map((c) => {
              const cls = `${c.num ? "num " : ""}th-${c.cls}`;
              if (c.plain)
                return (
                  <th key={c.id} className={cls} scope="col">
                    <span className="plain">{c.label || <span className="sr-only">Play</span>}</span>
                  </th>
                );
              const on = sort.col === c.id;
              const dir = on ? sort.dir : null;
              return (
                <th
                  key={c.id}
                  className={`${cls}${on ? " is-on" : ""}`}
                  scope="col"
                  aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button type="button" onClick={() => onSort(c.id)}>
                    {c.label}
                    <Caret dir={dir} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const open = !g.group || !collapsed.has(g.group);
            const c = counts(g.rows);
            const scores = g.rows.map(score).filter((x): x is number => x != null);
            const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
            return (
              <Fragment key={g.group ?? "_all"}>
                {g.group && (
                  <tr className="grp">
                    <td colSpan={cols.length}>
                      <button type="button" aria-expanded={open} onClick={() => onToggleGroup(g.group!)}>
                        <span className="caret" aria-hidden="true">
                          ▾
                        </span>
                        <span className="g-name">{g.group}</span>
                        {/round 3/.test(g.group) && <span className="tag-retired">retired path</span>}
                        <span className="tally">
                          <b>{g.rows.length}</b>
                        </span>
                        <span
                          className="g-bar"
                          role="img"
                          aria-label={`${c.proven} proven, ${c.kept} kept, ${c.unjudged} unjudged, ${c.rejected} rejected`}
                        >
                          {VORDER.map((v) => (
                            <i key={v} className={`seg-${v}`} style={{ flex: c[v] }} />
                          ))}
                        </span>
                        <span className="g-t" aria-hidden="true">
                          <span className="t-proven">{c.proven}</span> · <span className="t-kept">{c.kept}</span> ·{" "}
                          <span className="t-unjudged">{c.unjudged}</span> ·{" "}
                          <span className="t-rejected">{c.rejected}</span>
                        </span>
                        <span className="grow" />
                        <span className="g-t dim">avg {avg}</span>
                      </button>
                    </td>
                  </tr>
                )}
                {open &&
                  g.rows.map((t) => (
                    <Row
                      key={t.id}
                      t={t}
                      cols={cols}
                      sel={t.id === sel}
                      dim={dim}
                      kbd={kbd}
                      flash={flash === t.id}
                      rejecting={rejecting === t.id}
                      reasons={reasons}
                      onClick={() => onRowClick(t.id)}
                      onRejectCommit={(r) => onRejectCommit(t.id, r)}
                      onRejectCancel={onRejectCancel}
                      engine={engine}
                      playable={t.upload_id ? urlFor(t) !== null : true}
                      onPlay={() => onPlay(t)}
                    />
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {total === 0 && <div className="empty">0 / {corpus}</div>}
    </>
  );
}

function Row({
  t,
  cols,
  sel,
  dim,
  kbd,
  flash,
  rejecting,
  reasons,
  onClick,
  onRejectCommit,
  onRejectCancel,
  engine,
  playable,
  onPlay,
}: {
  t: Take;
  cols: Col[];
  sel: boolean;
  dim: number;
  kbd: boolean;
  flash: boolean;
  rejecting: boolean;
  reasons: [string, number][];
  onClick: () => void;
  onRejectCommit: (reason: string) => void;
  onRejectCancel: () => void;
  engine: Engine;
  playable: boolean;
  onPlay: () => void;
}) {
  const v = verdict(t);
  const s = score(t);
  const tags = tagsOf(t);
  const ref = refById(t.reference_track_id);
  const on = (di: number) => sel && kbd && di === dim;
  const cell = (id: ColId) => {
    switch (id) {
      case "play":
        return (
          <td key={id}>
            <PlayButton engine={engine} take={t} disabled={!playable} onPlay={onPlay} />
          </td>
        );
      case "title":
        return (
          <td key={id} className="c-title">
            {t.title}
            <small>{dur(t.duration_s)}</small>
          </td>
        );
      case "type":
        return (
          <td key={id}>
            <span className={`kind kind--${t.kind}`}>{t.kind === "track" ? "T" : "FX"}</span>
          </td>
        );
      case "verdict":
        return (
          <td key={id}>
            <span className={`pill t-${v}`}>{v}</span>
          </td>
        );
      case "melody":
        return (
          <td key={id} className="num">
            <Score t={t} k="melody" on={on(0)} />
          </td>
        );
      case "instrument_choice":
        return (
          <td key={id} className="num">
            <Score t={t} k="instrument_choice" on={on(1)} />
          </td>
        );
      case "instrument_quality":
        return (
          <td key={id} className="num">
            <Score t={t} k="instrument_quality" on={on(2)} />
          </td>
        );
      case "score":
        return (
          <td key={id} className="num">
            <span className="score">{s == null ? "—" : s.toFixed(1)}</span>
          </td>
        );
      case "tags":
        return (
          <td key={id} className="c-tags">
            {tags.slice(0, 3).map((x) => (
              <span key={x} className="chip">
                {x}
              </span>
            ))}
            {tags.length > 3 && <span className="dim">+{tags.length - 3}</span>}
          </td>
        );
      case "vendor":
        return <td key={id}>{t.vendor ?? <span className="dim">—</span>}</td>;
      case "src": {
        const r = t.prompt_round ? roundOf(t.prompt_round) : null;
        const ret = Boolean(t.draft_id || t.parent_id);
        return (
          <td key={id} className="c-src">
            {t.reference_track_id ? (
              <span className="chip chip--src chip--ref">ref·{ref?.title ?? "?"}</span>
            ) : r ? (
              <span className={`chip chip--src${r.retired ? " chip--retired" : ""}`}>{r.s}</span>
            ) : null}
            {ret && <span className="chip chip--src chip--ret">return</span>}
            {!t.reference_track_id && !r && !ret && <span className="dim">—</span>}
          </td>
        );
      }
      case "age":
        return (
          <td key={id} className="num dim">
            {ago(t.created_at, OPENED_AT)}
          </td>
        );
    }
  };
  return (
    <>
      <tr
        className={`row is-v-${v}${sel ? " is-sel" : ""}${flash ? " is-new" : ""}`}
        data-id={t.id}
        tabIndex={sel ? 0 : -1}
        aria-selected={sel}
        onClick={onClick}
      >
        {cols.map((c) => cell(c.id))}
      </tr>
      {rejecting && (
        <tr className="rej">
          <td colSpan={cols.length}>
            <RejectBox
              label={`Reject reason for ${t.title}`}
              reasons={reasons.slice(0, 7)}
              showCounts
              cancellable
              onCommit={onRejectCommit}
              onCancel={onRejectCancel}
            />
          </td>
        </tr>
      )}
    </>
  );
}
