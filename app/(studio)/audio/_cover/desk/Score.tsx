"use client";

// THE SECTION AND THE SCORE: the span of the song the takes cover (RangePick over the browser's own peaks, the
// section played alone through the A/B pair), then the words the five takes are rendered with - the style, the
// source's own style back-filled, lyrics optional and empty by default - and the launch: its receipt read
// first, its token confirmed.
import { useState } from "react";

import { COVER_LYRICS_MAX, COVER_SECTION_MAX_S, COVER_SECTION_MIN_S, COVER_STYLE_MAX } from "@gt/domain/cover";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { RangePick } from "@gt/ui/components/rangepick/RangePick.tsx";

import { BriefHypothesis } from "./brief/Brief.tsx";
import { SECTION_KEY, type AB } from "./useAB.ts";
import type { CoverFlow } from "./useCover.ts";
import { clock } from "./words.ts";
import s from "./cover.module.css";

export function SectionPart({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const live = ab.at === SECTION_KEY;
  const state = live ? (ab.playing ? "playing" : "idle") : "idle";
  const playhead = live ? flow.span.startS + ab.clock : undefined;
  const len = flow.span.endS - flow.span.startS;
  return (
    <div className={s.fields}>
      {flow.heardError !== null && <ErrorLine message={flow.heardError} live />}
      <RangePick
        label={flow.card.record.title}
        peaks={flow.heard?.peaks ?? []}
        lenS={flow.lenS}
        minS={COVER_SECTION_MIN_S}
        maxS={COVER_SECTION_MAX_S}
        value={flow.span}
        onChange={flow.setSpan}
        disabled={!flow.editable}
        {...(playhead === undefined ? {} : { playheadS: playhead })}
      />
      <div className={s.row}>
        <EarButton state={state} name="the section" onPress={() => ab.toggle(SECTION_KEY, null)} />
        <span className={s.time}>{`${clock(live ? ab.clock : 0)} / ${clock(len)}`}</span>
        {!flow.editable && <Chip label="locked" casing="lower" />}
        {flow.heard === null && flow.heardError === null && <Chip label="decoding" tone="cyan" dot casing="lower" />}
      </div>
      {live && ab.failed !== null && <ErrorLine message={ab.failed} live />}
    </div>
  );
}

function Counted({ label, value, max, onChange, rows, disabled }: { readonly label: string; readonly value: string; readonly max: number; readonly onChange: (v: string) => void; readonly rows: number; readonly disabled: boolean }) {
  return (
    <div className={s.fields}>
      <div className={s.row}>
        <span className={s.label}>{label}</span>
        <span className={value.length > max ? `${s.count} ${s.over}` : s.count}>{`${value.length}/${max}`}</span>
      </div>
      <TextArea label={label} value={value} onChange={onChange} maxLength={max} rows={rows} disabled={disabled} />
    </div>
  );
}

export function ScorePart({ flow }: { readonly flow: CoverFlow }) {
  const off = !flow.editable || flow.busy;
  const l = flow.launching;
  // The ceiling field is the Receipt's own; a $0 job has nothing to stop at, and the act takes no ceiling.
  const [ceiling, setCeiling] = useState("");
  return (
    <div className={s.fields}>
      <Counted label="style" value={flow.style} max={COVER_STYLE_MAX} onChange={flow.setStyle} rows={3} disabled={off} />
      <BriefHypothesis brief={flow.card.record.brief} />
      <Counted label="source style" value={flow.sourceStyle} max={COVER_STYLE_MAX} onChange={flow.setSourceStyle} rows={2} disabled={off} />
      <Counted label="lyrics" value={flow.lyrics} max={COVER_LYRICS_MAX} onChange={flow.setLyrics} rows={4} disabled={off} />
      {flow.lyrics.trim() === "" && <Chip label="lyrics: score tags" casing="lower" ghost />}
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
