"use client";

// WHAT OPENS ON A PRESS (variant "focus"): the one dialog the step has open - its details, its editor, or one of the
// long reads behind a row (the shelf, the calendar slots, the previews, the splits). The sleeve's generation flow, the
// previews and the splits sheet are the wizard's own components inside the dialog: a STOP-GAP, their design is not
// this variant's yet.
import { useState, type ReactNode } from "react";

import { CHANNEL_NAMES } from "@gt/domain/release";

import { plannedSlots } from "../../../../_release/draft.ts";
import { day } from "../../../../_release/wizard/fmt.ts";
import { Splits } from "../../../../_release/wizard/Splits.tsx";
import { CHANNEL_ENTRY } from "../../../../_release/wizard/status.ts";
import { StepExtras } from "../../../../_release/wizard/StepExtras.tsx";
import { StepSleeve } from "../../../../_release/wizard/StepSleeve.tsx";
import { STEP_LABEL, type StepId, type StepProps } from "../../../../_release/wizard/steps.ts";
import { Dialog } from "../_kit/Dialog.tsx";
import { EditDetails } from "./EditDetails.tsx";
import { EditGroup, EditRow } from "./Edit.tsx";
import { EditRights } from "./EditRights.tsx";
import { EditChannels, EditShelf, EditTrack } from "./EditTracks.tsx";
import type { Sheet } from "./rows.ts";
import s from "./focus.module.css";

function Slots({ props }: { readonly props: StepProps }) {
  const slots = plannedSlots(props.release, props.read.channels);
  return (
    <EditGroup label="Calendar slots">
      {slots.map((x) => (
        <EditRow key={x.channel} label={CHANNEL_NAMES[x.channel]}>
          <span className={s.chanState}>
            {x.at === null ? "when processed" : day(x.at)} · {CHANNEL_ENTRY[x.state].label}
          </span>
          {x.detail !== null && <span className={s.verbatim}>{x.detail}</span>}
        </EditRow>
      ))}
      {slots.length === 0 && <EditRow label="channels">—</EditRow>}
    </EditGroup>
  );
}

function editorOf(step: StepId, props: StepProps, focus: string | null): { readonly title: string; readonly body: ReactNode } | null {
  switch (step) {
    case "tracks":
      return { title: `Track ${props.track + 1}`, body: <EditTrack props={props} focus={focus} /> };
    case "details":
      return { title: STEP_LABEL.details, body: <EditDetails props={props} focus={focus} /> };
    case "rights":
      return { title: STEP_LABEL.rights, body: <EditRights props={props} focus={focus} /> };
    case "sleeve":
      return { title: STEP_LABEL.sleeve, body: <StepSleeve {...props} /> };
    case "channels":
      return { title: STEP_LABEL.channels, body: <EditChannels props={props} /> };
    case "extras":
      return { title: "Splits", body: <Splits release={props.release} problems={props.problems} dispatch={props.dispatch} /> };
    case "review":
      return null;
  }
}

/** The editor, shelf, slots, previews or splits dialog; `details` is ./Details.tsx's own. */
export function Sheets({ sheet: asked, step, props, focus, onClose }: { readonly sheet: Sheet | null; readonly step: StepId; readonly props: StepProps; readonly focus: string | null; readonly onClose: () => void }) {
  // The last sheet stays drawn while the dialog leaves, so its exit does not collapse to an empty panel.
  const [kept, setKept] = useState<Sheet | null>(asked);
  if (asked !== null && asked !== kept) setKept(asked);
  const sheet = asked ?? kept;
  const view: { readonly title: string; readonly body: ReactNode } | null =
    sheet === "edit"
      ? editorOf(step, props, focus)
      : sheet === "shelf"
        ? { title: "Shelf", body: <EditShelf props={props} /> }
        : sheet === "slots"
          ? { title: "Calendar slots", body: <Slots props={props} /> }
          : sheet === "previews"
            ? { title: "Around the release", body: <StepExtras {...props} /> }
            : sheet === "splits"
              ? { title: "Splits", body: <Splits release={props.release} problems={props.problems} dispatch={props.dispatch} /> }
              : null;
  return (
    <Dialog open={asked !== null && asked !== "details" && view !== null} onClose={onClose} title={view?.title ?? ""} className={s.dialog} width="wide">
      {view?.body}
    </Dialog>
  );
}
