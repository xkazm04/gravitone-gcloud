"use client";

// WHERE YOU ARE, as a path. Each level but the last can be stepped back to; the
// last is `aria-current="location"`. On a phone only the first level shows, so a
// long run id never cuts the bar.

import Link from "next/link";

export interface Crumb {
  label: string;
  /** A route. Mutually exclusive with `onSelect`. */
  href?: string;
  /** A level inside the page (closing a sheet, leaving a run). */
  onSelect?: () => void;
}

export function Crumbs({ items, label = "Location" }: { items: Crumb[]; label?: string }) {
  return (
    <ol className="k-crumbs k-caps" aria-label={label}>
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <li key={`${c.label}-${i}`}>
            {last ? (
              <span aria-current="location">{c.label}</span>
            ) : c.href ? (
              <Link href={c.href}>{c.label}</Link>
            ) : (
              <button type="button" onClick={c.onSelect}>
                {c.label}
              </button>
            )}
            {!last && (
              <span className="k-sep" aria-hidden="true">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
