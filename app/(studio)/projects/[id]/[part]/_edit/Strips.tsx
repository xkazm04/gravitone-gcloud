"use client";

// EXPLAINER · STRIPS (STEPS-DESIGN §2 "explainer parts"): the strips run's cards - PRIMARY: the
// card grid (drawn, pending, refused with its reason); INSPECTOR: the selected card's caption and
// the article section it draws. The strips gate's Board packet is the cull of these cards.
import { useState } from "react";

import type { PartView, StripsData } from "@gt/domain/partView";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { EditorProps } from "./PartEditor.tsx";
import s from "./Cut.module.css";

const TONE = { drawn: "emerald", pending: "amber", refused: "rose" } as const;

export function StripsEditor({ frame, error, view }: EditorProps<PartView<"strips">>) {
  const d: StripsData = view.data;
  const [chosen, setSel] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? (d.cards[0]?.id ?? null) : chosen;
  const card = d.cards.find((c) => c.id === sel) ?? null;
  useKeys("part.strips", {
    item: ({ index }) => {
      const next = walk(d.cards.map((c) => c.id), sel, index === 0 ? 1 : -1);
      if (next === null) return false;
      setSel(next);
    },
  });
  const drawn = d.cards.filter((c) => c.state === "drawn").length;
  const e = d.engine;
  return (
    <PartWorkspace
      {...frame}
      mode="part.strips"
      rail={{
        label: "cards",
        children: (
          <>
            <div className={s.railHead}>
              <Tally value={drawn} of={Math.max(d.planned, d.cards.length)} label="cards drawn" />
            </div>
            {d.cards.length === 0 ? (
              <div className={s.railHead}>
                <Empty label="no cards drawn" />
              </div>
            ) : (
              <RailList
                label="cards"
                items={d.cards}
                idOf={(c) => c.id}
                selected={sel}
                onSelect={setSel}
                row={(c) => (
                  <div className={s.rr}>
                    <div className={s.rrTop}>
                      <span>{c.id}</span>
                      <span className={c.state === "drawn" ? s.ok : c.state === "refused" ? s.rose : s.amber}>{c.state}</span>
                    </div>
                    <div className={s.rrTitle}>{c.title}</div>
                  </div>
                )}
              />
            )}
          </>
        ),
      }}
      primary={{
        label: "cards",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            {d.cards.length === 0 ? (
              <Ghost count={Math.max(1, Math.min(6, d.planned))} label="no cards drawn" />
            ) : (
              <div className={s.cards}>
                {d.cards.map((c) => (
                  <button key={c.id} type="button" className={s.card} {...(c.id === sel ? { "data-on": "" } : {})} aria-pressed={c.id === sel} onClick={() => setSel(c.id)} data-card={c.id}>
                    {c.blob === undefined ? (
                      <span className={s.cardArt} aria-hidden="true" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- a kernel blob through /api/blob; nothing for next/image to optimise
                      <img className={s.cardArt} src={`/api/blob/${c.blob}`} alt="" />
                    )}
                    <span className={s.row}>
                      <strong className={s.grow}>{c.title}</strong>
                      <Chip label={c.state} tone={TONE[c.state]} casing="lower" />
                    </span>
                    <span className={s.why}>{c.caption}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ),
      }}
      inspector={{
        label: "card",
        children:
          card === null ? (
            <Empty label="no card selected" />
          ) : (
            <div className={s.sect}>
              <h3 className={s.h}>{card.title}</h3>
              <p className={s.work}>{card.caption}</p>
              {card.why !== undefined && <p className={s.deny}>{card.why}</p>}
              <span className={s.mono}>{`section ${card.section}`}</span>
              {e !== undefined && <Provenance model={e.model} vendor={e.provider} cost={e.usd === null ? (e.mode === "dry" ? "dry" : "unpriced") : `$${e.usd.toFixed(2)}`} />}
            </div>
          ),
      }}
    />
  );
}
