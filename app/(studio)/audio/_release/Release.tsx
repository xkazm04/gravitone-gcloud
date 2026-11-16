"use client";

// THE RELEASE TAB (spark audio-distribution, S1): the draft every layout shares, and the switch between
// the three layouts under test - desk (one page), wizard (a stepper) and board (a catalog). The layout
// lives in the URL (`v`) so a link and a reload carry it; switching keeps the draft, because the
// reducer lives here, above all three.
import { useCallback, useReducer, useState } from "react";

import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import type { ReleaseRead, ReleaseUrl, ReleaseVariant } from "./_port/port.ts";
import { RELEASE_VARIANTS } from "./_port/port.ts";
import { Board } from "./_v/board/Board.tsx";
import { Desk } from "./_v/desk/Desk.tsx";
import { Wizard } from "./_v/wizard/Wizard.tsx";
import { initialDraft, reduceDraft } from "./draft.ts";
import { releaseHref } from "./url.ts";
import s from "./release.module.css";

const LAYOUTS = { desk: Desk, wizard: Wizard, board: Board } as const;

const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

export function Release({ read, url }: { readonly read: ReleaseRead; readonly url: ReleaseUrl }) {
  const [variant, setVariant] = useState<ReleaseVariant>(url.variant);
  const [state, dispatch] = useReducer(reduceDraft, initialDraft(read.releases, url.release));
  const newId = useCallback(() => `rel-${hex12()}`, []);
  const pick = (v: ReleaseVariant) => {
    setVariant(v);
    window.history.replaceState(null, "", releaseHref({ ...url, variant: v, release: state.openId }));
  };
  const Layout = LAYOUTS[variant];
  return (
    <section className={s.tab} data-variant={variant}>
      <div className={s.switch}>
        <Seg label="layout" options={RELEASE_VARIANTS.map((v) => ({ value: v, label: v }))} value={variant} onChange={pick} />
      </div>
      <Layout read={read} state={state} dispatch={dispatch} newId={newId} />
    </section>
  );
}
