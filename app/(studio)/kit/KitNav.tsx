"use client";

// The kit's index (kit.js `#kitnav`): the sections grouped, the one in view marked. The mark
// is `aria-current="location"` - a position inside the page, not a page - set from an
// IntersectionObserver over the scrolling body, as kit.js did with its `.on` class.

import { Fragment, useEffect, useState } from "react";

import { SECTIONS } from "./sections.ts";
import k from "./kit.module.css";

export function KitNav({ bodyId }: { readonly bodyId: string }) {
  const [here, setHere] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    const root = document.getElementById(bodyId);
    if (root === null) return;
    // Every section in the band, not only the last to enter it: one leaving hands the mark
    // back to the one still there (scrolling up out of the section below).
    const inBand = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target.id);
          else inBand.delete(e.target.id);
        }
        const last = SECTIONS.findLast((s) => inBand.has(s.id));
        if (last !== undefined) setHere(last.id);
      },
      { root, rootMargin: "0px 0px -70% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el !== null) io.observe(el);
    }
    return () => io.disconnect();
  }, [bodyId]);
  return (
    <nav className={k.nav} aria-label="kit sections">
      {SECTIONS.map((s, i) => {
        const head = SECTIONS[i - 1]?.group !== s.group;
        return (
          <Fragment key={s.id}>
            {head && <div className={k.grp}>{s.group}</div>}
            <a href={`#${s.id}`} aria-current={here === s.id ? "location" : undefined}>
              {s.title}
            </a>
          </Fragment>
        );
      })}
    </nav>
  );
}
