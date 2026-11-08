"use client";

// THE SCORE ON THE CONSOLE (prototype v1; copied from ../Score.tsx ScorePart and changed): the same words the five takes
// are rendered with and the same launch - receipt read first, its token confirmed - packed tighter. The style and the
// source style sit side by side (the brief's hypothesis under the style it wrote), the lyrics take two rows, and
// "score tags" rides on the lyrics' label line instead of a line of its own.
import { useState } from "react";

import { COVER_LYRICS_MAX, COVER_STYLE_MAX } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";

import { BriefHypothesis } from "../brief/Brief.tsx";
import type { CoverFlow } from "../useCover.ts";
import s from "../cover.module.css";
import c from "./console.module.css";

type CountedProps = { readonly label: string; readonly value: string; readonly max: number; readonly onChange: (v: string) => void; readonly rows: number; readonly disabled: boolean; readonly mark?: string };

function Counted({ label, value, max, onChange, rows, disabled, mark }: CountedProps) {
  return (
    <div className={s.fields}>
      <div className={s.row}>
        <span className={s.label}>{label}</span>
        <span className={value.length > max ? `${s.count} ${s.over}` : s.count}>{`${value.length}/${max}`}</span>
        {mark !== undefined && <Chip label={mark} casing="lower" ghost />}
      </div>
      <TextArea label={label} value={value} onChange={onChange} maxLength={max} rows={rows} disabled={disabled} />
    </div>
  );
}

export function ScoreStrip({ flow }: { readonly flow: CoverFlow }) {
  const off = !flow.editable || flow.busy;
  const l = flow.launching;
  // The ceiling field is the Receipt's own; a $0 job has nothing to stop at, and the act takes no ceiling.
  const [ceiling, setCeiling] = useState("");
  return (
    <div className={s.fields}>
      <div className={c.pair}>
        <div className={s.fields}>
          <Counted label="style" value={flow.style} max={COVER_STYLE_MAX} onChange={flow.setStyle} rows={2} disabled={off} />
          <BriefHypothesis brief={flow.card.record.brief} />
        </div>
        <Counted label="source style" value={flow.sourceStyle} max={COVER_STYLE_MAX} onChange={flow.setSourceStyle} rows={2} disabled={off} />
      </div>
      <Counted label="lyrics" value={flow.lyrics} max={COVER_LYRICS_MAX} onChange={flow.setLyrics} rows={2} disabled={off} {...(flow.lyrics.trim() === "" ? { mark: "score tags" } : {})} />
      {flow.editable && l === null && (
        <div className={s.row}>
          <Button label={flow.busy ? "Reading receipt" : "Launch"} tone="cyan" disabled={flow.busy || flow.style.trim() === ""} onPress={flow.launch} />
          {flow.style.trim() === "" && <Chip label="no style" tone="amber" casing="lower" />}
        </div>
      )}
      {l !== null && (
        <>
          <Receipt receipt={l.receipt} {...(l.changes === undefined ? {} : { changes: l.changes })} ceiling={ceiling} onCeiling={setCeiling} onConfirm={flow.confirm} busy={flow.busy} nowMs={l.readAtMs} />
          <div className={s.row}>
            <Button label="Back" size="sm" onPress={flow.cancel} />
          </div>
        </>
      )}
      {flow.error !== null && <ErrorLine message={flow.error} live />}
    </div>
  );
}
