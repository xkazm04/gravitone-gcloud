"use client";

// THE STRENGTHS SECTION OF THE AUDIO DESK (owner ruling 2026-10-17: every Sound lab tool is
// absorbed into /audio; v1 app/playground/triage/Strengths.tsx, unreachable since Phase 3). The
// provider × value table for one facet of one kind, and the selected cell's detail: its
// figures, the takes behind it, and a lesson drafted from it - "when X, brief Y, because Z" -
// which the operator rewrites and signs through the lesson door (./lesson.ts, L65's). The draft
// states the evidence (@gt/ui strengths.ts `claimDraft`); the judgement is the signer's, and a
// cell under the evidence floor offers no sign at all.
//
// The page reads on the server (./read.ts); this island owns the facet, the sort, the picked
// cell and the claim being written. The sign waits through ../_hunt/settled.ts: a door whose
// round trip fails rejects, and the button must not stay busy behind it.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { StrengthHead, StrengthTable } from "@gt/ui/components/audio/Strengths.tsx";
import { cellKey, cellView, claimDraft, evidenceFor, FACETS, MIN_N, type Facet, type Sort, type StrengthCell } from "@gt/ui/components/audio/strengths.ts";

import { useShell } from "../../_shell/Providers.tsx";
import { settled } from "../_hunt/settled.ts";
import type { LessonDoor } from "./lesson.ts";
import type { StrengthsView } from "./read.ts";
import s from "./insight.module.css";

const opId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const pct = (r: number | null): string => (r === null ? "—" : `${Math.round(r * 100)}%`);

function Detail({ cell, view, door }: { readonly cell: StrengthCell; readonly view: StrengthsView; readonly door: LessonDoor }) {
  const router = useRouter();
  const { toast } = useShell();
  const ev = useMemo(() => evidenceFor(view.evidence.ok ? view.evidence.value : [], cell), [view.evidence, cell]);
  const [claim, setClaim] = useState(() => claimDraft(cell));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const enough = cellView(cell).state === "measured";
  const sign = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await settled(door({
      kind: cell.kind,
      source: "triage",
      provider: cell.provider,
      huntId: null,
      claim: claim.trim(),
      technique: cell.facet === "technique" ? [cell.value] : [],
      evidence: { n: ev.n, keepRate: ev.keepRate, meanScore: ev.meanScore, takeIds: [...ev.takeIds] },
      opId: opId(),
    }));
    setBusy(false);
    if (!r.ok) {
      setError(r.error.error);
      return;
    }
    setSigned(true);
    toast(`lesson · ${cell.provider} · ${cell.value}`);
    router.refresh();
  };
  return (
    <section className={s.detail} aria-label="selected cell">
      <StrengthHead cell={cell} />
      {!view.evidence.ok ? (
        <ErrorLine message={`takes: ${view.evidence.error}`} />
      ) : (
        <>
          <span className={s.figs}>
            <Tally value={ev.n} label="takes" />
            <Tally value={pct(ev.keepRate)} label="kept" />
            <Tally value={ev.meanScore === null ? "—" : ev.meanScore.toFixed(1)} label="mean" />
          </span>
          {enough ? (
            <>
              <textarea className={s.claim} aria-label="lesson claim" rows={4} value={claim} disabled={signed} onChange={(e) => setClaim(e.currentTarget.value)} />
              {error !== null && <ErrorLine message={error} live />}
              <Button label={signed ? "Signed" : "Sign lesson"} tone="emerald" disabled={busy || signed || claim.trim() === ""} onPress={() => void sign()} />
            </>
          ) : (
            <Ghost count={2} label={`${cell.n} of ${MIN_N} judged takes; no lesson until the floor`} />
          )}
        </>
      )}
    </section>
  );
}

export function StrengthsDesk({ view, lessonDoor }: { readonly view: StrengthsView; readonly lessonDoor: LessonDoor }) {
  const cells = view.cells.ok ? view.cells.value : [];
  const [facet, setFacet] = useState<Facet>(FACETS[view.kind][0] ?? "mood");
  const [sort, setSort] = useState<Sort>({ key: "keep", provider: "suno", dir: "desc" });
  const [picked, setPicked] = useState<string | null>(null);
  const cell = picked === null ? undefined : cells.find((c) => cellKey(c) === picked);
  return (
    <div className={s.split}>
      <main className={s.main}>
        <CapsHeading text="strengths" tally={{ value: view.judged, label: "judged" }} level={2} />
        {!view.cells.ok && <ErrorLine message={`ledger: ${view.cells.error}`} />}
        <StrengthTable
          kind={view.kind}
          cells={cells}
          facet={facet}
          sort={sort}
          picked={picked}
          onFacet={(f) => {
            setFacet(f);
            setPicked(null);
          }}
          onSort={setSort}
          onPick={(c) => setPicked(cellKey(c))}
        />
      </main>
      <aside className={s.side} aria-label="cell and lessons">
        {cell === undefined ? <Ghost count={2} label="no cell selected" /> : <Detail key={picked} cell={cell} view={view} door={lessonDoor} />}
        <section className={s.lessons} aria-label="lessons">
          <CapsHeading text="lessons" tally={{ value: view.lessons.ok ? view.lessons.value.length : 0, label: "signed" }} variant="section" level={3} />
          {!view.lessons.ok ? (
            <ErrorLine message={`lessons: ${view.lessons.error}`} />
          ) : view.lessons.value.length === 0 ? (
            <Ghost count={1} label="no lesson signed for this kind" />
          ) : (
            <ul className={s.lessonList}>
              {view.lessons.value.map((l) => (
                <li key={l.id} className={s.lesson}>
                  <p className={s.lessonClaim}>{l.claim}</p>
                  <span className={s.lessonMeta}>
                    {[l.provider, l.source, `n ${l.n}`, pct(l.keepRate), l.meanScore === null ? null : l.meanScore.toFixed(1), l.at.slice(0, 10)].filter((x): x is string => x !== null).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
