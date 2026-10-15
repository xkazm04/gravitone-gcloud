// One Calendar slot (prototype index.html `SlotRow`, floor.css `[data-component=SlotRow]`): the
// hour, the channel's mark, the title, the state in the slot vocabulary (STATUS.slot), and - for
// a failed or missed slot - v1's error, verbatim (CLAUDE.md: real errors explain themselves).
//
// A v1 channel id the badge set does not know is drawn as a neutral mark that SPEAKS the id, so
// an unwired channel is visible rather than silently dressed as one it is not.

import { ChannelBadge, isBadgeChannel } from "../channel/ChannelBadge.tsx";
import channelCss from "../channel/ChannelBadge.module.css";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { StatusPill } from "../status/StatusPill.tsx";
import { clock, isBad, type RailSlot } from "./calendar.ts";
import s from "./SlotRow.module.css";

export function SlotMark({ channel }: { readonly channel: string }) {
  if (isBadgeChannel(channel)) return <ChannelBadge channel={channel} />;
  return (
    <span className={channelCss.chan}>
      <span aria-hidden="true">··</span>
      <SrOnly text={channel} />
    </span>
  );
}

export function SlotRow({ slot, showError = true, href }: { readonly slot: RailSlot; readonly showError?: boolean; readonly href?: string }) {
  const body = (
    <>
      <span className={s.tm}>{clock(Date.parse(slot.publishAt))}</span>
      <SlotMark channel={slot.channel} />
      <span className={s.main}>
        <span className={s.ttl}>{slot.title}</span>
        <span className={s.st}>
          <StatusPill machine="slot" state={slot.status} />
        </span>
        {showError && isBad(slot) && slot.error !== undefined && (
          <span className={s.err}>
            <ErrorLine message={slot.error} />
          </span>
        )}
      </span>
    </>
  );
  const cls = cx(s.row, slot.status === "cancelled" && s.cancelled, href !== undefined && s.door);
  return href === undefined ? (
    <div className={cls} data-component="SlotRow" data-status={slot.status}>
      {body}
    </div>
  ) : (
    <a className={cls} data-component="SlotRow" data-status={slot.status} href={href}>
      {body}
    </a>
  );
}
