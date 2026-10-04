"use client";

// THE TAKE EXPANSION — Variations + Composer + Drafts, ONE coupled unit that
// mounts inside the Ledger's expanded row (`./Ledger.tsx`'s `renderExpansion`,
// wired at the `<Ledger>` call site in `AudioWorkbench.tsx`). Caveat 2
// (`.vault/Spark/ideas/library-audio-workbench-port.md`) moves this off the
// side panel entirely — `./Inspector.tsx` stops at Take+Recipe.
//
// Ported from the contest winner's `composerHTML()` (`.contest/arena/
// library-audio-workbench/entries/claude-claude-opus-5-5_high/variant-3/
// app.js:516-558`) and the `Variations` block at the tail of `takeHTML()`
// (app.js:508-513). `WB.compose()`'s format (core.js:164-183) is ported
// verbatim below — it is what actually produces the Suno/ElevenLabs text.
//
// THREE SCOPED FINDINGS, reported in full in the WP3 report rather than
// silently working around any of them:
//
// 1. VARIATIONS ARE HONESTLY EMPTY. The source's `WB.variations()` ranks terms
//    across the WHOLE working set (best/worst keep-rate per facet); this
//    spark's non-goals exclude building a new analysis/generation pipeline,
//    and this component's prop is one `AudioAsset`, not the shelf. Rendered as
//    an empty state; there is nothing to wire Load/Copy to yet.
// 2. NO SHARED VOCABULARY TO SUGGEST FROM. `VocabSpine.tsx` keeps stance/
//    phrase as component-local `useState` (its own header comment says so) and
//    exports neither — there is no hook or helper this component can reach for
//    "preferred term" floats. The facet editors below keep their own local
//    term lists (seeded from this take) rather than duplicating VocabSpine's
//    storage a second time.
// 3. DRAFTS ARE PAGE-SESSION STATE, NOT PERSISTED. `lib/assets.ts` has no
//    draft/collection store — an audio take only carries `draft_id`/
//    `parent_id` pointers, not a list of outstanding sends. "Copy for
//    <vendor>" queues an in-memory awaiting entry for this mount; attaching a
//    file marks it returned in the same local state. Reloading the page loses
//    this list, same as the Variations gap above — flagged for the Director
//    rather than inventing a new IndexedDB store this spark did not scope.

import { useMemo, useState } from "react";

import { Dropzone } from "@/components/kit";
import { Ghost, Tally } from "@/components/ui/signal";

import { audioMetaOf, type AudioAsset } from "./Ledger";

type Target = "suno" | "elevenlabs";

interface Seed {
  genres: string[];
  moods: string[];
  instruments: string[];
  avoid: string[];
  bpm: number | undefined;
  key: string;
}

/** `WB.compose()`, ported verbatim (core.js:164-183) — the exact format the
 *  "Copy for <vendor>" button must produce. No `phraseOf()` substitution (see
 *  finding 2 above): terms render as written, not translated through a
 *  vocabulary this component cannot reach. */
function compose(seed: Seed, target: Target): string {
  const g = seed.genres;
  const mo = seed.moods;
  const ins = seed.instruments;
  const avoid = seed.avoid;
  const tk = [seed.bpm ? `${Math.round(seed.bpm)} BPM` : null, seed.key || null].filter(Boolean) as string[];
  if (target === "elevenlabs") {
    const head = [mo.join(", "), g.join(" / ")].filter(Boolean).join(" ");
    let s = (head ? head.charAt(0).toUpperCase() + head.slice(1) : "Instrumental") + " instrumental";
    if (tk.length) s += ", " + tk.join(", ");
    if (ins.length) s += ". Built on " + ins.slice(0, -1).join(", ") + (ins.length > 1 ? " and " : "") + ins[ins.length - 1] + ".";
    if (avoid.length) s += " No " + avoid.join(", no ") + ".";
    return s;
  }
  const style = g.concat(mo, ins, tk).join(", ");
  const lines = ["Style: " + style];
  if (avoid.length) lines.push("Exclude: " + avoid.join(", "));
  lines.push("", "[Instrumental]", "[Intro]", "[Build]", "[Drop]", "[Breakdown]", "[Outro]");
  return lines.join("\n");
}

function FacetRow({
  label,
  terms,
  onRemove,
  onAdd,
}: {
  label: string;
  terms: readonly string[];
  onRemove: (term: string) => void;
  onAdd: (term: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="aw__facet">
      <span className="aw__facet-l">{label}</span>
      <div className="aw__tchips">
        {terms.map((t) => (
          <span key={t} className="aw__tchip">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onRemove(t)}>
              ×
            </button>
          </span>
        ))}
        <input
          className="aw__addterm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onAdd(draft.trim());
              setDraft("");
            }
          }}
          placeholder={`+ ${label.toLowerCase()}`}
          aria-label={`Add ${label.toLowerCase()} term`}
        />
      </div>
    </div>
  );
}

interface DraftItem {
  id: string;
  target: Target;
  text: string;
  createdAt: number;
  returnedFileName: string | null;
}

export interface TakeExpansionProps {
  asset: AudioAsset;
}

export default function TakeExpansion({ asset }: TakeExpansionProps) {
  const meta = audioMetaOf(asset);
  const variations = useMemo(() => [] as ReadonlyArray<never>, []); // see finding 1 above

  const [genres, setGenres] = useState<string[]>(meta.genre_tags ?? []);
  const [moods, setMoods] = useState<string[]>(meta.mood_tags ?? []);
  const [instruments, setInstruments] = useState<string[]>(meta.instrumentation ?? []);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [bpm, setBpm] = useState<number | undefined>(meta.tempo_bpm);
  const [key, setKey] = useState(meta.key ?? "");
  const [target, setTarget] = useState<Target>(meta.vendor === "elevenlabs" ? "elevenlabs" : "suno");
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [copied, setCopied] = useState(false);

  const seed: Seed = { genres, moods, instruments, avoid, bpm, key };
  const text = compose(seed, target);

  const removeFrom = (list: string[], setList: (next: string[]) => void, term: string) =>
    setList(list.filter((t) => t !== term));
  const addTo = (list: string[], setList: (next: string[]) => void, term: string) =>
    setList(list.includes(term) ? list : [...list, term]);

  const copyForVendor = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable (no HTTPS context, headless
      // test runner) — the draft below still records the text so a manual
      // copy from the `<pre>` is always possible.
    }
    setDrafts((prev) => [
      { id: `dr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, target, text, createdAt: Date.now(), returnedFileName: null },
      ...prev,
    ]);
  };

  const attachReturn = (draftId: string, files: FileList | File[]) => {
    const file = "length" in files ? files[0] : undefined;
    if (!file) return;
    setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, returnedFileName: file.name } : d)));
  };

  const awaiting = drafts.filter((d) => !d.returnedFileName).length;

  return (
    <div className="aw__expansion">
      <section className="aw__panel" aria-label="Variations">
        <h3>
          Variations <Tally value={variations.length} />
        </h3>
        {variations.length === 0 ? (
          <Ghost shape="slot" count={1} label="no variations yet" />
        ) : null}
      </section>

      <section className="aw__panel aw__composer" aria-label="Composer">
        <h3>Composer</h3>
        <FacetRow label="Genre" terms={genres} onRemove={(t) => removeFrom(genres, setGenres, t)} onAdd={(t) => addTo(genres, setGenres, t)} />
        <FacetRow label="Mood" terms={moods} onRemove={(t) => removeFrom(moods, setMoods, t)} onAdd={(t) => addTo(moods, setMoods, t)} />
        <FacetRow
          label="Instrument"
          terms={instruments}
          onRemove={(t) => removeFrom(instruments, setInstruments, t)}
          onAdd={(t) => addTo(instruments, setInstruments, t)}
        />
        <FacetRow label="Exclude" terms={avoid} onRemove={(t) => removeFrom(avoid, setAvoid, t)} onAdd={(t) => addTo(avoid, setAvoid, t)} />

        <div className="aw__tk">
          <input
            type="number"
            min={40}
            max={220}
            value={bpm ?? ""}
            onChange={(e) => setBpm(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="BPM"
            aria-label="Tempo BPM"
          />
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key" aria-label="Key" />
          <div className="aw__seg" role="group" aria-label="Target">
            {(["suno", "elevenlabs"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={target === t} onClick={() => setTarget(t)}>
                {t === "suno" ? "Suno" : "ElevenLabs"}
              </button>
            ))}
          </div>
        </div>

        <pre className="aw__prompt" aria-label="Prompt text">
          {text}
        </pre>
        <div className="aw__composer-actions">
          <span className="aw__dim">{text.length} chars</span>
          <span className="aw__grow" />
          <button type="button" className="aw__btn aw__btn--solid" onClick={copyForVendor}>
            {copied ? "Copied" : `Copy for ${target === "suno" ? "Suno" : "ElevenLabs"}`}
          </button>
        </div>
      </section>

      <section className="aw__panel" aria-label="Drafts">
        <h3>
          Drafts <Tally value={awaiting} label="awaiting" /> <Tally value={drafts.length} label="sent" />
        </h3>
        <div className="aw__drafts">
          {drafts.length === 0 ? (
            <Ghost shape="slot" count={1} label="no drafts sent yet" />
          ) : (
            drafts.map((d) => (
              <div key={d.id} className={`aw__draft${d.returnedFileName ? "" : " aw__draft--await"}`}>
                <div className="aw__draft-h">
                  <span className="aw__chip">{d.target}</span>
                  {d.returnedFileName ? (
                    <Tally value={1} label="returned" tone="emerald" />
                  ) : (
                    <span className="aw__await-chip">awaiting return</span>
                  )}
                  <span className="aw__dim">{d.returnedFileName ?? ""}</span>
                </div>
                <div className="aw__draft-t" title={d.text}>
                  {d.text.replace(/\n+/g, " · ")}
                </div>
                {!d.returnedFileName && (
                  <Dropzone
                    accept="audio/*"
                    constraints="mp3 · wav · m4a"
                    label="Attach returned file to this draft"
                    onFiles={(files) => attachReturn(d.id, files)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
