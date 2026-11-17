"use client";

// The Sleeve, Channels and Extras items' editors, in the dialog (prototype dock-package, round 2, variant
// "checklist"). The sleeve's sources, the extras' previews and the splits sheet are the wizard's own step components
// drawn inside the dialog - a STOP-GAP the brief allows (they carry their own rule lines, so the dialog does not repeat
// them); the prompt, a channel and the stores are in this variant's design.
import { ChannelBadge, isBadgeChannel } from "@gt/ui/components/channel/ChannelBadge.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { CHANNEL_NAMES, RELEASE_CHANNELS, type ReleaseChannelId } from "@gt/domain/release";

import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { Splits } from "../../../../../../_release/wizard/Splits.tsx";
import { CHANNEL_ENTRY } from "../../../../../../_release/wizard/status.ts";
import { StepExtras } from "../../../../../../_release/wizard/StepExtras.tsx";
import { StepSleeve } from "../../../../../../_release/wizard/StepSleeve.tsx";
import type { StepProps } from "../../../../../../_release/wizard/steps.ts";
import { setRelease, type EditorProps } from "./types.ts";
import e from "./editors.module.css";

/** The wizard's StepProps from the dialog's props, for the stop-gap step components. */
const stepProps = (p: EditorProps): StepProps => ({ release: p.r, read: p.read, problems: p.problems, dispatch: p.session.dispatch, track: p.track, setTrack: () => undefined, go: p.go, session: p.session });

// STOP-GAP: the wizard's sleeve step (generate / upload / MV look, real takes through sleeveActs) inside the dialog.
export const SleeveEditor = (p: EditorProps) => <StepSleeve {...stepProps(p)} />;
// STOP-GAP: the wizard's extras step (smart link, canvas, promo cards, splits) inside the dialog.
export const PreviewsEditor = (p: EditorProps) => <StepExtras {...stepProps(p)} />;
// STOP-GAP: the wizard's splits sheet inside the dialog.
export const SplitsEditor = (p: EditorProps) => <Splits release={p.r} problems={p.problems} dispatch={p.session.dispatch} />;

export function PromptEditor(p: EditorProps) {
  return <TextArea label="sleeve prompt" value={p.r.sleevePrompt ?? ""} rows={6} onChange={(v) => setRelease(p)({ sleevePrompt: orNull(v) })} />;
}

const isDirect = (id: string): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

export function ChannelEditor({ item, r, read, session }: EditorProps) {
  const row = read.channels.find((c) => c.id === item.ref);
  if (row === undefined || !isDirect(row.id)) return null;
  const id = row.id;
  const on = r.channels.includes(id);
  return (
    <div className={e.stack}>
      <div className={e.channel}>
        <span className={e.chanName}>
          {isBadgeChannel(id) && <ChannelBadge channel={id} />}
          {CHANNEL_NAMES[id]}
        </span>
        <EntryPill entry={CHANNEL_ENTRY[row.state]} />
        <Toggle label={on ? "picked" : "not picked"} on={on} onToggle={() => session.dispatch({ type: "toggleChannel", id: r.id, channel: id })} name={`pick ${CHANNEL_NAMES[id]}`} />
      </div>
      {row.detail !== null && <p className={e.quote}>{row.detail}</p>}
    </div>
  );
}

export function StoresEditor({ read }: EditorProps) {
  return (
    <ul className={e.rows}>
      {read.channels
        .filter((c) => c.kind === "dsp")
        .map((c) => (
          <li key={c.id} className={e.rowLine}>
            <span className={e.rowName}>{CHANNEL_NAMES[c.id]}</span>
            <EntryPill entry={CHANNEL_ENTRY[c.state]} />
            <span className={e.rowNote}>{c.detail ?? ""}</span>
          </li>
        ))}
    </ul>
  );
}
