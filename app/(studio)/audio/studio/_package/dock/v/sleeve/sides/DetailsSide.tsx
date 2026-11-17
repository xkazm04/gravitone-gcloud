"use client";

// Side A2, the credits: the catalogue block a sleeve prints (title, version, artist, label, date, language, genre, UPC)
// as terms over printed values, blanks where nothing is written; then the people on each track the way liner notes
// credit them - written by, the credits by role, the lyric sheet's length. A field opens the catalogue card; a track
// opens its people card.
import { useState } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { Release } from "@gt/domain/release";

import { pendingIn } from "../../../../../../_release/pending.ts";
import { day } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOf, problemsOnTrack } from "../../../../../../_release/wizard/steps.ts";
import { FIELD_OF_CODE, linesOf, worst, type SideProps } from "../liner.ts";
import { PencilMark, Printed, ProblemDot, ValueOr, WriteIn, type Face } from "../Print.tsx";
import { DetailsCard } from "./DetailsCard.tsx";
import { PeopleCard } from "./PeopleCard.tsx";
import s from "./side.module.css";

interface Entry {
  readonly path: string;
  readonly term: string;
  readonly value: string | null;
  readonly face: Face;
}

const entries = (r: Release): readonly Entry[] => [
  { path: "title", term: "title", value: r.title, face: "serif" },
  { path: "version", term: "version", value: r.version, face: "serif" },
  { path: "artist", term: "artist", value: r.artist, face: "serif" },
  { path: "label", term: "label", value: r.label, face: "serif" },
  { path: "releaseDate", term: "out", value: r.releaseDate === null ? null : day(r.releaseDate), face: "mono" },
  { path: "language", term: "language", value: r.language, face: "mono" },
  { path: "genre.primary", term: "genre", value: r.genre.primary, face: "serif" },
  { path: "genre.secondary", term: "second genre", value: r.genre.secondary, face: "serif" },
  { path: "upc", term: "UPC", value: r.upc, face: "mono" },
];

export function DetailsSide(side: SideProps) {
  const { release: r, problems, session } = side;
  const [catalogue, setCatalogue] = useState(false);
  const [people, setPeople] = useState<number | null>(null);
  const atRelease = problemsOf(problems, "details").filter((p) => p.at === "release");
  const notes = pendingIn(session.pending, "details");
  return (
    <div className={s.side}>
      <section className={s.block} aria-label="catalogue">
        <h3 className={s.blockHead}>catalogue</h3>
        <ul className={s.terms}>
          {entries(r).map((e) => {
            const level = worst(atRelease.filter((p) => FIELD_OF_CODE[p.code] === e.path));
            const pencilled = notes.filter((p) => p.path === e.path).length;
            return (
              <li key={e.path}>
                <button type="button" className={s.term} onClick={() => setCatalogue(true)}>
                  <span className={s.termName}>
                    {e.term}
                    <ProblemDot level={level} />
                    {pencilled > 0 && <PencilMark />}
                  </span>
                  <ValueOr value={e.value} what={e.term} face={e.face} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={s.block} aria-label="people on each track">
        <h3 className={s.blockHead}>credits</h3>
        <ol className={s.credits}>
          {r.tracks.map((t, i) => {
            const writers = t.songwriters.filter((w) => w.trim() !== "");
            const lines = linesOf(t.lyrics);
            const pencilled = notes.filter((p) => p.path.startsWith(`track:${i + 1}.`)).length;
            return (
              <li key={t.takeId}>
                <button type="button" className={s.credit} onClick={() => setPeople(i)}>
                  <span className={s.no}>{i + 1}</span>
                  <span className={s.creditBody}>
                    <span className={s.creditTitle}>
                      <Printed text={t.title.trim() === "" ? `track ${i + 1}` : t.title} />
                      <ProblemDot level={worst(problemsOnTrack(problems, "details", i))} />
                      {pencilled > 0 && <PencilMark say={`${pencilled} pencilled`} />}
                    </span>
                    <span className={s.creditLine}>
                      <span className={s.creditRole}>written by</span>
                      {writers.length === 0 ? <WriteIn what="songwriters" /> : <Printed text={writers.join(", ")} face="sans" />}
                    </span>
                    {t.credits.length > 0 && (
                      <span className={s.chips}>
                        {t.credits.map((c, k) => (
                          <Chip key={k} label={c.role} value={c.name.trim() === "" ? "—" : c.name} casing="lower" />
                        ))}
                      </span>
                    )}
                  </span>
                  <span className={s.creditSide}>{lines > 0 ? <Chip label="lyrics" value={lines} casing="lower" /> : <Chip label="no lyrics" ghost casing="lower" />}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <DetailsCard open={catalogue} onClose={() => setCatalogue(false)} side={side} />
      <PeopleCard index={people} onClose={() => setPeople(null)} side={side} />
    </div>
  );
}
