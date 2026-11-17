"use client";

// THE RELEASE WIZARD (spark audio-distribution; picked 2026-11-16): DistroKid's upload flow, made calm. First
// which release (one in the draft, or a new one from the shelf); then seven steps - tracks, details,
// AI & rights, sleeve, channels, extras, review - with a rail that shows every step and its
// live problems and lets any step be jumped to. Each step gets the room for its one job.
//
// Registry wizard-flows: one model owns every step. The draft lives in Release.tsx's reducer, above
// this component, so going back, jumping, or switching layout loses nothing; this component holds
// only the walk's presentation - which step, which track, which steps were visited - and S1 has no
// side effect that would owe that position durability (state lives where the side effects live).
// A step change moves focus to the new step's heading and is announced.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release } from "@gt/domain/release";
import { releaseProblems } from "@gt/domain/release.problems";

import { pendingIn } from "../pending.ts";
import { isPageMade, isSwap } from "../swap.ts";
import type { WizardProps } from "./props.ts";
import { clock, day, KIND_LABEL } from "./fmt.ts";
import { Picker } from "./Picker.tsx";
import { Rail } from "./Rail.tsx";
import { STATUS_ENTRY } from "./status.ts";
import { StepChannels } from "./StepChannels.tsx";
import { StepDetails } from "./StepDetails.tsx";
import { StepExtras } from "./StepExtras.tsx";
import { StepReview } from "./StepReview.tsx";
import { StepRights } from "./StepRights.tsx";
import { StepSleeve } from "./StepSleeve.tsx";
import { entryStep, problemsOf, severityOf, STEP_LABEL, STEPS, type StepId, type StepProps } from "./steps.ts";
import { StepTracks } from "./StepTracks.tsx";
import s from "./wizard.module.css";

const BODY: Readonly<Record<StepId, (p: StepProps) => ReactNode>> = {
  tracks: StepTracks,
  details: StepDetails,
  rights: StepRights,
  sleeve: StepSleeve,
  channels: StepChannels,
  extras: StepExtras,
  review: StepReview,
};

interface Walk {
  readonly id: string | null;
  readonly step: StepId;
  readonly track: number;
  /** The id the walk began on: a step's body is keyed by it, so a swap to the store's id does not remount a field
   *  the operator is typing in. */
  readonly began: string | null;
}

function Identity({ r, saving, onLeave }: { readonly r: Release; readonly saving: boolean; readonly onLeave: () => void }) {
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  return (
    <header className={s.identity}>
      {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={s.idArt} width={64} aspect={1} /> : <PlateMissing className={s.idArt} aspect={1} />}
      <div className={s.idText}>
        <span className={s.idTitle}>{r.title.trim() === "" ? "untitled" : r.title}</span>
        <span className={s.idMeta}>
          {r.artist} · {KIND_LABEL[releaseKind(r.tracks)]} · {r.tracks.length} {r.tracks.length === 1 ? "track" : "tracks"} · {clock(total)}
          {r.releaseDate === null ? "" : ` · ${day(r.releaseDate)}`}
        </span>
      </div>
      {saving && <Chip label="saving" tone="cyan" dot />}
      <EntryPill entry={STATUS_ENTRY[r.status]} />
      <Button label="All releases" size="sm" onPress={onLeave} />
    </header>
  );
}

export function Wizard({ read, session, newId, startStep }: WizardProps) {
  const { state, dispatch } = session;
  const release = state.releases.find((r) => r.id === state.openId) ?? null;
  const problems = useMemo(() => (release === null ? [] : releaseProblems(release)), [release]);
  const [walk, setWalk] = useState<Walk>(() => ({ id: release?.id ?? null, step: release === null ? "tracks" : (startStep ?? entryStep(problems, isPageMade(release.id, read.records))), track: 0, began: release?.id ?? null }));
  const [visited, setVisited] = useState<Readonly<Record<string, readonly StepId[]>>>({});
  const heading = useRef<HTMLHeadingElement | null>(null);
  const moved = useRef(false);

  // A release opened from anywhere (this picker, a create, another layout, the URL) starts its walk - a release made on
  // this page at its first step. A page-made release taking the store's id (../swap.ts) is the same release: its walk
  // and visited steps carry over to the new id.
  if ((release?.id ?? null) !== walk.id) {
    const next = release?.id ?? null;
    if (next !== null && isSwap(walk.id, next, state.releases.map((r) => r.id))) {
      const from = walk.id ?? "";
      setWalk((w) => ({ ...w, id: next }));
      setVisited((v) => ({ ...v, [next]: v[from] ?? [] }));
    } else setWalk({ id: next, step: release === null ? "tracks" : entryStep(problems, isPageMade(release.id, read.records)), track: 0, began: next });
  }

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [walk.step, walk.id]);

  if (release === null) {
    return (
      <div data-variant-body="wizard" className={s.wizard}>
        <Picker
          read={read}
          releases={state.releases}
          onOpen={(id) => {
            moved.current = true;
            dispatch({ type: "open", id });
          }}
          onCreate={(takes) => {
            const id = newId();
            moved.current = true;
            dispatch({ type: "create", id, artist: read.artist, takes });
          }}
        />
      </div>
    );
  }

  const step = walk.step;
  const at = STEPS.indexOf(step);
  const track = Math.max(0, Math.min(walk.track, release.tracks.length - 1));
  const seen = new Set<StepId>([...(visited[release.id] ?? []), step]);
  const go = (next: StepId, nextTrack?: number) => {
    moved.current = next !== step;
    setVisited((v) => ({ ...v, [release.id]: [...new Set([...(v[release.id] ?? []), step, next])] }));
    setWalk((w) => ({ ...w, step: next, track: nextTrack ?? w.track }));
  };
  const prev = STEPS[at - 1];
  const next = STEPS[at + 1];
  const here = severityOf(problemsOf(problems, step));
  const suggested = pendingIn(session.pending, step);
  const Body = BODY[step];
  const props: StepProps = { release, read, problems, dispatch, track, setTrack: (i) => setWalk((w) => ({ ...w, track: i })), go, session };

  return (
    <div data-variant-body="wizard" className={s.wizard}>
      <Identity r={release} saving={session.saving} onLeave={() => dispatch({ type: "open", id: null })} />
      {session.notice !== null && (
        <div className={s.notice}>
          <ErrorLine message={session.notice} live />
        </div>
      )}
      <div className={s.flow}>
        <Rail problems={problems} pending={session.pending} current={step} seen={seen} onGo={(x) => go(x)} />
        <section className={s.main} aria-labelledby="wizard-step-heading">
          <div className={s.stepHead}>
            <span className={s.stepNo} aria-hidden="true">
              {at + 1}/{STEPS.length}
            </span>
            <h2 id="wizard-step-heading" ref={heading} tabIndex={-1} className={s.stepTitle}>
              {STEP_LABEL[step]}
            </h2>
            {step !== "review" && here.block > 0 && <Chip label="block" value={here.block} tone="rose" />}
            {step !== "review" && here.warn > 0 && <Chip label="warn" value={here.warn} tone="amber" />}
            {suggested.length > 0 && (
              <span className={s.acceptAll}>
                <Button label="Accept all" size="sm" tone="emerald" tally={{ value: suggested.length }} onPress={() => session.accept(suggested.map((p) => p.id))} />
              </span>
            )}
          </div>
          <p className={s.sr} aria-live="polite">
            {`Step ${at + 1} of ${STEPS.length}, ${STEP_LABEL[step]}`}
          </p>
          <div className={s.body}>
            <Body key={`${walk.began ?? release.id}:${step}`} {...props} />
          </div>
          <footer className={s.foot}>
            {prev !== undefined ? <Button label={`Back · ${STEP_LABEL[prev]}`} onPress={() => go(prev)} /> : <span />}
            {next !== undefined && <Button label={`Next · ${STEP_LABEL[next]}`} tone="cyan" glyphAfter="chevR" onPress={() => go(next)} />}
          </footer>
        </section>
      </div>
    </div>
  );
}
