"use client";

// THE DESK (prototype dock-package, "console"): the open release set up as a mixing console before a broadcast - the
// scribble strip across the top, the store's refusal under it in full, then six channel strips and the master side by
// side, every step visible at once. A press on a strip pulls it forward into the dialog; the selection (the cyan rim)
// follows the strip last opened, and the stage's start step (`review` on the release stage) is where it begins.
//
// The desk holds no field of the release: only which strip is selected or open, at which field, and which track a
// per-track editor is looking at (registry wizard-flows: one model owns every step).
import { useCallback, useMemo, useState } from "react";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import type { Release } from "@gt/domain/release";
import { releaseProblems } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../../../../../_release/_port/port.ts";
import { pendingIn } from "../../../../../_release/pending.ts";
import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { isPageMade } from "../../../../../_release/swap.ts";
import { entryStep, severityOf, type StepId } from "../../../../../_release/wizard/steps.ts";
import type { FaceState } from "./Face.tsx";
import { Commit, Master } from "./Master.tsx";
import { Scribble } from "./Scribble.tsx";
import { StepDialog, type Opened } from "./StepDialog.tsx";
import { Strip } from "./Strip.tsx";
import { levelOf, stripsOf } from "./strips.ts";
import s from "./ground.module.css";

export interface DeskProps {
  readonly read: ReleaseRead;
  readonly session: ReleaseSessionApi;
  readonly release: Release;
  readonly startStep: StepId | undefined;
  readonly reduce: boolean;
}

export function Desk({ read, session, release: r, startStep, reduce }: DeskProps) {
  const { dispatch } = session;
  const problems = useMemo(() => releaseProblems(r), [r]);
  const strips = stripsOf(r, problems, session.pending, read.channels);
  const [opened, setOpened] = useState<Opened>(() => {
    const fresh = isPageMade(r.id, read.records);
    return { step: startStep !== undefined && !fresh ? startStep : entryStep(problems, fresh), field: null, n: 0, open: false };
  });
  const [track, setTrack] = useState(0);
  const at = Math.max(0, Math.min(track, r.tracks.length - 1));

  // Stable: the kit Dialog re-runs its focus effect (focus back to the opener, then to its first control) whenever
  // `onClose` changes identity, so a fresh closure per render would pull focus out of a field on every keystroke.
  const close = useCallback(() => setOpened((o) => ({ ...o, open: false })), []);
  const open = (step: StepId, field: string | null = null) => setOpened((o) => ({ step, field, n: o.n + 1, open: true }));
  const go = (step: StepId, nextTrack?: number) => {
    if (nextTrack !== undefined) setTrack(nextTrack);
    open(step);
  };
  const schedule = () => dispatch({ type: "schedule", id: r.id });
  const acceptAll = (step: StepId) => session.accept(pendingIn(session.pending, step).map((p) => p.id));
  const face = (step: StepId): FaceState => {
    if (step === "review") {
      const sev = severityOf(problems);
      return { step, sev, level: levelOf(sev), incoming: session.pending.length };
    }
    const m = strips.find((x) => x.step === step);
    return m === undefined ? { step, sev: { block: 0, warn: 0 }, level: "clear", incoming: 0 } : { step, sev: m.sev, level: m.level, incoming: m.incoming.length };
  };

  return (
    <div className={s.desk}>
      <Scribble r={r} saving={session.saving} reduce={reduce} onLeave={() => dispatch({ type: "open", id: null })} />
      {session.notice !== null && (
        <div className={s.notice}>
          <ErrorLine message={session.notice} live />
        </div>
      )}
      <div className={s.rack}>
        {strips.map((m) => (
          <Strip
            key={m.step}
            model={m}
            release={r}
            channels={read.channels}
            lifted={opened.open && opened.step === m.step}
            selected={opened.step === m.step}
            reduce={reduce}
            onOpen={(field) => open(m.step, field ?? null)}
            onAcceptAll={() => acceptAll(m.step)}
          />
        ))}
        <Master
          release={r}
          problems={problems}
          pending={session.pending}
          strips={strips}
          channels={read.channels}
          lifted={opened.open && opened.step === "review"}
          selected={opened.step === "review"}
          reduce={reduce}
          onOpen={() => open("review")}
          onSchedule={schedule}
        />
      </div>
      <StepDialog
        opened={opened}
        face={face}
        commit={<Commit release={r} problems={problems} onSchedule={schedule} />}
        incoming={(step) => (step === "review" ? session.pending.length : pendingIn(session.pending, step).length)}
        editor={{ release: r, read, problems, session, dispatch, track: at, setTrack, go, reduce }}
        onStep={(step) => open(step)}
        onClose={close}
        onAcceptAll={(step) => (step === "review" ? session.accept(session.pending.map((p) => p.id)) : acceptAll(step))}
      />
    </div>
  );
}
