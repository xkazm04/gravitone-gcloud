"use client";

// THE REST OF THE EDITORS (variant "sheet"): the channels, in this variant's design - one toggle per direct channel
// with the server's readiness and its sentence verbatim, then the stores no route reaches - and the four STOP-GAPS
// that reuse the wizard's own step components inside the dialog until they are redesigned: the sleeve's sources and
// takes (StepSleeve, real takes through sleeveActs), the shelf (Shelf), the splits sheet (Splits) and the previews
// around the release (StepExtras).
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { CHANNEL_NAMES, RELEASE_CHANNELS, type ChannelRow, type ReleaseChannelId } from "@gt/domain/release";

import { CHANNEL_ENTRY } from "../../../../../_release/wizard/status.ts";
import { Shelf } from "../../../../../_release/wizard/Shelf.tsx";
import { Splits } from "../../../../../_release/wizard/Splits.tsx";
import { StepExtras } from "../../../../../_release/wizard/StepExtras.tsx";
import { StepSleeve } from "../../../../../_release/wizard/StepSleeve.tsx";
import type { StepProps } from "../../../../../_release/wizard/steps.ts";
import s from "./dialog.module.css";

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

export function EditChannels({ release: r, read, dispatch }: StepProps) {
  const direct = read.channels.filter((c) => c.kind === "direct");
  const dsps = read.channels.filter((c) => c.kind === "dsp");
  return (
    <div className={s.editor}>
      <section className={s.block} aria-label="direct channels">
        <h3 className={s.blockHead}>Direct</h3>
        <ul className={s.rowList}>
          {direct.map((c) => {
            const id = c.id;
            if (!isDirect(id)) return null;
            return (
              <li key={id} className={s.chan}>
                <Toggle label={CHANNEL_NAMES[id]} on={r.channels.includes(id)} onToggle={() => dispatch({ type: "toggleChannel", id: r.id, channel: id })} name={`publish to ${CHANNEL_NAMES[id]}`} />
                <span className={s.chanState}>{CHANNEL_ENTRY[c.state].label}</span>
                {c.detail !== null && <span className={s.chanDetail}>{c.detail}</span>}
              </li>
            );
          })}
        </ul>
      </section>
      <section className={s.block} aria-label="stores">
        <h3 className={s.blockHead}>Stores</h3>
        <ul className={s.rowList}>
          {dsps.map((c) => (
            <li key={c.id} className={s.chan}>
              <span className={s.itemV}>{CHANNEL_NAMES[c.id]}</span>
              <span className={s.chanState}>{CHANNEL_ENTRY[c.state].label}</span>
              {c.detail !== null && <span className={s.chanDetail}>{c.detail}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** STOP-GAP (round 2): the wizard's sleeve step, whole, in the dialog. */
export function EditSleeve(props: StepProps) {
  return <StepSleeve {...props} />;
}

/** STOP-GAP (round 2): the wizard's shelf, in its add mode. */
export function EditShelf({ release: r, read, dispatch }: StepProps) {
  const onRelease = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !onRelease.has(t.takeId));
  if (rest.length === 0) return <Empty label={read.shelf.length === 0 ? "No kept takes on the shelf" : "Every kept take is on this release"} />;
  return <Shelf takes={rest} label="shelf takes not on this release" mode={{ kind: "add", onAdd: (take) => dispatch({ type: "addTrack", id: r.id, take }) }} />;
}

/** STOP-GAP (round 2): the wizard's splits sheet. */
export function EditSplits({ release, problems, dispatch }: StepProps) {
  return <Splits release={release} problems={problems} dispatch={dispatch} />;
}

/** STOP-GAP (round 2): the wizard's extras step (previews and, below them, the same splits sheet). */
export function ViewPreviews(props: StepProps) {
  return <StepExtras {...props} />;
}
