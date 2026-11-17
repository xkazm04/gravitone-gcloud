"use client";

// DESIGN VARIANT "focus" of the package stage (prototype dock-package, round 2): ONE NEXT ACTION. The baseline
// wizard's frame, region for region (its own layout classes - identity, flow, rail width, main, stepHead, body, foot),
// with a different information design inside: each step's body opens with the single decision it needs now (./Lead.tsx
// - fix this block, take this value, schedule, or a quiet `clear`), then the step's values as a quiet read
// (./Summary.tsx), and everything else one press away in a dialog (./Details.tsx, ./Sheets.tsx). The walk's position is
// copied from the wizard (Wizard.tsx): which step, which track, which steps were visited; never a field of the release.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { releaseProblems, type ReleaseProblem } from "@gt/domain/release.problems";

import { plannedSlots } from "../../../../../_release/draft.ts";
import { pendingIn } from "../../../../../_release/pending.ts";
import { isPageMade, isSwap } from "../../../../../_release/swap.ts";
import { Picker } from "../../../../../_release/wizard/Picker.tsx";
import { entryStep, problemsOf, STEP_LABEL, STEPS, stepOf, trackIndexOf, type StepId, type StepProps } from "../../../../../_release/wizard/steps.ts";
import w from "../../../../../_release/wizard/wizard.module.css";
import type { StageProps } from "../props.ts";
import { Details } from "./Details.tsx";
import { Identity } from "./Identity.tsx";
import { Lead, type LeadActs } from "./Lead.tsx";
import { fieldOf, focusKeyOf, leadOf, PROBLEM_SHORT } from "./lead.ts";
import { Rail } from "./Rail.tsx";
import type { Sheet } from "./rows.ts";
import { Sheets } from "./Sheets.tsx";
import { Summary } from "./Summary.tsx";
import s from "./focus.module.css";

interface Walk {
  readonly id: string | null;
  readonly step: StepId;
  readonly track: number;
  readonly began: string | null;
}

export function FocusStage({ read, session, newId, startStep }: StageProps) {
  const { state, dispatch } = session;
  const reduce = useReducedMotion();
  const release = state.releases.find((r) => r.id === state.openId) ?? null;
  const problems = useMemo(() => (release === null ? [] : releaseProblems(release)), [release]);
  const [walk, setWalk] = useState<Walk>(() => ({ id: release?.id ?? null, step: release === null ? "tracks" : (startStep ?? entryStep(problems, isPageMade(release.id, read.records))), track: 0, began: release?.id ?? null }));
  const [visited, setVisited] = useState<Readonly<Record<string, readonly StepId[]>>>({});
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const moved = useRef(false);

  // As the wizard: a release opened from anywhere starts its walk; a page-made release taking the store's id keeps it.
  if ((release?.id ?? null) !== walk.id) {
    const next = release?.id ?? null;
    if (next !== null && isSwap(walk.id, next, state.releases.map((r) => r.id))) {
      const from = walk.id ?? "";
      setWalk((x) => ({ ...x, id: next }));
      setVisited((v) => ({ ...v, [next]: v[from] ?? [] }));
    } else setWalk({ id: next, step: release === null ? "tracks" : entryStep(problems, isPageMade(release.id, read.records)), track: 0, began: next });
  }

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [walk.step, walk.id]);

  if (release === null) {
    // STOP-GAP: the wizard's own picker, until this variant draws the shelf.
    return (
      <div data-variant-body="focus" className={w.wizard}>
        <Picker
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
  const at = STEPS.indexOf(step);
  const track = Math.max(0, Math.min(walk.track, release.tracks.length - 1));
  const seen = new Set<StepId>([...(visited[release.id] ?? []), step]);
  const setTrack = (i: number) => setWalk((x) => ({ ...x, track: i }));
  const go = (next: StepId, nextTrack?: number) => {
    moved.current = next !== step;
    setSheet(null);
    setVisited((v) => ({ ...v, [release.id]: [...new Set([...(v[release.id] ?? []), step, next])] }));
    setWalk((x) => ({ ...x, step: next, track: nextTrack ?? x.track }));
  };
  const prev = STEPS[at - 1];
  const next = STEPS[at + 1];
  const lead = leadOf(step, problems, session.pending, release);
  const focus = focusKeyOf(lead);
  const open = (x: Sheet, i?: number) => {
    if (i !== undefined) setTrack(i);
    setSheet(x);
  };
  const fix = (p: ReleaseProblem) => {
    const ti = trackIndexOf(p);
    if (step === "review") return go(stepOf(p), ti ?? undefined);
    open(p.code === "no-tracks" ? "shelf" : "edit", ti ?? undefined);
  };
  const acts: LeadActs = {
    accept: (id) => session.accept([id]),
    dismiss: (id) => session.dismiss([id]),
    fix,
    details: () => open(lead.kind === "ready" && lead.rest === 0 ? "slots" : "details"),
    schedule: () => dispatch({ type: "schedule", id: release.id }),
  };
  const props: StepProps = { release, read, problems, dispatch, track, setTrack, go, session };
  const spoken = lead.problem !== null ? PROBLEM_SHORT[lead.problem.code] : lead.proposal !== null ? fieldOf(lead.proposal.path).name : lead.kind;
  const quiet = lead.kind !== "clear";

  return (
    <div data-variant-body="focus" className={w.wizard}>
      <Identity r={release} saving={session.saving} onLeave={() => dispatch({ type: "open", id: null })} />
      {session.notice !== null && (
        <div className={w.notice}>
          <ErrorLine message={session.notice} live />
        </div>
      )}
      <div className={w.flow}>
        <Rail release={release} problems={problems} pending={session.pending} current={step} seen={seen} onGo={(x) => go(x)} />
        <section className={w.main} aria-labelledby="wizard-step-heading">
          <div className={w.stepHead}>
            <span className={w.stepNo} aria-hidden="true">
              {at + 1}/{STEPS.length}
            </span>
            <h2 id="wizard-step-heading" ref={heading} tabIndex={-1} className={w.stepTitle}>
              {STEP_LABEL[step]}
            </h2>
          </div>
          <p className={w.sr} aria-live="polite">
            {`Step ${at + 1} of ${STEPS.length}, ${STEP_LABEL[step]}, next: ${spoken}`}
          </p>
          <div className={w.body}>
            <motion.div key={`${walk.began ?? release.id}:${step}`} className={s.stepBody} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}>
              <Lead lead={lead} step={step} release={release} slots={plannedSlots(release, read.channels).length} acts={acts} />
              <Summary step={step} ctx={{ release, read, track, problems: problemsOf(problems, step), pending: pendingIn(session.pending, step), open }} focus={focus} setTrack={setTrack} />
            </motion.div>
          </div>
          <footer className={w.foot}>
            {prev !== undefined ? <Button label={`Back · ${STEP_LABEL[prev]}`} onPress={() => go(prev)} /> : <span />}
            {next !== undefined && <Button label={`Next · ${STEP_LABEL[next]}`} tone={quiet ? "neutral" : "cyan"} glyphAfter="chevR" onPress={() => go(next)} />}
          </footer>
        </section>
      </div>
      <Details open={sheet === "details"} onClose={() => setSheet(null)} step={step} release={release} problems={problemsOf(problems, step)} pending={pendingIn(session.pending, step)} session={session} onFix={fix} />
      <Sheets sheet={sheet} step={step} props={props} focus={focus} onClose={() => setSheet(null)} />
    </div>
  );
}
