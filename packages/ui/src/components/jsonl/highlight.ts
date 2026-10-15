// JSON text as coloured runs (ledger.js `jsonHi`), without HTML.
//
// The prototype built the colours by regex-replacing a JSON string into HTML and escaping
// each piece by hand (`esc(str)`); one missed escape is markup injection from a log line.
// Here the scanner returns runs and React escapes them, so a note that contains `<script>`
// renders as those characters. The scan is the prototype's alternation, kept: a string
// (followed by a colon, it is a key), a number, a literal, anything else verbatim. Every
// character of the input lands in exactly one run, so the runs re-joined are the input -
// the property the test holds.

export type RunKind = "key" | "str" | "num" | "lit" | "punct";
export type Run = { readonly kind: RunKind; readonly text: string };

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([^"\d\-tfn]+|[\s\S])/g;

export function jsonRuns(text: string): Run[] {
  const out: Run[] = [];
  const push = (kind: RunKind, t: string): void => {
    if (t === "") return;
    const last = out[out.length - 1];
    if (last !== undefined && last.kind === kind && kind === "punct") out[out.length - 1] = { kind, text: last.text + t };
    else out.push({ kind, text: t });
  };
  for (const m of text.matchAll(TOKEN)) {
    const [, str, colon, num, lit, other] = m;
    if (str !== undefined) {
      push(colon === undefined ? "str" : "key", str);
      if (colon !== undefined) push("punct", colon);
    } else if (num !== undefined) push("num", num);
    else if (lit !== undefined) push("lit", lit);
    else push("punct", other ?? m[0]);
  }
  return out;
}
