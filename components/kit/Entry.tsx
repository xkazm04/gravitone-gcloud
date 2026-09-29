"use client";

// A WORK ENTRY: one bordered row of work that is judged as a whole: an extracted
// style with its sources, replicas and transfer; a Dojo improvement with its pair
// wall. It shows its state in its border: gold when focused, Aldebaran when kept,
// dimmed when rejected. The header carries the name and the verdict controls; the
// body is whatever the caller lays out.

export function Entry({
  id,
  label,
  focused = false,
  verdict,
  title,
  lede,
  aside,
  onFocus,
  children,
}: {
  id?: string;
  /** The entry's accessible name. */
  label: string;
  focused?: boolean;
  verdict?: "keep" | "reject" | null;
  /** The display-voice heading. */
  title: React.ReactNode;
  /** Under the heading: id, family, the claim. */
  lede?: React.ReactNode;
  /** At the right of the header: score chips, the verdict mark, `<VerdictKeys>`. */
  aside?: React.ReactNode;
  onFocus?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={`${label}${verdict ? (verdict === "keep" ? ", kept" : ", rejected") : ""}`}
      onClick={onFocus}
      className={`k-entry${focused ? " k-entry--focus" : ""}${verdict ? ` k-entry--${verdict}` : ""}`}
    >
      <div className="k-entry__h">
        <div className="min-w-0">
          <h3>{title}</h3>
          {lede}
        </div>
        {aside && <div className="k-entry__r">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** The verdict as a word on an entry: solid Aldebaran for a pick, ruled ash for a rejection. */
export function VerdictMark({ verdict, keepWord = "KEPT" }: { verdict: "keep" | "reject"; keepWord?: string }) {
  return <span className={`k-vst k-vst--${verdict}`}>{verdict === "keep" ? keepWord : "REJECTED"}</span>;
}

/** A column of an entry's body: a caps label over its matter. */
export function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="k-col">
      <span className="k-caps">{label}</span>
      {children}
    </div>
  );
}
