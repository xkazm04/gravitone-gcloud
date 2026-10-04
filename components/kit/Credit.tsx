// A GRADER'S CREDIT ON ONE FIELD: full, half or crossed, as a mark and the word
// it applies to. Colour never carries it alone; the shape does.

export function Credit({ value, children }: { value: number | undefined; children: React.ReactNode }) {
  const c = value === 1 ? "1" : value === 0.5 ? "5" : value === 0 ? "0" : "";
  const word = value === 1 ? "matched" : value === 0.5 ? "half" : value === 0 ? "missed" : "";
  return (
    <span className={`k-cr${c ? ` k-cr--${c}` : ""}`}>
      {value === 1 ? (
        <svg viewBox="-6 -6 12 12" aria-hidden="true">
          <circle r="4.6" fill="currentColor" />
        </svg>
      ) : value === 0.5 ? (
        <svg viewBox="-6 -6 12 12" aria-hidden="true">
          <circle r="4.6" fill="none" stroke="currentColor" />
          <path d="M0 -4.6 A4.6 4.6 0 0 0 0 4.6 Z" fill="currentColor" />
        </svg>
      ) : value === 0 ? (
        <svg viewBox="-6 -6 12 12" aria-hidden="true">
          <circle r="4.6" fill="none" stroke="currentColor" />
          <path d="M-3.3 3.3 L3.3 -3.3" stroke="currentColor" />
        </svg>
      ) : null}
      {children}
      {word && <span className="sr-only"> ({word})</span>}
    </span>
  );
}
