// A publish channel's mark (tokens.css `.chan`): two letters, in the channel's colour, with
// the channel's name spoken. The channels are the domain's (`@gt/domain/slot`). `blog` is the
// prototype's fourth mark (amber "PR"): since Phase 6 (owner ruling 2026-10-17) it is a slot
// channel like the others, whose slot "publishes" as the article approve's pull request to
// ai-registry rather than an upload.
import type { Channel } from "@gt/domain/slot";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import s from "./ChannelBadge.module.css";

export type BadgeChannel = Channel;

const MARK: { readonly [C in BadgeChannel]: string } = { youtube: "YT", tiktok: "TT", instagram: "IG", blog: "PR" };

/**
 * The marks in drawing order; a v1 channel id that is not one of them has no badge. A copy of
 * @gt/domain/slot `CHANNELS` by necessity: slot.ts loads zod, and this is client code
 * (tests/next-gates/client-closure). signal.test.ts pins the two equal, so a channel added there
 * fails a test here rather than drawing behind the neutral mark.
 */
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
