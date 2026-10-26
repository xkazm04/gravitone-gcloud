"use client";

// THE COMPOSER (v1 app/library/audio/InspectorComposer.tsx + InspectorComposerTempo.tsx +
// InspectorAddTerm.tsx): the seed as term chips per facet, the team's preferred terms floating
// in (★) and its avoided ones offered as fences (⊘), tempo and key, the prompt as each vendor
// reads it, and the act.
//
// THE ACT CHANGED. v1 ended in "Copy for Suno" (text for a human to paste into suno.com) and an
// ElevenLabs "Render" that billed on the press. Here the act is `Send to Suno`: the seed becomes
// the queue's form fields (./recipe.ts `sunoFieldsOf`) and the caller opens a RECEIPT, so every
// generation is read before it is confirmed (COMMON decision 3). The ElevenLabs dialect is still
// drawn and copyable - a person may take it elsewhere - but it launches nothing: no producer runs
// a free ElevenLabs seed as a job in this checkout, and a press that bills with no receipt is the
// defect the receipt exists to remove.
import { useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Seg } from "../seg/Seg.tsx";
import { TEMPO, tempoProblem } from "./batch.ts";
import { addTo, avoidFloats, BLANK_SEED, compose, FACET_OF, preferredFloats, removeFrom, SEED_LISTS, sunoCut, sunoFieldsOf, type Hand, type Seed, type SeedList, type Target, type Term } from "./recipe.ts";
import s from "./Composer.module.css";

function AddWord({ label, list, onAdd }: { readonly label: string; readonly list: string; readonly onAdd: (w: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className={s.addForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim() !== "") onAdd(v);
        setV("");
      }}
    >
      <input className={s.add} value={v} list={list} placeholder="+ term" aria-label={label} onChange={(e) => setV(e.currentTarget.value)} />
    </form>
  );
}

export type SeedComposerProps = {
  readonly seed: Seed;
  readonly terms: readonly Term[];
  readonly hands: Readonly<Record<string, Hand>>;
  /** Where the seed came from: `blank`, a take's title, a reference, a variation's axis. */
  readonly from: string;
  readonly onSeed: (s: Seed) => void;
  readonly onSend: () => void;
  /** A receipt is being read or confirmed: the act waits. */
  readonly busy: boolean;
  readonly onCopy: (text: string) => void;
  /** Keys the store's takes were asked or measured in: the key field's suggestions (v1 read them off the ledger). */
  readonly keys: readonly string[];
};

const TARGETS = [
  { value: "suno", label: "suno" },
  { value: "elevenlabs", label: "elevenlabs" },
] as const satisfies readonly { readonly value: Target; readonly label: string }[];

export function SeedComposer({ seed, terms, hands, from, onSeed, onSend, busy, onCopy, keys }: SeedComposerProps) {
  const [target, setTarget] = useState<Target>("suno");
  const dl = (f: string): string => `audio-composer-${f}`;
  const text = compose(seed, target, hands);
  const fields = sunoFieldsOf(seed, hands);
  const cut = target === "suno" ? sunoCut(seed, hands) : 0;
  const tempoRefused = tempoProblem(seed.bpm === null ? null : Math.round(seed.bpm));
  const row = (list: SeedList, label: string) => (
    <div className={s.facet} key={list}>
      <span className={s.facetLabel}>{label}</span>
      <div className={s.chips}>
        {seed[list].map((t) => (
          <span key={t} className={s.seedChip} data-stance={terms.find((x) => x.facet === FACET_OF[list] && x.term === t)?.stance ?? "none"}>
            {t}
            <button type="button" className={s.x} aria-label={`remove ${t}`} onClick={() => onSeed(removeFrom(seed, list, t))}>
              ×
            </button>
          </span>
        ))}
        {preferredFloats(terms, FACET_OF[list], seed[list]).map((t) => (
          <Chip key={t.id} label={`★ ${t.term}`} casing="lower" tone="emerald" ghost name={`add preferred ${t.term}`} onPress={() => onSeed(addTo(seed, list, t.term))} />
        ))}
        <AddWord label={`add ${label} term`} list={dl(FACET_OF[list])} onAdd={(w) => onSeed(addTo(seed, list, w))} />
      </div>
    </div>
  );
  return (
    <section className={s.composer} aria-label="composer">
      <div className={s.head}>
        <CapsHeading text="composer" variant="section" />
        <Chip label="from" value={from} casing="lower" />
        <span className={s.grow} />
        <Button label="Blank" size="sm" onPress={() => onSeed(BLANK_SEED)} />
      </div>
      <div className={s.facets}>
      {SEED_LISTS.map(({ list, label }) => row(list, label))}
      <div className={s.facet}>
        <span className={s.facetLabel}>exclude</span>
        <div className={s.chips}>
          {seed.avoid.map((t) => (
            <span key={t} className={s.seedChip} data-stance="avoid">
              {t}
              <button type="button" className={s.x} aria-label={`remove ${t}`} onClick={() => onSeed(removeFrom(seed, "avoid", t))}>
                ×
              </button>
            </span>
          ))}
          {avoidFloats(terms, seed.avoid).map((t) => (
            <Chip key={t.id} label={`⊘ ${t.term}`} casing="lower" tone="rose" ghost name={`exclude ${t.term}`} onPress={() => onSeed(addTo(seed, "avoid", t.term))} />
          ))}
          <AddWord label="add excluded term" list={dl("instrument")} onAdd={(w) => onSeed(addTo(seed, "avoid", w))} />
        </div>
      </div>
      <div className={s.facet}>
        <span className={s.facetLabel}>tempo · key</span>
        <div className={s.tk}>
          <input
            className={s.num}
            type="number"
            min={TEMPO.min}
            max={TEMPO.max}
            step={1}
            value={seed.bpm === null ? "" : Math.round(seed.bpm)}
            placeholder="bpm"
            aria-label="tempo bpm"
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              onSeed({ ...seed, bpm: Number.isFinite(n) && n > 0 ? n : null });
            }}
          />
          <input className={s.keyField} list={dl("keys")} value={seed.key ?? ""} placeholder="key" aria-label="key" onChange={(e) => onSeed({ ...seed, key: e.currentTarget.value.trim() === "" ? null : e.currentTarget.value })} />
          <span className={s.grow} />
          <Seg label="prompt dialect" options={TARGETS} value={target} onChange={setTarget} />
        </div>
      </div>
      </div>
      <pre className={s.promptText} aria-label="prompt text" data-testid="audio-prompt">
        {text}
      </pre>
      <div className={s.acts}>
        <span className={s.count}>{text.length} chars</span>
        {cut > 0 && <Chip label="cut" value={cut} tone="amber" casing="lower" name={`${cut} seed term${cut === 1 ? "" : "s"} past Suno's limit`} />}
        <span className={s.grow} />
        <Button label="Copy" size="sm" onPress={() => onCopy(text)} />
        <Button label="Send to Suno" tone="cyan" disabled={busy || fields === null || tempoRefused !== null} {...(tempoRefused === null ? {} : { badge: { label: tempoRefused, tone: "amber" as const } })} onPress={onSend} />
      </div>
      <div hidden>
        {(["genre", "mood", "instrument"] as const).map((f) => (
          <datalist key={f} id={dl(f)}>
            {terms
              .filter((t) => t.facet === f)
              .map((t) => (
                <option key={t.id} value={t.term} />
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
