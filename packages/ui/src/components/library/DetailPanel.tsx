// THE LIBRARY'S DETAIL (library.js `detHead`, `renderDetail`, `body`; library.css `.det`): a
// column with a head - the kind, where the item sits in the result (i / N), previous and next,
// and the close whose key is `]` - and a scrolling body the page composes from parts: preview,
// title, chips, facets, lineage, the kind's extras, acts. With nothing selected the body is the
// set's summary (SetSummary.tsx).
//
// The panel takes PARTS, never a paragraph: a section is a caps heading over structured
// content (CapsHeading's law), and nothing here narrates what the parts already show.

import type { ReactNode } from "react";

import { Chip } from "../chip/Chip.tsx";
import { FloorGlyph } from "../floor/FloorGlyph.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Keycap } from "../keycaps/Keycaps.tsx";
import type { TallyProps } from "../tally/Tally.tsx";
import { FaceView, type Face } from "./Face.tsx";
import { count } from "./library.ts";
import { LibraryGlyph, kindShort, type KindId } from "./LibraryGlyph.tsx";
import s from "./DetailPanel.module.css";

export type DetailPanelProps = {
  /** The selected item's kind, or `set` when nothing is selected. */
  readonly kind: KindId | "set";
  /** 0-based place in the result, when the item is in it. */
  readonly position?: { readonly index: number; readonly total: number };
  readonly onStep?: (delta: -1 | 1) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
};

export function DetailPanel({ kind, position, onStep, onClose, children }: DetailPanelProps) {
  return (
    <div className={s.panel} data-component="LibraryDetail">
      <div className={s.head}>
        <span className={s.kind}>
          <LibraryGlyph name={kind === "set" ? "all" : kind} className={s.kindMark} />
          <span>{kind === "set" ? "set" : kindShort(kind)}</span>
        </span>
        <span className={s.sp} />
        {position !== undefined && (
          <span className={s.pos}>
            {count(position.index + 1)} / {count(position.total)}
          </span>
        )}
        {onStep !== undefined && (
          <>
            <button type="button" className={s.nav} aria-label="previous item" onClick={() => onStep(-1)}>
              <FloorGlyph name="chevL" className={s.navMark} />
            </button>
            <button type="button" className={s.nav} aria-label="next item" onClick={() => onStep(1)}>
              <FloorGlyph name="chevR" className={s.navMark} />
            </button>
          </>
        )}
        <button type="button" className={s.close} aria-label="close detail" onClick={onClose}>
          <Keycap mode="library" verb="detail" size="sm" />
        </button>
      </div>
      <div className={s.body}>{children}</div>
    </div>
  );
}

/** A block of the detail under its caps heading, with the hairline after it (library.css `.det h4`). */
export function DetailSection({ title, tally, children }: { readonly title: string; readonly tally?: TallyProps; readonly children: ReactNode }) {
  return (
    <section className={s.section} aria-label={title}>
      <div className={s.h4}>
        <CapsHeading text={title} variant="section" level={4} {...(tally === undefined ? {} : { tally })} />
      </div>
      {children}
    </section>
  );
}

/** The item's name, its id and its date (library.css `.dtitle`, `.did`). */
export function DetailTitle({ title, id, date }: { readonly title: string; readonly id: string; readonly date: string | null }) {
  return (
    <>
      <h2 className={s.title}>{title}</h2>
      <div className={s.id}>
        {id}
        {date !== null && ` · ${date}`}
      </div>
    </>
  );
}

/** A row of chips under the title: kind, state, source, the marks. */
export function DetailChips({ children }: { readonly children: ReactNode }) {
  return <div className={s.chips}>{children}</div>;
}

export type FacetLine = {
  readonly group: string;
  readonly label: string;
  readonly values: readonly { readonly value: string; readonly label: string; readonly pressed: boolean }[];
};

/**
 * The item's vocabulary as doors (library.css `.fdl`): each value is a chip that adds itself to
 * the filter - the fastest way from one item to everything like it.
 */
export function DetailFacets({ lines, onPress }: { readonly lines: readonly FacetLine[]; readonly onPress: (group: string, value: string) => void }) {
  return (
    <dl className={s.facets}>
      {lines.map((l) => (
        <div key={l.group} className={s.facetLine}>
          <dt>{l.label}</dt>
          <dd>
            {l.values.map((v) => (
              <Chip key={v.value} label={v.label} casing="lower" tone={v.pressed ? "cyan" : "neutral"} pressed={v.pressed} onPress={() => onPress(l.group, v.value)} name={`${l.label}: ${v.label}${v.pressed ? ", in the filter" : ""}`} />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The item at the top of the detail (library.js `preview`): a clip or an export plays in place
 * (a motion clip muted and looping, as the prototype's poster-led strips did), anything else is
 * its face at preview size. Audio is not drawn here: the take's preview is the audio lane's
 * (L52 `AudioPreview`), which owns its one <audio> element and releases it on unmount.
 */
export function DetailPreview({ face, title, video }: { readonly face: Face; readonly title: string; readonly video?: { readonly src: string; readonly poster?: string; readonly loop: boolean } }) {
  if (video !== undefined) {
    return (
      <div className={s.preview}>
        <video className={s.video} src={video.src} poster={video.poster} controls muted={video.loop} loop={video.loop} preload="metadata" playsInline aria-label={title} />
      </div>
    );
  }
  return (
    <div className={s.preview}>
      <FaceView face={face} size="preview" alt={title} />
    </div>
  );
}
