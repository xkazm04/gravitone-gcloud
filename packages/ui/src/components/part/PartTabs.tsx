// The part rail at the foot of the workspace: the project's parts in recipe order, each with its
// state mark (part.ts `tabMark`). Navigation, not the ARIA tabs pattern - each tab is the URL of
// its editor - so `[` / `]` (the keymap's `part` mode) walk it and the arrows are left alone
// (TabRail's reasoning). A part with no editor yet, a gate and the slot stay readable and are
// aria-disabled: they are Board and calendar acts, not editors.
import type { PartTab } from "@gt/domain/partView";

import { Keycap } from "../keycaps/Keycaps.tsx";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import { tabMark, verdictLook } from "./part.ts";
import s from "./Part.module.css";

export type PartTabsProps = {
  readonly tabs: readonly PartTab[];
  readonly current: string;
  readonly href: (key: string) => string;
  /** Draw the `[ ]` keycaps after the rail (the workspace does; the contract specimen does not). */
  readonly keys?: boolean;
};

export function PartTabs({ tabs, current, href, keys = true }: PartTabsProps) {
  return (
    <nav className={s.tabs} aria-label="parts" data-component="PartTabs">
      {tabs.map((t) => {
        const m = tabMark(t);
        const open = t.editor && t.kind !== "gate" && t.kind !== "slot";
        return (
          <a
            key={t.partId}
            className={cx(s.tab, t.verdict !== null && s[verdictLook(t.verdict)], t.kind === "gate" && s.gateTab)}
            href={open ? href(t.key) : undefined}
            aria-current={t.key === current ? "page" : undefined}
            aria-disabled={open ? undefined : true}
          >
            {t.label}
            <span className={s.mark} aria-hidden="true">
              {m.glyph}
            </span>
            <SrOnly text={`, ${m.spoken}`} />
          </a>
        );
      })}
      {keys && (
        <span className={s.tabKeys}>
          <Keycap mode="part" verb="tab" size="sm" />
        </span>
      )}
    </nav>
  );
}
