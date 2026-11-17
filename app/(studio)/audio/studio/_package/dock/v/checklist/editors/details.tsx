"use client";

// The Details items' editors, in the dialog (prototype dock-package, round 2, variant "checklist"): the release's
// fields in labelled cells, and per track the people on it - songwriters, credits, lyrics.
import type { ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CREDIT_ROLES, GENRES, type CreditRole, type Genre } from "@gt/domain/release";

import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { setRelease, setTrack, type EditorProps } from "./types.ts";
import e from "./editors.module.css";

const GENRE_OPTIONS: readonly { readonly value: Genre | ""; readonly label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];
const ROLE_OPTIONS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

/** A labelled cell: the field's one-word label above it (kit candidate `Cell`). */
export function Cell({ k, children, wide }: { readonly k: string; readonly children: ReactNode; readonly wide?: boolean }) {
  return (
    <label className={e.cell} data-w={wide === true ? "wide" : undefined}>
      <span className={e.k}>{k}</span>
      {children}
    </label>
  );
}

export function TitleEditor(p: EditorProps) {
  const set = setRelease(p);
  return (
    <div className={e.form}>
      <Cell k="title" wide>
        <Field label="release title" value={p.r.title} onChange={(v) => set({ title: v })} />
      </Cell>
      <Cell k="version" wide>
        <Field label="release version" value={p.r.version ?? ""} onChange={(v) => set({ version: orNull(v) })} />
      </Cell>
    </div>
  );
}

export function ArtistEditor(p: EditorProps) {
  const set = setRelease(p);
  return (
    <div className={e.form}>
      <Cell k="artist" wide>
        <Field label="artist" value={p.r.artist} onChange={(v) => set({ artist: v })} />
      </Cell>
      <Cell k="label" wide>
        <Field label="record label" value={p.r.label ?? ""} onChange={(v) => set({ label: orNull(v) })} />
      </Cell>
    </div>
  );
}

export function GenreEditor(p: EditorProps) {
  const set = setRelease(p);
  const g = p.r.genre;
  return (
    <div className={e.form}>
      <Cell k="primary">
        <Select label="primary genre" options={GENRE_OPTIONS} value={g.primary ?? ""} onChange={(v) => set({ genre: { ...g, primary: v === "" ? null : v } })} />
      </Cell>
      <Cell k="secondary">
        <Select label="secondary genre" options={GENRE_OPTIONS} value={g.secondary ?? ""} onChange={(v) => set({ genre: { ...g, secondary: v === "" ? null : v } })} />
      </Cell>
    </div>
  );
}

export function DateEditor(p: EditorProps) {
  const set = setRelease(p);
  return (
    <div className={e.form}>
      <Cell k="release date">
        <Field label="release date" value={p.r.releaseDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set({ releaseDate: orNull(v) })} />
      </Cell>
      <Cell k="language">
        <Field label="language" value={p.r.language} placeholder="en" maxLength={35} onChange={(v) => set({ language: v })} />
      </Cell>
      <Cell k="UPC" wide>
        <Field label="UPC" value={p.r.upc ?? ""} maxLength={13} onChange={(v) => set({ upc: orNull(v) })} />
      </Cell>
    </div>
  );
}

function Remove({ name, onPress }: { readonly name: string; readonly onPress: () => void }) {
  return (
    <button type="button" className={e.remove} aria-label={`remove ${name}`} onClick={onPress}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function SongwritersEditor(p: EditorProps) {
  const t = p.r.tracks[p.track];
  if (t === undefined) return null;
  const patch = setTrack(p);
  const ws = t.songwriters;
  return (
    <div className={e.stack}>
      <ul className={e.lines}>
        {ws.map((w, k) => (
          <li key={k} className={e.line}>
            <Field label={`songwriter ${k + 1}`} value={w} placeholder="Jane Doe" onChange={(v) => patch({ songwriters: ws.map((x, j) => (j === k ? v : x)) })} />
            <Remove name={`songwriter ${w.trim() === "" ? k + 1 : w}`} onPress={() => patch({ songwriters: ws.filter((_, j) => j !== k) })} />
          </li>
        ))}
      </ul>
      <span>
        <Button label="Add songwriter" size="sm" onPress={() => patch({ songwriters: [...ws, ""] })} />
      </span>
    </div>
  );
}

export function CreditsEditor(p: EditorProps) {
  const t = p.r.tracks[p.track];
  if (t === undefined) return null;
  const patch = setTrack(p);
  const set = (k: number, f: Partial<{ name: string; role: CreditRole }>) => patch({ credits: t.credits.map((c, j) => (j === k ? { ...c, ...f } : c)) });
  return (
    <div className={e.stack}>
      <ul className={e.lines}>
        {t.credits.map((c, k) => (
          <li key={k} className={e.line} data-cols="3">
            <Field label={`credit ${k + 1} name`} value={c.name} onChange={(v) => set(k, { name: v })} />
            <Select label={`credit ${k + 1} role`} options={ROLE_OPTIONS} value={c.role} onChange={(v) => set(k, { role: v })} />
            <Remove name={`credit ${c.name.trim() === "" ? k + 1 : c.name}`} onPress={() => patch({ credits: t.credits.filter((_, j) => j !== k) })} />
          </li>
        ))}
      </ul>
      <span>
        <Button label="Add credit" size="sm" onPress={() => patch({ credits: [...t.credits, { name: "", role: "performer" }] })} />
      </span>
    </div>
  );
}

export function LyricsEditor(p: EditorProps) {
  const t = p.r.tracks[p.track];
  if (t === undefined) return null;
  return <TextArea label={`track ${p.track + 1} lyrics`} value={t.lyrics ?? ""} rows={12} onChange={(v) => setTrack(p)({ lyrics: orNull(v) })} />;
}
