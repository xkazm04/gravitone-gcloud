"use client";

// THE BRIEF ON THE DESK (cover brief, WP-B): beside the song's facts, before the section and the style. A draft or
// failed cover with no brief under way offers it; its receipt is read first and its token confirmed, as a launch's
// is (../Score.tsx). The rest is the record's `brief`: queued and running with how long since the state moved,
// done, or failed with the job's sentence verbatim and the offer back. What a finished brief wrote - its reason
// and how many of the three listens agreed - sits beside the style it wrote, as the hypothesis it is.
import { useState } from "react";

import type { CoverBrief } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";

import type { CoverFlow } from "../useCover.ts";
import { agreedWords, BRIEF_TONE, briefOffered, since } from "./brief.ts";
import s from "../cover.module.css";

function BriefState({ b, readAtMs }: { readonly b: CoverBrief; readonly readAtMs: number | null }) {
  const moving = b.state === "queued" || b.state === "running";
  return (
    <>
      <Chip label="brief" value={b.state} tone={BRIEF_TONE[b.state]} dot casing="lower" name={`brief ${b.state}`} />
      {moving && readAtMs !== null && (
        <time className={s.time} dateTime={b.at} aria-label={`brief ${b.state} for ${since(b.at, readAtMs)}`}>
          {since(b.at, readAtMs)}
        </time>
      )}
    </>
  );
}

export function BriefPart({ flow }: { readonly flow: CoverFlow }) {
  const r = flow.card.record;
  const b = r.brief;
  const f = flow.brief;
  const offered = briefOffered(r);
  // The ceiling field is the Receipt's own; the brief's job takes no ceiling, as the cover's does not.
  const [ceiling, setCeiling] = useState("");
  if (b === undefined && !offered) return null;
  return (
    <div className={s.fields} aria-label="brief">
      <div className={s.row}>
        {b !== undefined && <BriefState b={b} readAtMs={f.readAtMs} />}
        {f.existing !== null && <Chip label="exists" value={f.existing} tone="amber" casing="lower" />}
        {offered && f.launching === null && <Button label={f.busy ? "Reading receipt" : b === undefined ? "Brief" : "Brief again"} tone="cyan" size="sm" disabled={f.busy} onPress={f.ask} />}
      </div>
      {b?.error !== undefined && <ErrorLine message={b.error} />}
      {f.launching !== null && (
        <>
          <Receipt receipt={f.launching.receipt} {...(f.launching.changes === undefined ? {} : { changes: f.launching.changes })} ceiling={ceiling} onCeiling={setCeiling} onConfirm={f.confirm} busy={f.busy} nowMs={f.launching.readAtMs} />
          <div className={s.row}>
            <Button label="Back" size="sm" onPress={f.cancel} />
          </div>
        </>
      )}
      {f.error !== null && <ErrorLine message={f.error} live />}
    </div>
  );
}

/** Beside the style: what a finished brief wrote it from. */
export function BriefHypothesis({ brief }: { readonly brief: CoverBrief | undefined }) {
  if (brief?.state !== "done") return null;
  return (
    <div className={s.fields}>
      {brief.agreed !== undefined && (
        <div className={s.row}>
          <Chip label={agreedWords(brief.agreed)} tone={brief.agreed >= 2 ? "neutral" : "amber"} casing="lower" />
        </div>
      )}
      {brief.why !== undefined && <span className={s.mono}>{brief.why}</span>}
    </div>
  );
}
