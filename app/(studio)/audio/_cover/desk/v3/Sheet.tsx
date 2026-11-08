"use client";

// ONE COVER'S PRODUCTION SHEET: the cover's title and state across the top, then two columns - what went in (the
// song, its rights, the brief, the section, the style and the source's, the lyrics, the launch) and what came out
// (the takes, the winner, the remix, the lineage). A step not reached is one line saying what it waits on. The two
// columns settle once as the sheet opens; the brief's and the job's states crossfade; a take or a winner arrives.
import { AnimatePresence, motion } from "motion/react";

import { COVER_TAKE_COUNT, type CoverRecord } from "@gt/domain/cover";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { ChainPart, WinnerPart } from "../After.tsx";
import { BriefPart } from "../brief/Brief.tsx";
import { briefOffered, briefShown } from "../brief/brief.ts";
import { SourceName } from "../link/LinkSource.tsx";
import { SectionPart } from "../Score.tsx";
import { doneCount } from "../Takes.tsx";
import type { AB } from "../useAB.ts";
import type { CoverFlow } from "../useCover.ts";
import { clock, RIGHTS_LABEL, RIGHTS_TONE, STATE_TONE } from "../words.ts";
import { Line, Waits } from "./Line.tsx";
import { useMoves } from "./motion.ts";
import { RemixLines } from "./Remix.tsx";
import { ScoreLines } from "./Score.tsx";
import { TakeList } from "./Takes.tsx";
import s from "./sheet.module.css";

/** What the out column's lines wait on, in one word each; null once the line is reached. */
function waiting(r: CoverRecord): { readonly takes: string | null; readonly winner: string | null; readonly remix: string | null; readonly lineage: string | null } {
  const launched = r.state !== "draft";
  const picked = r.state === "picked";
  return {
    takes: launched ? null : "launch",
    winner: picked ? null : r.state === "judging" || r.state === "failed" ? "pick" : launched ? "takes" : "launch",
    remix: picked ? null : "winner",
    lineage: r.remix !== undefined ? null : "remix",
  };
}

function In({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const r = flow.card.record;
  const moves = useMoves();
  const briefLine = r.brief !== undefined || briefOffered(r);
  return (
    <div className={s.col}>
      <CapsHeading text="in" level={3} />
      <Line term="rights">
        <div className={s.inline}>
          <Chip label={RIGHTS_LABEL[r.rights]} tone={RIGHTS_TONE[r.rights]} dot name={`rights ${RIGHTS_LABEL[r.rights]}`} />
          {r.holder !== undefined && <span className={s.valText}>{r.holder}</span>}
        </div>
      </Line>
      {r.note !== undefined && (
        <Line term="note">
          <span className={s.valText}>{r.note}</span>
        </Line>
      )}
      <Line term="song">
        <div className={s.inline}>
          <SourceName record={r} />
          <span className={s.time}>{clock(flow.lenS)}</span>
        </div>
      </Line>
      {briefLine && (
        <Line term="brief">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={briefShown(r.brief)} {...moves.swap}>
              <BriefPart flow={flow} />
            </motion.div>
          </AnimatePresence>
        </Line>
      )}
      <Line term="section" aside={<span className={s.count}>{`${clock(flow.span.startS)}–${clock(flow.span.endS)}`}</span>}>
        <SectionPart flow={flow} ab={ab} />
      </Line>
      <ScoreLines flow={flow} />
    </div>
  );
}

function Out({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const r = flow.card.record;
  const moves = useMoves();
  const w = waiting(r);
  return (
    <div className={s.col}>
      <CapsHeading text="out" level={3} />
      {w.takes !== null ? (
        <Waits term="takes" on={w.takes} />
      ) : (
        <Line term="takes" aside={<Tally value={doneCount(r.takes)} of={COVER_TAKE_COUNT} label="done" />}>
          <TakeList flow={flow} ab={ab} />
        </Line>
      )}
      {w.winner !== null ? (
        <Waits term="winner" on={w.winner} />
      ) : (
        <Line term="winner" tone="rule">
          <AnimatePresence initial={false}>
            <motion.div key={r.winnerSeed} {...moves.arrive}>
              <WinnerPart flow={flow} />
            </motion.div>
          </AnimatePresence>
        </Line>
      )}
      {w.remix !== null ? <Waits term="remix" on={w.remix} /> : <RemixLines flow={flow} />}
      {w.lineage !== null ? (
        <Waits term="lineage" on={w.lineage} />
      ) : (
        <Line term="lineage" tone="rule">
          <ChainPart flow={flow} quiet={ab.stop} />
        </Line>
      )}
    </div>
  );
}

export function Sheet({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const r = flow.card.record;
  const moves = useMoves();
  return (
    <article className={s.sheet} aria-label={r.title}>
      <header className={s.sheetHead}>
        <h2 className={s.title}>{r.title}</h2>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={r.state} className={s.inline} {...moves.swap}>
            <Chip label={r.state} tone={STATE_TONE[r.state]} dot casing="lower" name={`cover ${r.state}`} />
          </motion.span>
        </AnimatePresence>
        <span className={s.mono}>{r.id}</span>
      </header>
      {/* A receipt's table wants the width: the in column widens while one is being read. */}
      <div className={s.cols} data-reading={flow.launching !== null || flow.brief.launching !== null ? "" : undefined}>
        <motion.div className={s.colWrap} {...moves.settle(0)}>
          <In flow={flow} ab={ab} />
        </motion.div>
        <motion.div className={s.colWrap} {...moves.settle(1)}>
          <Out flow={flow} ab={ab} />
        </motion.div>
      </div>
    </article>
  );
}
