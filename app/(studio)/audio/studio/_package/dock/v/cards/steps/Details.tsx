"use client";

// DETAILS ON THE CARD: the release's metadata as value tiles - the title large, then artist, genres, date, language,
// version, label, UPC - each turning into its editor in place; a problem is its tile's edge and the agent's
// suggestion lands in its tile. Below, the people on each track, one line each.
import { Field, Select } from "@gt/ui/components/field/Field.tsx";
import { GENRES, type Genre } from "@gt/domain/release";
import type { ProposalPath } from "@gt/domain/release.record";

import type { ReleaseFields } from "../../../../../../_release/draft.ts";
import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOf, type StepProps } from "../../../../../../_release/wizard/steps.ts";
import { ISSUE_FIELD } from "../model.ts";
import { ValueTile } from "../ValueTile.tsx";
import { PeopleLines } from "./People.tsx";
import s from "./steps.module.css";

const GENRE_OPTIONS: readonly { readonly value: Genre | ""; readonly label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];

export function DetailsBody(props: StepProps) {
  const { release: r, problems, dispatch, session } = props;
  const set = (fields: ReleaseFields) => dispatch({ type: "patch", id: r.id, fields });
  const mine = problemsOf(problems, "details").filter((p) => p.at === "release");
  const issue = (field: string): "block" | "warn" | null => {
    const on = mine.filter((p) => ISSUE_FIELD[p.code] === field);
    return on.some((p) => p.severity === "block") ? "block" : on.length > 0 ? "warn" : null;
  };
  const tile = (path: ProposalPath) => ({ path, suggested: session.pending.some((p) => p.path === path), issue: issue(path) });
  return (
    <div className={s.body}>
      <div className={s.tiles}>
        <ValueTile label="title" value={r.title.trim() === "" ? null : r.title} size="hero" span={2} {...tile("title")} editor={<Field label="release title" value={r.title} onChange={(v) => set({ title: v })} />} />
        <ValueTile label="artist" value={r.artist.trim() === "" ? null : r.artist} {...tile("artist")} editor={<Field label="artist" value={r.artist} onChange={(v) => set({ artist: v })} />} />
        <ValueTile
          label="primary genre"
          value={r.genre.primary}
          {...tile("genre.primary")}
          editor={<Select label="primary genre" options={GENRE_OPTIONS} value={r.genre.primary ?? ""} onChange={(v) => set({ genre: { ...r.genre, primary: v === "" ? null : v } })} />}
        />
        <ValueTile
          label="secondary genre"
          value={r.genre.secondary}
          {...tile("genre.secondary")}
          editor={<Select label="secondary genre" options={GENRE_OPTIONS} value={r.genre.secondary ?? ""} onChange={(v) => set({ genre: { ...r.genre, secondary: v === "" ? null : v } })} />}
        />
        <ValueTile label="release date" value={r.releaseDate} {...tile("releaseDate")} editor={<Field label="release date" value={r.releaseDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set({ releaseDate: orNull(v) })} />} />
        <ValueTile label="language" value={r.language} {...tile("language")} editor={<Field label="language" value={r.language} placeholder="en" maxLength={35} onChange={(v) => set({ language: v })} />} />
        <ValueTile label="version" value={r.version} {...tile("version")} editor={<Field label="release version" value={r.version ?? ""} onChange={(v) => set({ version: orNull(v) })} />} />
        <ValueTile label="label" value={r.label} {...tile("label")} editor={<Field label="record label" value={r.label ?? ""} onChange={(v) => set({ label: orNull(v) })} />} />
        <ValueTile label="UPC" value={r.upc} {...tile("upc")} editor={<Field label="UPC" value={r.upc ?? ""} maxLength={13} onChange={(v) => set({ upc: orNull(v) })} />} />
      </div>
      {r.tracks.length > 0 && (
        <section className={s.sub} aria-label="people">
          <span className={s.k}>people</span>
          <PeopleLines {...props} />
        </section>
      )}
    </div>
  );
}
