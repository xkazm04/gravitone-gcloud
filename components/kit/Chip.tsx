// A LABELLED FACT AS A CHIP: `shot size: extreme wide`. The name is vellum, the
// value white. `tone` is for the two chips that carry news (gold: a stand-in,
// ant: a fault).

export function Chip({
  name,
  children,
  tone,
  wrap = false,
}: {
  /** The field. Optional: a bare chip is just its children. */
  name?: string;
  children: React.ReactNode;
  tone?: "gold" | "ant";
  wrap?: boolean;
}) {
  return (
    <span className={`k-chip${tone ? ` k-chip--${tone}` : ""}${wrap ? " k-chip--wrap" : ""}`}>
      {name ? (
        <>
          {name}: <b>{children}</b>
        </>
      ) : (
        children
      )}
    </span>
  );
}

export function Chips({ children }: { children: React.ReactNode }) {
  return <div className="k-chips">{children}</div>;
}
