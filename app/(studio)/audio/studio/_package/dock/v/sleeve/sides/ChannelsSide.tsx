"use client";

// Side B2, where it is available: the five channels a release reaches over their own upload APIs, printed like the
// "available on" line on the back of a sleeve - each a tile that is in print (picked) or not, with the server's
// readiness; the server's own sentence about it opens on a card. Then the stores no route from here reaches today.
import { useState } from "react";

import { ChannelBadge, isBadgeChannel } from "@gt/ui/components/channel/ChannelBadge.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES, RELEASE_CHANNELS, type ChannelRow, type ReleaseChannelId } from "@gt/domain/release";

import { CHANNEL_ENTRY } from "../../../../../../_release/wizard/status.ts";
import type { SideProps } from "../liner.ts";
import { PrintedCard } from "../PrintedCard.tsx";
import s from "./side.module.css";

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

export function ChannelsSide({ release: r, read, dispatch, fresh }: SideProps) {
  const [detail, setDetail] = useState<ChannelRow | null>(null);
  const [stores, setStores] = useState(false);
  const direct = read.channels.filter((c) => c.kind === "direct");
  const dsps = read.channels.filter((c) => c.kind === "dsp");
  return (
    <div className={s.side} data-fresh={fresh ? "" : undefined}>
      <section className={s.block} aria-label="direct channels">
        <h3 className={s.blockHead}>
          available on
          <span className={s.headCount}>
            {r.channels.length}/{direct.length}
          </span>
        </h3>
        <ul className={s.channels}>
          {direct.map((c) => {
            const id = c.id;
            if (!isDirect(id)) return null;
            const on = r.channels.includes(id);
            return (
              <li key={id} className={s.channel} data-on={on ? "" : undefined}>
                <button type="button" className={s.channelPick} aria-pressed={on} onClick={() => dispatch({ type: "toggleChannel", id: r.id, channel: id })}>
                  <span className={s.check} aria-hidden="true">
                    {on ? "✓" : ""}
                  </span>
                  <span className={s.channelName}>
                    {isBadgeChannel(id) && <ChannelBadge channel={id} />}
                    {CHANNEL_NAMES[id]}
                  </span>
                </button>
                <span className={s.channelFoot}>
                  <EntryPill entry={CHANNEL_ENTRY[c.state]} />
                  {c.detail !== null && <Chip label="detail" casing="lower" onPress={() => setDetail(c)} name={`${CHANNEL_NAMES[id]} detail`} />}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={s.block} aria-label="stores">
        <h3 className={s.blockHead}>stores</h3>
        <span className={s.chips}>
          {dsps.map((c) => (
            <Chip key={c.id} label={CHANNEL_NAMES[c.id]} casing="lower" ghost />
          ))}
          {dsps.length > 0 && <Chip label="not reachable" value={dsps.length} casing="lower" onPress={() => setStores(true)} name="stores: why not reachable" />}
        </span>
      </section>
      <PrintedCard open={detail !== null} onClose={() => setDetail(null)} title={detail === null ? "" : CHANNEL_NAMES[detail.id]} mark={`B2 · ${detail === null ? "" : CHANNEL_ENTRY[detail.state].label}`}>
        {detail !== null && <p className={s.verbatim}>{detail.detail}</p>}
      </PrintedCard>
      <PrintedCard open={stores} onClose={() => setStores(false)} title="Stores" mark={`B2 · ${dsps.length} stores`}>
        <Facts facts={dsps.map((c) => ({ term: CHANNEL_NAMES[c.id], value: c.detail ?? CHANNEL_ENTRY[c.state].label }))} />
      </PrintedCard>
    </div>
  );
}
