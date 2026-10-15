// Provenance of what is SHOWN (tokens.css `.src`, GT.Src(kind)): real, model, illustrative,
// fixture, derived, session. The kinds are the domain's own (a cost's `src`, a library
// item's `source`) plus `session`, the prototype's acts-in-this-browser; a typo is a type
// error rather than an unstyled tag.
import type { CostSource } from "@gt/domain/event";
import type { LibraryItem } from "@gt/domain/libraryItem";
import { cx } from "../cx.ts";
import s from "./SourceTag.module.css";

export type SourceKind = CostSource | LibraryItem["source"] | "session";

export function SourceTag({ kind }: { readonly kind: SourceKind }) {
  return <span className={cx(s.src, kind === "real" && s.real, kind === "illustrative" && s.illustrative)}>{kind}</span>;
}
