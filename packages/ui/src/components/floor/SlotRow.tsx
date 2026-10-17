// One Calendar slot (prototype index.html `SlotRow`, floor.css `[data-component=SlotRow]`): the
// hour, the channel's mark, the title, the state in the slot vocabulary (STATUS.slot), and - for
// a failed or missed slot - the channel's error, verbatim (CLAUDE.md: real errors explain
// themselves). A cancelled slot that had failed keeps its error, drawn dim (prototype
// `.merr.dim`): cancelling does not rewrite why it never went out. A missed slot says when its
// window closed and a drifted one why it will not fire, each from its own field.
//
// A v1 channel id the badge set does not know is drawn as a neutral mark that SPEAKS the id, so
// an unwired channel is visible rather than silently dressed as one it is not.
//
// The row is a door to the slot's own record when it has an `href`; with `onOpen` too, a plain
// click opens it in place (the Floor's level sheet) and a modified click keeps the browser's
// own meaning (a new tab gets the same record as a page).

import type { MouseEvent } from "react";

import { ChannelBadge, isBadgeChannel } from "../channel/ChannelBadge.tsx";
import channelCss from "../channel/ChannelBadge.module.css";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { StatusPill } from "../status/StatusPill.tsx";
import { clock, isBad, type RailSlot } from "./calendar.ts";
import { DRIFT_WORDS, missedWords } from "./slot.ts";
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

/** A plain primary click; anything modified is the browser's. */
export const plainClick = (e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export type SlotRowProps = {
  readonly slot: RailSlot;
  readonly showError?: boolean;
  readonly href?: string;
  readonly onOpen?: (id: string) => void;
};

export function SlotRow({ slot, showError = true, href, onOpen }: SlotRowProps) {
  const missed = missedWords(slot);
  const body = (
    <>
      <span className={s.tm}>{clock(Date.parse(slot.publishAt))}</span>
      <SlotMark channel={slot.channel} />
      <span className={s.main}>
        <span className={s.ttl}>{slot.title}</span>
        <span className={s.st}>
          <StatusPill machine="slot" state={slot.status} />
          {slot.drift !== undefined && <Chip label={DRIFT_WORDS[slot.drift]} tone="amber" casing="lower" />}
          {missed !== null && <Chip label={missed} casing="lower" />}
        </span>
        {showError && isBad(slot) && slot.error !== undefined && (
          <span className={s.err}>
            <ErrorLine message={slot.error} />
          </span>
        )}
        {showError && slot.status === "cancelled" && slot.error !== undefined && (
          <span className={cx(s.err, s.dim)}>
            <ErrorLine message={slot.error} />
          </span>
        )}
      </span>
    </>
  );
  const cls = cx(s.row, slot.status === "cancelled" && s.cancelled, href !== undefined && s.door);
  return href === undefined ? (
    <div className={cls} data-component="SlotRow" data-status={slot.status} data-slot={slot.id} data-at={slot.publishAt}>
      {body}
    </div>
  ) : (
    <a
      className={cls}
      data-component="SlotRow"
      data-status={slot.status}
      data-slot={slot.id}
      data-at={slot.publishAt}
      href={href}
      onClick={(e) => {
        if (onOpen === undefined || !plainClick(e)) return;
        e.preventDefault();
        onOpen(slot.id);
      }}
    >
      {body}
    </a>
  );
}
