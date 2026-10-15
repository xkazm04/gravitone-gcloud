// A route column (tokens.css `.panel`): a caps head with its count, an optional toolbar of
// controls, and a scrolling body. The head takes a title and a Tally and nothing else - the
// prototype's panels never carried a subtitle, and this one cannot.
import type { ReactNode } from "react";
import { Tally, type TallyProps } from "../tally/Tally.tsx";
import s from "./Panel.module.css";

export type PanelProps = {
  readonly title: string;
  readonly tally?: TallyProps;
  /** Controls above the body: Seg, Toggle, Search, Button. */
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
};

export function Panel({ title, tally, toolbar, children }: PanelProps) {
  return (
    <section className={s.panel} aria-label={title}>
      <h2 className={s.head}>
        {title}
        {tally !== undefined && <Tally {...tally} />}
      </h2>
      {toolbar !== undefined && <div className={s.toolbar}>{toolbar}</div>}
      <div className={s.body}>{children}</div>
    </section>
  );
}
