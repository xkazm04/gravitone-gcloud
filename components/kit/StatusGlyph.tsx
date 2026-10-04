// THE STATUS VOCABULARY, DRAWN. One small mark per state, so a run list reads
// as a column of shapes and not a column of words:
//
//   live       a gold ring turning around a lit core
//   ready      a ring with a core: waiting on a person
//   inc        a half-filled ring: the run gave up partway
//   failed     a struck-through ring, in Antares
//   committed  a double ring: charted, read-only
//   gate       a lit core with cross-hairs: parked for a human verdict
//   keep       an Aldebaran ring around a four-point star (a person kept this)
//   reject     a dark disc sliding across a lit one (occulted)
//   undecided  a dashed ring
//   queued     a faint dashed ring
//   lock       a padlock
//
// EVERY MARK HAS A NAME. `label` defaults per kind and is rendered `sr-only`; pass
// `decorative` only when a visible word beside it says the same thing.

export type StatusKind =
  | "live"
  | "ready"
  | "inc"
  | "failed"
  | "committed"
  | "gate"
  | "keep"
  | "reject"
  | "undecided"
  | "queued"
  | "lock";

const NAME: Record<StatusKind, string> = {
  live: "running",
  ready: "ready",
  inc: "incomplete",
  failed: "failed",
  committed: "committed",
  gate: "awaiting your verdict",
  keep: "kept",
  reject: "rejected",
  undecided: "undecided",
  queued: "queued",
  lock: "locked",
};

function Shape({ kind }: { kind: StatusKind }) {
  switch (kind) {
    case "live":
      return (
        <>
          <circle className="k-spin k-s-gold k-f-none" r="6.4" strokeWidth="1.1" strokeDasharray="1.8 2.2" />
          <circle className="k-f-gold k-s-none" r="2.8" />
        </>
      );
    case "ready":
      return (
        <>
          <circle className="k-s-white k-f-none" r="5.8" strokeWidth="1.2" />
          <circle className="k-f-white k-s-none" r="2" />
        </>
      );
    case "inc":
      return (
        <>
          <circle className="k-s-gold k-f-none" r="5.8" strokeWidth="1.2" />
          <path className="k-f-gold k-s-none" d="M0 -5.8 A5.8 5.8 0 0 0 0 5.8 Z" />
        </>
      );
    case "failed":
      return (
        <>
          <circle className="k-s-ant k-f-none" r="5.8" strokeWidth="1.3" />
          <path className="k-s-ant" d="M-4.1 4.1 L4.1 -4.1" strokeWidth="1.3" />
        </>
      );
    case "committed":
      return (
        <>
          <circle className="k-s-white k-f-none" r="6.8" strokeOpacity="0.5" strokeWidth="0.8" />
          <circle className="k-s-white k-f-none" r="4.4" strokeWidth="1.1" />
          <circle className="k-f-white k-s-none" r="2" />
        </>
      );
    case "gate":
      return (
        <>
          <circle className="k-s-gold k-f-none" r="6.4" strokeWidth="1" />
          <circle className="k-f-gold k-s-none" r="3.4" />
          <path className="k-s-gold" d="M0 -8 V-5.6 M0 8 V5.6 M-8 0 H-5.6 M8 0 H5.6" strokeWidth="1" />
        </>
      );
    case "keep":
      return (
        <>
          <circle className="k-s-ald k-f-none" r="6" strokeWidth="1.6" />
          <path className="k-f-white k-s-none" d="M0 -3.4 L.9 -.9 L3.4 0 L.9 .9 L0 3.4 L-.9 .9 L-3.4 0 L-.9 -.9 Z" />
        </>
      );
    case "reject":
      return (
        <>
          <circle className="k-f-field k-s-ash" r="5.6" strokeWidth="1.1" />
          <circle className="k-f-deep k-s-none" cx="-2.6" r="5" />
        </>
      );
    case "undecided":
      return <circle className="k-s-white k-f-none" r="5.6" strokeWidth="1.1" strokeDasharray="2 2" />;
    case "queued":
      return <circle className="k-s-vellum k-f-none" r="5.6" strokeWidth="1" strokeDasharray="1.2 2.2" />;
    case "lock":
      return (
        <>
          <rect className="k-s-cur k-f-none" x="-5" y="-1" width="10" height="7.5" rx="1" strokeWidth="1.2" />
          <path className="k-s-cur k-f-none" d="M-3 -1 V-3.5 A3 3 0 0 1 3 -3.5 V-1" strokeWidth="1.2" />
        </>
      );
  }
}

export function StatusGlyph({
  kind,
  label,
  decorative = false,
  size,
  className = "",
}: {
  kind: StatusKind;
  /** The accessible name; defaults per kind. */
  label?: string;
  /** A visible word beside the mark already names it. */
  decorative?: boolean;
  /** Pixels. Defaults to the text height. */
  size?: number;
  className?: string;
}) {
  return (
    <>
      <svg
        className={`k-gl ${className}`}
        viewBox="-8 -8 16 16"
        aria-hidden="true"
        style={size ? { width: size, height: size } : undefined}
      >
        <Shape kind={kind} />
      </svg>
      {!decorative && <span className="sr-only">{label ?? NAME[kind]}</span>}
    </>
  );
}
