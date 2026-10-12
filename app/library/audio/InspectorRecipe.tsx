"use client";

// THE RECIPE — the Inspector's "Recipe" block: the take's lineage as a path
// (ancestors, the reference and what librosa measured on it, the parent take,
// the concept, the draft that asked for it or the re-composed ghost, the take
// itself, its returns, and drafts still awaiting a return). Split out of
// Inspector.tsx to keep each Inspector file under the 200-line cap.

import {
  OPENED_AT,
  ago,
  compose,
  returnsOf,
  roundOf,
  seedOf,
  tempoError,
  verdict,
  type Draft,
  type Hand,
  type Take,
} from "./book";
import { refById } from "./audioRefs";

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
