"use client";

// THE CARD'S WORDS (canvas, WP3): `heard` is the card's header - the person's own sentence with
// each linked phrase carrying, above it, what it became ("calm" -> "slow and soft"), and the words
// that were not used struck through - and `measures` is its footer, one chip per measured fact in
// its tone. Degraded: a sentence with no links reads as said; an empty measures piece says nothing
// was measured.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { Tone } from "@gt/ui/components/chip/tone.ts";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";

import { runsOf } from "../model.ts";
import type { PieceProps } from "../registry.tsx";
import s from "./pieces.module.css";

export function Heard({ node }: PieceProps<"heard">) {
  const runs = runsOf(node.sentence, node.links);
  const unheard = node.unheard ?? [];
  return (
    <div className={s.heard} data-provisional={node.source === "illustrative" || undefined}>
      <span className={s.youSaid}>you said</span>
      <p className={s.sentence}>
        {runs.map((r, i) => {
          const link = r.link === null ? undefined : node.links[r.link];
          return link === undefined ? (
            <span key={i}>{r.text}</span>
          ) : (
            <ruby key={i} className={s.linked} data-field={link.field}>
              {r.text}
              <rt className={s.became}>{link.to}</rt>
            </ruby>
          );
        })}
      </p>
      {(unheard.length > 0 || node.links.length === 0 || node.source !== undefined) && (
        <p className={s.unheard}>
          {node.source !== undefined && <SourceTag kind={node.source} />}
          {node.links.length === 0 && <span>{"The agent did not say what these words became."}</span>}
          {unheard.length > 0 && <span>{"not used:"}</span>}
          {unheard.map((w) => (
            <s key={w} className={s.struck}>
              {w}
            </s>
          ))}
        </p>
      )}
    </div>
  );
}

const TONE: Readonly<Record<"ok" | "warn" | "bad", Tone>> = { ok: "emerald", warn: "amber", bad: "rose" };

export function Measures({ node }: PieceProps<"measures">) {
  return (
    <div className={s.measures} aria-label="what was measured">
      {node.source !== undefined && <SourceTag kind={node.source} />}
      {node.rows.length === 0 ? (
        <span className={s.quietInline}>nothing was measured on this take</span>
      ) : (
        node.rows.map((r) => <Chip key={`${r.label}-${r.value}`} label={r.label} value={r.value} casing="lower" {...(r.tone !== undefined ? { tone: TONE[r.tone], dot: true } : {})} />)
      )}
    </div>
  );
}
