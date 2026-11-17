"use client";

// DESIGN VARIANT "cards" - THE DECISION STACK (prototype dock-package, 2026-11-17). Packaging is a short run of
// decisions taken one at a time: the step in focus is one large card in the middle of a quiet ground, the steps
// behind it fold above as one-line summaries, the steps ahead wait below as thin edges, and a segmented bar carries
// the counts. The session is the one model: every value is read from `session.state` and every edit is a DraftEvent;
// this component holds only the walk's position (which release, which step, which track, which steps were seen),
// exactly as the wizard does (registry wizard-flows: one model owns every step), including the wizard's handling of a
// page-made release taking the store's id (../../../../../_release/swap.ts).
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { releaseProblems } from "@gt/domain/release.problems";

import { isPageMade, isSwap } from "../../../../../_release/swap.ts";
import { entryStep, STEPS, type StepId, type StepProps } from "../../../../../_release/wizard/steps.ts";
import type { StageProps } from "../props.ts";
import { Deck } from "./Deck.tsx";
import { Header } from "./Header.tsx";
import { marksOf } from "./model.ts";
import { Progress } from "./Progress.tsx";
import { Stack } from "./Stack.tsx";
import g from "./ground.module.css";

interface Walk {
  readonly id: string | null;
  readonly step: StepId;
  readonly track: number;
  readonly dir: 1 | -1;
}

export function CardsStage({ read, session, newId, startStep }: StageProps) {
  const { state, dispatch } = session;
  const release = state.releases.find((r) => r.id === state.openId) ?? null;
  const problems = useMemo(() => (release === null ? [] : releaseProblems(release)), [release]);
  const [walk, setWalk] = useState<Walk>(() => ({ id: release?.id ?? null, step: release === null ? "tracks" : (startStep ?? entryStep(problems, isPageMade(release.id, read.records))), track: 0, dir: 1 }));
  const [visited, setVisited] = useState<Readonly<Record<string, readonly StepId[]>>>({});
  const heading = useRef<HTMLHeadingElement | null>(null);
  const moved = useRef(false);
  const reduce = useReducedMotion() === true;

  // A release opened from anywhere starts its walk; a page-made release taking the store's id keeps its walk.
  if ((release?.id ?? null) !== walk.id) {
    const next = release?.id ?? null;
    if (next !== null && isSwap(walk.id, next, state.releases.map((r) => r.id))) {
      const from = walk.id ?? "";
      setWalk((w) => ({ ...w, id: next }));
      setVisited((v) => ({ ...v, [next]: v[from] ?? [] }));
    } else setWalk({ id: next, step: release === null ? "tracks" : entryStep(problems, isPageMade(release.id, read.records)), track: 0, dir: 1 });
  }

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest("section")?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [walk.step, walk.id, reduce]);

  if (release === null) {
    return (
      <div className={g.ground} data-variant-body="cards">
        <Deck
          read={read}
          releases={state.releases}
          onOpen={(id) => {
            moved.current = true;
            dispatch({ type: "open", id });
          }}
          onCreate={(takes) => {
            moved.current = true;
            dispatch({ type: "create", id: newId(), artist: read.artist, takes });
          }}
        />
      </div>
    );
  }

  const step = walk.step;
  const track = Math.max(0, Math.min(walk.track, release.tracks.length - 1));
  const seen = new Set<StepId>([...(visited[release.id] ?? []), step]);
  const go = (next: StepId, nextTrack?: number) => {
    moved.current = next !== step;
    setVisited((v) => ({ ...v, [release.id]: [...new Set([...(v[release.id] ?? []), step, next])] }));
    setWalk((w) => ({ ...w, step: next, track: nextTrack ?? w.track, dir: STEPS.indexOf(next) >= STEPS.indexOf(w.step) ? 1 : -1 }));
  };
  const marks = marksOf(problems, session.pending, seen, step);
  const props: StepProps = { release, read, problems, dispatch, track, setTrack: (i) => setWalk((w) => ({ ...w, track: i })), go, session };

  return (
    <div className={g.ground} data-variant-body="cards">
      <div className={g.column}>
        <Header r={release} saving={session.saving} onLeave={() => dispatch({ type: "open", id: null })} />
        <Progress marks={marks} current={step} onGo={(x) => go(x)} />
        {session.notice !== null && (
          <div className={g.notice}>
            <ErrorLine message={session.notice} live />
          </div>
        )}
        <Stack release={release} problems={problems} marks={marks} step={step} dir={walk.dir} heading={heading} props={props} />
      </div>
    </div>
  );
}
