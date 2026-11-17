"use client";

// THE RELEASE PIECE IN A THREAD CARD (spark studio-to-release): the agent's pre-flight review of a release, posted
// as a `release` node. Its counts are the agent's reading of `release_read` at that moment - blocks and warnings
// from the release's live problems, pending = proposals nobody has decided - so the card shows them as counts and
// opens the release's package stage, where the live record is. Nothing here accepts, keeps or schedules: the
// operator does that on the release's own steps. No sound (nodeSound has no case for it).
import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import type { Placed } from "@gt/ui/components/studio-desk/desk.ts";

import { STATUS_ENTRY } from "../../_release/wizard/status.ts";
import { studioHref } from "../url.ts";
import type { CardCtx } from "./ctx.ts";
import r from "./release.module.css";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Where the card opens: the same conversation, its package stage, this release. */
export const releaseHref = (node: Pick<StudioNodeOf<"release">, "releaseId">, session: { readonly id: string; readonly source: "live" | "fixture" }): string =>
  studioHref({ session: session.id, offline: false, source: session.source, stage: "package", release: node.releaseId });

export function ReleaseCard({ placed, ctx }: { readonly placed: Placed<"release">; readonly ctx: CardCtx }) {
  const n = placed.node;
  return (
    <section className={r.release} aria-label={`release ${n.title}, pre-flight review`}>
      <div className={r.head}>
        <Chip label={n.releaseKind} tone="violet" casing="lower" />
        <span className={r.title}>{n.title}</span>
        <EntryPill entry={STATUS_ENTRY[n.status]} />
      </div>
      <div className={r.counts}>
        <Chip label="blocks" value={n.blocks} tone={n.blocks > 0 ? "rose" : "emerald"} casing="lower" name={plural(n.blocks, "block", "blocks")} />
        <Chip label="warnings" value={n.warns} tone={n.warns > 0 ? "amber" : "neutral"} casing="lower" name={plural(n.warns, "warning", "warnings")} />
        <Chip label="pending" value={n.pending} tone={n.pending > 0 ? "violet" : "neutral"} casing="lower" name={plural(n.pending, "pending proposal", "pending proposals")} />
        <span className={r.grow} />
        <Button label="Open the release" size="sm" href={releaseHref(n, ctx.v.session)} />
      </div>
    </section>
  );
}
