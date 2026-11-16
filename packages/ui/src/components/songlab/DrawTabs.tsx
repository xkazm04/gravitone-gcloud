"use client";

// THE DRAW TABS (the contest winner "Knockout", the owner's fifth why): the main draw and one post
// draw per raw take with variants, each tab its own URL (the TabRail is navigation), carrying its
// open matches as a Tally. Beside them the open draw's head: its rules as chips, decided and upset
// tallies, and the cut - the takes the rules took out, each named with the rule's reason - in a
// fold that opens under the head.
import { useState } from "react";

import { Chip } from "../chip/Chip.tsx";
import { TabRail } from "../tabrail/TabRail.tsx";
import { Tally } from "../tally/Tally.tsx";
import type { DrawHeadView, DrawTabView } from "./songlab.ts";
import s from "./DrawTabs.module.css";

export type DrawTabsProps = {
  readonly tabs: readonly DrawTabView[];
  readonly current: string;
  readonly hrefOf: (drawId: string) => string;
  readonly head: DrawHeadView;
  readonly decided: number;
  readonly total: number;
  readonly upsets: number;
  /** The field sheet's door. */
  readonly fieldHref?: string;
  /** /kit only: the cut fold drawn open. */
  readonly seedCut?: boolean;
};

export function DrawTabs({ tabs, current, hrefOf, head, decided, total, upsets, fieldHref, seedCut = false }: DrawTabsProps) {
  const [cutOpen, setCutOpen] = useState(seedCut);
  const cut = head.cut;
  return (
    <>
      <div className={s.head} data-role="sl-draw-head">
        <TabRail
          label="draws"
          mode="audio.songlab"
          current={current}
          tabs={tabs.map((t) => ({ id: t.drawId, label: t.name, href: hrefOf(t.drawId), tally: t.total > 0 && t.decided === t.total ? { value: "done" } : { value: t.open, label: "open" } }))}
        />
        <div className={s.rules}>
          {head.rules.map((r) => (
            <Chip key={r} label={r} casing="lower" />
          ))}
        </div>
        <div className={s.right}>
          <Tally value={decided} of={total} label="decided" />
          <Tally value={upsets} label="upsets" />
          {fieldHref !== undefined && <Chip label="field" casing="lower" href={fieldHref} />}
          {cut !== undefined && <Chip label={`cut ${cut.length}`} casing="lower" onPress={() => setCutOpen(!cutOpen)} pressed={cutOpen} />}
        </div>
      </div>
      {cutOpen && cut !== undefined && (
        <div className={s.cutfold} data-role="sl-cut">
          <span className={s.caps}>cut</span>
          {cut.length === 0 ? (
            <span className={s.ci}>nobody</span>
          ) : (
            cut.map((c) => (
              <span key={`${c.label}-${c.why}`} className={s.ci}>
                <b>{c.label}</b>
                {c.why}
                <Chip label={c.rights.short} tone="amber" name={c.rights.licence} />
              </span>
            ))
          )}
        </div>
      )}
    </>
  );
}
