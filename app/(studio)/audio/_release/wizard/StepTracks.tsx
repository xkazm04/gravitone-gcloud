"use client";

// Step 1, tracks: what is on the release and in what order, each track's own name for itself (title,
// version, ISRC, explicit), and the shelf to add from.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import type { ReleaseTrack } from "@gt/domain/release";

import type { TrackFields } from "../draft.ts";
import { clock, db, orNull } from "./fmt.ts";
import { Problems } from "./Problems.tsx";
import { Shelf } from "./Shelf.tsx";
import { problemsOf, problemsOnTrack, type StepProps } from "./steps.ts";
import s from "./step.module.css";

function TrackRow({ t, i, n, props }: { readonly t: ReleaseTrack; readonly i: number; readonly n: number; readonly props: StepProps }) {
  const { release, read, problems, dispatch } = props;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: release.id, index: i, fields });
  const take = read.shelf.find((x) => x.takeId === t.takeId);
  const name = t.title.trim() === "" ? `track ${i + 1}` : t.title;
  return (
    <li className={s.trackRow}>
      <span className={s.trackNo} aria-hidden="true">
        {i + 1}
      </span>
      <span className={s.order}>
        <button type="button" className={s.iconBtn} aria-label={`move ${name} up`} aria-disabled={i === 0 ? true : undefined} onClick={() => i > 0 && dispatch({ type: "moveTrack", id: release.id, from: i, to: i - 1 })}>
          <Glyph name="up" />
        </button>
        <button type="button" className={s.iconBtn} aria-label={`move ${name} down`} aria-disabled={i === n - 1 ? true : undefined} onClick={() => i < n - 1 && dispatch({ type: "moveTrack", id: release.id, from: i, to: i + 1 })}>
          <Glyph name="down" />
        </button>
      </span>
      <div className={s.trackBody}>
        <div className={s.trackFields}>
          <label className={s.cell} data-w="wide">
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
          <span className={s.cell} data-w="tight">
            <span className={s.k}>explicit</span>
            <Toggle label={t.explicit ? "explicit" : "clean"} on={t.explicit} onToggle={(v) => patch({ explicit: v })} name={`track ${i + 1} explicit`} />
          </span>
        </div>
        <div className={s.trackFacts}>
          <span className={s.num}>{clock(t.durationS)}</span>
          {take !== undefined && take.lufs !== null && <span className={s.num}>{db(take.lufs)} LUFS</span>}
          {take !== undefined && take.truePeakDb !== null && <span className={s.num}>{db(take.truePeakDb)} dBTP</span>}
          {t.rights.vendor !== null && <Chip label={t.rights.vendor} casing="lower" />}
          {t.audioHref === null && <Chip label="no audio" ghost />}
          <Chip label={t.master.state === "done" ? "mastered" : t.master.state === "running" ? "mastering" : "unmastered"} tone={t.master.state === "done" ? "emerald" : t.master.state === "running" ? "cyan" : "neutral"} />
        </div>
        <Problems problems={problemsOnTrack(problems, "tracks", i)} label={`track ${i + 1} problems`} />
      </div>
      <button type="button" className={s.iconBtn} data-tone="rose" aria-label={`remove ${name}`} onClick={() => dispatch({ type: "removeTrack", id: release.id, index: i })}>
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

export function StepTracks(props: StepProps) {
  const { release, read, problems, dispatch } = props;
  const onRelease = new Set(release.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !onRelease.has(t.takeId));
  return (
    <div className={s.stack}>
      <Problems problems={problemsOf(problems, "tracks").filter((p) => p.at === "release")} label="release problems" />
      {release.tracks.length === 0 ? (
        <Empty label="No tracks on this release" />
      ) : (
        <ol className={s.tracks} aria-label="tracks in release order">
          {release.tracks.map((t, i) => (
            <TrackRow key={t.takeId} t={t} i={i} n={release.tracks.length} props={props} />
          ))}
        </ol>
      )}
      <section className={s.section} aria-label="add from the shelf">
        <CapsHeading text="Add from the shelf" tally={{ value: rest.length }} variant="section" />
        {rest.length === 0 && read.shelf.length > 0 ? (
          <Empty label="Every kept take is on this release" />
        ) : (
          <Shelf takes={rest} label="shelf takes not on this release" mode={{ kind: "add", onAdd: (take) => dispatch({ type: "addTrack", id: release.id, take }) }} />
        )}
      </section>
    </div>
  );
}
