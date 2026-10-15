// A record as the agent reads it (ledger.js `lineHtml` and the detail's `pre.json`;
// INVENTORY.md owed the JSONL view). Two shapes over one scanner (highlight.ts):
//   JsonLine   one compact line with its line number, at one fixed height, so a JSON Lines
//              list of thousands windows by arithmetic like the table beside it;
//   JsonBlock  one record pretty-printed, wrapping, for the detail panel.
// The text is the caller's (`JSON.stringify` of the record the screen shows), so what is
// drawn is byte-for-byte what a copy puts on the clipboard.
import { cx } from "../cx.ts";
import { jsonRuns, type RunKind } from "./highlight.ts";
import s from "./Json.module.css";

const CLASS: Readonly<Record<RunKind, string | undefined>> = { key: s.k, str: s.sv, num: s.nv, lit: s.bv, punct: undefined };

function Runs({ text }: { readonly text: string }) {
  return (
    <>
      {jsonRuns(text).map((r, i) =>
        r.kind === "punct" ? (
          r.text
        ) : (
          <span key={i} className={CLASS[r.kind]}>
            {r.text}
          </span>
        ),
      )}
    </>
  );
}

export type JsonLineProps = {
  readonly n: number;
  readonly text: string;
  readonly selected: boolean;
  /** 1-based position in the whole list, for aria-rowindex. */
  readonly index: number;
  readonly onSelect: () => void;
};

export function JsonLine({ n, text, selected, index, onSelect }: JsonLineProps) {
  return (
    <div className={s.line} role="row" aria-rowindex={index} aria-selected={selected} onClick={onSelect}>
      <span className={s.ln} aria-hidden="true">
        {n}
      </span>
      <span role="gridcell">
        <Runs text={text} />
      </span>
    </div>
  );
}

export function JsonBlock({ text, label }: { readonly text: string; readonly label: string }) {
  return (
    <pre className={cx(s.block)} aria-label={label}>
      <Runs text={text} />
    </pre>
  );
}
