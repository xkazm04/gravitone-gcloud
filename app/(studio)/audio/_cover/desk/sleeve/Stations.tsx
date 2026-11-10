"use client";

// ONE COVER ON THE TURNTABLE: the sleeve's face (its title and the song's facts), the groove, and
// one station's panel at a time. The cover opens at the station its work stands at (./stations.ts frontier) and moves
// there again when the record moves - a brief finishing, takes landing, a pick - so a state change is a slide, not a
// scroll. Pressing a station slides the panel forward (left) or back (right). The take-against-take player
// (./usePair.ts) and the A/B (../useAB.ts) never sound together.
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { COVER_TAKE_COUNT, type CoverCard, type CoverRecord } from "@gt/domain/cover";
import { sunoSendInFlight } from "@gt/domain/cover.suno";

import { ChainPart, RemixPart, WinnerPart } from "../After.tsx";
import { BRIEF_TONE } from "../brief/brief.ts";
import { BriefHypothesis, BriefPart } from "../brief/Brief.tsx";
import { ScorePart, SectionPart } from "../Score.tsx";
import { SunoStation } from "../suno/SunoStation.tsx";
import { SourceFacts } from "../Source.tsx";
import { useAB, type AB } from "../useAB.ts";
import { useCover, type CoverFlow } from "../useCover.ts";
import type { Desk } from "../useDesk.ts";
import { clock, doneCount } from "../words.ts";
import { Compare } from "./Compare.tsx";
import { Groove, type StationFacts } from "./Groove.tsx";
import { keepPeaks, sectionPeaks } from "./peaks.ts";
import { direction, FITTED, frontier, reachedOf, type Station } from "./stations.ts";
import { TakeGrid } from "./TakeGrid.tsx";
import { usePair, type Pair } from "./usePair.ts";
import { WinnerCard } from "./WinnerCard.tsx";
import s from "./sleeve.module.css";

/** The suno station's badge: running while a send is, the kept take once one is filed, else how many sends went. */
function sunoFact(r: CoverRecord): Partial<Record<Station, StationFacts>> {
  const sends = r.suno?.sends ?? [];
  if (sunoSendInFlight(r.suno)) return { suno: { badge: { label: "sending", tone: "cyan" } } };
  if (r.suno?.filed !== undefined) return { suno: { badge: { label: `send ${r.suno.filed.send} · take ${r.suno.filed.take}`, tone: "emerald" } } };
  return sends.length === 0 ? {} : { suno: { tally: { value: sends.length, label: "sent" } } };
}

function factsOf(flow: CoverFlow): Partial<Record<Station, StationFacts>> {
  const r = flow.card.record;
  const winner = r.takes.find((t) => t.seed === r.winnerSeed);
  return {
    ...(r.brief === undefined ? {} : { brief: { badge: { label: r.brief.state, tone: BRIEF_TONE[r.brief.state] } } }),
    section: { badge: { label: `${clock(flow.span.startS)}–${clock(flow.span.endS)}` } },
    ...(flow.editable && flow.style.trim() === "" ? { score: { badge: { label: "no style", tone: "amber" } } } : {}),
    ...(r.state === "draft" ? {} : { takes: { tally: { value: doneCount(r.takes), of: COVER_TAKE_COUNT, label: "done" } } }),
    ...(winner === undefined ? {} : { winner: { badge: { label: `take ${winner.n}`, tone: "emerald" } } }),
    ...sunoFact(r),
    ...(r.remix === undefined ? {} : { remix: { badge: { label: "chain", tone: "emerald" } } }),
  };
}

function Panel({ at, flow, desk, ab, pair, quiet }: { readonly at: Station; readonly flow: CoverFlow; readonly desk: Desk; readonly ab: AB; readonly pair: Pair; readonly quiet: () => void }) {
  const r = flow.card.record;
  const reduce = useReducedMotion() === true;
  switch (at) {
    case "brief":
      return (
        // Keyed by the brief's state: queued, running, done and failed each land as the record moves.
        <motion.div key={r.brief?.state ?? "none"} className={s.fields} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
          <BriefPart flow={flow} />
          <BriefHypothesis brief={r.brief} />
        </motion.div>
      );
    case "section":
      return <SectionPart flow={flow} ab={ab} />;
    case "score":
      return <ScorePart flow={flow} />;
    case "takes":
      return (
        <div className={s.fields}>
          <TakeGrid flow={flow} ab={ab} />
          <Compare flow={flow} pair={pair} quiet={quiet} />
        </div>
      );
    case "winner":
      return (
        <div className={s.winnerRow}>
          <WinnerCard flow={flow} ab={ab} />
          <WinnerPart flow={flow} />
        </div>
      );
    case "suno":
      return <SunoStation flow={flow} desk={desk} />;
    case "remix":
      return (
        <div className={s.remix}>
          <RemixPart flow={flow} />
          <ChainPart flow={flow} quiet={quiet} />
        </div>
      );
  }
}

const slide = {
  enter: (d: number) => ({ x: d * 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -48, opacity: 0 }),
};

export function Stations({ card, desk }: { readonly card: CoverCard; readonly desk: Desk }) {
  const flow = useCover(card, desk.acts, desk.sender, desk.refresh);
  const { heard, span } = flow;
  const rms = useMemo(() => heard?.rms(span.startS, span.endS), [heard, span.startS, span.endS]);
  const raw = useAB(card.sourceUrl, span, rms);
  const pair = usePair();
  const reduce = useReducedMotion() === true;
  // One player at a time: the A/B quiets the pair before it sounds, the pair and the chain quiet the A/B.
  const ab = useMemo((): AB => {
    const hush = pair.stop;
    return {
      ...raw,
      toggle: (k, u) => {
        hush();
        raw.toggle(k, u);
      },
      seek: (k, u, x) => {
        hush();
        raw.seek(k, u, x);
      },
      hear: (k, u, x) => {
        hush();
        raw.hear(k, u, x);
      },
    };
  }, [raw, pair.stop]);
  const quiet = (): void => {
    raw.stop();
    pair.stop();
  };

  // A cover made from a link opens on its brief's receipt (desk.briefOnOpen): asked once, here, as it mounts.
  const askNow = desk.briefOnOpen === card.record.id;
  const { briefAsked } = desk;
  const ask = flow.brief.ask;
  useEffect(() => {
    if (!askNow) return;
    briefAsked();
    ask();
  }, [askNow, briefAsked, ask]);

  // The sleeve's waveform in the crate: this cover's section, from the decode just made.
  useEffect(() => {
    if (heard !== null) keepPeaks(card.record.id, sectionPeaks(heard.peaks, heard.lenS, span.startS, span.endS));
  }, [heard, span.startS, span.endS, card.record.id]);

  const r = card.record;
  const reached = reachedOf(r);
  const front = frontier(r);
  const [at, setAt] = useState<Station>(front);
  const [dir, setDir] = useState(0);
  // The record moved the work on: the panel goes where it now stands (React's reset-on-prop pattern, during render).
  // `editable` is in the key because a failed cover relaunched stands at the takes both before and after.
  const moved = `${front}/${flow.editable}`;
  const [seen, setSeen] = useState(moved);
  if (seen !== moved) {
    setSeen(moved);
    setDir(direction(at, front));
    setAt(front);
  }
  const go = (to: Station): void => {
    if (!reached[to] || to === at) return;
    setDir(direction(at, to));
    setAt(to);
  };
  const shown = reached[at] ? at : front;

  return (
    <article className={s.disc} aria-label={r.title}>
      <header className={s.face}>
        <h2 className={s.title}>{r.title}</h2>
        <AnimatePresence initial={false} mode="wait">
          <motion.div key={`${r.state}·${r.brief?.state ?? ""}`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}>
            <SourceFacts card={card} lenS={flow.lenS} />
          </motion.div>
        </AnimatePresence>
      </header>
      <LayoutGroup id={`sleeve-${r.id}`}>
        <Groove at={shown} reached={reached} facts={factsOf(flow)} onGo={go} />
        <div className={s.stage}>
          <AnimatePresence initial={false} custom={dir}>
            <motion.section
              key={shown}
              className={s.panel}
              data-fit={FITTED.has(shown) ? "" : undefined}
              aria-label={shown}
              custom={dir}
              variants={slide}
              initial={reduce ? false : "enter"}
              animate="center"
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : "exit"}
              transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <Panel at={shown} flow={flow} desk={desk} ab={ab} pair={pair} quiet={quiet} />
            </motion.section>
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </article>
  );
}
