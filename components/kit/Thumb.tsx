"use client";

// A THUMBNAIL THAT OPENS: a picture in a hairline that turns gold under the
// pointer, with room over its lower edge for score chips and over its corner for a
// flag. A button, so it is reachable and named. `inForce` rules the one whose
// recipe is the recipe in force.

export function Thumb({
  src,
  alt,
  label,
  onOpen,
  inForce = false,
  chips,
  flag,
}: {
  src: string;
  alt: string;
  /** The button's name: what opening it shows. */
  label: string;
  onOpen: () => void;
  inForce?: boolean;
  chips?: React.ReactNode;
  flag?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`k-thumb${inForce ? " k-thumb--in-force" : ""}`}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
      <img src={src} alt={alt} loading="lazy" />
      {flag && <span className="k-tile__flag">{flag}</span>}
      {chips && <span className="k-tile__chips">{chips}</span>}
    </button>
  );
}
