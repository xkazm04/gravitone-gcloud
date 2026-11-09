"use client";

// THE KEY SHEET - ⌘/ over any studio screen: every key a press could fire right now, by mode,
// innermost first, the studio's own last (keymap/help.ts). A keymap is a table, not prose: each
// section is a `Keycaps` legend over the same rows the dispatcher resolves, so a binding added to
// bindings.ts is drawn here without anyone touching this file (keyboard-shortcuts
// declared-keymap-authority: the reference page is a render of the declarations).
//
// A `dialog` layer with no keymap mode: it claims the keyboard, so nothing beneath fires while
// it is read, and Escape closes it and returns focus to where it was.
import { useEffect, useRef } from "react";

import { KEYMAP } from "../../keymap/bindings.ts";
import { helpTable } from "../../keymap/help.ts";
import type { Keymap } from "../../keymap/keymap.ts";
import { useLayer } from "../../layers/useLayer.ts";
import { cx } from "../cx.ts";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Keycaps } from "../keycaps/Keycaps.tsx";
import s from "./Jump.module.css";

export type KeySheetProps = {
  /** The mode a press resolves in beneath the sheet (dispatch.ts `keyContext`); null when no screen bound keys. */
  readonly mode: string | null;
  readonly facts: ReadonlySet<string>;
  readonly onClose: () => void;
  readonly map?: Keymap;
  /** A /kit specimen: drawn in flow, never on the stack. */
  readonly specimen?: boolean;
};

/** `board.cull` is drawn `board · cull`: the mode's own words, its nesting as the separator. */
const spoken = (mode: string): string => mode.split(".").join(" · ");

export function KeySheet({ mode, facts, onClose, map = KEYMAP, specimen = false }: KeySheetProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useLayer(!specimen, { kind: "dialog", panelRef: panel, onClose });
  useEffect(() => {
    if (!specimen) panel.current?.focus({ preventScroll: true });
  }, [specimen]);
  const sections = helpTable(map, mode, facts);
  return (
    <div className={cx(s.backdrop, specimen && s.inline)}>
      <div ref={panel} className={cx(s.panel, s.sheet)} role="dialog" aria-modal={specimen ? undefined : true} aria-label="keys" tabIndex={-1}>
        {sections.map((sec) => (
          <section key={sec.mode} className={s.section} aria-label={spoken(sec.mode)}>
            <CapsHeading text={spoken(sec.mode)} level={4} />
            <Keycaps mode={sec.mode} facts={facts} map={map} label={`${spoken(sec.mode)} keys`} />
          </section>
        ))}
      </div>
    </div>
  );
}
