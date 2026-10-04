// GRAVITONE as plain, solid capitals. The first mark drew each letter as a
// constellation figure in hairline strokes; owner review (2026-09-29) found the
// wordmark and its typography barely readable, so the name is now set as text:
// Hanken Grotesk bold, star white, wide tracking. The one brand gesture that
// survives is the O, which carries the Cut star, the only red in the mark.
//
// It is real text (selectable, translatable by the browser, sharp at any size).
// `height` is the cap height in CSS px; omit it and the size follows the
// surrounding font-size, so a stylesheet can size it with one declaration.

export interface WordmarkProps {
  /** Cap height in CSS px; the font size is derived. Omit to inherit font-size. */
  height?: number;
  className?: string;
}

// Hanken Grotesk's cap height is 0.7em.
const CAP = 0.7;

export function Wordmark({ height, className }: WordmarkProps) {
  return (
    <span
      role="img"
      aria-label="Gravitone"
      className={["font-hanken", className].filter(Boolean).join(" ")}
      style={{
        display: "inline-block",
        fontSize: height ? height / CAP : undefined,
        fontWeight: 700,
        letterSpacing: "0.16em",
        lineHeight: 1,
        whiteSpace: "nowrap",
        color: "var(--al-white, currentColor)",
        // the tracking after the last letter would push the mark off-centre
        marginRight: "-0.16em",
      }}
    >
      <span aria-hidden="true">
        GRAVIT
        <span style={{ position: "relative", display: "inline-block" }}>
          O
          <i
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "0.24em",
              height: "0.24em",
              margin: "-0.12em 0 0 -0.12em",
              borderRadius: "50%",
              background: "var(--al-ald, currentColor)",
            }}
          />
        </span>
        NE
      </span>
    </span>
  );
}
