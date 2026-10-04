// A SCORE AS A STAR WHOSE SIZE IS ITS WEIGHT.
//
//   >= 0.75   a solid white star           (held)
//   >= 0.50   a vellum star                (partly held)
//   <  0.50   a hollow star                (did not hold)
//   no score  a dashed ring                (not graded)
//
// The thresholds are the ones the cull has always used; only the drawing moved.

export type Grade = "held" | "partial" | "missed" | "ungraded";

export function gradeOf(v: number | null | undefined): Grade {
  return typeof v !== "number" ? "ungraded" : v >= 0.75 ? "held" : v >= 0.5 ? "partial" : "missed";
}

export function Magnitude({ value }: { value: number | null | undefined }) {
  const g = gradeOf(value);
  const r = typeof value === "number" ? 1.4 + 3 * value : 3.4;
  return (
    <svg className="k-mag" viewBox="-5 -5 10 10" aria-hidden="true">
      {g === "ungraded" ? (
        <circle className="k-s-gold k-f-none" r="3.4" strokeDasharray="1.2 1.2" />
      ) : g === "held" ? (
        <circle className="k-f-white k-s-none" r={r.toFixed(2)} />
      ) : g === "partial" ? (
        <circle className="k-f-vellum k-s-none" r={r.toFixed(2)} />
      ) : (
        <circle className="k-s-ash k-f-none" r={r.toFixed(2)} strokeWidth="1" />
      )}
    </svg>
  );
}
