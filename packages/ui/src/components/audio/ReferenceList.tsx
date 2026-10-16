// THE REFERENCES (v1 app/library/audio/References.tsx): the tracks the ledger was anchored to,
// what each tempo/key method measured against the published truth and the KIND of error it made
// (./variations.ts `tempoError`, `keyRelation`), how its descendants were judged, and Seed - the
// concept it yields (its measured tempo and key plus its kept descendants' terms).
//
// Not carried: v1's in-browser decode of a dropped reference file (app/library/audio/
// analysis.ts). Measuring media belongs at ingest on the server (Phase 5 media facts), not in a
// tab; a reference that arrives as a Library item will carry its facts from there.
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { keyRelation, tempoError } from "./variations.ts";
import s from "./Composer.module.css";

export type ReferenceMethod = { readonly id: string; readonly label: string; readonly tempo: number; readonly key: string };

export type ReferenceRow = {
  readonly id: string;
  readonly artist: string;
  readonly title: string;
  readonly truth: { readonly tempo: number; readonly key: string };
  readonly methods: readonly ReferenceMethod[];
  readonly kept: number;
  readonly rejected: number;
};

export function ReferenceList({ refs, onSeed }: { readonly refs: readonly ReferenceRow[]; readonly onSeed: (r: ReferenceRow, m: ReferenceMethod) => void }) {
  return (
    <section className={s.block} aria-label="references">
      <CapsHeading text="references" variant="section" tally={{ value: refs.length }} />
      <ul className={s.refs}>
        {refs.map((r) => (
          <li key={r.id} className={s.ref}>
            <div className={s.draftHead}>
              <span className={s.draftTitle}>
                {r.artist} — {r.title}
              </span>
              <span className={s.grow} />
              <Chip label="kept" value={r.kept} tone="emerald" />
              <Chip label="rejected" value={r.rejected} tone="rose" />
            </div>
            <div className={s.truth}>
              truth {r.truth.tempo} bpm · {r.truth.key}
            </div>
            <ul className={s.methods}>
              {r.methods.map((m) => {
                const e = tempoError(m.tempo, r.truth.tempo);
                const k = keyRelation(m.key, r.truth.key);
                return (
                  <li key={m.id} className={s.method}>
                    <span className={s.methodName}>{m.label}</span>
                    <span className={s.methodVal}>{m.tempo.toFixed(1)} bpm</span>
                    <Chip label={e.kind} tone={e.ok ? "emerald" : "rose"} casing="lower" />
                    <span className={s.methodVal}>{m.key}</span>
                    <Chip label={k} tone={k === "exact" ? "emerald" : k === "relative" ? "amber" : "rose"} casing="lower" />
                    <Button label="Seed" size="sm" onPress={() => onSeed(r, m)} />
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
