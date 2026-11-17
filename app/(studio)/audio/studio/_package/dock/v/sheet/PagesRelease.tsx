"use client";

// THE SHEET'S FIRST TWO PAGES (variant "sheet"): Tracks - the running order set as a table, and how much of the shelf
// is not on the release - and Details - the release's metadata, then the people on the track being read.
import { releaseKind } from "@gt/domain/release";

import type { StepProps } from "../../../../../_release/wizard/steps.ts";
import { clock, day, db, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import type { SectionId } from "./model.ts";
import { SheetLines, SheetSection, SheetTable, TrackTabs, Value } from "./Sheet.tsx";
import s from "./sheet.module.css";

export interface PageProps {
  readonly props: StepProps;
  readonly onEdit: (section: SectionId) => void;
}

export function TracksPage({ props, onEdit }: PageProps) {
  const { release: r, read } = props;
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  const onRelease = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !onRelease.has(t.takeId)).length;
  return (
    <div className={s.page}>
      <SheetSection id="list" title="Tracks" aside={`${KIND_LABEL[releaseKind(r.tracks)]} · ${clock(total)}`} {...(r.tracks.length > 0 ? { onEdit: () => onEdit("list") } : {})}>
        {r.tracks.length === 0 ? (
          <SheetLines lines={[{ k: "tracks", v: null }]} />
        ) : (
          <SheetTable
            label="tracks in release order"
            head={["#", "title", "length", "loudness", "ISRC", ""]}
            rows={r.tracks.map((t, i) => {
              const take = read.shelf.find((x) => x.takeId === t.takeId);
              return {
                key: t.takeId,
                cells: [
                  i + 1,
                  <span key="title">
                    <Value v={t.title} />
                    {t.version !== null && <span className={s.sub}>{t.version}</span>}
                    {t.audioHref === null && <span className={s.sub}>no audio</span>}
                  </span>,
                  clock(t.durationS),
                  take === undefined || take.lufs === null ? <Value key="lufs" v={null} /> : `${db(take.lufs)} LUFS`,
                  <Value key="isrc" v={t.isrc} />,
                  t.explicit ? "explicit" : "clean",
                ],
              };
            })}
          />
        )}
      </SheetSection>
      <SheetSection id="shelf" title="Shelf" edit="Add" onEdit={() => onEdit("shelf")}>
        <SheetLines lines={[{ k: "not on the release", v: `${rest} ${rest === 1 ? "take" : "takes"}` }]} />
      </SheetSection>
    </div>
  );
}

export function DetailsPage({ props, onEdit }: PageProps) {
  const { release: r, track, setTrack } = props;
  const t = r.tracks[track];
  const lyricLines = t?.lyrics?.split("\n").filter((l) => l.trim() !== "").length ?? 0;
  return (
    <div className={s.page}>
      <SheetSection id="release" title="Release" onEdit={() => onEdit("release")}>
        <SheetLines
          lines={[
            { k: "title", v: r.title, wide: true },
            { k: "version", v: r.version },
            { k: "artist", v: r.artist },
            { k: "label", v: r.label },
            { k: "release date", v: r.releaseDate === null ? null : day(r.releaseDate) },
            { k: "language", v: r.language },
            { k: "UPC", v: r.upc, code: true },
            { k: "primary genre", v: r.genre.primary },
            { k: "secondary genre", v: r.genre.secondary },
          ]}
        />
      </SheetSection>
      {t !== undefined && (
        <SheetSection id="people" title="People" onEdit={() => onEdit("people")}>
          <TrackTabs titles={r.tracks.map((x) => x.title)} current={track} onPick={setTrack} />
          <SheetLines
            cols={2}
            lines={[
              { k: "songwriters", v: t.songwriters.filter((w) => w.trim() !== "").join(", "), wide: true },
              { k: "credits", v: t.credits.map((c) => `${c.name.trim() === "" ? "—" : c.name} · ${c.role}`).join(", "), wide: true },
              { k: "lyrics", v: lyricLines === 0 ? null : `${lyricLines} lines` },
            ]}
          />
        </SheetSection>
      )}
    </div>
  );
}
