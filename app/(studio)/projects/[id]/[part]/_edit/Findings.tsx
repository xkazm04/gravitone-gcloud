"use client";

// A check's findings as the work states them: verdict, rule and subject, the sentence, and where
// it sits (`at` + quote - "a finding you cannot locate is a rumour", lib/script/gate.ts). One list
// for the render gate and the trailer structure check, so `unmeasured` never reads as `pass` in
// one and as something else in the other (the honesty rule, gate.ts :24-35). The sentences are
// verbatim; the server already removed citations and developer text from them.
import type { Finding } from "@gt/domain/partView";
import { cx } from "@gt/ui/components/cx.ts";

import s from "./Editors.module.css";

const MARK: Readonly<Record<Finding["verdict"], string>> = { pass: "✓ pass", violation: "✗ violation", unmeasured: "? unmeasured", "not-engaged": "— not-engaged" };
const LOOK: Readonly<Record<Finding["verdict"], string | undefined>> = { pass: s.pass, violation: s.violation, unmeasured: s.unmeasured, "not-engaged": s["not-engaged"] };

export function Findings({ findings, onLocate }: { readonly findings: readonly (Finding & { readonly beatId?: string })[]; readonly onLocate?: (beatId: string) => void }) {
  return (
    <div role="list" aria-label="findings">
      {findings.map((f, i) => (
        <div key={`${f.rule}:${f.subject}:${i}`} className={s.finding} role="listitem" data-verdict={f.verdict}>
          <span className={cx(s.v, LOOK[f.verdict])}>{MARK[f.verdict]}</span>
          <div>
            <span className={s.fsub}>
              {f.rule} · {f.subject}
              {f.at !== undefined && f.beatId !== undefined && onLocate !== undefined ? (
                <>
                  {" · "}
                  <button type="button" className={s.locate} onClick={() => onLocate(f.beatId ?? "")}>
                    {f.at}
                  </button>
                </>
              ) : (
                f.at !== undefined && ` · ${f.at}`
              )}
            </span>
            {f.detail !== "" && <p className={s.work}>{f.detail}</p>}
            {f.quote !== undefined && <p className={s.quote}>{`“${f.quote}”`}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
