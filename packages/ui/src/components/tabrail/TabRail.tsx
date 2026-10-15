// The view switch with no slot for a paragraph (projects.js `.tabrail`: Plan, Runs; v1
// signal/TabRail.tsx). Each tab is a label, its count as a Tally, and the caps of the keymap
// verb that also switches to it. There is no `blurb`, `sub` or `description`, and that
// absence is the component (v1 README).
//
// Semantics changed from both ancestors: the prototype's tabs are LINKS to views with their
// own URLs (#plan, #runs), so this is navigation - `aria-current="page"` - not the ARIA tabs
// pattern, whose arrow-key roving would need a second keyboard path beside the keymap
// registry. v1's arrows and Home/End are dropped for that reason; P and R reach the views.
// A tab that cannot be entered yet is aria-disabled and stays readable.
import { Keycap } from "../keycaps/Keycaps.tsx";
import { Tally, type TallyProps } from "../tally/Tally.tsx";
import s from "./TabRail.module.css";

export type Tab<V extends string> = {
  readonly id: V;
  readonly label: string;
  readonly href: string;
  /** The keymap verb that opens this view in `mode`. */
  readonly verb?: string;
  readonly tally?: TallyProps;
  readonly disabled?: boolean;
};

export type TabRailProps<V extends string> = {
  readonly label: string;
  readonly mode: string;
  readonly tabs: readonly Tab<V>[];
  readonly current: V;
};

export function TabRail<V extends string>({ label, mode, tabs, current }: TabRailProps<V>) {
  return (
    <nav className={s.rail} aria-label={label}>
      {tabs.map((t) => (
        <a
          key={t.id}
          className={s.tab}
          href={t.disabled === true ? undefined : t.href}
          aria-current={t.id === current ? "page" : undefined}
          aria-disabled={t.disabled === true ? true : undefined}
        >
          {t.label}
          {t.tally !== undefined && <Tally {...t.tally} />}
          {t.verb !== undefined && <Keycap mode={mode} verb={t.verb} size="sm" />}
        </a>
      ))}
    </nav>
  );
}
