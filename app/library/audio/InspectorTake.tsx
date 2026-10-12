"use client";

// THE TAKE PANEL — the Inspector's "Take" block: title, kind, verdict, vendor,
// id, age, score; the player; the three-dimension rubric (1-10 each); keep /
// reject / clear; the reject reason quoted; the take's terms, each a filter.
// The player lives in InspectorTakePlayer.tsx, split out to keep each Inspector
// file under the 200-line cap.

import RejectBox from "./RejectBox";
import {
  OPENED_AT,
  RUBRIC,
  ago,
  dimsFor,
  dur,
  score,
  verdict,
  type Facet,
  type RatingKey,
  type Take,
  type TermFacet,
} from "./book";
import type { Engine } from "./engine";
import { TakePlayer } from "./InspectorTakePlayer";

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
