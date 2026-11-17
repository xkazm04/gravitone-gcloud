"use client";

// Side A1, the tracklist: printed as a record prints it - number, title, version, a dotted leader, the ISRC and the
// length - with each track's marks (explicit, a problem, a pencilled note, no audio). A row opens its card; the shelf
// opens as a card of its own. The rows enter staggered the first time the side is shown, never again.
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import type { ReleaseTrack } from "@gt/domain/release";

import { pendingIn } from "../../../../../../_release/pending.ts";
import { clock } from "../../../../../../_release/wizard/fmt.ts";
import { Shelf } from "../../../../../../_release/wizard/Shelf.tsx";
import { problemsOnTrack } from "../../../../../../_release/wizard/steps.ts";
import { lengthOf, worst, type SideProps } from "../liner.ts";
import { PencilMark, Printed, ProblemDot, WriteIn } from "../Print.tsx";
import { PrintedCard } from "../PrintedCard.tsx";
import { TrackCard } from "./TrackCard.tsx";
import s from "./side.module.css";

function Row({ t, i, side, onOpen }: { readonly t: ReleaseTrack; readonly i: number; readonly side: SideProps; readonly onOpen: () => void }) {
  const reduce = useReducedMotion() === true;
  const level = worst(problemsOnTrack(side.problems, "tracks", i));
  const notes = pendingIn(side.session.pending, "tracks").filter((p) => p.path.startsWith(`track:${i + 1}.`)).length;
  return (
    <motion.li initial={side.fresh && !reduce ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, delay: Math.min(i, 10) * 0.05, ease: [0.22, 1, 0.36, 1] }}>
      <button type="button" className={s.track} onClick={onOpen}>
        <span className={s.no}>{i + 1}</span>
        <span className={s.trackName}>
          {t.title.trim() === "" ? <WriteIn what="title" /> : <Printed text={t.title} />}
          {t.version !== null && <span className={s.version}>({t.version})</span>}
        </span>
        <span className={s.trackMarks}>
          {t.explicit && (
            <span className={s.explicit} aria-label="explicit" role="img">
              E
            </span>
          )}
          <ProblemDot level={level} />
          {notes > 0 && <PencilMark say={`${notes} pencilled`} />}
          {t.audioHref === null && <Chip label="no audio" ghost />}
        </span>
        <span className={s.leader} aria-hidden="true" />
        {t.isrc !== null && <span className={s.code}>{t.isrc}</span>}
        <span className={s.dur}>{clock(t.durationS)}</span>
      </button>
    </motion.li>
  );
}

export function TracksSide(side: SideProps) {
  const { release: r, read, dispatch } = side;
  const [open, setOpen] = useState<number | null>(null);
  const [shelf, setShelf] = useState(false);
  const onRelease = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !onRelease.has(t.takeId));
  return (
    <div className={s.side}>
      {r.tracks.length === 0 ? (
        <div className={s.blankList}>
          <Empty label="No tracks on this release" action={{ label: "Add from the shelf", tone: "cyan", onPress: () => setShelf(true) }} />
        </div>
      ) : (
        <ol className={s.tracklist} aria-label="tracklist">
          {r.tracks.map((t, i) => (
            <Row key={t.takeId} t={t} i={i} side={side} onOpen={() => setOpen(i)} />
          ))}
        </ol>
      )}
      <div className={s.total}>
        <span className={s.totalTerm}>total</span>
        <span className={s.leader} aria-hidden="true" />
        <span className={s.dur}>{lengthOf(r)}</span>
      </div>
      {r.tracks.length > 0 && (
        <div className={s.acts}>
          <Button label="Add from the shelf" size="sm" tally={{ value: rest.length }} onPress={() => setShelf(true)} />
        </div>
      )}
      <TrackCard index={open} onClose={() => setOpen(null)} side={side} />
      {/* STOP-GAP (prototype dock-package): the wizard's shelf rows, reused inside the card until the crate's own
          shelf design is extracted. */}
      <PrintedCard open={shelf} onClose={() => setShelf(false)} title="Add from the shelf" mark={`A1 · ${rest.length} on the shelf`} wide>
        <Shelf takes={rest} label="shelf takes not on this release" mode={{ kind: "add", onAdd: (take) => dispatch({ type: "addTrack", id: r.id, take }) }} />
      </PrintedCard>
    </div>
  );
}
