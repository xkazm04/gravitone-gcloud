"use client";

// THE CHANNELS EDITOR (prototype dock-package, "console"): the direct channels as arm keys - a lamp lit when armed,
// the channel, the server's state and its sentence verbatim - then the stores, which ingest only from a licensed
// distributor and no route from here reaches today (each with its server sentence).
import { ChannelBadge, isBadgeChannel } from "@gt/ui/components/channel/ChannelBadge.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES, RELEASE_CHANNELS, type ChannelRow, type ReleaseChannelId } from "@gt/domain/release";

import { CHANNEL_ENTRY } from "../../../../../../_release/wizard/status.ts";
import { problemsOf } from "../../../../../../_release/wizard/steps.ts";
import { Lamp } from "../Instruments.tsx";
import { Rules } from "../Rules.tsx";
import { CHANNEL_MARK } from "../strips.ts";
import { Module } from "./Cell.tsx";
import type { EditorProps } from "./props.ts";
import s from "../editor.module.css";

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

export function ChannelsEditor({ release: r, read, problems, dispatch, reduce }: EditorProps) {
  const direct = read.channels.filter((c) => c.kind === "direct");
  const stores = read.channels.filter((c) => c.kind === "dsp");
  return (
    <div className={s.stack}>
      <Rules problems={problemsOf(problems, "channels")} label="channel rules" reduce={reduce} />
      <Module label="direct" count={`${r.channels.length}/${direct.length} armed`} field="direct">
        <ul className={s.arms}>
          {direct.map((c) => {
            const id = c.id;
            if (!isDirect(id)) return null;
            const on = r.channels.includes(id);
            return (
              <li key={id}>
                <button type="button" className={s.arm} aria-pressed={on} onClick={() => dispatch({ type: "toggleChannel", id: r.id, channel: id })}>
                  <Lamp tone="emerald" on={on} label={CHANNEL_MARK[id]} />
                  <span className={s.armName}>
                    {isBadgeChannel(id) && <ChannelBadge channel={id} />}
                    {CHANNEL_NAMES[id]}
                  </span>
                  <EntryPill entry={CHANNEL_ENTRY[c.state]} />
                  <span className={s.armDetail}>{c.detail ?? ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Module>
      <Module label="stores" count={String(stores.length)} field="stores">
        <ul className={s.arms}>
          {stores.map((c) => (
            <li key={c.id} className={s.arm} data-off="">
              <Lamp tone="emerald" on={false} />
              <span className={s.armName}>{CHANNEL_NAMES[c.id]}</span>
              <EntryPill entry={CHANNEL_ENTRY[c.state]} />
              <span className={s.armDetail}>{c.detail ?? ""}</span>
            </li>
          ))}
        </ul>
      </Module>
    </div>
  );
}
