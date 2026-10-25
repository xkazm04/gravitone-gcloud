"use client";

// ONE SLOT, OPENED (prototype index.html `SlotDetail`, the Floor's `slot` level; v1
// app/calendar/SlotSheet.tsx absorbed). Left: what goes out - the export's player (its poster
// from the Library's media facts, computed at ingest: v1 grabbed a frame in the browser), or
// for a blog slot the post's pull request; the description verbatim; the tags. Right: the
// channel, the state and which side answered; the title; the doors to the ledger and the
// project's runs; the hour, the slot id and the publication; the channel's error verbatim on
// the publish chain it broke (scheduled → auth → upload → live); the latest metrics; the
// project. Then the three verbs.
//
// The verbs are the caller's acts (the Floor's calendar port); this holds only the operator's
// in-progress choice: the move field, opened at the hour ./slot.ts moveDefault picks, and which
// irreversible verb is waiting on its confirm (./SlotConfirm.tsx). A move is not confirmed - a
// moved slot moves back. While a verb is in flight every verb is disarmed (`busy`), so a second
// press cannot send a second act (async-ui-states action-busy-states).
//
// media-playback (media-resource-lifecycle): the player is a plain element over an address the
// server named, never a minted object URL, and it is unmounted with the sheet - so nothing here
// outlives the level, and `preload="metadata"` fetches no frames until asked.

import { useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { Field } from "../field/Field.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { LedgerLink } from "../ledgerlink/LedgerLink.tsx";
import { PipRow } from "../piprow/PipRow.tsx";
import type { Look } from "../status/status.ts";
import { StatusPill } from "../status/StatusPill.tsx";
import { Tally } from "../tally/Tally.tsx";
import { UpstreamBreak } from "../upstream/UpstreamBreak.tsx";
import { isBad, whenUtc as when, type RailSlot } from "./calendar.ts";
import { PUBLISH_CHAIN, breakOf, canCancel, canMove, canPublishNow, duration, figure, fromUtcInput, missedWords, moveDefault, moveProblem, signed, DRIFT_WORDS } from "./slot.ts";
import { SlotConfirm } from "./SlotConfirm.tsx";
import { SlotMark } from "./SlotRow.tsx";
import s from "./SlotDetail.module.css";

/** A measured count: null never measured; `floor` when some of what it sums was not. */
export type Figure = { readonly value: number | null; readonly floor?: true };

export type SlotMetrics = {
  readonly at: string;
  readonly views: Figure;
  readonly likes: Figure;
  readonly comments: Figure;
  readonly shares: Figure;
  readonly avgViewDurationS: number | null;
  readonly subsDelta: number | null;
};

export type SlotView = {
  readonly slot: RailSlot;
  /** The record's revision as read: a verb carries it back, and a slot that moved since is
   *  refused rather than overwritten (the store's 409 shape). */
  readonly rev?: number;
  readonly libraryItemId: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly publicationId?: string;
  /** The publication was a dry run: a plan was written, nothing was uploaded. */
  readonly dry?: true;
  readonly media: { readonly kind: "video"; readonly src: string; readonly poster?: string } | { readonly kind: "post"; readonly pr?: string } | { readonly kind: "none" };
  readonly metrics?: SlotMetrics;
  readonly project?: { readonly title: string; readonly href: string; readonly runs: string; readonly steps: readonly Look[] };
  readonly ledger: string;
  readonly source: "fixture" | "real";
  /** How a publish-now would go out on this side. */
  readonly mode: "dry" | "live";
};

export type SlotVerb = "move" | "cancel" | "publish-now";

export type SlotDetailProps = {
  readonly view: SlotView;
  readonly nowMs: number;
  /** The verb in flight, if any: every verb is disarmed until it answers. */
  readonly busy: SlotVerb | null;
  /** The last refusal, verbatim. */
  readonly error?: string;
  /** Which verb the keys asked for (the sheet's M / X / P): opens its field or confirm. */
  readonly asked?: { readonly verb: SlotVerb; readonly n: number };
  readonly onMove: (at: string) => void;
  readonly onCancel: () => void;
  readonly onPublishNow: () => void;
  readonly specimen?: boolean;
};

function Media({ view }: { readonly view: SlotView }) {
  const m = view.media;
  if (m.kind === "video")
    return (
      <div className={s.player}>
        <video className={s.video} src={m.src} {...(m.poster === undefined ? {} : { poster: m.poster })} controls preload="metadata" playsInline aria-label={view.slot.title} />
      </div>
    );
  return (
    <div className={s.ghost} data-component="SlotGhost">
      {m.kind === "post" ? (
        <>
          <span>post · ai-registry PR</span>
          {m.pr !== undefined && <Chip label={m.pr.replace(/^https?:\/\/(www\.)?/, "")} href={m.pr} casing="lower" tone="amber" />}
        </>
      ) : (
        <span>no export</span>
      )}
    </div>
  );
}

function Metrics({ m }: { readonly m: SlotMetrics }) {
  return (
    <section className={s.section}>
      <CapsHeading text={`metrics · ${m.at.slice(0, 10)}`} variant="section" level={4} />
      <div className={s.kv}>
        <Tally value={figure(m.views.value, m.views.floor)} label="views" />
        <Tally value={figure(m.likes.value, m.likes.floor)} label="likes" />
        <Tally value={figure(m.comments.value, m.comments.floor)} label="comments" />
        <Tally value={figure(m.shares.value, m.shares.floor)} label="shares" />
        <Tally value={duration(m.avgViewDurationS)} label="avg view" />
        <Tally value={signed(m.subsDelta)} label="subs" />
      </div>
    </section>
  );
}

export function SlotDetail({ view, nowMs, busy, error, asked, onMove, onCancel, onPublishNow, specimen = false }: SlotDetailProps) {
  const { slot } = view;
  const [field, setField] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "publish-now" | null>(null);
  // The keys' ask, taken once per press: a render with the same ask does not reopen what the
  // operator just closed (adjusting state from a prop, React's documented pattern).
  const [seen, setSeen] = useState(asked?.n ?? 0);
  // A verb that landed changed the slot: its field and its confirm are spent.
  const stamp = `${slot.status}|${slot.publishAt}`;
  const [was, setWas] = useState(stamp);
  if (was !== stamp) {
    setWas(stamp);
    setField(null);
    setConfirm(null);
  }
  if (asked !== undefined && asked.n !== seen) {
    setSeen(asked.n);
    if (asked.verb === "move" && canMove(slot)) setField(moveDefault(slot, nowMs));
    if (asked.verb === "cancel" && canCancel(slot)) setConfirm("cancel");
    if (asked.verb === "publish-now" && canPublishNow(slot)) setConfirm("publish-now");
  }
  const at = field === null ? null : fromUtcInput(field);
  const problem = field === null ? null : moveProblem(slot, at, nowMs);
  const missed = missedWords(slot);
  const object = `${slot.title} · ${slot.channel} · ${when(slot.publishAt)}`;
  const idle = busy === null;

  return (
    <div className={s.detail} data-component="SlotDetail" data-slot={slot.id} data-status={slot.status}>
      <div className={s.grid}>
        <div className={s.col}>
          <Media view={view} />
          <section className={s.section}>
            <CapsHeading text="description · verbatim" variant="section" level={4} />
            <p className={s.desc}>{view.description === "" ? "—" : view.description}</p>
          </section>
          {view.tags.length > 0 && (
            <div className={s.kv} role="list" aria-label="tags">
              {view.tags.map((t) => (
                <span role="listitem" key={t}>
                  <Chip label={`#${t}`} casing="lower" />
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={s.col}>
          <div className={s.kv}>
            <SlotMark channel={slot.channel} />
            <Chip label={slot.channel} casing="lower" />
            <StatusPill machine="slot" state={slot.status} />
            {slot.drift !== undefined && <Chip label={DRIFT_WORDS[slot.drift]} tone="amber" casing="lower" />}
            {missed !== null && <Chip label={missed} casing="lower" />}
            <Chip label={view.source} ghost casing="lower" />
          </div>
          <h1 className={s.title}>{slot.title}</h1>
          <div className={s.kv}>
            <LedgerLink href={view.ledger} subject={slot.id} />
            {view.project !== undefined && <Chip label="runs" href={view.project.runs} tone="cyan" casing="lower" />}
          </div>
          <div className={s.kv}>
            <Chip label={when(slot.publishAt)} casing="lower" />
            <Chip label={slot.id} casing="lower" />
            {view.publicationId !== undefined && <Chip label={view.publicationId} casing="lower" />}
            {view.dry === true && <Chip label="dry run" tone="amber" casing="lower" />}
          </div>
          {slot.error !== undefined && (
            <section className={s.section} role={isBad(slot) ? "alert" : undefined}>
              <CapsHeading text="error · verbatim" variant="section" level={4} />
              <UpstreamBreak steps={PUBLISH_CHAIN} brokeAt={breakOf(slot.error)} detail={slot.error} />
            </section>
          )}
          {view.metrics !== undefined && <Metrics m={view.metrics} />}
          {view.project !== undefined && (
            <section className={s.section}>
              <CapsHeading text="project" variant="section" level={4} />
              <a className={s.project} href={view.project.href}>
                <span className={s.projectTitle}>{view.project.title}</span>
                {view.project.steps.length > 0 && <PipRow looks={view.project.steps} label="steps" />}
              </a>
            </section>
          )}
          {(canMove(slot) || canCancel(slot) || canPublishNow(slot)) && (
            <section className={s.section} aria-label="slot verbs">
              <div className={s.verbs}>
                {canMove(slot) && <Button label={busy === "move" ? "Moving …" : "Move"} tone="violet" size="sm" shortcut={{ mode: "slot", verb: "move" }} disabled={!idle} onPress={() => setField(field === null ? moveDefault(slot, nowMs) : null)} />}
                {canPublishNow(slot) && <Button label={busy === "publish-now" ? "Publishing …" : "Publish now"} tone="amber" size="sm" shortcut={{ mode: "slot", verb: "publish-now" }} disabled={!idle} onPress={() => setConfirm("publish-now")} />}
                {canCancel(slot) && <Button label={busy === "cancel" ? "Cancelling …" : "Cancel slot"} tone="rose" size="sm" shortcut={{ mode: "slot", verb: "cancel" }} disabled={!idle} onPress={() => setConfirm("cancel")} />}
              </div>
              {field !== null && (
                <form
                  className={s.move}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (problem === null && at !== null && idle) onMove(at);
                  }}
                >
                  <Field type="datetime-local" label="move to, UTC" value={field} onChange={setField} />
                  <span className={s.utc}>UTC</span>
                  <Button label="Move" tone="violet" size="sm" submit disabled={problem !== null || !idle} />
                  {problem !== null && <ErrorLine message={problem} />}
                </form>
              )}
            </section>
          )}
          {/* Outside the verbs: a refusal on a slot that moved under the press (the caller re-reads
              it on a conflict) is drawn beside the slot as it now is, even when no verb is left. */}
          {error !== undefined && confirm === null && <ErrorLine message={error} live />}
        </div>
      </div>
      {confirm !== null && (
        <SlotConfirm
          verb={confirm === "cancel" ? "Cancel slot" : "Publish now"}
          object={object}
          consequences={confirm === "cancel" ? ["cancelled · stays in the calendar, struck", "final · it never publishes"] : view.mode === "dry" ? ["dry run · writes the plan, uploads nothing"] : [`uploads to ${slot.channel} now · private`, "the missed window does not apply"]}
          tone={confirm === "cancel" ? "rose" : "amber"}
          busy={!idle}
          {...(error === undefined ? {} : { error })}
          onConfirm={() => (confirm === "cancel" ? onCancel() : onPublishNow())}
          onCancel={() => setConfirm(null)}
          specimen={specimen}
        />
      )}
    </div>
  );
}
