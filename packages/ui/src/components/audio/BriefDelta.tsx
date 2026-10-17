// What a take was ASKED beside what its bytes ARE, axis by axis - tempo, key, length (./brief.ts).
// A miss is rose with its signed delta; an octave read is amber and named, because a clean
// double or half is the tracker's error, not the provider's; a held axis is quiet; an axis that
// could not be measured is a dashed placeholder, never a zero. An axis the brief never asked is
// not drawn at all. The whole check is one list with one spoken summary.
import { cx } from "../cx.ts";
import type { AxisCheck, BriefCheck } from "./brief.ts";
import s from "./BriefDelta.module.css";

const spoken = (a: AxisCheck): string => {
  switch (a.verdict) {
    case "missed":
      return `${a.axis} asked ${a.asked ?? "?"}, measured ${a.measured ?? "?"}${a.delta === undefined ? "" : `, ${a.delta}`}`;
    case "octave":
      return `${a.axis} asked ${a.asked ?? "?"}, measured ${a.measured ?? "?"}, an octave read`;
    case "held":
      return `${a.axis} ${a.measured ?? a.asked ?? ""} as asked`;
    case "unmeasured":
      return `${a.axis} asked ${a.asked ?? "?"}, not measured`;
    case "unasked":
      return "";
  }
};

export function BriefDelta({ check, label }: { readonly check: BriefCheck; readonly label: string }) {
  const shown = check.axes.filter((a) => a.verdict !== "unasked");
  if (shown.length === 0) return null;
  return (
    <ul className={s.brief} aria-label={`${label}: ${check.missed === 0 ? "brief held" : `${check.missed} missed`}`}>
      {shown.map((a) => (
        <li key={a.axis} className={cx(s.axis, s[a.verdict])} aria-label={spoken(a)}>
          <span className={s.name} aria-hidden="true">
            {a.axis}
          </span>
          <span className={s.figures} aria-hidden="true">
            {a.verdict === "held" ? (a.measured ?? a.asked) : `${a.asked ?? "?"} → ${a.measured ?? "?"}`}
          </span>
          {a.delta !== undefined && (
            <b className={s.delta} aria-hidden="true">
              {a.delta}
            </b>
          )}
          {a.verdict === "octave" && (
            <b className={s.delta} aria-hidden="true">
              octave
            </b>
          )}
        </li>
      ))}
    </ul>
  );
}
