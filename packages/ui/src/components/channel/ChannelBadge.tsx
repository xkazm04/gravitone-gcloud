// A publish channel's mark (tokens.css `.chan`): two letters, in the channel's colour, with
// the channel's name spoken. The slot machine's channels are the domain's (`@gt/domain/slot`);
// `blog` is the prototype's fourth mark (amber "PR"): a landed article is published as a pull
// request to ai-registry, not through a slot, but the Floor's calendar and the Library draw it
// beside the video channels, so it has a badge without being a channel the slot machine owns.
import type { Channel } from "@gt/domain/slot";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import s from "./ChannelBadge.module.css";

export type BadgeChannel = Channel | "blog";

const MARK: { readonly [C in BadgeChannel]: string } = { youtube: "YT", tiktok: "TT", instagram: "IG", blog: "PR" };

/** The marks in drawing order; a v1 channel id that is not one of them has no badge. */
export const BADGE_CHANNELS: readonly BadgeChannel[] = ["youtube", "tiktok", "instagram", "blog"];

export function isBadgeChannel(id: string): id is BadgeChannel {
  return (BADGE_CHANNELS as readonly string[]).includes(id);
}

export function ChannelBadge({ channel }: { readonly channel: BadgeChannel }) {
  return (
    <span className={cx(s.chan, s[channel])}>
      <span aria-hidden="true">{MARK[channel]}</span>
      <SrOnly text={channel} />
    </span>
  );
}
