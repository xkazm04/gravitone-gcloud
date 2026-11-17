"use client";

// DESIGN VARIANT "sleeve" - LINER NOTES (prototype dock-package, 2026-11-17): the release is a physical record and
// packaging it is writing its sleeve. The sleeve (or its white-label blank) is the hero; the steps are the record's
// sides down its spine; each side is a page of liner notes, printed as values and marks, its detail opened as a card
// from the inner sleeve; the agent's suggestions are pencilled in the margin and accepted into print.
//
// Like the wizard (../../../../../_release/wizard/Wizard.tsx, whose walk this keeps) it holds no field of the release:
// the session is the one model, and this holds only the walk - which side, which track, the direction the page turned,
// and which sides have been shown (their rows enter once). A page-made release taking the store's id is the same
// release (../../../../../_release/swap.ts): its walk carries over.
import { useEffect, useMemo, useRef, useState } from "react";

import { releaseProblems } from "@gt/domain/release.problems";

import { isPageMade, isSwap } from "../../../../../_release/swap.ts";
import { entryStep, STEPS, type StepId, type StepProps } from "../../../../../_release/wizard/steps.ts";
import type { StageProps } from "../props.ts";
import { Crate } from "./Crate.tsx";
import { Liner } from "./Liner.tsx";

interface Walk {
  readonly id: string | null;
  readonly step: StepId;
  readonly track: number;
  readonly began: string | null;
  readonly dir: number;
}

export function SleeveStage({ read, session, newId, startStep }: StageProps) {
  const { state, dispatch } = session;
  const release = state.releases.find((r) => r.id === state.openId) ?? null;
  const problems = useMemo(() => (release === null ? [] : releaseProblems(release)), [release]);
  const [walk, setWalk] = useState<Walk>(() => ({ id: release?.id ?? null, step: release === null ? "tracks" : (startStep ?? entryStep(problems, isPageMade(release.id, read.records))), track: 0, began: release?.id ?? null, dir: 0 }));
  const [shown, setShown] = useState<Readonly<Record<string, readonly StepId[]>>>({});
  const heading = useRef<HTMLHeadingElement | null>(null);
  const moved = useRef(false);

  if ((release?.id ?? null) !== walk.id) {
    const next = release?.id ?? null;
    if (next !== null && isSwap(walk.id, next, state.releases.map((r) => r.id))) {
      const from = walk.id ?? "";
      setWalk((w) => ({ ...w, id: next }));
      setShown((v) => ({ ...v, [next]: v[from] ?? [] }));
    } else setWalk({ id: next, step: release === null ? "tracks" : entryStep(problems, isPageMade(release.id, read.records)), track: 0, began: next, dir: 0 });
  }

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [walk.step, walk.id]);

  if (release === null) {
    return (
      <Crate
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
    );
  }

  const step = walk.step;
  const track = Math.max(0, Math.min(walk.track, release.tracks.length - 1));
  const go = (next: StepId, nextTrack?: number) => {
    moved.current = next !== step;
    setShown((v) => ({ ...v, [release.id]: [...new Set([...(v[release.id] ?? []), step])] }));
    setWalk((w) => ({ ...w, step: next, track: nextTrack ?? w.track, dir: Math.sign(STEPS.indexOf(next) - STEPS.indexOf(w.step)) }));
  };
  const props: StepProps = { release, read, problems, dispatch, track, setTrack: (i) => setWalk((w) => ({ ...w, track: i })), go, session };
  const fresh = !(shown[release.id] ?? []).includes(step);
  return <Liner side={{ ...props, fresh }} step={step} dir={walk.dir} leafKey={`${walk.began ?? release.id}:${step}`} heading={heading} onLeave={() => dispatch({ type: "open", id: null })} />;
}
