"use client";

// ONE TRACK'S EDITORS (variant "sheet"): the Tracks section (a track's own name for itself, its place, its removal)
// and the People section (songwriters by legal name, credits by role, the lyrics). The dialog picks the track; every
// change is a `patchTrack` / `moveTrack` / `removeTrack` on the draft.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { CREDIT_ROLES, type CreditRole, type Release } from "@gt/domain/release";

import type { DraftEvent, TrackFields } from "../../../../../_release/draft.ts";
import { orNull } from "../../../../../_release/wizard/fmt.ts";
import { Cell } from "./EditRelease.tsx";
import s from "./dialog.module.css";

const ROLE_OPTIONS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

interface Props {
  readonly r: Release;
  readonly i: number;
  readonly dispatch: (e: DraftEvent) => void;
  readonly setTrack: (i: number) => void;
}

export function EditTrack({ r, i, dispatch, setTrack }: Props) {
  const t = r.tracks[i];
  if (t === undefined) return null;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: i, fields });
  const n = r.tracks.length;
  const move = (to: number) => {
    dispatch({ type: "moveTrack", id: r.id, from: i, to });
    setTrack(to);
  };
  return (
    <div className={s.editor}>
      <div className={s.form}>
        <Cell k="title" wide>
          <Field label={`track ${i + 1} title`} value={t.title} onChange={(v) => patch({ title: v })} />
        </Cell>
        <Cell k="version">
          <Field label={`track ${i + 1} version`} value={t.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
        </Cell>
        <Cell k="ISRC">
          <Field label={`track ${i + 1} ISRC`} value={t.isrc ?? ""} placeholder="CC-XXX-YY-NNNNN" maxLength={15} onChange={(v) => patch({ isrc: orNull(v) })} />
        </Cell>
      </div>
      <div className={s.row}>
        <Toggle label={t.explicit ? "explicit" : "clean"} on={t.explicit} onToggle={(v) => patch({ explicit: v })} name={`track ${i + 1} explicit`} />
        {n > 1 && <Button label="Move up" size="sm" glyph="up" disabled={i === 0} onPress={() => move(i - 1)} />}
        {n > 1 && <Button label="Move down" size="sm" glyph="down" disabled={i === n - 1} onPress={() => move(i + 1)} />}
        <Button
          label="Remove track"
          size="sm"
          tone="rose"
          onPress={() => {
            dispatch({ type: "removeTrack", id: r.id, index: i });
            setTrack(Math.max(0, i - 1));
          }}
        />
      </div>
    </div>
  );
}

export function EditPeople({ r, i, dispatch }: Props) {
  const t = r.tracks[i];
  if (t === undefined) return null;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: i, fields });
  const writers = t.songwriters;
  const setCredit = (k: number, f: Partial<{ name: string; role: CreditRole }>) => patch({ credits: t.credits.map((c, j) => (j === k ? { ...c, ...f } : c)) });
  return (
    <div className={s.editor}>
      <section className={s.block} aria-label="songwriters">
        <h3 className={s.blockHead}>Songwriters</h3>
        <ul className={s.rowList}>
          {writers.map((w, k) => (
            <li key={k} className={s.rowItem}>
              <Field label={`songwriter ${k + 1}`} value={w} placeholder="Jane Doe" onChange={(v) => patch({ songwriters: writers.map((x, j) => (j === k ? v : x)) })} />
              <button type="button" className={s.remove} aria-label={`remove songwriter ${w.trim() === "" ? k + 1 : w}`} onClick={() => patch({ songwriters: writers.filter((_, j) => j !== k) })}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <span className={s.row}>
          <Button label="Add songwriter" size="sm" onPress={() => patch({ songwriters: [...writers, ""] })} />
        </span>
      </section>
      <section className={s.block} aria-label="credits">
        <h3 className={s.blockHead}>Credits</h3>
        <ul className={s.rowList}>
          {t.credits.map((c, k) => (
            <li key={k} className={s.rowItem} data-cols="3">
              <Field label={`credit ${k + 1} name`} value={c.name} onChange={(v) => setCredit(k, { name: v })} />
              <Select label={`credit ${k + 1} role`} options={ROLE_OPTIONS} value={c.role} onChange={(v) => setCredit(k, { role: v })} />
              <button type="button" className={s.remove} aria-label={`remove credit ${c.name.trim() === "" ? k + 1 : c.name}`} onClick={() => patch({ credits: t.credits.filter((_, j) => j !== k) })}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <span className={s.row}>
          <Button label="Add credit" size="sm" onPress={() => patch({ credits: [...t.credits, { name: "", role: "performer" }] })} />
        </span>
      </section>
      <section className={s.block} aria-label="lyrics">
        <h3 className={s.blockHead}>Lyrics</h3>
        <TextArea label={`track ${i + 1} lyrics`} value={t.lyrics ?? ""} rows={8} onChange={(v) => patch({ lyrics: orNull(v) })} />
      </section>
    </div>
  );
}
