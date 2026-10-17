// THE ENGINES THE DESK CAN REACH, one row each: the transport, the state DERIVED from what it can
// do (lib/sound/engines.ts `engineState`), the operations open now, and each withheld one with
// its reason verbatim - a withheld op keeps its place and says why (v1 app/playground/engines.ts
// `withheld`). The declared lane lists what it would take, never a fake take.
import { Chip } from "../chip/Chip.tsx";
import type { Tone } from "../chip/tone.ts";
import s from "./Arrange.module.css";

export type EngineRow = {
  readonly id: string;
  readonly name: string;
  readonly transport: string;
  readonly state: "live" | "round-trip" | "copy-only" | "off" | "not-installed";
  readonly ops: readonly string[];
  readonly withheld: readonly { readonly op: string; readonly reason: string }[];
  readonly needs?: readonly string[];
};

const LOOK: Readonly<Record<EngineRow["state"], { readonly word: string; readonly tone: Tone }>> = {
  live: { word: "live", tone: "emerald" },
  "round-trip": { word: "round trip", tone: "amber" },
  "copy-only": { word: "copy only", tone: "neutral" },
  off: { word: "off here", tone: "rose" },
  "not-installed": { word: "not installed", tone: "neutral" },
};

/** Withheld ops that share a reason are said once, the ops joined. */
function grouped(rows: EngineRow["withheld"]): { readonly ops: string; readonly reason: string }[] {
  const by = new Map<string, string[]>();
  for (const w of rows) by.set(w.reason, [...(by.get(w.reason) ?? []), w.op]);
  return [...by].map(([reason, ops]) => ({ ops: ops.join(" · "), reason }));
}

export function EngineList({ engines, label }: { readonly engines: readonly EngineRow[]; readonly label: string }) {
  return (
    <ul className={s.engines} aria-label={label}>
      {engines.map((e) => (
        <li key={e.id} className={s.engine}>
          <span className={s.engineName}>{e.name}</span>
          <Chip label={LOOK[e.state].word} tone={LOOK[e.state].tone} casing="lower" dot />
          <span className={s.engineVia}>{e.transport}</span>
          <span className={s.engineOps}>
            {e.ops.map((op) => (
              <Chip key={op} label={op} casing="lower" />
            ))}
          </span>
          {grouped(e.withheld).map((w) => (
            <span key={w.reason} className={s.withheld}>
              <span className={s.struck}>{w.ops}</span> {w.reason}
            </span>
          ))}
          {e.needs !== undefined && <span className={s.withheld}>needs {e.needs.join(" · ")}</span>}
        </li>
      ))}
    </ul>
  );
}
