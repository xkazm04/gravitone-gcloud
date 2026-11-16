"use client";

// The release sheet: a card opened in place. Its head is the record's own fields beside the sleeve;
// its rail is the seven sections a release is assembled through, each with its problems counted by
// severity; a problem anywhere jumps to the control that fixes it.
import { useEffect, useRef, useState, type ReactNode } from "react";

import { GENRES, releaseKind, type Genre, type Release, type ReleaseStatus } from "@gt/domain/release";
import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";
import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Field, Select } from "@gt/ui/components/field/Field.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";

import type { ReleaseRead } from "../../_port/port.ts";
import type { DraftEvent, ReleaseFields } from "../../draft.ts";
import { bySection, clock, jumpKey, kindLabel, orNull, SECTION_LABEL, SECTIONS, sectionOf, trackNo, type Section, type SectionProps } from "./board.ts";
import { SeverityChips, SleeveFace } from "./Card.tsx";
import { Channels } from "./Channels.tsx";
import { Extras } from "./Extras.tsx";
import { Master } from "./Master.tsx";
import { Review } from "./Review.tsx";
import { Rights } from "./Rights.tsx";
import { SleeveSection } from "./SleeveSection.tsx";
import { Tracks } from "./Tracks.tsx";
import s from "./sheet.module.css";

export function ProblemLine({ problem, onJump }: { readonly problem: ReleaseProblem; readonly onJump?: () => void }) {
  const body = (
    <>
      <Glyph name="warn" className={s.lineGlyph} />
      <SrOnly text={problem.severity === "block" ? "blocks: " : "warning: "} />
      <span>{PROBLEM_TEXT[problem.code]}</span>
    </>
  );
  return onJump === undefined ? (
    <span className={s.line} data-sev={problem.severity}>
      {body}
    </span>
  ) : (
    <button type="button" className={s.line} data-sev={problem.severity} onClick={onJump}>
      {body}
    </button>
  );
}

/** A labelled cell of a form grid; the field inside carries its own accessible name. */
export function Cell({ label, jump, wide = false, children }: { readonly label: string; readonly jump?: string; readonly wide?: boolean; readonly children: ReactNode }) {
  return (
    <label className={s.cell} data-jump={jump} data-wide={wide ? "" : undefined}>
      <span className={s.cellLabel} aria-hidden="true">
        {label}
      </span>
      {children}
    </label>
  );
}

const GENRE_OPTS: readonly { readonly value: Genre | ""; readonly label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];
const genreOf = (v: Genre | ""): Genre | null => (v === "" ? null : v);

function Head({ release: r, problems, dispatch, jump }: { readonly release: Release; readonly problems: readonly ReleaseProblem[]; readonly dispatch: (e: DraftEvent) => void; readonly jump: (p: ReleaseProblem) => void }) {
  const patch = (fields: ReleaseFields) => dispatch({ type: "patch", id: r.id, fields });
  return (
    <div className={s.fields}>
      <Cell label="title" jump="head:title" wide>
        <Field label="release title" value={r.title} onChange={(v) => patch({ title: v })} />
      </Cell>
      <Cell label="version">
        <Field label="release version" value={r.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
      </Cell>
      <Cell label="artist" jump="head:artist">
        <Field label="artist" value={r.artist} onChange={(v) => patch({ artist: v })} />
      </Cell>
      <Cell label="label">
        <Field label="label" value={r.label ?? ""} onChange={(v) => patch({ label: orNull(v) })} />
      </Cell>
      <Cell label="release date" jump="head:date">
        <Field label="release date" placeholder="YYYY-MM-DD" value={r.releaseDate ?? ""} onChange={(v) => patch({ releaseDate: orNull(v) })} />
      </Cell>
      <Cell label="language">
        <Field label="language" value={r.language} onChange={(v) => patch({ language: v })} />
      </Cell>
      <Cell label="genre" jump="head:genre">
        <Select label="primary genre" options={GENRE_OPTS} value={r.genre.primary ?? ""} onChange={(v) => patch({ genre: { ...r.genre, primary: genreOf(v) } })} />
      </Cell>
      <Cell label="second genre">
        <Select label="secondary genre" options={GENRE_OPTS} value={r.genre.secondary ?? ""} onChange={(v) => patch({ genre: { ...r.genre, secondary: genreOf(v) } })} />
      </Cell>
      <Cell label="UPC" jump="head:upc">
        <Field label="UPC" value={r.upc ?? ""} onChange={(v) => patch({ upc: orNull(v) })} />
      </Cell>
      {problems.length > 0 && (
        <div className={s.headLines}>
          {problems.map((p) => (
            <ProblemLine key={`${p.code}:${p.at}`} problem={p} onJump={() => jump(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

export interface SheetProps {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly column: ReleaseStatus;
  readonly read: ReleaseRead;
  readonly dispatch: (e: DraftEvent) => void;
  readonly onClose: () => void;
  readonly onShelf: () => void;
}

export function Sheet({ release: r, problems, column, read, dispatch, onClose, onShelf }: SheetProps) {
  const [section, setSection] = useState<Section>(r.tracks.length > 0 && (r.status === "scheduled" || problems.some((p) => p.severity === "block")) ? "review" : "tracks");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const target = useRef<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const counts = bySection(problems);

  const jump = (p: ReleaseProblem) => {
    const sec = sectionOf(p);
    if (sec !== "head") setSection(sec);
    const n = trackNo(p);
    if (n !== null && sec === "tracks") setExpanded(n - 1);
    target.current = jumpKey(p);
    setTick((t) => t + 1);
  };

  useEffect(() => {
    const key = target.current;
    if (key === null) return;
    target.current = null;
    const el = root.current?.querySelector<HTMLElement>(`[data-jump="${key}"]`);
    if (el === null || el === undefined) return;
    const control = el.matches("input,select,textarea,button") ? el : (el.querySelector<HTMLElement>("input,select,textarea,button") ?? el);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    control.focus({ preventScroll: true });
    el.setAttribute("data-flash", "");
    const t = window.setTimeout(() => el.removeAttribute("data-flash"), 1400);
    return () => window.clearTimeout(t);
  }, [tick]);

  const props: SectionProps = { release: r, problems, read, dispatch, jump };
  const total = r.tracks.reduce((n, t) => n + t.durationS, 0);
  const headProblems = problems.filter((p) => sectionOf(p) === "head");

  return (
    <article ref={root} className={s.sheet} data-col={column} aria-label={`${r.title || "untitled"} release`}>
      <header className={s.head}>
        <SleeveFace release={r} size="sheet" />
        <div className={s.headMain}>
          <div className={s.titleRow}>
            <h3 className={s.title}>{r.title || "untitled"}</h3>
            <Chip label={column} tone={column === "draft" ? "amber" : column === "ready" ? "emerald" : column === "scheduled" ? "violet" : "neutral"} />
            <span className={s.grow} />
            <Button label="close" size="sm" onPress={onClose} />
          </div>
          <div className={s.meta}>
            <span>{r.artist || "no artist"}</span>
            <span aria-hidden="true">·</span>
            <span>{kindLabel(releaseKind(r.tracks))}</span>
            <span aria-hidden="true">·</span>
            <span>{r.tracks.length === 1 ? "1 track" : `${r.tracks.length} tracks`}</span>
            <span aria-hidden="true">·</span>
            <span>{clock(total)}</span>
            <span className={s.metaId}>{r.id}</span>
          </div>
          <Head release={r} problems={headProblems} dispatch={dispatch} jump={jump} />
        </div>
      </header>
      <div className={s.body}>
        <nav className={s.rail} aria-label="release sections">
          {SECTIONS.map((k) => (
            <button key={k} type="button" className={s.railBtn} aria-pressed={k === section} onClick={() => setSection(k)}>
              <span className={s.railLabel}>{SECTION_LABEL[k]}</span>
              <span className={s.railChips}>
                <SeverityChips sev={counts[k]} quiet />
              </span>
            </button>
          ))}
        </nav>
        <section className={s.pane} aria-label={SECTION_LABEL[section]}>
          {section === "tracks" && <Tracks {...props} expanded={expanded} onExpand={setExpanded} onShelf={onShelf} />}
          {section === "rights" && <Rights {...props} />}
          {section === "sleeve" && <SleeveSection {...props} />}
          {section === "master" && <Master {...props} />}
          {section === "channels" && <Channels {...props} />}
          {section === "extras" && <Extras {...props} />}
          {section === "review" && <Review {...props} />}
        </section>
      </div>
    </article>
  );
}
