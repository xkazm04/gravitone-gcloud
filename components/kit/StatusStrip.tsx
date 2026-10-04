// THE STATUS STRIP over a run: its state as a pill, the facts about it, a real
// error if there is one, the last line of the log while it is live, and a meridian
// (a dotted line with a lit star travelling along it) for how far it has got.
// `actions` is where Pause / Resume / Retry sit; the strip explains nothing.

import { StatusPill } from "./StatusPill";
import type { StatusKind } from "./StatusGlyph";

export function Meridian({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (100 * done) / total)) : 0;
  return (
    <div className="k-meridian" role="progressbar" aria-label={label ?? "progress"} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusStrip({
  kind,
  word,
  progress,
  facts,
  error,
  log,
  actions,
}: {
  kind: StatusKind;
  /** The state's word: "ready to cull", "generating". */
  word: string;
  /** Live runs only: `done/total` shown in the pill and along the meridian. */
  progress?: { done: number; total: number };
  /** `<b>` for the numbers. */
  facts?: React.ReactNode;
  /** The real error, verbatim. */
  error?: string | null;
  /** The last log line, shown while live. */
  log?: string | null;
  actions?: React.ReactNode;
}) {
  const showProgress = progress && progress.total > 0;
  return (
    <div className="k-strip">
      <StatusPill kind={kind}>
        {word}
        {showProgress ? ` ${progress.done}/${progress.total}` : ""}
      </StatusPill>
      {facts && <span className="k-facts">{facts}</span>}
      {error && (
        <span className="k-err" role="alert">
          {error}
        </span>
      )}
      {actions && <span className="k-strip__act">{actions}</span>}
      {log && <span className="k-strip__log">{log}</span>}
      {showProgress && <Meridian done={progress.done} total={progress.total} label={`${word} progress`} />}
    </div>
  );
}
