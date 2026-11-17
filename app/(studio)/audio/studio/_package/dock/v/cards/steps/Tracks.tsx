"use client";

// TRACKS ON THE CARD: the release's shape as figures (kind, count, length), then one line per track - its number,
// its title (a door to its own fields), its length and loudness, its marks as chips - with the order and the remove
// at the line's end. The shelf to add from sits behind a door.
import { useState } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { releaseKind, type ReleaseTrack } from "@gt/domain/release";

import type { TrackFields } from "../../../../../../_release/draft.ts";
import { clock, db, KIND_LABEL, orNull } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOnTrack, severityOf, type StepProps } from "../../../../../../_release/wizard/steps.ts";
import { Door, Sheet } from "../Door.tsx";
import { Figure } from "../Figure.tsx";
import { totalOf } from "../model.ts";
import { ShelfList } from "./Shelf.tsx";
import s from "./steps.module.css";

function TrackFieldsSheet({ t, i, open, onClose, patch }: { readonly t: ReleaseTrack; readonly i: number; readonly open: boolean; readonly onClose: () => void; readonly patch: (f: TrackFields) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Track ${i + 1}`}>
      <div className={s.form}>
        <label className={s.cell} data-w="full">
          <span className={s.k}>title</span>
          <Field label={`track ${i + 1} title`} value={t.title} onChange={(v) => patch({ title: v })} />
        </label>
        <label className={s.cell}>
          <span className={s.k}>version</span>
          <Field label={`track ${i + 1} version`} value={t.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
        </label>
        <label className={s.cell}>
          <span className={s.k}>ISRC</span>
          <Field label={`track ${i + 1} ISRC`} value={t.isrc ?? ""} placeholder="CC-XXX-YY-NNNNN" maxLength={15} onChange={(v) => patch({ isrc: orNull(v) })} />
        </label>
        <span className={s.cell}>
          <span className={s.k}>explicit</span>
          <Toggle label={t.explicit ? "explicit" : "clean"} on={t.explicit} onToggle={(v) => patch({ explicit: v })} name={`track ${i + 1} explicit`} />
        </span>
      </div>
    </Sheet>
  );
}

function TrackLine({ t, i, n, props }: { readonly t: ReleaseTrack; readonly i: number; readonly n: number; readonly props: StepProps }) {
  const { release, read, problems, dispatch } = props;
  const [open, setOpen] = useState(false);
  const take = read.shelf.find((x) => x.takeId === t.takeId);
  const sev = severityOf(problemsOnTrack(problems, "tracks", i));
  const name = t.title.trim() === "" ? `track ${i + 1}` : t.title;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: release.id, index: i, fields });
  return (
    <li className={s.trackLine} data-issue={sev.block > 0 ? "block" : sev.warn > 0 ? "warn" : undefined}>
      <span className={s.trackNo} aria-hidden="true">
        {i + 1}
      </span>
      <button type="button" className={s.trackTitle} aria-haspopup="dialog" aria-label={`${name}: edit title, version, ISRC, explicit`} onClick={() => setOpen(true)}>
        <span>{t.title.trim() === "" ? "untitled" : t.title}</span>
        {t.version !== null && <span className={s.trackVersion}>{t.version}</span>}
      </button>
      <span className={s.trackChips}>
        <span className={s.num}>{clock(t.durationS)}</span>
        {take !== undefined && take.lufs !== null && <span className={s.num}>{db(take.lufs)} LUFS</span>}
        <Chip label={t.explicit ? "explicit" : "clean"} casing="lower" tone={t.explicit ? "amber" : "neutral"} />
        {t.isrc === null ? <Chip label="no ISRC" casing="lower" ghost /> : <Chip label={t.isrc} casing="lower" name={`ISRC ${t.isrc}`} />}
        {t.audioHref === null && <Chip label="no audio" tone="rose" casing="lower" />}
      </span>
      <span className={s.trackActs}>
        <button type="button" className={s.iconBtn} aria-label={`move ${name} up`} aria-disabled={i === 0 ? true : undefined} onClick={() => i > 0 && dispatch({ type: "moveTrack", id: release.id, from: i, to: i - 1 })}>
          <Glyph name="up" />
        </button>
        <button type="button" className={s.iconBtn} aria-label={`move ${name} down`} aria-disabled={i === n - 1 ? true : undefined} onClick={() => i < n - 1 && dispatch({ type: "moveTrack", id: release.id, from: i, to: i + 1 })}>
          <Glyph name="down" />
        </button>
        <button type="button" className={s.iconBtn} data-tone="rose" aria-label={`remove ${name}`} onClick={() => dispatch({ type: "removeTrack", id: release.id, index: i })}>
          <span aria-hidden="true">×</span>
        </button>
      </span>
      <TrackFieldsSheet t={t} i={i} open={open} onClose={() => setOpen(false)} patch={patch} />
    </li>
  );
}

export function TracksBody(props: StepProps) {
  const { release: r, read, dispatch } = props;
  const onRelease = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !onRelease.has(t.takeId));
  const shelf = (
    <Door name={`add from the shelf, ${rest.length} takes`} title="Add from the shelf" glyph="grid" word={`shelf · ${rest.length}`} size="xl">
      {rest.length === 0 && read.shelf.length > 0 ? (
        <Empty label="Every kept take is on this release" />
      ) : (
        <ShelfList takes={rest} label="shelf takes not on this release" mode={{ kind: "add", onAdd: (take) => dispatch({ type: "addTrack", id: r.id, take }) }} />
      )}
    </Door>
  );
  return (
    <div className={s.body}>
      <div className={s.figures}>
        <Figure value={KIND_LABEL[releaseKind(r.tracks)]} label="kind" />
        <Figure value={r.tracks.length} label={r.tracks.length === 1 ? "track" : "tracks"} tone={r.tracks.length === 0 ? "block" : undefined} />
        <Figure value={clock(totalOf(r))} label="length" />
        <span className={s.figuresEnd}>{shelf}</span>
      </div>
      {r.tracks.length === 0 ? (
        <div className={s.void}>
          <Empty label="No tracks on this release" />
        </div>
      ) : (
        <ol className={s.trackList} aria-label="tracks in release order">
          {r.tracks.map((t, i) => (
            <TrackLine key={t.takeId} t={t} i={i} n={r.tracks.length} props={props} />
          ))}
        </ol>
      )}
    </div>
  );
}
