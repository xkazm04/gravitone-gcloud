"use client";

// The desk's centre: the release sheet. Its head (title, artist, kind, status, length), the
// release fields a store's upload form asks for, then the tracks - each one unfolds in place into
// its fields, its AI credits and rights record, and its master.
import type { Dispatch } from "react";

import { GENRES, releaseKind, type Genre, type Release } from "@gt/domain/release";
import type { ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Field, Select } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import type { ReleaseRead } from "../../_port/port.ts";
import type { DraftEvent, ReleaseFields } from "../../draft.ts";
import { Cell } from "./Cell.tsx";
import { KIND_LABEL, STATUS_TONE, clock, orNull, worst } from "./fmt.ts";
import { TrackRow } from "./TrackRow.tsx";
import s from "./desk.module.css";
import t from "./sheet.module.css";

export type SheetProps = {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly read: ReleaseRead;
  readonly dispatch: Dispatch<DraftEvent>;
  readonly unfolded: ReadonlySet<string>;
  readonly onFold: (takeId: string, open: boolean) => void;
  readonly onMaster: (index: number) => void;
  readonly onMasterAll: () => void;
};

const TITLE: readonly ProblemCode[] = ["title-missing", "title-has-feat", "title-has-version", "title-all-caps"];

type GenreOpt = Genre | "";
const GENRE_OPTIONS: readonly { value: GenreOpt; label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];
const genreOf = (v: GenreOpt): Genre | null => (v === "" ? null : v);

export function Sheet({ release: r, problems, read, dispatch, unfolded, onFold, onMaster, onMasterAll }: SheetProps) {
  const patch = (fields: ReleaseFields) => dispatch({ type: "patch", id: r.id, fields });
  const own = problems.filter((p) => p.at === "release");
  const mark = (codes: readonly ProblemCode[]) => worst(own, codes);
  const length = r.tracks.reduce((n, x) => n + x.durationS, 0);
  const unmastered = r.tracks.filter((x) => x.master.state === "none" || x.master.state === "failed").length;
  const running = r.tracks.some((x) => x.master.state === "running");
  const n = r.tracks.length;

  return (
    <section className={s.col} aria-label="release sheet">
      <div className={s.colBody}>
        <header className={t.head}>
          <h2 className={t.title}>{r.title.trim() === "" ? "untitled" : r.title}</h2>
          {r.version !== null && <span className={t.version}>{r.version}</span>}
          <span className={t.artist}>{r.artist.trim() === "" ? "no artist" : r.artist}</span>
          <span className={t.headChips}>
            <Chip label={KIND_LABEL[releaseKind(r.tracks)]} tone="cyan" />
            <Chip label={r.status} tone={STATUS_TONE[r.status]} dot />
            <Chip label="tracks" value={n} />
            <Chip label="length" value={clock(length)} />
            <Chip label={r.id} casing="lower" ghost />
          </span>
        </header>

        <div id="desk-release" tabIndex={-1} className={t.fields} aria-label="release fields" role="group">
          <Cell label="title" mark={mark(TITLE)} span={2}>
            <Field label="release title" value={r.title} onChange={(v) => patch({ title: v })} />
          </Cell>
          <Cell label="version">
            <Field label="release version" value={r.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
          </Cell>
          <Cell label="artist" mark={mark(["artist-missing"])}>
            <Field label="artist" value={r.artist} onChange={(v) => patch({ artist: v })} />
          </Cell>
          <Cell label="label">
            <Field label="record label" value={r.label ?? ""} onChange={(v) => patch({ label: orNull(v) })} />
          </Cell>
          <Cell label="release date" mark={mark(["release-date-malformed"])}>
            <Field label="release date" value={r.releaseDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => patch({ releaseDate: orNull(v) })} />
          </Cell>
          <Cell label="language">
            <Field label="language" value={r.language} placeholder="en" maxLength={12} onChange={(v) => patch({ language: v })} />
          </Cell>
          <Cell label="UPC" mark={mark(["upc-malformed"])}>
            <Field label="UPC" value={r.upc ?? ""} maxLength={13} onChange={(v) => patch({ upc: orNull(v) })} />
          </Cell>
          <Cell label="primary genre" mark={mark(["genre-missing"])} span={2}>
            <Select<GenreOpt> label="primary genre" options={GENRE_OPTIONS} value={r.genre.primary ?? ""} onChange={(v) => patch({ genre: { ...r.genre, primary: genreOf(v) } })} />
          </Cell>
          <Cell label="secondary genre" span={2}>
            <Select<GenreOpt> label="secondary genre" options={GENRE_OPTIONS} value={r.genre.secondary ?? ""} onChange={(v) => patch({ genre: { ...r.genre, secondary: genreOf(v) } })} />
          </Cell>
        </div>

        <div className={t.tracksHead}>
          <CapsHeading text="tracks" tally={{ value: n }} level={3} />
          <Button
            label="Master all"
            size="sm"
            tone="cyan"
            pending={running}
            disabled={unmastered === 0}
            tally={{ value: unmastered, label: "unmastered" }}
            onPress={onMasterAll}
          />
        </div>
        {n === 0 ? (
          <div className={t.noTracks}>
            <Empty label="no tracks" />
          </div>
        ) : (
          <ol className={t.tracks}>
            {r.tracks.map((x, i) => (
              <TrackRow
                key={x.takeId}
                release={r}
                track={x}
                index={i}
                problems={problems.filter((p) => p.at === `track:${i + 1}`)}
                shelf={read.shelf}
                dispatch={dispatch}
                open={unfolded.has(x.takeId)}
                onFold={(o) => onFold(x.takeId, o)}
                onMaster={() => onMaster(i)}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
