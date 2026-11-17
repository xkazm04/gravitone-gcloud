"use client";

// THE DETAILS EDITOR (prototype dock-package, "console"): the release's metadata as the stores' upload form asks for
// it, each field in its cell with the agent's signal under it, the release's rules in the store's words, then the
// people on each track (People.tsx). Every edit is a `patch` on the session; nothing is held here.
import { Field, Select } from "@gt/ui/components/field/Field.tsx";
import { GENRES, type Genre } from "@gt/domain/release";

import type { ReleaseFields } from "../../../../../../_release/draft.ts";
import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOf } from "../../../../../../_release/wizard/steps.ts";
import { Rules } from "../Rules.tsx";
import { Cell, Module } from "./Cell.tsx";
import { People } from "./People.tsx";
import type { EditorProps } from "./props.ts";
import s from "../editor.module.css";

const GENRE_OPTIONS: readonly { readonly value: Genre | ""; readonly label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];

export function DetailsEditor(props: EditorProps) {
  const { release: r, problems, dispatch, session, reduce } = props;
  const set = (fields: ReleaseFields) => dispatch({ type: "patch", id: r.id, fields });
  const c = { session, reduce };
  const filled = [r.title, r.version, r.artist, r.label, r.releaseDate, r.language, r.genre.primary, r.genre.secondary, r.upc].filter((v) => v !== null && v.trim() !== "").length;
  return (
    <div className={s.stack}>
      <Module label="release" count={`${filled}/9`}>
        <Rules problems={problemsOf(problems, "details").filter((p) => p.at === "release")} label="release rules" reduce={reduce} />
        <div className={s.grid}>
          <Cell field="title" label="title" path="title" wide {...c}>
            <Field label="release title" value={r.title} onChange={(v) => set({ title: v })} />
          </Cell>
          <Cell field="version" label="version" path="version" {...c}>
            <Field label="release version" value={r.version ?? ""} onChange={(v) => set({ version: orNull(v) })} />
          </Cell>
          <Cell field="artist" label="artist" path="artist" {...c}>
            <Field label="artist" value={r.artist} onChange={(v) => set({ artist: v })} />
          </Cell>
          <Cell field="label" label="label" path="label" {...c}>
            <Field label="record label" value={r.label ?? ""} onChange={(v) => set({ label: orNull(v) })} />
          </Cell>
          <Cell field="releaseDate" label="release date" path="releaseDate" {...c}>
            <Field label="release date" value={r.releaseDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set({ releaseDate: orNull(v) })} />
          </Cell>
          <Cell field="language" label="language" path="language" {...c}>
            <Field label="language" value={r.language} placeholder="en" maxLength={35} onChange={(v) => set({ language: v })} />
          </Cell>
          <Cell field="genre.primary" label="primary genre" path="genre.primary" {...c}>
            <Select label="primary genre" options={GENRE_OPTIONS} value={r.genre.primary ?? ""} onChange={(v) => set({ genre: { ...r.genre, primary: v === "" ? null : v } })} />
          </Cell>
          <Cell field="genre.secondary" label="secondary genre" path="genre.secondary" {...c}>
            <Select label="secondary genre" options={GENRE_OPTIONS} value={r.genre.secondary ?? ""} onChange={(v) => set({ genre: { ...r.genre, secondary: v === "" ? null : v } })} />
          </Cell>
          <Cell field="upc" label="UPC" path="upc" {...c}>
            <Field label="UPC" value={r.upc ?? ""} maxLength={13} onChange={(v) => set({ upc: orNull(v) })} />
          </Cell>
        </div>
      </Module>
      <People {...props} />
    </div>
  );
}
