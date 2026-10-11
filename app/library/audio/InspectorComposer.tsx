"use client";

// THE COMPOSER — the Inspector's "Composer" block: the seed as term chips, the
// team's preferred terms floating in, tempo and key, the prompt for the chosen
// vendor, Copy. Its add-term field is InspectorAddTerm.tsx and its tempo and key
// row is InspectorComposerTempo.tsx, both split out to keep this file under the
// 200-line cap.

import { useId } from "react";

import { compose, type Facet, type Hand, type Seed, type Target, type TermEntry } from "./book";
import { AddTerm } from "./InspectorAddTerm";
import { ComposerTempo } from "./InspectorComposerTempo";

/* ── the composer ──────────────────────────────────────────────────────── */

type SeedList = "genres" | "moods" | "instruments";
const FACET_OF: Record<SeedList, Facet> = {
  genres: "genre_tags",
  moods: "mood_tags",
  instruments: "instrumentation",
};

export interface ComposerState {
  seed: Seed;
  from: string;
  parent: string | null;
  ref: string | null;
}

export function Composer({
  state,
  voc,
  hands,
  target,
  keys,
  onSeed,
  onBlank,
  onTarget,
  onCopy,
}: {
  state: ComposerState;
  voc: readonly TermEntry[];
  hands: Record<string, Hand>;
  target: Target;
  /** Keys seen in the ledger, for the key field's suggestions. */
  keys: string[];
  onSeed: (s: Seed) => void;
  onBlank: () => void;
  onTarget: (t: Target) => void;
  onCopy: () => void;
}) {
  const uid = useId();
  const dl = (f: Facet | "keys") => `${uid}-dl-${f}`;
  const sd = state.seed;
  const entry = (facet: Facet, t: string) => voc.find((v) => v.facet === facet && v.term === t);
  const add = (k: SeedList | "avoid", term: string) => {
    if (sd[k].includes(term)) return;
    onSeed({ ...sd, [k]: [...sd[k], term] });
  };
  const rm = (k: SeedList | "avoid", i: number) => onSeed({ ...sd, [k]: sd[k].filter((_, j) => j !== i) });
  const facetRow = (k: SeedList, label: string) => {
    const facet = FACET_OF[k];
    const list = sd[k];
    const floats = voc.filter((v) => v.facet === facet && v.stance === "prefer" && !list.includes(v.term));
    return (
      <div className="facet">
        <span className="caps">{label}</span>
        <div className="tchips">
          {list.map((t, i) => {
            const e = entry(facet, t);
            return (
              <span
                key={`${t}-${i}`}
                className={`tchip${e?.stance === "prefer" ? " pref" : e?.stance === "avoid" ? " avoid" : ""}`}
              >
                {t}
                {e?.phrase && <span className="ph">→ {e.phrase}</span>}
                <button type="button" aria-label={`Remove ${t}`} onClick={() => rm(k, i)}>
                  ×
                </button>
              </span>
            );
          })}
          {floats.map((v) => (
            <button
              key={v.id}
              type="button"
              className="float"
              aria-label={`Add preferred ${v.term}`}
              onClick={() => add(k, v.term)}
            >
              ★ {v.term}
            </button>
          ))}
          <AddTerm
            list={dl(facet)}
            label={`Add ${label.toLowerCase()} term`}
            placeholder="+ term"
            onAdd={(v) => add(k, v)}
          />
        </div>
      </div>
    );
  };
  const text = compose(sd, target, hands);
  return (
    <section className="panel composer" aria-label="Composer" id={`${uid}-composer`} data-composer>
      <h3>
        Composer
        <span className="grow" />
        <span className="src-chip">
          from <span className="chip">{state.from}</span>
        </span>
        <button type="button" className="btn btn--sm" onClick={onBlank}>
          Blank
        </button>
      </h3>
      {facetRow("genres", "Genre")}
      {facetRow("moods", "Mood")}
      {facetRow("instruments", "Instrument")}
      <div className="facet">
        <span className="caps">Exclude</span>
        <div className="tchips">
          {sd.avoid.map((t, i) => (
            <span key={`${t}-${i}`} className="tchip avoid">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => rm("avoid", i)}>
                ×
              </button>
            </span>
          ))}
          {voc
            .filter((v) => v.stance === "avoid" && !sd.avoid.includes(v.term))
            .map((v) => (
              <button
                key={v.id}
                type="button"
                className="float float--avoid"
                aria-label={`Exclude ${v.term}`}
                onClick={() => add("avoid", v.term)}
              >
                ⊘ {v.term}
              </button>
            ))}
          <AddTerm
            list={dl("instrumentation")}
            label="Add excluded term"
            placeholder="+ exclude"
            onAdd={(v) => add("avoid", v)}
          />
        </div>
      </div>
      <ComposerTempo
        seed={sd}
        keysList={dl("keys")}
        target={target}
        onSeed={onSeed}
        onTarget={onTarget}
      />
      <pre className="prompt" aria-label="Prompt text" data-testid="audio-prompt">
        {text}
      </pre>
      <div className="actions" style={{ marginTop: 8 }}>
        <span className="dim mono">{text.length} chars</span>
        <span className="grow" />
        <button type="button" className="btn btn--solid" onClick={onCopy}>
          Copy for {target === "suno" ? "Suno" : "ElevenLabs"}
        </button>
      </div>
      <div hidden>
        {(["genre_tags", "mood_tags", "instrumentation"] as const).map((f) => (
          <datalist key={f} id={dl(f)}>
            {voc
              .filter((v) => v.facet === f)
              .map((v) => (
                <option key={v.id} value={v.term} />
              ))}
          </datalist>
        ))}
        <datalist id={dl("keys")}>
          {keys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </div>
    </section>
  );
}
