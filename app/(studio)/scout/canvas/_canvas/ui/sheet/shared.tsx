"use client";

// THE SHEET'S SHARED PIECES - the winner's sheet.js helpers as components: a section, the rows list with "+ N more",
// a river row, an episode card, the projected box, the stage pips, the verdict history, the notes pinned here, a
// family's stations, the media strip; and the calendar's day words and the illustrative projection they read.

import { useState, type ReactNode } from "react";
import type { Episode } from "@gt/domain/channel";

import * as acts from "../../acts.ts";
import { locate } from "../../render/camera.ts";
import { cut, fmt, shortNight } from "../../scene/geo.ts";
import { anchorOf, notesAt } from "../../scene/scopes.ts";
import type { Hit, Item, Port, River, Scope } from "../../scene/types.ts";
import type { CanvasStore } from "../../store.ts";
import type { Family } from "../../pipelines.ts";
import { ITEM_STATES, STAGE_NAME, STAGES, STATE, type ItemState } from "../../tables.ts";
import { useCanvasStore } from "../../useCanvas.ts";
import { Chip, cx, Gl, StackBar, StateChip, kit } from "../kit.tsx";
import { gate } from "../Menu.tsx";
import s from "../sheet.module.css";

export const stateC = (st: ItemState): string => `var(--${STATE[st].tone})`;
export const stageName = (si: number): string => {
  const x = STAGES[si];
  return x === undefined ? "" : STAGE_NAME[x];
};

/** A place in the sheet: fly there and open its sheet. */
export function go(st: CanvasStore, h: Exclude<Scope, { type: "all" }>): void {
  locate(st, h);
  st.openSheet(h);
}

/** Day `d` of the calendar (0 = the server's today), as the winner wrote it. */
const dayOf = (today: string, d: number): Date => {
  const t = new Date(`${today.slice(0, 10)}T00:00:00`);
  t.setDate(t.getDate() + d);
  return t;
};
export const dayLabel = (today: string, d: number): string => dayOf(today, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const dayName = (today: string, d: number): string => dayOf(today, d).toLocaleDateString("en-US", { weekday: "short" });

export function Sec({ title, n, children }: { readonly title?: ReactNode; readonly n?: ReactNode; readonly children: ReactNode }) {
  return (
    <div className={s.sec}>
      {title !== undefined && (
        <h3>
          {title}
          {n !== undefined && <span className={s.n}>{n}</span>}
        </h3>
      )}
      {children}
    </div>
  );
}

export function RowOf({ it }: { readonly it: Item }) {
  const st = useCanvasStore();
  return (
    <button type="button" className={s.row} onClick={() => go(st, { type: "item", ref: it })}>
      <span className={kit.dot} style={{ background: stateC(it.state) }} />
      <span className={s.t}>{it.label}</span>
      <span className={s.m}>{shortNight(it.at)}</span>
    </button>
  );
}

export function Rows({ its, cap = 12 }: { readonly its: readonly Item[]; readonly cap?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? its : its.slice(0, cap);
  return (
    <>
      <div className={s.rows}>
        {shown.map((it) => (
          <RowOf key={it.id} it={it} />
        ))}
      </div>
      {!all && its.length > cap && (
        <button type="button" className={s.more} onClick={() => setAll(true)}>{`+ ${its.length - cap} more`}</button>
      )}
    </>
  );
}

export function RiverRow({ rv }: { readonly rv: River }) {
  const st = useCanvasStore();
  const dot = rv.reach < 0 ? "var(--rose)" : rv.rank > 0 ? "var(--emerald)" : rv.reach >= 3 ? "var(--cyan)" : "var(--muted)";
  return (
    <button type="button" className={s.row} onClick={() => go(st, { type: "river", ref: rv })}>
      <span className={kit.dot} style={{ background: dot }} />
      <span className={s.t}>
        {cut(rv.name, 44)}
        <small>{`${rv.kept}/${rv.decided} kept · ${rv.open} undecided${rv.paused ? " · paused" : ""}`}</small>
      </span>
      <span className={s.m}>{rv.reach >= 0 ? stageName(rv.reach) : "dry"}</span>
    </button>
  );
}

/** An episode: its title and state, its logline, its five beats and spec (folded unless `open`). */
export function EpCard({ e, open, port }: { readonly e: Episode; readonly open: boolean; readonly port?: Port | null }) {
  const st = useCanvasStore();
  const ship = port?.ships.find((x) => x.ep === e) ?? null;
  const beats = (
    <>
      <ol>
        {e.beats.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ol>
      <div className={s.spec}>{e.spec}</div>
    </>
  );
  return (
    <div className={s.ep}>
      <div className={s.h}>
        <span className={kit.dot} style={{ margin: 0, background: stateC(e.state) }} />
        <b>{e.title}</b>
        <Chip>{STATE[e.state].word}</Chip>
        {ship !== null && (
          <button type="button" className={s.iconbtn} aria-label={`Locate ${e.title}`} onClick={() => go(st, { type: "ship", ref: ship })}>
            <Gl name="next" size={13} />
          </button>
        )}
      </div>
      <p className={s.lg}>{e.logline}</p>
      {open ? (
        <>
          {beats}
          {e.note !== undefined && e.note !== "" && <div className={s.spec} style={{ color: "var(--text)" }}>{e.note}</div>}
        </>
      ) : (
        <details>
          <summary>{`${e.beats.length} beats`}</summary>
          {beats}
        </details>
      )}
    </div>
  );
}

/** Views and revenue at the operator's assumptions: illustrative, never a measurement. */
export function projOf(p: Port, a: { readonly views: number; readonly rpm: number }): { views: number; rev: number; basis: string } {
  if (p.song || p.chan === null) {
    const n = 5;
    return { views: n * a.views * 2, rev: ((n * a.views * 2) / 1000) * a.rpm * 4, basis: "5 finished music videos × 2 (long-form)" };
  }
  const k = p.chan.episodes.filter((e) => e.state === "kept").length;
  const m = p.chan.episodes.filter((e) => e.state === "made").length;
  const views = (k + m * 0.5) * a.views;
  return { views, rev: (views / 1000) * a.rpm, basis: `${k} kept + ½ × ${m} made` };
}

export function ProjBox({ p }: { readonly p: Port | null | undefined }) {
  const st = useCanvasStore();
  if (p === null || p === undefined) return null;
  const a = st.ui.assume;
  const pr = projOf(p, a);
  return (
    <Sec title="Projected · illustrative">
      <div className={kit.projbox}>
        <div className={kit.big}>{`≈ ${fmt(pr.views)} views · ≈ $${pr.rev.toFixed(2)}`}</div>
        <div className={kit.m}>{`${pr.basis} × ${a.views.toLocaleString()} views × $${a.rpm}/1k · no analytics yet`}</div>
      </div>
    </Sec>
  );
}

/** How far the river's work got: a stacked bar per stage, then Publish, then the planned Views. */
export function StagePips({ r }: { readonly r: River }) {
  const max = Math.max(1, ...r.towns.map((t) => t.n));
  const pip = (key: string, lbl: string, si: number | null, planned: boolean) => {
    const t = si === null ? undefined : r.towns.find((x) => x.si === si);
    return (
      <div key={key} className={cx(s.pip, planned && s.planned, si !== null && r.reach === si && s.reach)}>
        <div className={s.bar}>
          {t !== undefined &&
            ITEM_STATES.map((k) => {
              const c = t.c[k] ?? 0;
              return c > 0 ? <span key={k} style={{ height: `${Math.max(2, (c / max) * 32)}px`, background: stateC(k), opacity: STATE[k].hollow ? 0.5 : 0.9 }} /> : null;
            })}
        </div>
        <b>{t !== undefined ? t.n : planned ? "·" : 0}</b>
        <span>{lbl}</span>
      </div>
    );
  };
  return (
    <div className={s.pips}>
      {STAGES.map((x, i) => pip(x, (STAGE_NAME[x].split(" ")[0] ?? "").slice(0, 7), i, false))}
      {pip("publish", "Publish", null, false)}
      {pip("views", "Views", null, true)}
    </div>
  );
}

export function History({ r }: { readonly r: River }) {
  return (
    <Sec
      title={
        <>
          Verdicts so far <span className={s.n}>{`${r.kept} kept of ${r.decided} decided`}</span>
          {r.rank > 0 && <Chip tone="emerald">{`▲ kept most · ${r.rank}`}</Chip>}
        </>
      }
    >
      <StackBar parts={[[r.kept, "emerald"], [r.open + r.pending, "amber"], [r.failed, "rose"], [r.rejected, "rose", 0.5]]} label={`${r.kept} kept, ${r.open} undecided, ${r.failed} failed, ${r.rejected} rejected`} />
      <div className={kit.chips}>
        <StateChip state="kept" n={r.kept} />
        {r.open > 0 && <StateChip state="open" n={r.open} />}
        {r.failed > 0 && <StateChip state="failed" n={r.failed} />}
        {r.rejected > 0 && <StateChip state="rejected" n={r.rejected} />}
      </div>
    </Sec>
  );
}

/** The notes pinned at this place for the next scouting. */
export function NotesSec({ sel }: { readonly sel: Hit }) {
  const st = useCanvasStore();
  const ns = notesAt(st.ui.notes, anchorOf(sel));
  if (ns.length === 0) return null;
  return (
    <Sec title="Notes for the next scouting" n={ns.length}>
      {ns.map((n) => (
        <div key={n.id} className={kit.noterow}>
          <Gl name="flag" size={13} />
          <span className={kit.t}>{(n.stance !== "" ? n.stance + (n.text !== "" ? " · " : "") : "") + n.text}</span>
          <button type="button" aria-label="Remove note" onClick={() => {
            if (gate(st, "notes")) void acts.unnote(st, n.id);
          }}>
            <Gl name="x" size={12} />
          </button>
        </div>
      ))}
    </Sec>
  );
}

/** A family's stations from idea to publish; a planned one is drawn dashed. */
export function Pipeline({ fam }: { readonly fam: Family }) {
  return (
    <div className={s.rows}>
      {fam.stations.map((x) => (
        <div key={x.id} className={s.row}>
          <span className={kit.dot} style={{ background: x.exists ? "var(--muted)" : "transparent", border: x.exists ? "1.5px solid var(--muted)" : "1.5px dashed var(--violet)" }} />
          <span className={s.t}>
            {x.name}
            <small>{x.tool}</small>
          </span>
          <span className={s.m}>{x.exists ? "" : "planned"}</span>
        </div>
      ))}
    </div>
  );
}

/** The lot's pictures and films; a film plays while the pointer is on it. `open`: a frame opens the gallery. */
export function MediaStrip({ it, open = true }: { readonly it: Item | null; readonly open?: boolean }) {
  const st = useCanvasStore();
  if (it === null || it.media === null) return null;
  const view = (): void => st.openSurface({ kind: "gallery", scope: { type: "item", ref: it }, block: null, focus: it });
  return (
    <Sec>
      <div className={s.strip}>
        {it.media.files.map((fl, i) => {
          const m =
            fl.type === "video" ? (
              <video key={i} src={fl.src} muted loop playsInline preload="metadata" aria-label={fl.from} onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />
            ) : (
              <img key={i} src={fl.src} alt={fl.from} loading="lazy" />
            );
          return open ? (
            <button key={i} type="button" className={s.frame} aria-label={fl.from} onClick={view}>
              {m}
            </button>
          ) : (
            m
          );
        })}
      </div>
    </Sec>
  );
}
