"use client";

// DESIGN VARIANT "checklist" of the package stage (prototype dock-package, round 2). THE FRAME IS THE WIZARD'S: the
// identity bar, the step rail at its width, the step's heading, body and Back / Next foot, built from
// `_release/wizard/wizard.module.css`'s own layout classes so the geometry cannot drift from the baseline. What fills
// the body is new: each step is a SHORT LIST of items (./defs.ts) - a name, one preview, one mark - sorted so what
// needs the person comes first; the first such row is the lead, raised with its one action; everything else opens on
// click in the item's dialog (./ItemDialog.tsx). A step with nothing left is a column of quiet done rows, and then
// Next is the one lit control. The walk itself (which step, which steps were visited, the store's id swap, the
// focus move on a step change) is the wizard's, copied.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release } from "@gt/domain/release";
import { releaseProblems } from "@gt/domain/release.problems";

import { pendingIn } from "../../../../../_release/pending.ts";
import { isPageMade, isSwap } from "../../../../../_release/swap.ts";
import { clock, day, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { Picker } from "../../../../../_release/wizard/Picker.tsx";
import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { entryStep, STEP_LABEL, STEPS, stepOf, type StepId } from "../../../../../_release/wizard/steps.ts";
import w from "../../../../../_release/wizard/wizard.module.css";
import type { StageProps } from "../props.ts";
import { itemsOf } from "./defs.ts";
import { ItemDialog } from "./ItemDialog.tsx";
import { ItemList } from "./ItemList.tsx";
import { leadOf, sorted, stepMark, type Item, type Mark } from "./model.ts";
import { Rail } from "./Rail.tsx";

interface Walk {
  readonly id: string | null;
  readonly step: StepId;
  readonly began: string | null;
}

/** The release in one bar: sleeve, title, one meta line, status. */
function Identity({ r, saving, onLeave }: { readonly r: Release; readonly saving: boolean; readonly onLeave: () => void }) {
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  return (
    <header className={w.identity}>
      {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={w.idArt} width={64} aspect={1} /> : <PlateMissing className={w.idArt} aspect={1} />}
      <div className={w.idText}>
        <span className={w.idTitle}>{r.title.trim() === "" ? "untitled" : r.title}</span>
        <span className={w.idMeta}>
          {r.artist} · {KIND_LABEL[releaseKind(r.tracks)]} · {r.tracks.length} {r.tracks.length === 1 ? "track" : "tracks"} · {clock(total)}
          {r.releaseDate === null ? "" : ` · ${day(r.releaseDate)}`}
        </span>
      </div>
      {saving ? <EntryPill entry={{ look: "running", label: "saving" }} /> : <EntryPill entry={STATUS_ENTRY[r.status]} />}
      <Button label="All releases" size="sm" onPress={onLeave} />
    </header>
  );
}

export function ChecklistStage({ read, session, newId, startStep }: StageProps) {
  const { state, dispatch } = session;
  const reduce = useReducedMotion();
  const release = state.releases.find((r) => r.id === state.openId) ?? null;
  const problems = useMemo(() => (release === null ? [] : releaseProblems(release)), [release]);
  const [walk, setWalk] = useState<Walk>(() => ({ id: release?.id ?? null, step: release === null ? "tracks" : (startStep ?? entryStep(problems, isPageMade(release.id, read.records))), began: release?.id ?? null }));
  const [visited, setVisited] = useState<Readonly<Record<string, readonly StepId[]>>>({});
  const [dlg, setDlg] = useState<{ readonly step: StepId; readonly id: string; readonly open: boolean } | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const moved = useRef(false);

  // The wizard's rule: a release opened from anywhere starts its walk; a page-made release taking the store's id is
  // the same release, and its walk carries over (../../../../../_release/swap.ts).
  if ((release?.id ?? null) !== walk.id) {
    const next = release?.id ?? null;
    if (next !== null && isSwap(walk.id, next, state.releases.map((r) => r.id))) {
      const from = walk.id ?? "";
      setWalk((x) => ({ ...x, id: next }));
      setVisited((v) => ({ ...v, [next]: v[from] ?? [] }));
    } else setWalk({ id: next, step: release === null ? "tracks" : entryStep(problems, isPageMade(release.id, read.records)), began: next });
  }

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [walk.step, walk.id]);

  if (release === null) {
    return (
      <div data-variant-body="checklist" className={w.wizard}>
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
  const seen = new Set<StepId>([...(visited[release.id] ?? []), step]);
  const go = (next: StepId) => {
    moved.current = next !== step;
    setDlg((x) => (x === null ? null : { ...x, open: false }));
    setVisited((v) => ({ ...v, [release.id]: [...new Set([...(v[release.id] ?? []), step, next])] }));
    setWalk((x) => ({ ...x, step: next }));
  };
  const all = Object.fromEntries(STEPS.map((x) => [x, itemsOf(x, release, read, problems, session.pending)])) as Record<StepId, Item[]>;
  const marks = Object.fromEntries(STEPS.map((x) => [x, stepMark(all[x], seen.has(x))])) as Record<StepId, Mark>;
  const items = all[step];
  const lead = leadOf(sorted(items));
  const suggested = pendingIn(session.pending, step);
  const prev = STEPS[at - 1];
  const next = STEPS[at + 1];
  const shownItem = dlg === null ? null : (all[dlg.step].find((x) => x.id === dlg.id) ?? null);

  const act = (it: Item) => {
    const first = it.problems[0];
    if (it.act === "accept") session.accept(it.pending.map((p) => p.id));
    else if (it.act === "schedule") dispatch({ type: "schedule", id: release.id });
    else if (it.act === "pick" && it.ref !== null) dispatch({ type: "toggleChannel", id: release.id, channel: it.ref as Release["channels"][number] });
    else if (it.act === "go" && first !== undefined) go(stepOf(first));
    else setDlg({ step, id: it.id, open: true });
  };

  return (
    <div data-variant-body="checklist" className={w.wizard}>
      <Identity r={release} saving={session.saving} onLeave={() => dispatch({ type: "open", id: null })} />
      {session.notice !== null && (
        <div className={w.notice}>
          <ErrorLine message={session.notice} live />
        </div>
      )}
      <div className={w.flow}>
        <Rail marks={marks} current={step} onGo={go} />
        <section className={w.main} aria-labelledby="checklist-step-heading">
          <div className={w.stepHead}>
            <span className={w.stepNo} aria-hidden="true">
              {at + 1}/{STEPS.length}
            </span>
            <h2 id="checklist-step-heading" ref={heading} tabIndex={-1} className={w.stepTitle}>
              {STEP_LABEL[step]}
            </h2>
            {step !== "review" && suggested.length > 1 && (
              <span className={w.acceptAll}>
                <Button label="Accept all" size="sm" tally={{ value: suggested.length }} onPress={() => session.accept(suggested.map((p) => p.id))} />
              </span>
            )}
          </div>
          <p className={w.sr} aria-live="polite">
            {`Step ${at + 1} of ${STEPS.length}, ${STEP_LABEL[step]}`}
          </p>
          <div className={w.body}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${walk.began ?? release.id}:${step}`}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.1 } }}
                transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {items.length === 0 ? <Empty label="No tracks on this release" /> : <ItemList items={items} label={`${STEP_LABEL[step]} items`} onOpen={(it) => setDlg({ step, id: it.id, open: true })} onAct={act} />}
              </motion.div>
            </AnimatePresence>
          </div>
          <footer className={w.foot}>
            {prev !== undefined ? <Button label={`Back · ${STEP_LABEL[prev]}`} onPress={() => go(prev)} /> : <span />}
            {next !== undefined && <Button label={`Next · ${STEP_LABEL[next]}`} {...(lead === null ? { tone: "cyan" as const } : {})} glyphAfter="chevR" onPress={() => go(next)} />}
          </footer>
        </section>
      </div>
      <ItemDialog
        open={dlg?.open === true}
        item={shownItem}
        ctx={{ r: release, read, problems, session, go: (s) => go(s) }}
        onClose={() => setDlg((x) => (x === null ? null : { ...x, open: false }))}
      />
    </div>
  );
}
