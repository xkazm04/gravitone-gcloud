"use client";

// STOP-GAP EDITORS (prototype dock-package, "console"): the sleeve's generation flow (real takes through
// _release/sleeveActs.ts, loaded on press) and the extras' previews with the splits sheet are the wizard's own steps,
// REUSED inside the console's dialog as the brief allows. Their look is the wizard's; a consolidation that keeps this
// direction redraws them in the console's material. They read the same session, through the wizard's StepProps.
import { StepExtras } from "../../../../../../_release/wizard/StepExtras.tsx";
import { StepSleeve } from "../../../../../../_release/wizard/StepSleeve.tsx";
import type { StepProps } from "../../../../../../_release/wizard/steps.ts";
import type { EditorProps } from "./props.ts";
import s from "../editor.module.css";

const stepProps = (p: EditorProps): StepProps => ({ release: p.release, read: p.read, problems: p.problems, dispatch: p.dispatch, track: p.track, setTrack: p.setTrack, go: p.go, session: p.session });

export function SleeveEditor(props: EditorProps) {
  return (
    <div className={s.reused} data-field="art">
      <StepSleeve {...stepProps(props)} />
    </div>
  );
}

export function ExtrasEditor(props: EditorProps) {
  return (
    <div className={s.reused} data-field="splits">
      <StepExtras {...stepProps(props)} />
    </div>
  );
}
