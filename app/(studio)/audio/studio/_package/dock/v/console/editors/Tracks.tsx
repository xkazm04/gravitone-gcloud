"use client";

// THE TRACKS EDITOR (prototype dock-package, "console"): the running order as a stack of track rows - its number, its
// order keys, its own name for itself (title, version, ISRC, explicit), its measured figures as readouts, its rules
// in the store's words - and the shelf to add from (the wizard's Shelf, reused). Rows move with a layout animation
// when the order changes.
import { motion } from "motion/react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import type { ReleaseTrack } from "@gt/domain/release";

import type { TrackFields } from "../../../../../../_release/draft.ts";
import { clock, db, orNull } from "../../../../../../_release/wizard/fmt.ts";
import { Shelf } from "../../../../../../_release/wizard/Shelf.tsx";
import { problemsOf, problemsOnTrack } from "../../../../../../_release/wizard/steps.ts";
import { Rules } from "../Rules.tsx";
import { Cell, Module } from "./Cell.tsx";
import type { EditorProps } from "./props.ts";
import s from "../editor.module.css";

function Row({ t, i, props }: { readonly t: ReleaseTrack; readonly i: number; readonly props: EditorProps }) {
  const { release: r, read, problems, dispatch, session, reduce } = props;
  const n = r.tracks.length;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: i, fields });
  const take = read.shelf.find((x) => x.takeId === t.takeId);
  const name = t.title.trim() === "" ? `track ${i + 1}` : t.title;
  const c = { session, reduce };
  return (
    <motion.li layout={!reduce} className={s.trackRow} transition={{ type: "spring", stiffness: 420, damping: 38 }}>
      <span className={s.trackNo} aria-hidden="true">
        {String(i + 1).padStart(2, "0")}
      </span>
      <span className={s.order}>
        <button type="button" className={s.iconKey} aria-label={`move ${name} up`} aria-disabled={i === 0 ? true : undefined} onClick={() => i > 0 && dispatch({ type: "moveTrack", id: r.id, from: i, to: i - 1 })}>
          <Glyph name="up" />
        </button>
        <button type="button" className={s.iconKey} aria-label={`move ${name} down`} aria-disabled={i === n - 1 ? true : undefined} onClick={() => i < n - 1 && dispatch({ type: "moveTrack", id: r.id, from: i, to: i + 1 })}>
          <Glyph name="down" />
        </button>
      </span>
      <div className={s.trackBody}>
        <div className={s.grid} data-cols="track">
          <Cell field={i === 0 ? "title" : `title-${i + 1}`} label="title" path={`track:${i + 1}.title`} wide {...c}>
            <Field label={`track ${i + 1} title`} value={t.title} onChange={(v) => patch({ title: v })} />
          </Cell>
          <Cell field={i === 0 ? "version" : `version-${i + 1}`} label="version" path={`track:${i + 1}.version`} {...c}>
            <Field label={`track ${i + 1} version`} value={t.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
          </Cell>
          <Cell field={i === 0 ? "isrc" : `isrc-${i + 1}`} label="ISRC" path={`track:${i + 1}.isrc`} {...c}>
            <Field label={`track ${i + 1} ISRC`} value={t.isrc ?? ""} placeholder="CC-XXX-YY-NNNNN" maxLength={15} onChange={(v) => patch({ isrc: orNull(v) })} />
          </Cell>
          <Cell field={i === 0 ? "explicit" : `explicit-${i + 1}`} label="explicit" path={`track:${i + 1}.explicit`} {...c}>
            <Toggle label={t.explicit ? "explicit" : "clean"} on={t.explicit} onToggle={(v) => patch({ explicit: v })} name={`track ${i + 1} explicit`} />
          </Cell>
        </div>
        <div className={s.facts}>
          <span className={s.fact}>
            <span className={s.k}>len</span> {clock(t.durationS)}
          </span>
          {take !== undefined && take.lufs !== null && (
            <span className={s.fact}>
              <span className={s.k}>LUFS</span> {db(take.lufs)}
            </span>
          )}
          {take !== undefined && take.truePeakDb !== null && (
            <span className={s.fact}>
              <span className={s.k}>dBTP</span> {db(take.truePeakDb)}
            </span>
          )}
          {t.rights.vendor !== null && <Chip label={t.rights.vendor} casing="lower" />}
          {t.audioHref === null && <Chip label="no audio" tone="amber" />}
        </div>
        <Rules problems={problemsOnTrack(problems, "tracks", i)} label={`track ${i + 1} rules`} reduce={reduce} />
      </div>
      <button type="button" className={s.remove} aria-label={`remove ${name}`} onClick={() => dispatch({ type: "removeTrack", id: r.id, index: i })}>
        <span aria-hidden="true">×</span>
      </button>
    </motion.li>
  );
}

export function TracksEditor(props: EditorProps) {
  const { release: r, read, problems, dispatch, reduce } = props;
  const onRelease = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !onRelease.has(t.takeId));
  return (
    <div className={s.stack}>
      <Module label="running order" count={String(r.tracks.length)} field="list">
        <Rules problems={problemsOf(problems, "tracks").filter((p) => p.at === "release")} label="release rules" reduce={reduce} />
        {r.tracks.length === 0 ? (
          <Empty label="No tracks on this release" />
        ) : (
          <ol className={s.trackList} aria-label="tracks in release order">
            {r.tracks.map((t, i) => (
              <Row key={t.takeId} t={t} i={i} props={props} />
            ))}
          </ol>
        )}
      </Module>
      <Module label="shelf" count={String(rest.length)}>
        {rest.length === 0 && read.shelf.length > 0 ? (
          <Empty label="Every kept take is on this release" />
        ) : (
          <Shelf takes={rest} label="shelf takes not on this release" mode={{ kind: "add", onAdd: (take) => dispatch({ type: "addTrack", id: r.id, take }) }} />
        )}
      </Module>
    </div>
  );
}
