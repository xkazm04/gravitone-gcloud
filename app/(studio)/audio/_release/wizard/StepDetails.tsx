"use client";

// Step 2, details: the release's metadata as a store's upload form asks for it, then the people on
// each track - songwriters by legal name, credits by role, the lyrics.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { CREDIT_ROLES, GENRES, type CreditRole, type Genre, type ReleaseTrack } from "@gt/domain/release";

import type { ReleaseFields, TrackFields } from "../draft.ts";
import type { ReleaseSessionApi } from "../session.ts";
import { orNull } from "./fmt.ts";
import { Problems } from "./Problems.tsx";
import { problemsOf, problemsOnTrack, type StepProps } from "./steps.ts";
import { Suggest } from "./Suggest.tsx";
import { TrackStrip } from "./TrackStrip.tsx";
import s from "./step.module.css";

const GENRE_OPTIONS: readonly { readonly value: Genre | ""; readonly label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];
const ROLE_OPTIONS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

function People({ t, i, patch, session }: { readonly t: ReleaseTrack; readonly i: number; readonly patch: (f: TrackFields) => void; readonly session: ReleaseSessionApi }) {
  const writers = t.songwriters;
  const setWriter = (k: number, v: string) => patch({ songwriters: writers.map((w, j) => (j === k ? v : w)) });
  const setCredit = (k: number, f: Partial<{ name: string; role: CreditRole }>) => patch({ credits: t.credits.map((c, j) => (j === k ? { ...c, ...f } : c)) });
  return (
    <div className={s.people}>
      <section className={s.section} aria-label={`track ${i + 1} songwriters`}>
        <CapsHeading text="Songwriters" tally={{ value: writers.filter((w) => w.trim() !== "").length }} variant="section" />
        <Suggest path={`track:${i + 1}.songwriters`} session={session} />
        <ul className={s.list}>
          {writers.map((w, k) => (
            <li key={k} className={s.listRow}>
              <Field label={`songwriter ${k + 1}`} value={w} placeholder="Jane Doe" onChange={(v) => setWriter(k, v)} />
              <button type="button" className={s.iconBtn} data-tone="rose" aria-label={`remove songwriter ${w.trim() === "" ? k + 1 : w}`} onClick={() => patch({ songwriters: writers.filter((_, j) => j !== k) })}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <Button label="Add songwriter" size="sm" onPress={() => patch({ songwriters: [...writers, ""] })} />
      </section>
      <section className={s.section} aria-label={`track ${i + 1} credits`}>
        <CapsHeading text="Credits" tally={{ value: t.credits.length }} variant="section" />
        <Suggest path={`track:${i + 1}.credits`} session={session} />
        <ul className={s.list}>
          {t.credits.map((c, k) => (
            <li key={k} className={s.listRow}>
              <Field label={`credit ${k + 1} name`} value={c.name} onChange={(v) => setCredit(k, { name: v })} />
              <Select label={`credit ${k + 1} role`} options={ROLE_OPTIONS} value={c.role} onChange={(v) => setCredit(k, { role: v })} />
              <button type="button" className={s.iconBtn} data-tone="rose" aria-label={`remove credit ${c.name.trim() === "" ? k + 1 : c.name}`} onClick={() => patch({ credits: t.credits.filter((_, j) => j !== k) })}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <Button label="Add credit" size="sm" onPress={() => patch({ credits: [...t.credits, { name: "", role: "performer" }] })} />
      </section>
      <section className={s.section} data-w="full" aria-label={`track ${i + 1} lyrics`}>
        <CapsHeading text="Lyrics" variant="section" />
        <Suggest path={`track:${i + 1}.lyrics`} session={session} />
        <TextArea label={`track ${i + 1} lyrics`} value={t.lyrics ?? ""} rows={8} onChange={(v) => patch({ lyrics: orNull(v) })} />
      </section>
    </div>
  );
}

export function StepDetails(props: StepProps) {
  const { release: r, problems, dispatch, track, setTrack, session } = props;
  const set = (fields: ReleaseFields) => dispatch({ type: "patch", id: r.id, fields });
  const t = r.tracks[track];
  return (
    <div className={s.stack}>
      <section className={s.section} aria-label="release">
        <CapsHeading text="Release" variant="section" />
        <div className={s.form}>
          <label className={s.cell} data-w="wide">
            <span className={s.k}>title</span>
            <Field label="release title" value={r.title} onChange={(v) => set({ title: v })} />
            <Suggest path="title" session={session} />
          </label>
          <label className={s.cell}>
            <span className={s.k}>version</span>
            <Field label="release version" value={r.version ?? ""} onChange={(v) => set({ version: orNull(v) })} />
            <Suggest path="version" session={session} />
          </label>
          <label className={s.cell}>
            <span className={s.k}>artist</span>
            <Field label="artist" value={r.artist} onChange={(v) => set({ artist: v })} />
            <Suggest path="artist" session={session} />
          </label>
          <label className={s.cell}>
            <span className={s.k}>label</span>
            <Field label="record label" value={r.label ?? ""} onChange={(v) => set({ label: orNull(v) })} />
            <Suggest path="label" session={session} />
          </label>
          <label className={s.cell}>
            <span className={s.k}>release date</span>
            <Field label="release date" value={r.releaseDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set({ releaseDate: orNull(v) })} />
            <Suggest path="releaseDate" session={session} />
          </label>
          <label className={s.cell}>
            <span className={s.k}>language</span>
            <Field label="language" value={r.language} placeholder="en" maxLength={35} onChange={(v) => set({ language: v })} />
            <Suggest path="language" session={session} />
          </label>
          <label className={s.cell}>
            <span className={s.k}>primary genre</span>
            <Select label="primary genre" options={GENRE_OPTIONS} value={r.genre.primary ?? ""} onChange={(v) => set({ genre: { ...r.genre, primary: v === "" ? null : v } })} />
            <Suggest path="genre.primary" session={session} />
          </label>
          <label className={s.cell}>
            <span className={s.k}>secondary genre</span>
            <Select label="secondary genre" options={GENRE_OPTIONS} value={r.genre.secondary ?? ""} onChange={(v) => set({ genre: { ...r.genre, secondary: v === "" ? null : v } })} />
            <Suggest path="genre.secondary" session={session} />
          </label>
          <label className={s.cell}>
            <span className={s.k}>UPC</span>
            <Field label="UPC" value={r.upc ?? ""} maxLength={13} onChange={(v) => set({ upc: orNull(v) })} />
            <Suggest path="upc" session={session} />
          </label>
        </div>
        <Problems problems={problemsOf(problems, "details").filter((p) => p.at === "release")} label="release problems" />
      </section>
      {t !== undefined && (
        <section className={s.section} aria-label="people on each track">
          <CapsHeading text="People" variant="section" />
          <TrackStrip tracks={r.tracks} problems={problems} pending={session.pending} step="details" current={track} onPick={setTrack} />
          <Problems problems={problemsOnTrack(problems, "details", track)} label={`track ${track + 1} problems`} />
          <People t={t} i={track} session={session} patch={(fields) => dispatch({ type: "patchTrack", id: r.id, index: track, fields })} />
        </section>
      )}
    </div>
  );
}
