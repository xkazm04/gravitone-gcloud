"use client";

// THE BLAST RADIUS, BEFORE THE ACT (Phase 3 decision 6). v1's forge commit deleted the
// rejected plates and wrote the catalogue in one press, and its preview was a count in a
// dialog; the prototype showed nothing and flew thumbnails afterwards. Here the commit first
// shows everything it will touch, in the source adapter's own words - files it deletes, rows
// and files it writes, what becomes a library thing, renames, near-duplicates, and every act
// that LEAVES this machine as its sentence verbatim ("push branch article/<slug> to
// ai-registry and open a PR") - and commits with the token of exactly this preview. When the
// decisions or v1's state moved underneath (409 stale-preview), the fresh preview replaces this
// one with a mark saying so, and the operator confirms again (hitl-approval
// resume-after-decision: what runs on approval is what was shown).
//
// A dialog layer: Escape cancels and focus returns to the desk; the confirm button takes focus,
// so ⏎ confirms through the button itself and no key row is needed.
import { useEffect, useRef } from "react";

import type { Consequence, ConsequenceItem } from "@gt/domain/board";

import { useLayer } from "../../layers/useLayer.ts";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import s from "./Consequence.module.css";

export type ConsequencePanelProps = {
  readonly consequence: Consequence | null;
  /** The preview this one replaced went stale: the decisions or v1 moved. */
  readonly refreshed: boolean;
  readonly busy: boolean;
  /** The last failure, verbatim. */
  readonly error?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly specimen?: boolean;
};

const line = (it: ConsequenceItem): string => [it.target, it.candidate, it.detail].filter((x): x is string => x !== undefined && x !== "").join(" · ");

function Block({ title, rows, tone }: { readonly title: string; readonly rows: readonly string[]; readonly tone?: "rose" | "amber" | "emerald" | "cyan" }) {
  if (rows.length === 0) return null;
  return (
    <section className={s.block}>
      <CapsHeading text={title} tally={{ value: rows.length }} />
      <ul className={s.rows}>
        {rows.map((r, i) => (
          <li key={`${r}:${i}`} className={tone === undefined ? s.row : s[tone]}>
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ConsequencePanel({ consequence: c, refreshed, busy, error, onConfirm, onCancel, specimen = false }: ConsequencePanelProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useLayer(!specimen, { kind: "dialog", panelRef: panel, onClose: onCancel });
  // Focus lands on Commit once there is something to commit, so ⏎ confirms what is shown.
  const ready = c !== null;
  useEffect(() => {
    if (!ready || specimen) return;
    const buttons = panel.current?.querySelectorAll("button");
    buttons?.[buttons.length - 1]?.focus();
  }, [ready, specimen]);
  return (
    <div className={specimen ? s.inline : s.backdrop}>
      <div ref={panel} className={s.panel} role="dialog" aria-modal={specimen ? undefined : true} aria-label="what this commit will do" data-component="ConsequencePanel">
        <div className={s.head}>
          <h3 className={s.title}>Commit packet</h3>
          {c !== null && (
            <span className={s.counts}>
              <Chip label="kept" value={c.counts.kept} tone="emerald" />
              <Chip label="rejected" value={c.counts.rejected} tone="rose" />
              {c.counts.undecided > 0 && <Chip label="undecided" value={c.counts.undecided} tone="amber" />}
            </span>
          )}
          {refreshed && <Chip label="moved · fresh preview" tone="amber" dot />}
        </div>
        {c === null ? (
          <div className={s.wait} aria-busy="true">
            <Chip label="reading the consequence" ghost />
          </div>
        ) : (
          <div className={s.body}>
            <Block title="leaves this machine" rows={c.outward.map((o) => o.sentence)} tone="amber" />
            <Block title="deletes" rows={c.deletes.map(line)} tone="rose" />
            <Block title="promotes" rows={c.promotions.map(line)} tone="emerald" />
            <Block title="writes" rows={c.writes.map((w) => `${w.kind} · ${line(w)}`)} />
            <Block title="renames" rows={c.renames.map((r) => `${r.from} → ${r.to}`)} />
            <Block title="near duplicates" rows={c.nearDuplicates.map((d) => `${d.candidate} ≈ ${d.of}${d.distance === undefined ? "" : ` · ${d.distance}`}`)} tone="amber" />
            {c.outward.length + c.deletes.length + c.promotions.length + c.writes.length + c.renames.length === 0 && <Chip label="nothing outside the decision log" ghost />}
            <div className={s.token}>
              <Chip label={`token ${c.token.slice(0, 12)}`} casing="lower" />
              <Chip label={`rev ${c.rev}`} casing="lower" />
            </div>
          </div>
        )}
        {error !== undefined && <ErrorLine message={error} live />}
        <div className={s.foot}>
          <Button label="Cancel" onPress={onCancel} />
          <Button label={busy ? "Committing" : "Commit"} tone="emerald" onPress={onConfirm} disabled={c === null || busy} />
        </div>
      </div>
    </div>
  );
}
