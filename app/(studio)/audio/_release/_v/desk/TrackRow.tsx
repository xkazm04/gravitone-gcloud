"use client";

// One track on the sheet: a dense head (number, title, length, master, what blocks it, order and
// removal) that unfolds in place into three columns - the track's fields, its AI credits and
// rights record, and its master.
import type { Dispatch } from "react";

import { CREDIT_ROLES, type CreditRole, type Release, type ReleaseTrack, type ShelfTake } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { DraftEvent, TrackFields } from "../../draft.ts";
import { Cell, Mini } from "./Cell.tsx";
import { clock, count, orNull, worst } from "./fmt.ts";
import { MasterChip, TrackMaster } from "./TrackMaster.tsx";
import { TrackRights } from "./TrackRights.tsx";
import t from "./sheet.module.css";

export type TrackRowProps = {
  readonly release: Release;
  readonly track: ReleaseTrack;
  readonly index: number;
  readonly problems: readonly ReleaseProblem[];
  readonly shelf: readonly ShelfTake[];
  readonly dispatch: Dispatch<DraftEvent>;
  readonly open: boolean;
  readonly onFold: (open: boolean) => void;
  readonly onMaster: () => void;
};

const ROLE_OPTIONS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

export function TrackRow({ release, track: x, index, problems, shelf, dispatch, open, onFold, onMaster }: TrackRowProps) {
  const n = index + 1;
  const name = x.title.trim() === "" ? `track ${n}` : x.title;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: release.id, index, fields });
  const move = (to: number) => dispatch({ type: "moveTrack", id: release.id, from: index, to });
  const blocks = count(problems, "block");
  const warns = count(problems, "warn");
  const bodyId = `desk-track-body-${x.takeId}`;
  const writers = x.songwriters;
  const credits = x.credits;
  const setWriter = (i: number, v: string) => patch({ songwriters: writers.map((w, j) => (j === i ? v : w)) });
  const setCredit = (i: number, c: { name?: string; role?: CreditRole }) => patch({ credits: credits.map((k, j) => (j === i ? { ...k, ...c } : k)) });

  return (
    <li className={t.track} data-open={open} data-mark={worst(problems)}>
      <div id={`desk-track-${n}`} tabIndex={-1} className={t.trackHead}>
        <span className={t.no}>{n}</span>
        <button type="button" className={t.unfold} aria-expanded={open} aria-controls={bodyId} onClick={() => onFold(!open)}>
          <Glyph name="down" className={t.chev} />
          <span className={t.trackTitle}>{name}</span>
          {x.version !== null && <span className={t.trackVersion}>{x.version}</span>}
        </button>
        <span className={t.trackFacts}>
          {x.explicit && <Chip label="E" name="explicit" tone="amber" />}
          <span className={t.dur}>{clock(x.durationS)}</span>
          <MasterChip master={x.master} />
          {blocks > 0 && <Chip label="block" value={blocks} tone="rose" />}
          {warns > 0 && <Chip label="warn" value={warns} tone="amber" />}
        </span>
        <span className={t.moves}>
          <Mini glyph="up" name={`move ${name} up`} off={index === 0} onPress={() => move(index - 1)} />
          <Mini glyph="down" name={`move ${name} down`} off={index === release.tracks.length - 1} onPress={() => move(index + 1)} />
          <Mini glyph="x" name={`remove ${name}`} onPress={() => dispatch({ type: "removeTrack", id: release.id, index })} />
        </span>
      </div>

      <div id={bodyId} className={t.trackBody} hidden={!open}>
        {open && (
          <>
            <div className={t.part} role="group" aria-label={`${name} fields`}>
              <div className={t.grid2}>
                <Cell label="title" mark={worst(problems, ["title-missing", "title-has-feat", "title-has-version", "title-all-caps"])} span={2}>
                  <Field label={`track ${n} title`} value={x.title} onChange={(v) => patch({ title: v })} />
                </Cell>
                <Cell label="version">
                  <Field label={`track ${n} version`} value={x.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
                </Cell>
                <Cell label="ISRC" mark={worst(problems, ["isrc-malformed"])}>
                  <Field label={`track ${n} ISRC`} value={x.isrc ?? ""} placeholder="CC-XXX-YY-NNNNN" maxLength={15} onChange={(v) => patch({ isrc: orNull(v) })} />
                </Cell>
              </div>
              <Toggle label="explicit" on={x.explicit} onToggle={(v) => patch({ explicit: v })} name={`track ${n} explicit`} />

              <Cell label="songwriters" mark={worst(problems, ["songwriter-missing", "songwriter-not-full-name"])}>
                <ul className={t.list}>
                  {writers.map((w, i) => (
                    <li key={i} className={t.listRow}>
                      <Field label={`track ${n} songwriter ${i + 1}`} value={w} onChange={(v) => setWriter(i, v)} />
                      <Mini glyph="x" name={`remove songwriter ${w || i + 1}`} onPress={() => patch({ songwriters: writers.filter((_, j) => j !== i) })} />
                    </li>
                  ))}
                </ul>
                <Button label="Add songwriter" size="sm" onPress={() => patch({ songwriters: [...writers, ""] })} />
              </Cell>

              <Cell label="credits">
                <ul className={t.list}>
                  {credits.map((c, i) => (
                    <li key={i} className={t.listRow}>
                      <Field label={`track ${n} credit ${i + 1} name`} value={c.name} onChange={(v) => setCredit(i, { name: v })} />
                      <Select<CreditRole> label={`track ${n} credit ${i + 1} role`} options={ROLE_OPTIONS} value={c.role} onChange={(v) => setCredit(i, { role: v })} />
                      <Mini glyph="x" name={`remove credit ${c.name || i + 1}`} onPress={() => patch({ credits: credits.filter((_, j) => j !== i) })} />
                    </li>
                  ))}
                </ul>
                <Button label="Add credit" size="sm" onPress={() => patch({ credits: [...credits, { name: "", role: "performer" }] })} />
              </Cell>

              <Cell label="lyrics">
                <TextArea label={`track ${n} lyrics`} value={x.lyrics ?? ""} rows={4} onChange={(v) => patch({ lyrics: orNull(v) })} />
              </Cell>
            </div>
            <TrackRights track={x} n={n} problems={problems} onPatch={patch} />
            <TrackMaster track={x} n={n} shelf={shelf} problems={problems} onMaster={onMaster} />
          </>
        )}
      </div>
    </li>
  );
}
