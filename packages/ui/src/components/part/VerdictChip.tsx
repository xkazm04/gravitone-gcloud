// The part's verdict in the header (STEPS-DESIGN §1): the state as a status pill, then its first
// reason in the work's own words ("3 cards moved since the scope was confirmed"). The other
// reasons are a Tip on the `+N`, read on hover and focus, never a paragraph. The tip stays mounted
// inside the status, so they are spoken with it (they were an SrOnly, which no sighted operator
// could open).
import type { PartVerdict } from "@gt/domain/partView";

import { cx } from "../cx.ts";
import { Tip } from "../hint/Tip.tsx";
import { verdictLook } from "./part.ts";
import s from "./Part.module.css";

export function VerdictChip({ verdict }: { readonly verdict: PartVerdict }) {
  const look = verdictLook(verdict.state);
  const [first, ...rest] = verdict.codes;
  return (
    <span className={cx(s.verdict, s[look])} data-component="VerdictChip" data-verdict={verdict.state} role="status">
      <span className={s.vstate}>{verdict.state}</span>
      {first !== undefined && <span className={s.vtext}>{first.text}</span>}
      {rest.length > 0 && (
        <Tip text={rest.map((c) => c.text).join(" · ")}>
          {(id) => (
            <span className={s.vmore} tabIndex={0} aria-describedby={id}>
              +{rest.length}
            </span>
          )}
        </Tip>
      )}
    </span>
  );
}
