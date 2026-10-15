// The sheet's two frames (kit.js `spec()` and `sec()`): a section with its heading, and a
// specimen card naming what it shows. `names` are the @gt/ui exports the card renders,
// written to `data-specimen` - the live probe (tests/live/kit.live.spec.ts) walks the
// package's exports and fails on any component no card names.

import type { ReactNode } from "react";

import { cx } from "@gt/ui/components/cx.ts";

import { SECTIONS, type SectionId } from "./sections.ts";
import k from "./kit.module.css";

export function Section({ id, children }: { readonly id: SectionId; readonly children: ReactNode }) {
  const sec = SECTIONS.find((s) => s.id === id);
  return (
    <section className={k.sec} id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>
        {sec?.title ?? id}
        <span className={k.sub}>{sec?.sub ?? ""}</span>
      </h2>
      <div className={k.grid}>{children}</div>
    </section>
  );
}

export type SpecProps = {
  readonly names: readonly string[];
  readonly source: string;
  readonly wide?: boolean;
  /** A token card names tokens, not components: it carries no `data-specimen`. */
  readonly tokens?: boolean;
  readonly children: ReactNode;
};

export function Spec({ names, source, wide = false, tokens = false, children }: SpecProps) {
  return (
    <div className={cx(k.spec, wide && k.wide)} data-specimen={tokens ? undefined : names.join(" ")}>
      <div className={k.nm}>
        <b>{names.join(" · ")}</b>
        <span>{source}</span>
      </div>
      {children}
    </div>
  );
}

/** A labelled row inside a card (kit.css `.row` with its `.lab`). */
export function Row({ label, children }: { readonly label?: string; readonly children: ReactNode }) {
  return (
    <div className={k.row}>
      {label !== undefined && <span className={k.lab}>{label}</span>}
      {children}
    </div>
  );
}
