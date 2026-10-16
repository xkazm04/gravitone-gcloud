// The part's verdict in the header (STEPS-DESIGN §1): the state as a status pill, then its first
// reason in the work's own words ("3 cards moved since the scope was confirmed"). The other
// reasons are spoken and listed on hover/focus as the chip's description, never as a paragraph.
import type { PartVerdict } from "@gt/domain/partView";

import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import { verdictLook } from "./part.ts";
import s from "./Part.module.css";

export function VerdictChip({ verdict }: { readonly verdict: PartVerdict }) {
  const look = verdictLook(verdict.state);
  const [first, ...rest] = verdict.codes;
  return (
    <span className={cx(s.verdict, s[look])} data-component="VerdictChip" data-verdict={verdict.state} role="status">
      <span className={s.vstate}>{verdict.state}</span>
      {first !== undefined && <span className={s.vtext}>{first.text}</span>}
      {rest.length > 0 && <span className={s.vmore} aria-hidden="true">+{rest.length}</span>}
      {rest.length > 0 && <SrOnly text={`; ${rest.map((c) => c.text).join("; ")}`} />}
    </span>
  );
}
