"use client";

// WHAT GOES IN, BELOW THE SECTION (copied from ../Score.tsx ScorePart, laid as sheet lines): the style the five takes
// are rendered with and, beside it, what a finished brief wrote it from; the source's own style; the lyrics (empty
// is the score's own section tags); then the launch - its receipt read first, its token confirmed - or, once
// launched, the job's state, which crossfades as the record moves it.
import { useState } from "react";

import { COVER_LYRICS_MAX, COVER_STYLE_MAX } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";

import { agreedWords } from "../brief/brief.ts";
import type { CoverFlow } from "../useCover.ts";
import { Line } from "./Line.tsx";
import s from "./sheet.module.css";

function Count({ value, max }: { readonly value: string; readonly max: number }) {
  return <span className={value.length > max ? `${s.count} ${s.over}` : s.count}>{`${value.length}/${max}`}</span>;
}

function Text({ term, value, max, onChange, rows, off }: { readonly term: string; readonly value: string; readonly max: number; readonly onChange: (v: string) => void; readonly rows: number; readonly off: boolean }) {
  return (
    <Line term={term} aside={<Count value={value} max={max} />}>
      <TextArea label={term} value={value} onChange={onChange} maxLength={max} rows={rows} disabled={off} />
    </Line>
  );
}

/** The brief's reason and agreement, under the style it wrote: the hypothesis it is. */
function Why({ flow }: { readonly flow: CoverFlow }) {
  const b = flow.card.record.brief;
  if (b?.state !== "done") return null;
  return (
    <Line term="why">
      <div className={s.stack}>
        {b.agreed !== undefined && <Chip label={agreedWords(b.agreed)} tone={b.agreed >= 2 ? "neutral" : "amber"} casing="lower" />}
        {b.why !== undefined && <p className={s.prose}>{b.why}</p>}
      </div>
    </Line>
  );
}

/** Once launched: the job's id. Its state is the sheet's own, crossfading in the sheet's head (./Sheet.tsx). */
function Job({ flow }: { readonly flow: CoverFlow }) {
  const r = flow.card.record;
  if (r.jobId === undefined) return null;
  return (
    <Line term="job">
      <span className={s.mono}>{r.jobId}</span>
    </Line>
  );
}

export function ScoreLines({ flow }: { readonly flow: CoverFlow }) {
  const off = !flow.editable || flow.busy;
  const l = flow.launching;
  // The ceiling field is the Receipt's own; a $0 job has nothing to stop at, and the act takes no ceiling.
  const [ceiling, setCeiling] = useState("");
  const noStyle = flow.style.trim() === "";
  return (
    <>
      <Text term="style" value={flow.style} max={COVER_STYLE_MAX} onChange={flow.setStyle} rows={2} off={off} />
      <Why flow={flow} />
      <Text term="source style" value={flow.sourceStyle} max={COVER_STYLE_MAX} onChange={flow.setSourceStyle} rows={2} off={off} />
      <Line term="lyrics" aside={flow.lyrics.trim() === "" ? <Chip label="score tags" casing="lower" ghost /> : <Count value={flow.lyrics} max={COVER_LYRICS_MAX} />}>
        <TextArea label="lyrics" value={flow.lyrics} onChange={flow.setLyrics} maxLength={COVER_LYRICS_MAX} rows={flow.lyrics.trim() === "" ? 1 : 4} disabled={off} />
      </Line>
      {flow.card.record.state === "failed" && <Job flow={flow} />}
      {flow.editable ? (
        <Line term="launch" tone="rule">
          <div className={s.stack}>
            {l === null ? (
              <div className={s.inline}>
                <Button label={flow.busy ? "Reading receipt" : "Launch"} tone="cyan" disabled={flow.busy || noStyle} onPress={flow.launch} />
                {noStyle && <Chip label="no style" tone="amber" casing="lower" />}
              </div>
            ) : (
              <>
                <Receipt receipt={l.receipt} {...(l.changes === undefined ? {} : { changes: l.changes })} ceiling={ceiling} onCeiling={setCeiling} onConfirm={flow.confirm} busy={flow.busy} nowMs={l.readAtMs} />
                <div className={s.inline}>
                  <Button label="Back" size="sm" onPress={flow.cancel} />
                </div>
              </>
            )}
            {flow.error !== null && <ErrorLine message={flow.error} live />}
          </div>
        </Line>
      ) : (
        <Job flow={flow} />
      )}
    </>
  );
}
