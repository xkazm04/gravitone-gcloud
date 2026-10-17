"use client";

// A FINISHED (OR FAILED) MUSIC VIDEO'S ACTS, in the inspector of its kernel job (Phase 6, owner
// ruling 2): Regenerate one part - image, motion or the YouTube text - through its receipt (the
// flow every launch takes, ../../_plan/receipt.tsx), and Send to Calendar - a slot on a video
// channel at a UTC hour, answered with the slot's own link. v1 had both on the Foundry's Pipeline
// canvas only (regenerateMv, sendMvToCalendar); the acts are lib/producers/mvActs.ts.
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { fromUtcInput, nextFullHour, toUtcInput } from "@gt/ui/components/floor/slot.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import { outcomeOf, type ReceiptSpec } from "../../_plan/receipt.tsx";
import type { mvRegenerate, mvRegenerateReceipt, mvSchedule } from "./mvActs.ts";
import s from "./Runs.module.css";

/** The acts' Server Actions (./mvActs.ts), handed down by the page as the Dojo's are. */
export type MvPort = { readonly receipt: typeof mvRegenerateReceipt; readonly regenerate: typeof mvRegenerate; readonly schedule: typeof mvSchedule };

export type MvPart = "image" | "motion" | "metadata";
export type MvChannel = "youtube" | "tiktok" | "instagram";
const PARTS: readonly MvPart[] = ["image", "motion", "metadata"];
const CHANNELS: readonly MvChannel[] = ["youtube", "tiktok", "instagram"];

/** The mv record a kernel job serves (lib/producers/mv.ts mvKernelId: `job:run:mv.<id>.<stamp>`). */
export function mvTrackOf(jobId: string): string | null {
  return /^job:run:mv\.([A-Za-z0-9][A-Za-z0-9_-]*)\.\d+$/.exec(jobId)?.[1] ?? null;
}

/** A Regenerate's receipt spec. The stamp the read priced rides back with its token: a stale
 *  confirm answers a fresh receipt AND its stamp, and the next ⏎ confirms that one. */
export function mvRegenerateSpec(port: MvPort, track: string, part: MvPart, done: ReceiptSpec["done"], failed: ReceiptSpec["failed"]): ReceiptSpec {
  let at = 0;
  return {
    trail: [{ label: "Runs", href: "/projects/runs" }],
    here: `${track} · regenerate ${part}`,
    armable: true,
    read: async (mode) => {
      const r = await port.receipt({ track, part, mode });
      if (!r.ok) return r;
      at = r.value.at;
      return { ok: true, value: r.value.receipt };
    },
    confirm: async (token, ceilingUsd, mode) =>
      outcomeOf(await port.regenerate({ track, part, mode, token, at, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }), (v) => {
        if (v.kind === "stale") {
          at = v.at;
          return { kind: "stale", fresh: v.fresh };
        }
        return { kind: "done", note: v.note, ledger: { href: `/ledger?q=${encodeURIComponent(v.jobId)}`, subject: v.jobId } };
      }),
    done,
    failed,
  };
}

export type MvActsProps = {
  readonly track: string;
  readonly finished: boolean;
  readonly nowMs: number;
  readonly busy: boolean;
  readonly onRegenerate: (part: MvPart) => void;
  readonly onSchedule: (channel: MvChannel, publishAt: string) => void;
};

export function MvActs({ track, finished, nowMs, busy, onRegenerate, onSchedule }: MvActsProps) {
  const [part, setPart] = useState<MvPart>("image");
  const [channel, setChannel] = useState<MvChannel>("youtube");
  const [when, setWhen] = useState(() => toUtcInput(nextFullHour(nowMs)));
  const at = fromUtcInput(when);
  return (
    <section className={s.sect} data-component="MvActs" aria-label={`music video ${track}`}>
      <CapsHeading text="music video" />
      <div className={s.acts}>
        <Seg label="part to regenerate" options={PARTS.map((p) => ({ value: p, label: p }))} value={part} onChange={setPart} />
        <Button size="sm" tone="amber" label="regenerate" onPress={() => onRegenerate(part)} disabled={busy} />
      </div>
      {finished && (
        <div className={s.acts}>
          <Seg label="channel" options={CHANNELS.map((c) => ({ value: c, label: c }))} value={channel} onChange={setChannel} />
          <label className={s.ceil}>
            <input className={cx(s.ceilIn, s.mvWhen)} type="datetime-local" aria-label="publish at, UTC" aria-invalid={at === null ? true : undefined} value={when} onChange={(e) => setWhen(e.currentTarget.value)} />
            <span>UTC</span>
          </label>
          <Button size="sm" tone="cyan" label="send to calendar" onPress={() => (at === null ? undefined : onSchedule(channel, at))} disabled={busy || at === null} />
        </div>
      )}
    </section>
  );
}
