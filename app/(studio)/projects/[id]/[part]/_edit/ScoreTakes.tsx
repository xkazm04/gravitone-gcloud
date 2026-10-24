"use client";

// A CUE'S (OR A LINE'S) TAKES (v1 CueTakes.tsx): use one, keep or reject each, hear it, read who
// made it, and put a note on one section for a revision. v1's "not kept past a reload" hint and
// its paragraph explaining an absent vendor are gone: a take's provenance is drawn when it
// exists and nothing is drawn when it does not; a take whose bytes are gone says "gone".
import { useState } from "react";

import type { TakeView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { clock, secs } from "@gt/ui/components/part/part.ts";
import { FIELD_ATTR } from "@gt/ui/keymap/target";

import s from "./Cut.module.css";

type Mark = "kept" | "rejected" | "none";

export type TakeActs = {
  readonly use: (takeId: string) => void;
  readonly mark: (takeId: string, mark: "kept" | "rejected" | null) => void;
  /** Absent where a take has no sections to revise (a voice line). */
  readonly note?: (takeId: string, section: number, note: string) => void;
  readonly revise?: (take: TakeView) => void;
};

const cost = (t: TakeView): string | undefined => {
  const e = t.engine;
  if (e === undefined) return undefined;
  return e.usd === null ? (e.mode === "dry" ? "dry" : "unpriced") : `$${e.usd.toFixed(2)}`;
};

function TakeRow({ t, acts, busy }: { readonly t: TakeView; readonly acts: TakeActs; readonly busy: boolean }) {
  const [section, setSection] = useState(t.revision?.section ?? 0);
  const [note, setNote] = useState(t.revision?.note ?? "");
  const c = cost(t);
  // A note belongs to a section: picking another carries the note there. It used to move only the
  // chip, so the note stayed on the old section and "revise §N" kept naming it.
  const pick = (i: number): void => {
    setSection(i);
    if (note.trim() !== "" && i !== t.revision?.section) acts.note?.(t.id, i, note);
  };
  return (
    <div className={s.take} {...(t.active ? { "data-active": "" } : {})} data-mark={t.mark ?? "none"} data-take={t.id}>
      <div className={s.row}>
        <strong className={`${s.grow} ${s.ell}`}>{t.label}</strong>
        {t.seconds !== null && <span className={s.mono}>{secs(t.seconds)}</span>}
        {!t.held && <Chip label="gone" tone="rose" casing="lower" />}
        {t.active ? <Chip label="in use" tone="emerald" casing="lower" /> : <Button label="use" size="sm" disabled={busy} onPress={() => acts.use(t.id)} />}
      </div>
      <Seg<Mark>
        label={`decision on ${t.label}`}
        options={[
          { value: "kept", label: "keep" },
          { value: "rejected", label: "reject" },
          { value: "none", label: "undecided" },
        ]}
        value={t.mark ?? "none"}
        onChange={(m) => !busy && acts.mark(t.id, m === "none" ? null : m)}
      />
      {t.blob !== undefined && <audio className={s.audio} controls preload="none" src={`/api/blob/${t.blob}`} aria-label={`play ${t.label}`} />}
      <Provenance {...(t.engine === undefined ? {} : { model: t.engine.model, vendor: t.engine.provider })} {...(c === undefined ? {} : { cost: c })} {...(t.at === null ? {} : { step: t.at.slice(0, 16).replace("T", " ") })} />
      {acts.note !== undefined && t.sections.length > 0 && (
        <div className={s.sect}>
          <div className={s.sections} role="radiogroup" aria-label={`sections of ${t.label}`}>
            {t.sections.map((x) => (
              <Chip key={x.index} label={x.name} value={`${clock(x.startS)}–${clock(x.endS)}`} casing="lower" pressed={x.index === section} onPress={() => pick(x.index)} />
            ))}
          </div>
          <input
            className={s.input}
            aria-label={`note on section ${section + 1} of ${t.label}`}
            value={note}
            placeholder="direction for this section"
            onChange={(e) => setNote(e.currentTarget.value)}
            onBlur={() => note.trim() !== (t.revision?.note ?? "") && acts.note?.(t.id, section, note)}
            {...{ [FIELD_ATTR]: "part-field" }}
          />
          {t.revision !== undefined && acts.revise !== undefined && <Button label={`revise §${t.revision.section + 1}`} size="sm" tone="cyan" onPress={() => acts.revise?.(t)} />}
        </div>
      )}
    </div>
  );
}

export function ScoreTakes({ takes, acts, busy }: { readonly takes: readonly TakeView[]; readonly acts: TakeActs; readonly busy: boolean }) {
  return (
    <div className={s.sect} aria-label="takes">
      {takes.map((t) => (
        <TakeRow key={`${t.id}:${t.mark ?? ""}:${t.revision?.note ?? ""}`} t={t} acts={acts} busy={busy} />
      ))}
    </div>
  );
}
