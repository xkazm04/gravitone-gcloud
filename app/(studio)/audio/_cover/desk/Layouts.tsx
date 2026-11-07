"use client";

// THE THREE COMPOSITIONS of one cover's parts (the prototype skill's variants, behind `?layout=`; the owner picks
// by using them). Same data, same acts, same parts - only where each part sits differs:
//   steps  one column; a part opens as the one before it completes
//   bench  the section and the style across the top, the takes in a stack, winner and remix in a rail
//   chain  the work as nodes left to right, source section -> score -> takes -> winner -> remix; a node opens its part
import { useState, type ReactNode } from "react";

import { COVER_TAKE_COUNT, type CoverState } from "@gt/domain/cover";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import type { CoverLayout } from "../contract.ts";
import { ChainPart, RemixPart, WinnerPart } from "./After.tsx";
import { ScorePart, SectionPart } from "./Score.tsx";
import { SourceFacts } from "./Source.tsx";
import { doneCount, TakesPart } from "./Takes.tsx";
import type { AB } from "./useAB.ts";
import type { CoverFlow } from "./useCover.ts";
import { clock, STATE_TONE } from "./words.ts";
import s from "./cover.module.css";

type PartId = "section" | "score" | "takes" | "winner" | "remix";
const ORDER: readonly PartId[] = ["section", "score", "takes", "winner", "remix"];

/** How far the work has come: the parts a state has opened. */
function reached(state: CoverState): number {
  if (state === "draft") return 2;
  if (state === "picked") return 5;
  return 3;
}

function Block({ n, title, open, extra, children }: { readonly n?: number; readonly title: string; readonly open: boolean; readonly extra?: ReactNode; readonly children: ReactNode }) {
  return (
    <section className={open ? s.block : `${s.block} ${s.closed}`} aria-label={title}>
      <div className={s.head}>
        {n !== undefined && <span className={s.n}>{n}</span>}
        <CapsHeading text={title} level={3} />
        {extra}
      </div>
      {open && children}
    </section>
  );
}

type Props = { readonly flow: CoverFlow; readonly ab: AB };

function parts({ flow, ab }: Props): Record<PartId, { readonly title: string; readonly extra?: ReactNode; readonly body: ReactNode }> {
  const r = flow.card.record;
  const done = doneCount(r.takes);
  return {
    section: {
      title: "section",
      extra: <Chip label={`${clock(flow.span.startS)}–${clock(flow.span.endS)}`} casing="lower" />,
      body: (
        <>
          <SourceFacts card={flow.card} lenS={flow.lenS} />
          <SectionPart flow={flow} ab={ab} />
        </>
      ),
    },
    score: { title: "score", body: <ScorePart flow={flow} /> },
    takes: { title: "takes", extra: <Tally value={done} of={COVER_TAKE_COUNT} label="done" />, body: <TakesPart flow={flow} ab={ab} /> },
    winner: { title: "winner", body: <WinnerPart flow={flow} /> },
    remix: {
      title: "remix",
      ...(r.remix === undefined ? {} : { extra: <Chip label="chain" tone="emerald" casing="lower" dot /> }),
      body: (
        <>
          <RemixPart flow={flow} />
          <ChainPart flow={flow} quiet={ab.stop} />
        </>
      ),
    },
  };
}

export function StepsLayout(p: Props) {
  const all = parts(p);
  const upTo = reached(p.flow.card.record.state);
  return (
    <div className={s.steps}>
      {ORDER.map((id, i) => (
        <Block key={id} n={i + 1} title={all[id].title} open={i < upTo} extra={all[id].extra}>
          {all[id].body}
        </Block>
      ))}
    </div>
  );
}

export function BenchLayout(p: Props) {
  const all = parts(p);
  const upTo = reached(p.flow.card.record.state);
  const b = (id: PartId) => (
    <Block title={all[id].title} open={ORDER.indexOf(id) < upTo} extra={all[id].extra}>
      {all[id].body}
    </Block>
  );
  return (
    <>
      <div className={s.bench}>
        {b("section")}
        {b("score")}
      </div>
      <div className={s.bench}>
        {b("takes")}
        <div className={s.benchRail}>
          {b("winner")}
          {b("remix")}
        </div>
      </div>
    </>
  );
}

function fact(id: PartId, flow: CoverFlow): string {
  const r = flow.card.record;
  if (id === "section") return `${clock(flow.span.startS)}–${clock(flow.span.endS)} of ${r.source.name}`;
  if (id === "score") return r.score !== undefined ? (r.style === "" ? "score" : r.style) : flow.style.trim() === "" ? "no style" : flow.style;
  if (id === "takes") return `${doneCount(r.takes)} of ${COVER_TAKE_COUNT}`;
  if (id === "winner") {
    const t = r.takes.find((x) => x.seed === r.winnerSeed);
    return t === undefined ? "—" : `take ${t.n}`;
  }
  return r.remix?.name ?? "—";
}

export function ChainLayout(p: Props) {
  const all = parts(p);
  const r = p.flow.card.record;
  const upTo = reached(r.state);
  const [open, setOpen] = useState<PartId>(ORDER[Math.min(upTo, ORDER.length) - 1] ?? "section");
  const here = all[open];
  return (
    <div className={s.chain}>
      <ol className={s.nodes} aria-label="chain of work">
        {ORDER.map((id, i) => (
          <li key={id} className={s.node}>
            <button type="button" className={s.nodeBtn} aria-pressed={open === id} data-reached={i < upTo ? "true" : "false"} onClick={() => setOpen(id)}>
              <span className={s.nodeName}>{all[id].title}</span>
              <span className={s.nodeFact}>{fact(id, p.flow)}</span>
              <span className={s.nodeChips}>
                {id === "takes" && r.state !== "draft" && <Chip label={r.state} tone={STATE_TONE[r.state]} casing="lower" dot />}
                {all[id].extra}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <Block title={here.title} open>
        {here.body}
      </Block>
    </div>
  );
}

export function CoverLayoutOf({ layout, ...p }: Props & { readonly layout: CoverLayout }) {
  if (layout === "bench") return <BenchLayout {...p} />;
  if (layout === "chain") return <ChainLayout {...p} />;
  return <StepsLayout {...p} />;
}
