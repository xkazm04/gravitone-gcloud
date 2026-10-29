"use client";

// THE SHEET'S VERSIONS RAIL (spark suno-advisor S1, composition b): every prompt version in the order
// it was first shown, each one press that pins it. A row carries the version's lineage at a glance -
// the parent it came from, the fields it changed, the verdict that caused it in the person's words -
// and what was said about it since: its newest verdict as marks (which take, keep or drop, the axes
// said to be off) and one mark per take brought back as an mp3. The full was -> now of each change is the pinned
// card's own Lineage; the rail never repeats it.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import type { SunoVersion } from "../_host/suno.ts";
import { changedFields, lastVerdict, verdictMark } from "./sheet.ts";
import s from "./sheet.module.css";

export type RailProps = {
  readonly versions: readonly SunoVersion[];
  readonly pinned: string | null;
  readonly onPin: (promptId: string) => void;
};

function Marks({ v }: { readonly v: SunoVersion }) {
  const last = lastVerdict(v);
  const mark = last === null ? null : verdictMark(last);
  if (mark === null && v.takes.length === 0) return null;
  return (
    <span className={s.marks}>
      {mark !== null && (
        <>
          <Chip label={mark.take} casing="lower" />
          {mark.call !== null && <Chip label={mark.call} tone={mark.call === "keep" ? "emerald" : "rose"} casing="lower" />}
          {mark.off.map((o) => (
            <Chip key={o} label={o} tone="amber" ghost casing="lower" />
          ))}
        </>
      )}
      {v.takes.map((t) => (
        <Chip key={t.takeId} label="mp3" {...(t.clip !== undefined ? { value: t.clip } : {})} tone="cyan" ghost casing="lower" name={t.clip === undefined ? "an uploaded take" : `uploaded take ${t.clip}`} />
      ))}
    </span>
  );
}

export function Rail({ versions, pinned, onPin }: RailProps) {
  return (
    <section className={s.rail} aria-label="prompt versions">
      <CapsHeading text="versions" tally={{ value: versions.length }} />
      <ol className={s.railList}>
        {versions.map((v, i) => {
          const fields = changedFields(v.node);
          const on = v.promptId === pinned;
          return (
            <li key={v.promptId} className={s.railItem}>
              <button type="button" className={s.railPin} aria-pressed={on} onClick={() => onPin(v.promptId)}>
                <span className={s.railHead}>
                  <span className={s.num}>{i + 1}</span>
                  <span className={s.railName}>{v.node.name ?? v.promptId}</span>
                  <Chip label={v.node.model} casing="lower" ghost />
                </span>
                {(v.node.parent !== undefined || fields.length > 0) && (
                  <span className={s.railLine}>
                    {v.node.parent !== undefined && <Chip label="from" value={v.node.parent} ghost casing="lower" />}
                    {fields.map((f) => (
                      <Chip key={f.field} label={f.field} {...(f.n > 1 ? { value: f.n } : {})} tone="violet" casing="lower" />
                    ))}
                  </span>
                )}
                {v.node.because !== undefined && <span className={s.railBecause}>{v.node.because}</span>}
                <Marks v={v} />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
