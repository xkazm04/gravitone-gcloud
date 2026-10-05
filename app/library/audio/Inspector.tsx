"use client";

// THE INSPECTOR — the right column's "Take · Compose" tab. Top to bottom:
//
//   Take        title, kind, verdict, vendor, id, age, score; the player; the
//               three-dimension rubric (1-10 each); keep / reject / clear; the
//               reject reason quoted; the take's terms, each a filter.
//   Recipe      the take's lineage as a path: ancestors, the reference and what
//               librosa measured on it, the parent take, the concept, the draft
//               that asked for it (or the prompt re-composed from its terms,
//               drawn as a ghost), the take itself, its returns, and drafts
//               still awaiting a return.
//   Variations  one axis each, so a verdict on the result says which mattered.
//   Composer    the seed as term chips, the team's preferred terms floating in,
//               tempo and key, the prompt for the chosen vendor, Copy.
//   Drafts      every copied prompt, with a drop zone for the file it returned.
//
// Ported from the contest entry's app.js#takeHTML/#lineageHTML/#composerHTML.

import { useId, useSyncExternalStore } from "react";

import { Dropzone, Player } from "@/components/kit";

import RejectBox from "./RejectBox";
import {
  OPENED_AT,
  RUBRIC,
  ago,
  compose,
  dimsFor,
  dur,
  peaksOf,
  returnsOf,
  roundOf,
  score,
  seedOf,
  tempoError,
  verdict,
  type Draft,
  type Facet,
  type Hand,
  type RatingKey,
  type Seed,
  type Take,
  type Target,
  type TermEntry,
  type TermFacet,
  type Variation,
} from "./book";
import { refById } from "./audioRefs";
import type { Engine } from "./engine";

/* ── the take ──────────────────────────────────────────────────────────── */

function TakePlayer({
  engine,
  take,
  url,
  playable,
}: {
  engine: Engine;
  take: Take;
  url: string | null;
  playable: boolean;
}) {
  const st = useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => null);
  const mine = st && st.id === take.id ? st : null;
  const duration = mine?.duration || take.duration_s || 0;
  return (
    <Player
      label={take.title}
      peaks={peaksOf(take, 96)}
      playing={mine?.playing ?? false}
      position={mine?.position ?? 0}
      duration={duration}
      disabled={!playable}
      onToggle={() => engine.toggle(take, url)}
      onSeek={(t) => engine.seek(take, t, url)}
    />
  );
}

export function TakePanel({
  take,
  dim,
  engine,
  url,
  playable,
  rejectOpen,
  reasons,
  onRate,
  onKeep,
  onRejectOpen,
  onRejectCommit,
  onRejectCancel,
  onClear,
  onSeedFrom,
  onFilterTerm,
}: {
  take: Take | undefined;
  dim: number;
  engine: Engine;
  url: string | null;
  playable: boolean;
  rejectOpen: boolean;
  reasons: [string, number][];
  onRate: (key: RatingKey, n: number) => void;
  onKeep: () => void;
  onRejectOpen: () => void;
  onRejectCommit: (reason: string) => void;
  onRejectCancel: () => void;
  onClear: () => void;
  onSeedFrom: () => void;
  onFilterTerm: (facet: TermFacet, term: string) => void;
}) {
  if (!take)
    return (
      <section className="panel">
        <div className="empty">—</div>
      </section>
    );
  const v = verdict(take);
  const dims = dimsFor(take);
  const s = score(take);
  const termChips = (facet: Facet, list: string[]) =>
    list.map((t) => (
      <button key={t} type="button" className="chip" onClick={() => onFilterTerm(facet, t)}>
        {t}
      </button>
    ));
  return (
    <section className="panel" aria-label="Take" data-testid="audio-take">
      <h2 className="insp-title">{take.title}</h2>
      <div className="meta">
        <span className={`kind kind--${take.kind}`}>{take.kind === "track" ? "T" : "FX"}</span>
        <span className={`pill t-${v}`} data-testid="audio-take-verdict">
          {v}
        </span>
        {take.vendor && <span className="chip">{take.vendor}</span>}
        <span className="mono">{take.id}</span>
        <span className="dim">{ago(take.created_at, OPENED_AT)}</span>
        {s != null && (
          <span className="tally">
            <b>{s.toFixed(1)}</b>
            <small>score</small>
          </span>
        )}
      </div>
      <TakePlayer engine={engine} take={take} url={url} playable={playable} />
      <div className="rubric" role="group" aria-label="Rubric">
        {RUBRIC.map((d, di) => {
          const val = take.ratings?.[d.key] ?? null;
          const off = !dims.includes(di);
          return (
            <div key={d.key} className={`rub${di === dim ? " is-dim" : ""}`}>
              <span className="rub__l" aria-hidden="true">
                {d.short}
              </span>
              <div className="rub__s" role="radiogroup" aria-label={d.label}>
                {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={val === n}
                    aria-label={`${d.label} ${n}`}
                    className={val === n ? "at" : val != null && n < val ? "fill" : ""}
                    disabled={off}
                    onClick={() => onRate(d.key, n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="rub__v">{off ? "n/a" : val == null ? "·" : val}</span>
            </div>
          );
        })}
      </div>
      <div className="actions">
        <button type="button" className="btn btn--keep" aria-pressed={v === "kept" || v === "proven"} onClick={onKeep}>
          Keep <kbd>↵</kbd>
        </button>
        <button type="button" className="btn btn--rej" onClick={onRejectOpen}>
          Reject <kbd>X</kbd>
        </button>
        {v !== "unjudged" && (
          <button type="button" className="btn" onClick={onClear}>
            Clear <kbd>U</kbd>
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn btn--cyan" disabled={take.kind !== "track"} onClick={onSeedFrom}>
          Seed composer
        </button>
      </div>
      {rejectOpen && (
        <div style={{ marginTop: 10 }}>
          <RejectBox
            label="Reject reason"
            reasons={reasons.slice(0, 6)}
            onCommit={onRejectCommit}
            onCancel={onRejectCancel}
          />
        </div>
      )}
      {take.reject_reason && v === "rejected" && <p className="quote">{take.reject_reason}</p>}
      <dl className="facts">
        {take.kind === "track" ? (
          <>
            <dt>Genre</dt>
            <dd>{termChips("genre_tags", take.genre_tags)}</dd>
            <dt>Mood</dt>
            <dd>{termChips("mood_tags", take.mood_tags)}</dd>
            <dt>Instr.</dt>
            <dd>{termChips("instrumentation", take.instrumentation)}</dd>
            <dt>Tempo</dt>
            <dd className="mono">
              {take.tempo_bpm ? `${Math.round(take.tempo_bpm)} BPM` : "—"} · {take.key ?? "—"}
            </dd>
          </>
        ) : (
          <>
            <dt>Category</dt>
            <dd>
              {take.sfx_category && (
                <button type="button" className="chip" onClick={() => onFilterTerm("sfx_category", take.sfx_category!)}>
                  {take.sfx_category}
                </button>
              )}
              {take.loopable && <span className="chip">loop</span>}
            </dd>
          </>
        )}
        <dt>Length</dt>
        <dd className="mono">
          {dur(take.duration_s)}
          {take.file_name ? ` · ${take.file_name}` : ""}
          {take.upload_id && !playable ? " · file missing" : ""}
        </dd>
      </dl>
    </section>
  );
}

/* ── the recipe ────────────────────────────────────────────────────────── */

export function Recipe({
  take,
  byId,
  takes,
  drafts,
  hands,
  onOpen,
}: {
  take: Take;
  byId: ReadonlyMap<string, Take>;
  takes: readonly Take[];
  drafts: readonly Draft[];
  hands: Record<string, Hand>;
  onOpen: (id: string) => void;
}) {
  const items: React.ReactNode[] = [];
  const parent = take.parent_id ? byId.get(take.parent_id) : undefined;
  if (parent?.parent_id) {
    const chain: Take[] = [];
    let p = byId.get(parent.parent_id);
    while (p && chain.length < 4) {
      chain.unshift(p);
      p = p.parent_id ? byId.get(p.parent_id) : undefined;
    }
    for (const a of chain)
      items.push(
        <li key={`anc-${a.id}`}>
          <div className="k">
            ancestor <span className={`pill t-${verdict(a)}`}>{verdict(a)}</span>
          </div>
          <button type="button" className="linkrow" onClick={() => onOpen(a.id)}>
            {a.title}
          </button>
        </li>,
      );
  }
  const refId = take.reference_track_id ?? parent?.reference_track_id ?? null;
  const ref = refById(refId);
  if (refId) {
    const lib = ref?.measured.librosa;
    const err = ref && lib ? tempoError(lib.tempo_bpm, ref.truth.tempo_bpm) : null;
    items.push(
      <li key="ref">
        <div className="k">reference</div>
        <div className="v">{ref ? `${ref.artist} — ${ref.title}` : refId}</div>
        {lib && err && (
          <div className="k">
            <span className="chip mono">librosa {lib.tempo_bpm.toFixed(1)} BPM</span>
            <span className="chip mono">{lib.key}</span>
            <span className={`chip ${err.ok ? "ok" : "bad"}`}>{err.kind}</span>
          </div>
        )}
      </li>,
    );
  } else if (take.kind === "track" && !parent) {
    items.push(
      <li key="ref" className="ghost">
        <div className="k">reference</div>
        <div className="v dim">—</div>
      </li>,
    );
  }
  if (parent)
    items.push(
      <li key="parent">
        <div className="k">
          parent take <span className={`pill t-${verdict(parent)}`}>{verdict(parent)}</span>
        </div>
        <button type="button" className="linkrow" onClick={() => onOpen(parent.id)}>
          {parent.title}
        </button>
      </li>,
    );
  if (take.kind === "track") {
    const r = take.prompt_round ? roundOf(take.prompt_round) : null;
    items.push(
      <li key="concept">
        <div className="k">
          concept
          {r && <span className={`chip chip--src${r.retired ? " chip--retired" : ""}`}>{r.s}</span>}
          {r?.retired && <span className="tag-retired">retired</span>}
        </div>
        <div className="v">
          {[take.genre_tags.join(" / "), take.tempo_bpm ? `${Math.round(take.tempo_bpm)} BPM` : "", take.key ?? ""]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </li>,
    );
  }
  const draft = take.draft_id ? drafts.find((d) => d.id === take.draft_id) : undefined;
  const text = take.prompt_text ?? draft?.text ?? null;
  if (text)
    items.push(
      <li key="draft">
        <div className="k">
          draft <span className="chip">{draft?.target ?? take.vendor ?? ""}</span>
          {draft?.copied_at && <span className="dim">copied {ago(draft.copied_at, OPENED_AT)}</span>}
        </div>
        <pre>{text}</pre>
      </li>,
    );
  else if (take.kind === "track")
    items.push(
      <li key="draft" className="ghost">
        <div className="k">
          draft <span className="chip">re-composed</span>
        </div>
        <pre>{compose(seedOf(take), take.vendor === "elevenlabs" ? "elevenlabs" : "suno", hands)}</pre>
      </li>,
    );
  items.push(
    <li key="here" className="here">
      <div className="k">
        this take <span className={`pill t-${verdict(take)}`}>{verdict(take)}</span>
        {take.vendor && <span className="chip">{take.vendor}</span>}
      </div>
      <div className="v">{take.title}</div>
    </li>,
  );
  for (const k of takes.filter((t) => t.parent_id === take.id))
    items.push(
      <li key={`ret-${k.id}`}>
        <div className="k">
          return <span className={`pill t-${verdict(k)}`}>{verdict(k)}</span>
        </div>
        <button type="button" className="linkrow" onClick={() => onOpen(k.id)}>
          {k.title}
        </button>
      </li>,
    );
  for (const d of drafts.filter((d) => d.parent_id === take.id && returnsOf(d.id, takes).length === 0))
    items.push(
      <li key={`await-${d.id}`} className="ghost">
        <div className="k">
          <span className="await-chip">awaiting return</span>
          <span className="chip">{d.target}</span>
        </div>
        <div className="draft__t">{d.text.split("\n")[0]}</div>
      </li>,
    );
  return (
    <section className="panel" aria-label="Recipe">
      <h3>Recipe</h3>
      <ol className="path">{items}</ol>
    </section>
  );
}

/* ── variations ────────────────────────────────────────────────────────── */

export function Variations({
  list,
  onLoad,
  onCopy,
}: {
  list: Variation[];
  onLoad: (v: Variation) => void;
  onCopy: (v: Variation) => void;
}) {
  if (!list.length) return null;
  return (
    <section className="panel" aria-label="Variations">
      <h3>
        Variations{" "}
        <span className="tally">
          <b>{list.length}</b>
        </span>
        <span className="grow" />
        <span className="dim plain">one axis each</span>
      </h3>
      <div className="vars">
        {list.map((x, i) => (
          <div key={`${x.axis}-${i}`} className="var">
            <div className="ax">
              {x.axis}
              <span>{x.why}</span>
            </div>
            <div>
              {x.diff.map((d) => (
                <span
                  key={d}
                  className={`diff ${d[0] === "−" ? "minus" : d[0] === "+" && !/BPM/.test(d) ? "plus" : "same"}`}
                >
                  {d}
                </span>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => onLoad(x)}>
                Load
              </button>
              <button type="button" className="btn btn--cyan" onClick={() => onCopy(x)}>
                Copy
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── the composer ──────────────────────────────────────────────────────── */

type SeedList = "genres" | "moods" | "instruments";
const FACET_OF: Record<SeedList, Facet> = {
  genres: "genre_tags",
  moods: "mood_tags",
  instruments: "instrumentation",
};

/** A text field that adds its value to a seed list on change (Enter or blur),
 *  then clears — the entry's `change` listener. Uncontrolled on purpose: what
 *  is typed is not state until it is committed. */
function AddTerm({
  list,
  label,
  placeholder,
  onAdd,
}: {
  list: string;
  label: string;
  placeholder: string;
  onAdd: (v: string) => void;
}) {
  return (
    <input
      className="addterm"
      list={list}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => {
        // A pick from the datalist arrives as one change with no keystroke
        // after it; commit it straight away, as the entry's `change` did.
        const native = e.nativeEvent as InputEvent;
        if (native.inputType === "insertReplacementText") {
          const v = e.currentTarget.value.trim();
          if (v) {
            onAdd(v);
            e.currentTarget.value = "";
          }
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const v = e.currentTarget.value.trim();
        if (v) onAdd(v);
        e.currentTarget.value = "";
      }}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v) onAdd(v);
        e.currentTarget.value = "";
      }}
    />
  );
}

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
      <div className="facet">
        <span className="caps">Tempo · key</span>
        <div className="tk">
          <input
            type="number"
            min={40}
            max={220}
            step={1}
            value={sd.bpm ? Math.round(sd.bpm) : ""}
            placeholder="BPM"
            aria-label="Tempo BPM"
            onChange={(e) => onSeed({ ...sd, bpm: Number(e.target.value) || null })}
          />
          <input
            className="key"
            list={dl("keys")}
            value={sd.key ?? ""}
            placeholder="key"
            aria-label="Key"
            onChange={(e) =>
              onSeed({
                ...sd,
                key: e.target.value.trim() ? e.target.value : null,
              })
            }
          />
          <span className="grow" />
          <div className="seg" role="group" aria-label="Target">
            {(
              [
                ["suno", "Suno"],
                ["elevenlabs", "ElevenLabs"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={target === k} onClick={() => onTarget(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
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

/* ── drafts ────────────────────────────────────────────────────────────── */

export function Drafts({
  drafts,
  takes,
  byId,
  onOpen,
  onAttach,
}: {
  drafts: readonly Draft[];
  takes: readonly Take[];
  byId: ReadonlyMap<string, Take>;
  onOpen: (id: string) => void;
  onAttach: (file: File, draftId: string) => void;
}) {
  const awaiting = drafts.filter((d) => returnsOf(d.id, takes).length === 0).length;
  return (
    <section className="panel" aria-label="Drafts">
      <h3>
        Drafts{" "}
        <span className="tally">
          <b>{awaiting}</b>
          <small>awaiting</small>
        </span>
        <span className="tally">
          <b>{drafts.length}</b>
          <small>sent</small>
        </span>
      </h3>
      <div className="drafts">
        {drafts.slice(0, 8).map((d) => {
          const rets = returnsOf(d.id, takes);
          const par = d.parent_id ? byId.get(d.parent_id) : undefined;
          const ref = refById(d.ref_id);
          return (
            <div key={d.id} className={`draft${rets.length ? "" : " await"}`}>
              <div className="draft__h">
                <span className="chip">{d.target}</span>
                {rets.length ? (
                  <span className="tally t-kept">
                    <b>{rets.length}</b>
                    <small>returned</small>
                  </span>
                ) : (
                  <span className="await-chip">awaiting return</span>
                )}
                {par ? (
                  <button type="button" className="chip" onClick={() => onOpen(par.id)}>
                    ↑ {par.title}
                  </button>
                ) : ref ? (
                  <span className="chip chip--ref">ref·{ref.title}</span>
                ) : null}
                <span className="dim">{ago(d.created_at, OPENED_AT)}</span>
                {rets.map((r) => (
                  <button key={r.id} type="button" className="chip chip--ret" onClick={() => onOpen(r.id)}>
                    {r.title}
                  </button>
                ))}
              </div>
              <div className="draft__t">{d.text.replace(/\n+/g, " · ")}</div>
              <Dropzone
                accept="audio/*"
                constraints="the file you downloaded · mp3 · wav · m4a"
                label={`Attach the returned file to the ${d.target} draft`}
                onFiles={(files) => {
                  const f = files[0];
                  if (f) onAttach(f, d.id);
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
