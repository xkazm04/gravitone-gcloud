"use client";

// DESIGN VARIANT "sheet" of the package stage (prototype dock-package, round 2): A CLEAN READ-ONLY SHEET, EDITED BY
// SECTION. The frame is the wizard's own - its identity bar, its rail column, its step head, body and foot, drawn with
// `wizard.module.css`'s layout classes so the geometry cannot drift - and only what fills each region changes:
//   - the LEAD: one slim bar above the sheet, the step's state in a word, its first subject and its counts, and one
//     button that opens exactly those items in the dialog (Lead.tsx);
//   - the SHEET: the step's values set as a document, label small and quiet, value large, no field, chip or colour
//     (Sheet.tsx, Pages*.tsx);
//   - the DETAIL: every section's one quiet Edit opens its form in the dialog, with the section's rules verbatim and
//     the agent's proposals for its fields (Editor.tsx).
// The walk (which step, which track, which steps were seen) is the wizard's logic, copied; the draft stays the
// session's - no release field is held here.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { releaseProblems, releaseReady } from "@gt/domain/release.problems";

import { isPageMade, isSwap } from "../../../../../_release/swap.ts";
import { Picker } from "../../../../../_release/wizard/Picker.tsx";
import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { entryStep, STEP_LABEL, STEPS, type StepId, type StepProps } from "../../../../../_release/wizard/steps.ts";
import w from "../../../../../_release/wizard/wizard.module.css";
import { Dialog } from "../_kit/Dialog.tsx";
import type { StageProps } from "../props.ts";
import { editorTitle, editorWidth, SectionEditor } from "./Editor.tsx";
import { Identity } from "./Identity.tsx";
import { LeadBar, LeadList } from "./Lead.tsx";
import { leadOf, SECTION_STEP, type SectionId } from "./model.ts";
import { RightsPage, SleevePage } from "./PagesArt.tsx";
import { ChannelsPage, ExtrasPage, ReviewPage } from "./PagesOut.tsx";
import { DetailsPage, TracksPage, type PageProps } from "./PagesRelease.tsx";
import { SheetRail } from "./SheetRail.tsx";
import d from "./dialog.module.css";
import s from "./sheet.module.css";

const PAGE: Readonly<Record<StepId, (p: PageProps) => ReactNode>> = {
  tracks: TracksPage,
  details: DetailsPage,
  rights: RightsPage,
  sleeve: SleevePage,
  channels: ChannelsPage,
  extras: ExtrasPage,
  review: ReviewPage,
};

interface Walk {
  readonly id: string | null;
  readonly step: StepId;
  readonly track: number;
  readonly began: string | null;
}

type Open = { readonly kind: "lead" } | { readonly kind: "edit"; readonly section: SectionId };

export function SheetStage({ read, session, newId, startStep }: StageProps) {
  const { state, dispatch } = session;
  const reduce = useReducedMotion();
  const release = state.releases.find((r) => r.id === state.openId) ?? null;
  const problems = useMemo(() => (release === null ? [] : releaseProblems(release)), [release]);
  const [walk, setWalk] = useState<Walk>(() => ({ id: release?.id ?? null, step: release === null ? "tracks" : (startStep ?? entryStep(problems, isPageMade(release.id, read.records))), track: 0, began: release?.id ?? null }));
  const [visited, setVisited] = useState<Readonly<Record<string, readonly StepId[]>>>({});
  const [open, setOpenRaw] = useState<Open | null>(null);
  // The dialog keeps what it showed while it leaves: closing hides it, the next open replaces it.
  const [visible, setVisible] = useState(false);
  const setOpen = (o: Open | null) => {
    if (o !== null) setOpenRaw(o);
    setVisible(o !== null);
  };
  const heading = useRef<HTMLHeadingElement | null>(null);
  const moved = useRef(false);

  // The wizard's rule (Wizard.tsx): a release opened from anywhere starts its walk; a page-made release taking the
  // store's id is the same release, its walk and visited steps carried over.
  if ((release?.id ?? null) !== walk.id) {
    const next = release?.id ?? null;
    if (next !== null && isSwap(walk.id, next, state.releases.map((r) => r.id))) {
      const from = walk.id ?? "";
      setWalk((x) => ({ ...x, id: next }));
      setVisited((v) => ({ ...v, [next]: v[from] ?? [] }));
    } else {
      setWalk({ id: next, step: release === null ? "tracks" : entryStep(problems, isPageMade(release.id, read.records)), track: 0, began: next });
      setOpen(null);
    }
  }

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [walk.step, walk.id]);

  if (release === null) {
    // The picker is the wizard's (stop-gap): this variant's design is the open release.
    return (
      <div data-variant-body="sheet" className={w.wizard}>
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
  const go = (next: StepId, nextTrack?: number, focus = true) => {
    moved.current = focus && next !== step;
    setVisited((v) => ({ ...v, [release.id]: [...new Set([...(v[release.id] ?? []), step, next])] }));
    setWalk((x) => ({ ...x, step: next, track: nextTrack ?? x.track }));
  };
  const setTrack = (i: number) => setWalk((x) => ({ ...x, track: i }));
  const props: StepProps = { release, read, problems, dispatch, track, setTrack, go, session };
  const lead = leadOf(problems, session.pending, step, release.tracks.length);
  const review = step === "review";
  const scheduled = release.status === "scheduled" || release.status === "published";
  const ready = releaseReady(problems);
  const prev = STEPS[at - 1];
  const next = STEPS[at + 1];
  const Page = PAGE[step];

  // From the lead's list straight to the form that answers the item: the section's step, its track, its editor.
  const toSection = (section: SectionId, ti: number | null) => {
    const target = SECTION_STEP[section];
    if (target !== step) go(target, ti ?? undefined, false);
    else if (ti !== null) setTrack(ti);
    setOpen({ kind: "edit", section });
  };
  const shown = visible && open !== null && !(open.kind === "lead" && lead.total === 0);

  return (
    <div data-variant-body="sheet" className={w.wizard}>
      <Identity r={release} saving={session.saving} onLeave={() => dispatch({ type: "open", id: null })} />
      {session.notice !== null && (
        <div className={w.notice}>
          <ErrorLine message={session.notice} live />
        </div>
      )}
      <div className={w.flow}>
        <SheetRail problems={problems} pending={session.pending} current={step} seen={seen} onGo={(x) => go(x)} />
        <section className={w.main} aria-labelledby="sheet-step-heading">
          <div className={w.stepHead}>
            <span className={w.stepNo} aria-hidden="true">
              {at + 1}/{STEPS.length}
            </span>
            <h2 id="sheet-step-heading" ref={heading} tabIndex={-1} className={w.stepTitle}>
              {STEP_LABEL[step]}
            </h2>
          </div>
          <p className={w.sr} aria-live="polite">
            {`Step ${at + 1} of ${STEPS.length}, ${STEP_LABEL[step]}`}
          </p>
          <div className={w.body}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${walk.began ?? release.id}:${step}`}
                className={s.page}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
              >
                <LeadBar lead={lead} {...(review ? { clearWord: scheduled ? STATUS_ENTRY[release.status].label : "Ready" } : {})} onOpen={() => setOpen({ kind: "lead" })} />
                <Page props={props} onEdit={(section) => setOpen({ kind: "edit", section })} />
              </motion.div>
            </AnimatePresence>
          </div>
          <footer className={w.foot}>
            {prev !== undefined ? <Button label={`Back · ${STEP_LABEL[prev]}`} onPress={() => go(prev)} /> : <span />}
            {next !== undefined && <Button label={`Next · ${STEP_LABEL[next]}`} glyphAfter="chevR" onPress={() => go(next)} />}
            {review && (
              <Button
                label={scheduled ? "Scheduled" : "Schedule"}
                tone="emerald"
                disabled={!ready || scheduled}
                onPress={() => dispatch({ type: "schedule", id: release.id })}
              />
            )}
          </footer>
        </section>
      </div>
      <Dialog
        open={shown}
        onClose={() => setOpen(null)}
        title={open?.kind === "edit" ? editorTitle(open.section, release, track) : `${STEP_LABEL[step]} · ${lead.total}`}
        className={`${d.panel} ${open?.kind === "edit" && editorWidth(open.section) === "xl" ? d.xl : ""}`}
        width="wide"
        {...(open?.kind === "lead" && lead.suggested.length > 1
          ? { foot: <Button label="Accept all" size="sm" tone="emerald" tally={{ value: lead.suggested.length }} onPress={() => session.accept(lead.suggested.map((p) => p.id))} /> }
          : open?.kind === "edit"
            ? { foot: <Button label="Done" size="sm" onPress={() => setOpen(null)} /> }
            : {})}
      >
        {open?.kind === "edit" ? <SectionEditor section={open.section} props={props} /> : <LeadList lead={lead} release={release} session={session} review={review} onEdit={toSection} />}
      </Dialog>
    </div>
  );
}
