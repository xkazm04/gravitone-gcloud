// A pile at the Weir (prototype index.html `Pile`, `PileFace`, `CoverFace`; floor.css
// `[data-component=Pile]`, `.pile-face`, `.sheet-l`): a stacked face in its medium's form, the
// title, how far the operator is through it, and which desk it opens. The NEXT pile - the
// oldest thing waiting on the operator - wears the amber ring.
//
// FACES. An article is paper (its title set on the top sheet), audio with known peaks is three
// waveform sheets, and every other pile draws the prototype's designed face - the source and the
// run id - because v1's Weir item names no cover and no peaks (lib/ledger/v1 WeirItem), and the
// prototype's own rule for a pile with no readable cover was "a pile's own data, never a blank".
// The face that draws a cover is added with the data that feeds it.
//
// THE RAIL. v1 counts a pile's decided items but not how they split (lib/ledger/v1 WeirItem
// `decided`), so the rail is decided against pending - a solid run and the hatch - not the
// kept/rejected StackBar, which would have to invent the split.
//
// A pile is a link to its packet's Board (`href`); `onOpen` lets the page route a plain click
// itself (a client navigation the Board sheet intercepts) while modified clicks keep the
// browser's own meaning.

import type { MouseEvent } from "react";
import type { MediaLane } from "@gt/domain/lane";

import { cx } from "../cx.ts";
import { Tally } from "../tally/Tally.tsx";
import { vars } from "../vars.ts";
import { Wave } from "../wave/Wave.tsx";
import { FloorGlyph } from "./FloorGlyph.tsx";
import { MODE_NAME, type PileMode } from "./floor.ts";
import s from "./Pile.module.css";

export type PileProps = {
  readonly title: string;
  readonly media: MediaLane;
  readonly mode: PileMode;
  /** The v1 store the pile came from (`forge`, `dojo`): the designed face's first line. */
  readonly source: string;
  /** The run it holds: the designed face's second line. */
  readonly runId: string;
  readonly decided: number;
  readonly pending: number;
  readonly href: string;
  readonly next?: boolean;
  /** A plain left click; the page navigates. Absent, the link navigates itself. */
  readonly onOpen?: (href: string) => void;
  /** Its place in the column, for the arrival cascade. */
  readonly index?: number;
  /** Per-sheet peaks for an audio pile, when known. */
  readonly peaks?: readonly (readonly number[])[];
};

const plain = (e: MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export function pileName({ title, decided, pending, mode }: Pick<PileProps, "title" | "decided" | "pending" | "mode">): string {
  return `${title}, ${decided + pending} items, ${pending} pending, ${MODE_NAME[mode]}`;
}

export function Pile(props: PileProps) {
  const { title, mode, decided, pending, href, next = false, onOpen, index = 0 } = props;
  const total = decided + pending;
  return (
    <a
      className={cx(s.pile, next && s.next)}
      data-component="Pile"
      data-next={next ? "" : undefined}
      href={href}
      style={vars({ "--d": `${index * 70}ms` })}
      aria-label={`${next ? "next: " : ""}${pileName(props)}`}
      onClick={(e) => {
        if (onOpen === undefined || !plain(e)) return;
        e.preventDefault();
        onOpen(href);
      }}
    >
      <span className={s.face} aria-hidden="true">
        <span className={s.mode}>
          <FloorGlyph name={mode} className={s.modeMark} />
        </span>
        <Face {...props} />
        <span className={s.count}>
          <Tally value={total} />
        </span>
      </span>
      <span className={s.title}>{title}</span>
      <span className={s.rail} aria-hidden="true">
        <i className={s.decided} style={vars({ "--n": decided })} />
        <i className={s.pending} style={vars({ "--n": pending || (decided === 0 ? 1 : 0) })} />
      </span>
      <span className={s.sub}>
        {MODE_NAME[mode]}
        {decided > 0 && ` · ${decided}/${total}`}
      </span>
    </a>
  );
}

function Face({ media, title, source, runId, peaks }: PileProps) {
  if (media === "article") {
    return (
      <>
        <span className={cx(s.sheet, s.paper, s.l2)} />
        <span className={cx(s.sheet, s.paper, s.l1)} />
        <span className={cx(s.sheet, s.paper)}>
          <small className={s.paperKind}>{source}</small>
          <span className={s.paperTitle}>{title}</span>
        </span>
      </>
    );
  }
  // Waveform sheets only over peaks that were read: the Floor's Weir item carries none, and three
  // dashed midlines are a picture of nothing, so a bare audio pile wears the designed face.
  if (media === "audio" && peaks?.some((p) => p.length > 0) === true) {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx(s.sheet, s.wav, i === 0 && s.l2, i === 1 && s.l1)}>
            <Wave peaks={peaks?.[i] ?? []} width={96} height={34} tone="cyan" />
          </span>
        ))}
      </>
    );
  }
  return (
    <>
      <span className={cx(s.sheet, s.l2)} />
      <span className={cx(s.sheet, s.l1)} />
      <span className={cx(s.sheet, s.designed)}>
        <span className={s.fbKind}>{source}</span>
        <span className={s.fbId}>{runId}</span>
      </span>
    </>
  );
}
