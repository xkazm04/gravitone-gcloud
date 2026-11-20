"use client";

// THE TRACKS AND CHANNELS EDITORS (variant "focus"): one track's own name for itself (title, version, ISRC, explicit)
// with its place in the order; the shelf to add from (the wizard's own Shelf - a STOP-GAP until the shelf is redrawn);
// the direct channels picked or not, each with the server's readiness sentence verbatim.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { ChannelBadge, isBadgeChannel } from "@gt/ui/components/channel/ChannelBadge.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { CHANNEL_NAMES, RELEASE_CHANNELS, type ChannelRow, type ReleaseChannelId } from "@gt/domain/release";

import type { TrackFields } from "../../../../_release/draft.ts";
import { orNull } from "../../../../_release/wizard/fmt.ts";
import { Shelf } from "../../../../_release/wizard/Shelf.tsx";
import { CHANNEL_ENTRY } from "../../../../_release/wizard/status.ts";
import type { StepProps } from "../../../../_release/wizard/steps.ts";
import { EditGroup, EditRow } from "./Edit.tsx";
import { TrackPick } from "./Summary.tsx";
import s from "./focus.module.css";

export function EditTrack({ props, focus }: { readonly props: StepProps; readonly focus: string | null }) {
  const { release: r, dispatch, track: i, setTrack, session } = props;
  const t = r.tracks[i];
  if (t === undefined) return null;
  const n = i + 1;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: i, fields });
  const last = r.tracks.length - 1;
  const order = (
    <span className={s.order}>
      <TrackPick release={r} current={i} onPick={setTrack} />
      {i > 0 && <Button label="Up" size="sm" glyph="up" onPress={() => {
            dispatch({ type: "moveTrack", id: r.id, from: i, to: i - 1 });
            setTrack(i - 1);
          }} />}
      {i < last && <Button label="Down" size="sm" glyph="down" onPress={() => {
            dispatch({ type: "moveTrack", id: r.id, from: i, to: i + 1 });
            setTrack(i + 1);
          }} />}
    </span>
  );
  return (
    <EditGroup label={`Track ${n}`} action={order}>
      <EditRow label="title" path={`track:${n}.title`} session={session} focus={focus === `track:${n}`}>
        <Field label={`track ${n} title`} value={t.title} onChange={(v) => patch({ title: v })} />
      </EditRow>
      <EditRow label="version" path={`track:${n}.version`} session={session}>
        <Field label={`track ${n} version`} value={t.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
      </EditRow>
      <EditRow label="ISRC" path={`track:${n}.isrc`} session={session}>
        <Field label={`track ${n} ISRC`} value={t.isrc ?? ""} placeholder="CC-XXX-YY-NNNNN" maxLength={15} onChange={(v) => patch({ isrc: orNull(v) })} />
      </EditRow>
      <EditRow label="explicit" path={`track:${n}.explicit`} session={session}>
        <Toggle label={t.explicit ? "explicit" : "clean"} on={t.explicit} onToggle={(v) => patch({ explicit: v })} name={`track ${n} explicit`} />
      </EditRow>
      <EditRow label="remove">
        <Button label={`Remove track ${n}`} size="sm" tone="rose" onPress={() => {
            dispatch({ type: "removeTrack", id: r.id, index: i });
            setTrack(Math.max(0, i - 1));
          }} />
      </EditRow>
    </EditGroup>
  );
}

export function EditShelf({ props }: { readonly props: StepProps }) {
  const { release: r, read, dispatch } = props;
  const on = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !on.has(t.takeId));
  return <Shelf takes={rest} label="shelf takes not on this release" mode={{ kind: "add", onAdd: (take) => dispatch({ type: "addTrack", id: r.id, take }) }} />;
}

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

export function EditChannels({ props }: { readonly props: StepProps }) {
  const { release: r, read, dispatch } = props;
  return (
    <div className={s.editCols}>
      <EditGroup label="Direct">
        {read.channels.flatMap((c) => {
          const id = c.id;
          if (c.kind !== "direct" || !isDirect(id)) return [];
          const picked = r.channels.includes(id);
          return [
            <EditRow key={id} label={CHANNEL_NAMES[id]}>
              <span className={s.chanLine}>
                {isBadgeChannel(id) && <ChannelBadge channel={id} />}
                <Toggle label={picked ? "on" : "off"} on={picked} onToggle={() => dispatch({ type: "toggleChannel", id: r.id, channel: id })} name={`release on ${CHANNEL_NAMES[id]}`} />
                <span className={s.chanState}>{CHANNEL_ENTRY[c.state].label}</span>
              </span>
              {c.detail !== null && <span className={s.verbatim}>{c.detail}</span>}
            </EditRow>,
          ];
        })}
      </EditGroup>
      <EditGroup label="Stores">
        {read.channels
          .filter((c) => c.kind === "dsp")
          .map((c) => (
            <EditRow key={c.id} label={CHANNEL_NAMES[c.id]}>
              <span className={s.chanState}>{CHANNEL_ENTRY[c.state].label}</span>
              {c.detail !== null && <span className={s.verbatim}>{c.detail}</span>}
            </EditRow>
          ))}
      </EditGroup>
    </div>
  );
}
