// A CLAIM WITH ITS SOURCE, RULED, IN THE WORK'S VOICE.
//
// The rule on the left margin is the whole device: everything to the right of it
// is somebody else's words, unedited. The tone is the standing of the claim, and
// it rides on the rule and on the source line's lightened hue, never on a dimmer
// text colour:
//
//   gold  a quote as it was returned
//   ald   a claim that held
//   ant   a claim contested or corrected; `dashed` marks one that was revised
//
// `size="sm"` is the row-sized quote (a gate finding's evidence); the default is
// the display voice, upright Instrument Serif.

export function Callout({
  children,
  source,
  tone = "gold",
  size = "md",
  dashed = false,
}: {
  /** The claim, verbatim. */
  children: React.ReactNode;
  /** Who said it and where: a run id, a finding, a URL host. A caps line under the quote. */
  source?: React.ReactNode;
  tone?: "gold" | "ald" | "ant";
  size?: "md" | "sm";
  /** A dashed rule: the claim has since been revised. */
  dashed?: boolean;
}) {
  const cls = ["k-callout", tone !== "gold" && `k-callout--${tone}`, size === "sm" && "k-callout--sm", dashed && "k-callout--dashed"]
    .filter(Boolean)
    .join(" ");
  return (
    <figure className={cls}>
      <blockquote>{children}</blockquote>
      {source && <figcaption className="k-caps">{source}</figcaption>}
    </figure>
  );
}
