// A WORDS CELL'S BODY as paragraphs and a list (spark scout-storyboards): a storyboard's words are a paragraph,
// a blank line, then its bullets as `- ` lines, and the card reads them as that - a paragraph and a list - with
// no markdown dependency. A run of lines that are not `- ` lines is one paragraph; a blank line ends one; a
// `- ` line is a list item, consecutive items one list. Anything else (a finding's quote) is one paragraph, as
// it always was.
//
// Spans, not <p>/<ul>: the body sits inside the variant's media button, which holds phrasing content only. The
// list keeps its semantics by role, and each item draws its own marker (display:list-item).
import { cx } from "../cx.ts";
import s from "./Verdict.module.css";

export type WordBlock = { readonly kind: "p"; readonly text: string } | { readonly kind: "list"; readonly items: readonly string[] };

const ITEM = /^\s*- (.*)$/;

/** The blocks a body reads as, in order. Empty lines between blocks are dropped. */
export function wordBlocks(text: string): WordBlock[] {
  const out: WordBlock[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = (): void => {
    if (para.length > 0) out.push({ kind: "p", text: para.join(" ") });
    if (list.length > 0) out.push({ kind: "list", items: list });
    para = [];
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const item = ITEM.exec(raw);
    if (item !== null) {
      if (para.length > 0) flush();
      list.push((item[1] ?? "").trim());
    } else if (line === "") flush();
    else {
      if (list.length > 0) flush();
      para.push(line);
    }
  }
  flush();
  return out;
}

/** `className` sets the words' type (a paragraph and each item alike); the list itself is laid out here. */
export function WordsBody({ text, className = s.quote }: { readonly text: string; readonly className?: string | undefined }) {
  return (
    <>
      {wordBlocks(text).map((b, i) =>
        b.kind === "p" ? (
          <span key={i} className={className}>
            {b.text}
          </span>
        ) : (
          <span key={i} className={s.list} role="list">
            {b.items.map((it, j) => (
              <span key={j} className={cx(className, s.item)} role="listitem">
                {it}
              </span>
            ))}
          </span>
        ),
      )}
    </>
  );
}
