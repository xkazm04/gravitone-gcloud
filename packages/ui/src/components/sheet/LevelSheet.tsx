"use client";

// The level sheet (prototype tokens.css `[data-component=LevelSheet]`, index.html `openLevel`):
// a deeper surface of the Floor that rises over it - the Board today - with its crumbs, the
// way back, and one body. It is a LAYER (layers/stack.ts kind `sheet`): it claims the keys for
// its desk's mode, holds the scroll lock, and its close is the caller's (the Board's is
// `router.back()`), so one Escape closes one sheet and a second Escape, while the route is
// still leaving, reaches the Floor instead of walking history twice.
//
// `full` is the same level loaded as a page (a reload, a pasted link): drawn in flow under the
// header with no scrim, still on the stack, so its keys and Escape work the same way.
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useLayer } from "../../layers/useLayer.ts";
import { Button } from "../button/Button.tsx";
import { Crumbs, type Crumb } from "../crumbs/Crumbs.tsx";
import { cx } from "../cx.ts";
import kc from "../keycaps/Keycaps.module.css";
import s from "./LevelSheet.module.css";

export type LevelSheetProps = {
  readonly trail: readonly Crumb[];
  readonly here: string;
  /** The keymap mode the sheet's keys resolve in (the desk's: `board.cull`, `board.pair`). */
  readonly mode: string;
  /** Where the way-back button says it goes. */
  readonly back: string;
  readonly onClose: () => void;
  readonly full?: boolean;
  /** A /kit specimen: drawn open, never on the stack. */
  readonly specimen?: boolean;
  /** Hug the content: the sheet rises from the bottom edge only as tall as its body (a receipt),
   *  up to the full sheet's height. Still the same layer, scrim, keys and Escape. */
  readonly fit?: boolean;
  readonly children: ReactNode;
};

export function LevelSheet({ trail, here, mode, back, onClose, full = false, specimen = false, fit = false, children }: LevelSheetProps) {
  const panel = useRef<HTMLElement | null>(null);
  const [risen, setRisen] = useState(full || specimen);
  useLayer(!specimen, { kind: "sheet", mode, panelRef: panel, onClose });
  useEffect(() => {
    if (risen) return;
    const raf = requestAnimationFrame(() => setRisen(true));
    return () => cancelAnimationFrame(raf);
  }, [risen]);
  // Focus enters the sheet once, on open, so its keys are the operator's at once.
  useEffect(() => {
    if (specimen) return;
    panel.current?.focus({ preventScroll: true });
  }, [specimen]);
  const name = [...trail.map((c) => c.label), here].join(" › ");
  return (
    <>
      {!full && !specimen && <div className={s.scrim} aria-hidden="true" />}
      <section
        ref={panel}
        className={cx(s.sheet, full && s.full, specimen && s.specimen, fit && !full && !specimen && s.fit, risen && s.open)}
        role={full ? "region" : "dialog"}
        aria-modal={full ? undefined : true}
        aria-label={name}
        tabIndex={-1}
        data-component="LevelSheet"
      >
        {!full && <div className={s.grab} aria-hidden="true" />}
        <div className={s.bar}>
          <Crumbs trail={trail} here={here} />
          <div className={s.close}>
            <kbd className={kc.cap}>Esc</kbd>
            <Button label={back} size="sm" onPress={onClose} />
          </div>
        </div>
        <div className={s.body}>{children}</div>
      </section>
    </>
  );
}
