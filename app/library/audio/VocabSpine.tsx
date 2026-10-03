"use client";

// THE VOCAB SPINE — the Audio Workbench's left panel, ported from the contest
// winner's terms list (`app.js:231-276`, `app.css:83-98`). Caveat 3
// (`.vault/Spark/ideas/library-audio-workbench-port.md`) applies from the
// start, not as a retrofit:
//
//   - 2 grid rows per term, not 3: row 1 is stance + name + numbers, row 2 is
//     the keep-rate bar at HALF the source's height (6px -> 3px).
//   - No row 3. The reject-reason chip is dropped outright (caveat 3 says so
//     directly); the phrase-editing input that lived there is RELOCATED, not
//     deleted — it opens in a per-term detail panel when the term's name is
//     clicked, the same surface the ★/⊘ stance toggles already live on.
//
// STANCE AND PHRASE ARE VIEW STATE, NOT PERSISTED. WP1's data model carries no
// vocabulary store — `AudioMeta` (lib/assets.ts) holds tags per asset, and the
// source's own `WB.vocabulary()` is a derived read, never a write target this
// repo's model has an equivalent for yet. A term's stance or phrasing is
// therefore remembered only for this page's mounted lifetime, which is stated
// here rather than silently dropped; persisting it is a later package's call
// once there is a real place to put it.

import { useMemo, useState } from "react";

import { Ghost, Tally } from "@/components/ui/signal";
import type { Asset } from "@/lib/assets";

import { audioMetaOf } from "./Ledger";

type Facet = "genre_tags" | "mood_tags" | "instrumentation" | "sfx_category";

interface TermStat {
  id: string;
  facet: Facet;
  term: string;
  n: number;
  kept: number;
  rejected: number;
  keepRate: number | null;
  avg: number | null;
}

const SECTIONS: ReadonlyArray<{ facet: Facet; label: string }> = [
  { facet: "genre_tags", label: "Genre" },
  { facet: "mood_tags", label: "Mood" },
  { facet: "instrumentation", label: "Instrument" },
  { facet: "sfx_category", label: "Effect category" },
];

function termsOf(facet: Facet, meta: ReturnType<typeof audioMetaOf>): string[] {
  if (facet === "sfx_category") return meta.sfx_category ? [meta.sfx_category] : [];
  if (facet === "genre_tags") return meta.genre_tags ?? [];
  if (facet === "mood_tags") return meta.mood_tags ?? [];
  return meta.instrumentation ?? [];
}

function buildTerms(assets: readonly Asset[], facet: Facet): TermStat[] {
  const m = new Map<string, { n: number; kept: number; rejected: number; sum: number; rated: number }>();
  for (const a of assets) {
    const meta = audioMetaOf(a);
    const vals = [meta.ratings?.melody, meta.ratings?.instrument_choice, meta.ratings?.instrument_quality].filter(
      (v): v is number => typeof v === "number",
    );
    const avg = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    for (const term of termsOf(facet, meta)) {
      if (!m.has(term)) m.set(term, { n: 0, kept: 0, rejected: 0, sum: 0, rated: 0 });
      const e = m.get(term)!;
      e.n++;
      if (meta.verdict === "kept" || meta.verdict === "proven") e.kept++;
      if (meta.verdict === "rejected") e.rejected++;
      if (avg != null) {
        e.sum += avg;
        e.rated++;
      }
    }
  }
  return [...m.entries()]
    .map(([term, e]) => {
      const judged = e.kept + e.rejected;
      return {
        id: `${facet}:${term}`,
        facet,
        term,
        n: e.n,
        kept: e.kept,
        rejected: e.rejected,
        keepRate: judged ? e.kept / judged : null,
        avg: e.rated ? e.sum / e.rated : null,
      };
    })
    .sort((a, b) => (b.kept + 1) / (b.n + 2) - (a.kept + 1) / (a.n + 2) || b.n - a.n || a.term.localeCompare(b.term));
}

type Stance = "prefer" | "avoid" | null;

export default function VocabSpine({ assets }: { assets: readonly Asset[] }) {
  const [stance, setStance] = useState<Record<string, Stance>>({});
  const [phrase, setPhrase] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<Facet>>(new Set());

  const sections = useMemo(
    () => SECTIONS.map((s) => ({ ...s, terms: buildTerms(assets, s.facet) })),
    [assets],
  );

  return (
    <div aria-label="Vocabulary" className="flex flex-col gap-1">
      {sections.map((sec) => {
        const open = !collapsed.has(sec.facet);
        return (
          <section key={sec.facet} className="border-b border-white/8 pb-1">
            <button
              type="button"
              className="aw__section-head"
              aria-expanded={open}
              onClick={() =>
                setCollapsed((c) => {
                  const next = new Set(c);
                  if (next.has(sec.facet)) next.delete(sec.facet);
                  else next.add(sec.facet);
                  return next;
                })
              }
            >
              <span className="text-label font-semibold tracking-[0.1em] text-white/55 uppercase">{sec.label}</span>
              <span className="grow" />
              <Tally value={sec.terms.length} />
            </button>

            {open &&
              (sec.terms.length === 0 ? (
                <Ghost shape="slot" count={1} label={`no ${sec.label.toLowerCase()} terms yet`} />
              ) : (
                sec.terms.map((t) => {
                  const st = stance[t.id] ?? null;
                  const isOpen = openId === t.id;
                  const unjudged = Math.max(0, t.n - t.kept - t.rejected);
                  const kr = t.keepRate == null ? "—" : `${Math.round(t.keepRate * 100)}%`;
                  return (
                    <div key={t.id} className={`aw__term${isOpen ? " aw__term--on" : ""}`}>
                      {t.facet === "sfx_category" ? (
                        <>
                          <span aria-hidden />
                          <span aria-hidden />
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="aw__stance aw__stance--prefer"
                            aria-pressed={st === "prefer"}
                            aria-label={`Prefer ${t.term}`}
                            onClick={() =>
                              setStance((s) => ({ ...s, [t.id]: s[t.id] === "prefer" ? null : "prefer" }))
                            }
                          >
                            ★
                          </button>
                          <button
                            type="button"
                            className="aw__stance aw__stance--avoid"
                            aria-pressed={st === "avoid"}
                            aria-label={`Avoid ${t.term}`}
                            onClick={() => setStance((s) => ({ ...s, [t.id]: s[t.id] === "avoid" ? null : "avoid" }))}
                          >
                            ⊘
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        className="aw__term-name"
                        aria-expanded={isOpen}
                        onClick={() => setOpenId(isOpen ? null : t.id)}
                      >
                        {t.term}
                      </button>
                      <span className="aw__term-nums">
                        <b>{kr}</b> · {t.n} · {t.avg == null ? "—" : t.avg.toFixed(1)}
                      </span>
                      <span
                        className="aw__term-bar"
                        role="img"
                        aria-label={`${t.kept} kept, ${unjudged} unjudged, ${t.rejected} rejected of ${t.n}`}
                      >
                        <i style={{ width: `${(t.kept / t.n) * 100}%`, background: "var(--al-ald)" }} />
                        <i style={{ width: `${(unjudged / t.n) * 100}%`, background: "var(--al-ash)" }} />
                        <i style={{ width: `${(t.rejected / t.n) * 100}%`, background: "var(--al-ant)" }} />
                      </span>

                      {isOpen && (
                        <div className="aw__term-detail">
                          <label className="text-label text-white/55" htmlFor={`phrase-${t.id}`}>
                            Phrasing
                          </label>
                          <input
                            id={`phrase-${t.id}`}
                            value={phrase[t.id] ?? ""}
                            onChange={(e) => setPhrase((p) => ({ ...p, [t.id]: e.target.value }))}
                            placeholder="as written in the prompt"
                            aria-label={`Prompt phrasing for ${t.term}`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              ))}
          </section>
        );
      })}
    </div>
  );
}
