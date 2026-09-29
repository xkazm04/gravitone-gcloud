// THE REPORT BAR after a commit: a double ring, what was done in numbers, and the
// one door to the document it wrote.

import { StatusGlyph } from "./StatusGlyph";

export function Report({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="k-report" role="status">
      <StatusGlyph kind="committed" decorative />
      <span className="k-caps">{children}</span>
      {action}
    </div>
  );
}

/** A quiet link-button: gold, underlined on hover. "Read findings.md →" */
export function OpenLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="k-open" onClick={onClick}>
      {children}
    </button>
  );
}
