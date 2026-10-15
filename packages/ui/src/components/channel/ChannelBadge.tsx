// A publish channel's mark (tokens.css `.chan`): two letters, in the channel's colour, with
// the channel's name spoken. Channels are the domain's (`@gt/domain/slot`); the prototype's
// `blog` (amber "PR") is not a channel the slot machine publishes to, so it has no badge.
import type { Channel } from "@gt/domain/slot";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import s from "./ChannelBadge.module.css";

const MARK: { readonly [C in Channel]: string } = { youtube: "YT", tiktok: "TT", instagram: "IG" };

export function ChannelBadge({ channel }: { readonly channel: Channel }) {
  return (
    <span className={cx(s.chan, s[channel])}>
      <span aria-hidden="true">{MARK[channel]}</span>
      <SrOnly text={channel} />
    </span>
  );
}
