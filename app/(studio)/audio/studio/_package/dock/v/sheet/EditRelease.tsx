"use client";

// THE RELEASE'S EDITORS (variant "sheet"): the Details step's Release section and the Sleeve step's Prompt section, as
// the dialog draws them. Every keystroke is an event on the draft (`patch`), so the sheet behind the scrim is already
// right when the dialog closes; no field is held here.
import type { ReactNode } from "react";

import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { GENRES, type Genre, type Release } from "@gt/domain/release";

import type { DraftEvent, ReleaseFields } from "../../../../../_release/draft.ts";
import { orNull } from "../../../../../_release/wizard/fmt.ts";
import s from "./dialog.module.css";

const GENRE_OPTIONS: readonly { readonly value: Genre | ""; readonly label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];

interface Props {
  readonly r: Release;
  readonly dispatch: (e: DraftEvent) => void;
}

export function Cell({ k, wide, children }: { readonly k: string; readonly wide?: boolean; readonly children: ReactNode }) {
  return (
    <label className={s.cell} data-w={wide === true ? "wide" : undefined}>
      <span className={s.k}>{k}</span>
      {children}
    </label>
  );
}

export function EditRelease({ r, dispatch }: Props) {
  const set = (fields: ReleaseFields) => dispatch({ type: "patch", id: r.id, fields });
  return (
    <div className={s.form}>
      <Cell k="title" wide>
        <Field label="release title" value={r.title} onChange={(v) => set({ title: v })} />
      </Cell>
      <Cell k="version">
        <Field label="release version" value={r.version ?? ""} onChange={(v) => set({ version: orNull(v) })} />
      </Cell>
      <Cell k="artist">
        <Field label="artist" value={r.artist} onChange={(v) => set({ artist: v })} />
      </Cell>
      <Cell k="label">
        <Field label="record label" value={r.label ?? ""} onChange={(v) => set({ label: orNull(v) })} />
      </Cell>
      <Cell k="release date">
        <Field label="release date" value={r.releaseDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set({ releaseDate: orNull(v) })} />
      </Cell>
      <Cell k="primary genre">
        <Select label="primary genre" options={GENRE_OPTIONS} value={r.genre.primary ?? ""} onChange={(v) => set({ genre: { ...r.genre, primary: v === "" ? null : v } })} />
      </Cell>
      <Cell k="secondary genre">
        <Select label="secondary genre" options={GENRE_OPTIONS} value={r.genre.secondary ?? ""} onChange={(v) => set({ genre: { ...r.genre, secondary: v === "" ? null : v } })} />
      </Cell>
      <Cell k="language">
        <Field label="language" value={r.language} placeholder="en" maxLength={35} onChange={(v) => set({ language: v })} />
      </Cell>
      <Cell k="UPC">
        <Field label="UPC" value={r.upc ?? ""} maxLength={13} onChange={(v) => set({ upc: orNull(v) })} />
      </Cell>
    </div>
  );
}

export function EditPrompt({ r, dispatch }: Props) {
  return <TextArea label="sleeve prompt" value={r.sleevePrompt ?? ""} rows={6} onChange={(v) => dispatch({ type: "patch", id: r.id, fields: { sleevePrompt: orNull(v) } })} />;
}
