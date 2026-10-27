// THE DRAFTS (v1 app/library/audio/InspectorDrafts.tsx): what was sent out, newest first, with
// what came back.
//
// UPGRADED: a v1 draft was a prompt COPIED to a vendor's site, kept in localStorage per browser,
// and a return was a file the operator dropped back by hand. A draft now is a Suno proposal in
// the queue's own store (suno.json), sent through a receipt, and its returns are the clips the
// queue collected - so every machine sees the same drafts, and "awaiting return" is the job's
// real state rather than the absence of a dropped file. Judging a return is the Board's audio
// triage (owner ruling 2026-10-17): this list links there and never keeps or rejects itself.
import { SrOnly } from "../a11y/SrOnly.tsx";
import { Chip } from "../chip/Chip.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { EntryPill } from "../status/StatusPill.tsx";
import type { StatusEntry } from "../status/status.ts";
import s from "./Composer.module.css";

export type DraftState = "proposed" | "queued" | "running" | "done" | "failed" | "cancelled";

/** The wire states mapped onto the kit's looks (status.ts); `proposed` has no job yet. */
export const DRAFT_STATUS: Readonly<Record<DraftState, StatusEntry>> = {
  proposed: { look: "idle", label: "proposed" },
  queued: { look: "idle", label: "queued" },
  running: { look: "running", label: "running" },
  done: { look: "done", label: "returned" },
  failed: { look: "failed", label: "failed" },
  cancelled: { look: "idle", label: "cancelled" },
};

export type DraftClip = { readonly id: string; readonly title: string; readonly model: string; readonly verdict: "keep" | "drop" | null };

export type DraftRow = {
  readonly id: string;
  readonly title: string;
  readonly style: string;
  readonly exclude?: string;
  /** custom (a seed sent from here), llm (a Floor sentence or a lane draft), riff, hunt. */
  readonly origin: string;
  readonly state: DraftState;
  /** The phase words while running (`creating v6-wild`), or the failure verbatim. */
  readonly detail?: string;
  readonly at: string;
  readonly clips: readonly DraftClip[];
};

export type DraftListProps = {
  readonly drafts: readonly DraftRow[];
  /** Where the returns are judged: the Board's audio triage. */
  readonly triageHref: string;
};

export function DraftList({ drafts, triageHref }: DraftListProps) {
  const awaiting = drafts.filter((d) => d.state === "queued" || d.state === "running").length;
  return (
    <section className={s.block} aria-label="drafts">
      <div className={s.head}>
        <CapsHeading text="drafts" variant="section" tally={{ value: drafts.length }} />
        {awaiting > 0 && <Chip label="awaiting" value={awaiting} tone="cyan" />}
      </div>
      {drafts.length === 0 ? (
        <p className={s.emptyLine}>nothing sent</p>
      ) : (
        <ul className={s.drafts}>
          {drafts.map((d) => (
            <li key={d.id} className={s.draft}>
              <div className={s.draftHead}>
                <EntryPill entry={DRAFT_STATUS[d.state]} />
                <Chip label={d.origin} casing="lower" />
                <span className={s.draftTitle}>{d.title}</span>
                <span className={s.grow} />
                <time className={s.when} dateTime={d.at}>
                  {d.at.slice(0, 16).replace("T", " ")}
                </time>
              </div>
              {(d.style !== d.title || d.exclude !== undefined) && (
                <div className={s.draftStyle}>
                  {d.style === d.title ? "" : d.style}
                  {d.exclude !== undefined && (
                    <span className={s.draftEx}>
                      {" "}
                      <span aria-hidden="true">−</span>
                      <SrOnly text="excluded" /> {d.exclude}
                    </span>
                  )}
                </div>
              )}
              {d.detail !== undefined && <div className={d.state === "failed" ? s.draftErr : s.draftDetail}>{d.detail}</div>}
              {d.clips.length > 0 && (
                <div className={s.chips}>
                  {d.clips.map((c) => (
                    <Chip key={c.id} label={c.title === "" ? c.id : c.title} value={c.model} casing="lower" tone={c.verdict === "keep" ? "emerald" : c.verdict === "drop" ? "rose" : "neutral"} href={triageHref} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
