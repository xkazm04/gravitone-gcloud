// A MEDIA CARD: one picture, a name in the display voice, a line of facts and a status. It is
// a single button; everything else about what it names lives on the sheet it opens.
// No picture is a state, not a blank: a dashed frame that says so.

import { StatusGlyph } from "./StatusGlyph";

export function Card({
  label,
  src,
  alt,
  what,
  title,
  meta,
  status,
  proven = false,
  emptyLabel = "no render yet",
  onOpen,
}: {
  /** The button's accessible name: "Open Blueprint". */
  label: string;
  src?: string;
  alt?: string;
  /** The small caps label over the picture: what kind of picture it is. */
  what?: string;
  title: string;
  meta?: string;
  /** The status pill: "proven", "candidate". */
  status?: string;
  proven?: boolean;
  emptyLabel?: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="k-card" aria-label={label} onClick={onOpen}>
      <div className="k-card__im">
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
            <img src={src} alt={alt ?? title} loading="lazy" />
            {what && <span className="k-card__what k-caps">{what}</span>}
          </>
        ) : (
          <div className="k-noimg k-caps">
            <StatusGlyph kind="queued" decorative size={44} />
            {emptyLabel}
          </div>
        )}
      </div>
      <div className="k-card__bd">
        <div className="min-w-0">
          <h3>{title}</h3>
          {meta && <div className="k-card__fm">{meta}</div>}
        </div>
        {status && <span className={`k-stt${proven ? " k-stt--proven" : ""}`}>{status}</span>}
      </div>
    </button>
  );
}

/** The grid a run of cards lies in. */
export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="k-cards">{children}</div>;
}
