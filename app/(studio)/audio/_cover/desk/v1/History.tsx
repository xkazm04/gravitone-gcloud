"use client";

// THE COVERS SO FAR, as the console's left rack (prototype v1): one compact row per cover - its title, the state it
// stands in (the brief's while a brief is under way), its rights, its age - grouped into runs: in flight (a brief or
// a job queued, running or rendering), drafts, to judge, done (picked first, failed last). Each row is a link
// (`?cover=<id>`) the desk opens in place. A cover whose state moves slides to its new run (a shared layout id,
// position only).
import { motion } from "motion/react";
import { useSyncExternalStore } from "react";

import type { CoverCard, CoverDeskView, CoverRecord } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import { BRIEF_TONE, briefInFlight, inFlight } from "../brief/brief.ts";
import { readSnapshot, serverReadSnapshot, subscribeRead } from "../brief/readClock.ts";
import type { Desk } from "../useDesk.ts";
import { RIGHTS_LABEL, RIGHTS_TONE, STATE_TONE } from "../words.ts";
import { useMotionKit } from "./motion.ts";
import { StateChip } from "./StateChip.tsx";
import { ageWords } from "./steps.ts";
import c from "./console.module.css";

type Run = "flight" | "draft" | "judge" | "done";
const RUNS: readonly { readonly id: Run; readonly title: string }[] = [
  { id: "flight", title: "in flight" },
  { id: "draft", title: "drafts" },
  { id: "judge", title: "to judge" },
  { id: "done", title: "done" },
];

function runOf(r: CoverRecord): Run {
  if (inFlight(r)) return "flight";
  if (r.state === "draft") return "draft";
  if (r.state === "judging") return "judge";
  return "done";
}

/** Within done: picked before failed; otherwise the history's own order (newest first). */
const doneRank = (r: CoverRecord): number => (r.state === "failed" ? 1 : 0);

const RIGHTS_SHORT: Readonly<Record<CoverRecord["rights"], string>> = { own: "own", licensed: "licensed", "third-party-uncleared": "uncleared" };

function RowState({ r }: { readonly r: CoverRecord }) {
  const b = r.brief;
  if (b !== undefined && briefInFlight(b)) return <StateChip label="brief" value={b.state} tone={BRIEF_TONE[b.state]} name={`brief ${b.state}`} />;
  const word = r.state === "picked" && r.remix !== undefined ? "remixed" : r.state;
  return <StateChip label={word} tone={STATE_TONE[r.state]} />;
}

function Row({ card, here, desk, now }: { readonly card: CoverCard; readonly here: boolean; readonly desk: Desk; readonly now: number | null }) {
  const kit = useMotionKit();
  const r = card.record;
  return (
    <motion.li {...(kit.still ? {} : { layout: "position" as const, layoutId: `v1-row-${r.id}` })} transition={kit.enter}>
      <a
        className={c.row}
        href={desk.hrefOf(r.id)}
        aria-current={here ? "page" : undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          desk.open(r.id);
        }}
      >
        <span className={c.rowTitle}>{r.title}</span>
        <span className={c.rowLine}>
          <RowState r={r} />
          <Chip label={RIGHTS_SHORT[r.rights]} tone={RIGHTS_TONE[r.rights]} casing="lower" name={`rights ${RIGHTS_LABEL[r.rights]}`} />
          {now !== null && (
            <time className={c.age} dateTime={r.createdAt}>
              {ageWords(r.createdAt, now)}
            </time>
          )}
        </span>
      </a>
    </motion.li>
  );
}

export function History({ desk, view }: { readonly desk: Desk; readonly view: CoverDeskView }) {
  const now = useSyncExternalStore(subscribeRead, readSnapshot, serverReadSnapshot);
  const here = view.current?.record.id;
  return (
    <nav className={c.rack} aria-label="covers">
      <Button label="New cover" size="sm" tone="cyan" onPress={() => desk.open(undefined)} />
      {RUNS.map(({ id, title }) => {
        const covers = view.covers.filter((x) => runOf(x.record) === id);
        if (covers.length === 0) return null;
        const sorted = id === "done" ? [...covers].sort((a, b) => doneRank(a.record) - doneRank(b.record)) : covers;
        return (
          <div key={id} className={c.run}>
            <CapsHeading text={title} tally={{ value: covers.length }} level={3} />
            <ul className={c.rows}>
              {sorted.map((x) => (
                <Row key={x.record.id} card={x} here={x.record.id === here} desk={desk} now={now} />
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
