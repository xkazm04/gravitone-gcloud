// Where this level sits (tokens.css Crumbs): Floor, Board, Image, then the packet. Each step
// is a link or a button back to its level; the last is the place itself, aria-current.
import { Fragment } from "react";
import s from "./Crumbs.module.css";

export type Crumb = { readonly label: string; readonly href: string } | { readonly label: string; readonly onPress: () => void };

export function Crumbs({ trail, here }: { readonly trail: readonly Crumb[]; readonly here: string }) {
  return (
    <nav className={s.crumbs} aria-label="breadcrumb">
      {trail.map((c) => (
        <Fragment key={c.label}>
          {"href" in c ? (
            <a className={s.step} href={c.href}>
              {c.label}
            </a>
          ) : (
            <button type="button" className={s.step} onClick={c.onPress}>
              {c.label}
            </button>
          )}
          <span className={s.sep} aria-hidden="true">
            {"›"}
          </span>
        </Fragment>
      ))}
      <span className={s.here} aria-current="page">
        {here}
      </span>
    </nav>
  );
}
