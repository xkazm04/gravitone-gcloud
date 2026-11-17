"use client";

// CHANNELS ON THE CARD: the five direct channels as switch tiles - picked or not, the server's readiness as its pill
// and the server's own sentence beneath - and the stores no route reaches folded to one row whose detail opens.
import { motion, useReducedMotion } from "motion/react";

import { ChannelBadge, isBadgeChannel } from "@gt/ui/components/channel/ChannelBadge.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES, RELEASE_CHANNELS, type ChannelRow, type ReleaseChannelId } from "@gt/domain/release";

import { CHANNEL_ENTRY } from "../../../../../../_release/wizard/status.ts";
import type { StepProps } from "../../../../../../_release/wizard/steps.ts";
import { Door } from "../Door.tsx";
import { Figure } from "../Figure.tsx";
import { SETTLE } from "../motion.ts";
import s from "./steps.module.css";

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

export function ChannelsBody({ release: r, read, dispatch }: StepProps) {
  const reduce = useReducedMotion() === true;
  const direct = read.channels.filter((c) => c.kind === "direct");
  const dsps = read.channels.filter((c) => c.kind === "dsp");
  return (
    <div className={s.body}>
      <div className={s.figures}>
        <Figure value={`${r.channels.length}/${direct.length}`} label="picked" tone={r.channels.length === 0 ? "block" : undefined} />
        <Figure value={direct.filter((c) => c.state === "ready" || c.state === "dry").length} label="wired" />
      </div>
      <ul className={s.channels} aria-label="direct channels">
        {direct.map((c) => {
          const id = c.id;
          if (!isDirect(id)) return null;
          const on = r.channels.includes(id);
          return (
            <li key={id}>
              <button type="button" className={s.channel} aria-pressed={on} onClick={() => dispatch({ type: "toggleChannel", id: r.id, channel: id })}>
                <span className={s.channelTop}>
                  <span className={s.channelTick} aria-hidden="true">
                    {on && (
                      <motion.span initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SETTLE}>
                        ✓
                      </motion.span>
                    )}
                  </span>
                  {isBadgeChannel(id) && <ChannelBadge channel={id} />}
                  <span className={s.channelName}>{CHANNEL_NAMES[id]}</span>
                </span>
                <EntryPill entry={CHANNEL_ENTRY[c.state]} />
                {c.detail !== null && <span className={s.channelDetail}>{c.detail}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className={s.stores}>
        <span className={s.k}>stores</span>
        {dsps.map((c) => (
          <Chip key={c.id} label={CHANNEL_NAMES[c.id]} casing="lower" ghost />
        ))}
        <Door name={`stores, ${dsps.length}, detail`} title="Stores" word="detail">
          <ul className={s.rules}>
            {dsps.map((c) => (
              <li key={c.id}>
                <Chip label={CHANNEL_NAMES[c.id]} casing="lower" />
                <EntryPill entry={CHANNEL_ENTRY[c.state]} />
                {c.detail !== null && <span>{c.detail}</span>}
              </li>
            ))}
          </ul>
        </Door>
      </div>
    </div>
  );
}
