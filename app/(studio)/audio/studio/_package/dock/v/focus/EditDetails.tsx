"use client";

// THE DETAILS EDITOR (variant "focus"): the release's fields and one track's people as the read's own rows turned
// live, with the agent's value under the field it would set.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CREDIT_ROLES, GENRES, type CreditRole, type Genre, type Release } from "@gt/domain/release";

import type { ReleaseFields, TrackFields } from "../../../../../_release/draft.ts";
import { orNull } from "../../../../../_release/wizard/fmt.ts";
import type { StepProps } from "../../../../../_release/wizard/steps.ts";
import { EditGroup, EditRow } from "./Edit.tsx";
import { TrackPick } from "./Summary.tsx";
import s from "./focus.module.css";

const GENRE_OPTIONS: readonly { readonly value: Genre | ""; readonly label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];
const ROLE_OPTIONS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

function ReleaseRows({ r, set, props, focus }: { readonly r: Release; readonly set: (f: ReleaseFields) => void; readonly props: StepProps; readonly focus: string | null }) {
  const { session } = props;
  const row = (key: string) => ({ session, focus: focus === key });
  return (
    <EditGroup label="Release">
      <EditRow label="title" path="title" {...row("title")}>
        <Field label="release title" value={r.title} onChange={(v) => set({ title: v })} />
      </EditRow>
      <EditRow label="version" path="version" {...row("version")}>
        <Field label="release version" value={r.version ?? ""} onChange={(v) => set({ version: orNull(v) })} />
      </EditRow>
      <EditRow label="artist" path="artist" {...row("artist")}>
        <Field label="artist" value={r.artist} onChange={(v) => set({ artist: v })} />
      </EditRow>
      <EditRow label="label" path="label" {...row("label")}>
        <Field label="record label" value={r.label ?? ""} onChange={(v) => set({ label: orNull(v) })} />
      </EditRow>
      <EditRow label="release date" path="releaseDate" {...row("releaseDate")}>
        <Field label="release date" value={r.releaseDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set({ releaseDate: orNull(v) })} />
      </EditRow>
      <EditRow label="language" path="language" {...row("language")}>
        <Field label="language" value={r.language} placeholder="en" maxLength={35} onChange={(v) => set({ language: v })} />
      </EditRow>
      <EditRow label="genre" path="genre.primary" {...row("genre")}>
        <Select label="primary genre" options={GENRE_OPTIONS} value={r.genre.primary ?? ""} onChange={(v) => set({ genre: { ...r.genre, primary: v === "" ? null : v } })} />
      </EditRow>
      <EditRow label="secondary genre" path="genre.secondary" {...row("genre2")}>
        <Select label="secondary genre" options={GENRE_OPTIONS} value={r.genre.secondary ?? ""} onChange={(v) => set({ genre: { ...r.genre, secondary: v === "" ? null : v } })} />
      </EditRow>
      <EditRow label="UPC" path="upc" {...row("upc")}>
        <Field label="UPC" value={r.upc ?? ""} maxLength={13} onChange={(v) => set({ upc: orNull(v) })} />
      </EditRow>
    </EditGroup>
  );
}

export function EditDetails({ props, focus }: { readonly props: StepProps; readonly focus: string | null }) {
  const { release: r, dispatch, track, setTrack, session } = props;
  const t = r.tracks[track];
  const set = (fields: ReleaseFields) => dispatch({ type: "patch", id: r.id, fields });
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: track, fields });
  const n = track + 1;
  return (
    <div className={s.editCols}>
      <ReleaseRows r={r} set={set} props={props} focus={focus} />
      {t !== undefined && (
        <EditGroup label={`People · track ${n}`} action={<TrackPick release={r} current={track} onPick={setTrack} />}>
          <EditRow label="songwriters" path={`track:${n}.songwriters`} session={session} focus={focus === `people:${n}`}>
            <ul className={s.editList}>
              {t.songwriters.map((w, k) => (
                <li key={k} className={s.editListRow}>
                  <Field label={`songwriter ${k + 1}`} value={w} placeholder="Jane Doe" onChange={(v) => patch({ songwriters: t.songwriters.map((x, j) => (j === k ? v : x)) })} />
                  <button type="button" className={s.x} aria-label={`remove songwriter ${w.trim() === "" ? k + 1 : w}`} onClick={() => patch({ songwriters: t.songwriters.filter((_, j) => j !== k) })}>
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button label="Add songwriter" size="sm" onPress={() => patch({ songwriters: [...t.songwriters, ""] })} />
          </EditRow>
          <EditRow label="credits" path={`track:${n}.credits`} session={session}>
            <ul className={s.editList}>
              {t.credits.map((c, k) => (
                <li key={k} className={s.editListRow}>
                  <Field label={`credit ${k + 1} name`} value={c.name} onChange={(v) => patch({ credits: t.credits.map((x, j) => (j === k ? { ...x, name: v } : x)) })} />
                  <Select label={`credit ${k + 1} role`} options={ROLE_OPTIONS} value={c.role} onChange={(v: CreditRole) => patch({ credits: t.credits.map((x, j) => (j === k ? { ...x, role: v } : x)) })} />
                  <button type="button" className={s.x} aria-label={`remove credit ${c.name.trim() === "" ? k + 1 : c.name}`} onClick={() => patch({ credits: t.credits.filter((_, j) => j !== k) })}>
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button label="Add credit" size="sm" onPress={() => patch({ credits: [...t.credits, { name: "", role: "performer" }] })} />
          </EditRow>
          <EditRow label="lyrics" path={`track:${n}.lyrics`} session={session}>
            <TextArea label={`track ${n} lyrics`} value={t.lyrics ?? ""} rows={8} onChange={(v) => patch({ lyrics: orNull(v) })} />
          </EditRow>
        </EditGroup>
      )}
    </div>
  );
}
