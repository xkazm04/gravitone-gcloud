"use client";

// THE SWAP - the cores tray (every core a production can cast: portrait, name, where it came from; a click or a drag
// onto the cast card asks the preview) and the preview itself: the take-start frames redrawn with the new core beside
// the frames as cast now, the eye's reading on each, and the redo the swap would queue, priced in the work's own
// units. Accept changes the cast and makes stale what the port names; Keep current changes nothing. A frame the
// experiment has not drawn yet is pending, never the old frame passed off as the new one.

import type { CoreRef, Production, SwapPreview } from "@gt/domain/productionGraph";

import { cx, Gl, Kbd } from "../ui/kit.tsx";
import k from "../ui/kit.module.css";
import { caption, clock, hours, receipt, redoMinutes } from "./model.ts";
import { dragCore } from "./parts.tsx";
import { Tile } from "./Tile.tsx";
import s from "./street.module.css";

/** `left` keeps the cast card (pinned at the right in the film strip) uncovered while a core is dragged onto it. */
export function CoresTray({ cores, cast, left = false, onPick, onClose }: { readonly cores: readonly CoreRef[]; readonly cast: string; readonly left?: boolean; readonly onPick: (core: string) => void; readonly onClose: () => void }) {
  return (
    <aside className={cx(s.tray, left && s.trayLeft)} aria-label={`Cores, ${cores.length}`} data-role="cores-tray">
      <div className={s.trayHead}>
        <h3>Cores · {cores.length}</h3>
        <span className={s.grow} />
        <button type="button" className={s.iconbtn} onClick={onClose} aria-label="Close cores">
          <Gl name="x" />
        </button>
      </div>
      <div className={s.cores}>
        {cores.map((c) => (
          <button key={c.id} type="button" className={s.core} aria-current={c.id === cast ? true : undefined} draggable onDragStart={(e) => dragCore(e, c)} onClick={() => onPick(c.id)} aria-label={`${c.name}${c.id === cast ? ", cast now" : ""}; ${c.origin}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.portrait} alt="" loading="lazy" decoding="async" />
            <b>{c.name}</b>
            <small>{c.origin}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}

type PanelProps = {
  readonly p: Production;
  readonly cores: readonly CoreRef[];
  readonly asking: string | null;
  readonly preview: SwapPreview | null;
  readonly onAccept: () => void;
  readonly onKeep: () => void;
};

/** The frames as cast now beside the frames redrawn: pending while the port is asked, or where nothing is drawn yet. */
export function SwapPanel({ p, cores, asking, preview, onAccept, onKeep }: PanelProps) {
  const to = cores.find((c) => c.id === (preview?.to ?? asking));
  const frames = preview?.frames ?? p.nodes.filter((n) => /^kf:K\d\d$/.test(n.id)).slice(0, 3);
  const pending = preview?.frames.filter((f) => f.state === "pending").length ?? 0;
  return (
    <section className={s.swap} role="dialog" aria-label={`Swap ${p.cast.name} for ${to?.name ?? asking ?? ""}`} data-role="swap-preview">
      <div className={s.swapHead}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.cast.portrait} alt="" />
        <b>{p.cast.name}</b>
        <span className={s.arrow} aria-hidden="true">
          →
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {to !== undefined && <img src={to.portrait} alt="" />}
        <b>{to?.name ?? asking}</b>
        {pending > 0 && <span className={s.facts}>{pending} of {preview?.frames.length} pending</span>}
      </div>
      <div className={s.pairs}>
        {frames.map((f) => {
          const was = p.nodes.find((n) => n.id === f.id) ?? f;
          return (
            <figure key={f.id} className={s.pair} style={{ margin: 0 }}>
              <Tile n={was} caption={p.cast.name} />
              <Tile n={f} pending={preview === null || f.state === "pending"} caption={to?.name ?? ""} />
              <figcaption>
                {caption(was)} · {clock(was.at ?? 0)}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <div className={s.receipt}>
        {preview === null ? (
          <span className={s.facts}>…</span>
        ) : (
          <>
            <span className={s.amberText}>{preview.stale.length} stale</span>
            <span>{receipt(preview.redo)}</span>
            <span className={s.facts}>{hours(redoMinutes(preview.redo))}</span>
          </>
        )}
        <span className={s.acts}>
          <button type="button" className={cx(k.btn, k.primary)} onClick={onAccept} disabled={preview === null}>
            Accept
          </button>
          <button type="button" className={k.btn} onClick={onKeep}>
            Keep current <Kbd verb="up" />
          </button>
        </span>
      </div>
    </section>
  );
}
