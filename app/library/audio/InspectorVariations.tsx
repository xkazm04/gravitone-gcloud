"use client";

// THE VARIATIONS — the Inspector's "Variations" block: one axis each, so a
// verdict on the result says which axis mattered. Split out of Inspector.tsx to
// keep each Inspector file under the 200-line cap.

import { DEFAULT_RENDER_S } from "@/lib/sound/fromSeed";

import type { Variation } from "./book";

/* ── variations ────────────────────────────────────────────────────────── */

export function Variations({
  list,
  onLoad,
  onCopy,
  canRender,
  rendering,
  cost,
  onRender,
  onRenderAll,
}: {
  list: Variation[];
  onLoad: (v: Variation) => void;
  onCopy: (v: Variation) => void;
  /** The draft is aimed at ElevenLabs, the one vendor this studio can drive. */
  canRender: boolean;
  rendering: boolean;
  /** The price line for `seconds` of music — never $0.00 (lib/musicClient.ts#costLabel). */
  cost: (seconds: number) => { text: string; title: string };
  onRender: (v: Variation) => void;
  onRenderAll: () => void;
}) {
  if (!list.length) return null;
  return (
    <section className="panel" aria-label="Variations">
      <h3>
        Variations{" "}
        <span className="tally">
          <b>{list.length}</b>
        </span>
        <span className="grow" />
        {canRender && (
          <>
            <span className="dim plain">{list.length}× · {cost(list.length * DEFAULT_RENDER_S).text}</span>
            <button type="button" className="btn btn--sm btn--cyan" disabled={rendering} onClick={onRenderAll}>
              {rendering ? "Rendering…" : `Render all ${list.length}`}
            </button>
          </>
        )}
        <span className="dim plain">one axis each</span>
      </h3>
      <div className="vars">
        {list.map((x, i) => (
          <div key={`${x.axis}-${i}`} className="var">
            <div className="ax">
              {x.axis}
              <span>{x.why}</span>
            </div>
            <div>
              {x.diff.map((d) => (
                <span
                  key={d}
                  className={`diff ${d[0] === "−" ? "minus" : d[0] === "+" && !/BPM/.test(d) ? "plus" : "same"}`}
                >
                  {d}
                </span>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => onLoad(x)}>
                Load
              </button>
              <button type="button" className="btn btn--cyan" onClick={() => onCopy(x)}>
                Copy
              </button>
              {canRender && (
                <button type="button" className="btn btn--solid" disabled={rendering} onClick={() => onRender(x)}>
                  Render
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
