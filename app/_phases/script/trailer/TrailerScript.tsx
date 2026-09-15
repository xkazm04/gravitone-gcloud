"use client";

// STEP 2 · SCRIPT — THE TRAILER HALF.
//
// The explainer Script writes three candidate renders against a notebook. A
// trailer has no notebook and no candidates: Step 1 confirmed a spine — one
// picked beat per named part — and this surface is where that spine becomes a
// CUT the creator edits, with the doctrine's five fields on it (PATTERNS.md § 9):
// parts as named objects, a raised variable per rung, a connector between
// beats, a payer on every promise, the withholding budget as a campaign object,
// an energy curve, and a structure check that reports malformed / unmeasured
// and never "works".

import { Hint } from "@/components/ui/signal";
import type { Discipline } from "@/lib/projects";

import Notice from "../../_shared/ui/Notice";
import { usePhaseReport } from "../../_shared/usePhaseReport";

import EnergyCurve from "./EnergyCurve";
import MovementSection from "./MovementSection";
import PromiseLedger from "./PromiseLedger";
import StructurePanel from "./StructurePanel";
import WithholdingPanel from "./WithholdingPanel";
import type { TrailerBeat } from "./types";
import { useTrailerCut } from "./useTrailerCut";

/** "1:50" → 110. The fixture's beats carry mm:ss timecodes; the project's
 *  clock is seconds. */
const secondsOf = (at: string): number => {
  const [m, s] = at.split(":").map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : 0;
};

export default function TrailerScript({
  projectId,
  discipline,
  title,
  targetS,
}: {
  projectId: string;
  discipline: Discipline;
  title: string;
  /** The runtime the project asked for. The composed cut does not read it
   *  yet (the fixture beats carry their own timecodes) — so the surface says
   *  so rather than presenting the fixture's clock as the project's. */
  targetS?: number;
}) {
  const api = useTrailerCut({ projectId, discipline, title });

  // WHAT THIS STEP REPORTS TO THE SHELF: a cut exists → in progress; the board's
  // spine has moved past it → needs a call. Never `done` — no sign-off lives here.
  usePhaseReport(
    projectId,
    "script",
    !api.hydrated || !api.cut ? null : api.staleSpine ? "review" : "working",
  );

  if (!api.hydrated)
    return <p className="font-jetbrains text-label text-white/35">opening the project’s cut…</p>;

  if (!api.cut || !api.budget || !api.report)
    return (
      <Notice severity="info" title="no spine composed for this project yet">
        <p>
          The Script step opens on the spine Step 1 confirmed, it does not compose one. Pick one beat
          per part in Step 1 and compose — the cut appears here, editable.
        </p>
      </Notice>
    );

  const { cut, budget, report } = api;
  const lastAt = cut.beats.reduce((n, b) => Math.max(n, secondsOf(b.at)), 0);
  const lastBeatAt = cut.beats.find((b) => secondsOf(b.at) === lastAt)?.at ?? "the fixture's end";
  const byMovement = new Map<string, TrailerBeat[]>();
  for (const b of cut.beats) byMovement.set(b.movement, [...(byMovement.get(b.movement) ?? []), b]);

  // Walk the movements once so each section knows the beat before it and the
  // last rung before it — the chain and the raise-repeat rule both cross part
  // boundaries.
  const walk = cut.movements.reduce<
    { m: (typeof cut.movements)[number]; beats: TrailerBeat[]; previousBeat: TrailerBeat | null; previousRung: TrailerBeat | null }[]
  >((acc, m) => {
    const last = acc[acc.length - 1];
    const before = last ? [...last.beats].reverse()[0] ?? last.previousBeat : null;
    const rungBefore = last
      ? [...last.beats].reverse().find((b) => last.m.role === "escalation" && b.kind === "rung") ?? last.previousRung
      : null;
    acc.push({ m, beats: byMovement.get(m.id) ?? [], previousBeat: before ?? null, previousRung: rungBefore ?? null });
    return acc;
  }, []);
  const sections = walk.map((w) => (
    <MovementSection
      key={w.m.id}
      movement={w.m}
      beats={w.beats}
      previousBeat={w.previousBeat}
      previousRung={w.previousRung}
      cue={cut.cue}
      onPatch={api.setBeat}
    />
  ));

  return (
    <div data-testid="trailer-script">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="min-w-0 grow">
          <p className="font-jetbrains text-label tracking-[0.14em] text-white/35 uppercase">composed from</p>
          <p className="font-jetbrains mt-1 text-label text-white/60" data-testid="trailer-composed-line">
            {cut.beats.length} picked parts · cue: {cut.cue ? cut.cue.title : <span className="text-amber-200">none attached</span>} ·
            lane: {cut.lane}
          </p>
          <p className="mt-1.5 text-content leading-relaxed text-slate-400">
            {cut.title} · {cut.rung}
            {cut.cue && !cut.cue.frozen && (
              <span className="text-amber-200/80"> · the cue is a candidate, not frozen</span>
            )}
          </p>
        </div>
        {/* A LINK, not a sentence about where a link would go. */}
        <a
          href={`/studio/${projectId}?step=research`}
          className="font-jetbrains shrink-0 rounded-full border border-white/12 px-3 py-1 text-label text-white/45 transition hover:border-cyan-400/40 hover:text-cyan-200"
        >
          <span aria-hidden>←</span> step 1 · picks
        </a>
        {/* THE SAME DISCLOSURE THE BOARD CARRIES, repeated on the surface that
            looks most like a deliverable. Step 1 said "fixture · n=0"; this
            step showed the heist cue and campaign budget under the project's
            own title and said nothing (uat 2026-09-05, four Characters). */}
        <p
          data-testid="trailer-fixture-note"
          className="font-jetbrains flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-label text-amber-200/80"
        >
          <span className="rounded-full border border-amber-400/35 bg-amber-400/[0.07] px-2 py-0.5 tracking-[0.1em]">
            fixture · n=0
          </span>
          <Hint tone="amber">
            the beat text, the cue and the withholding budget are the Glass Harbor stand-in
          </Hint>
          {typeof targetS === "number" && lastAt > 0 && lastAt !== targetS && (
            <>
              <span>target {targetS}s</span>
              <span aria-hidden className="text-white/30">
                vs
              </span>
              <span>beats to {lastBeatAt}</span>
              <Hint tone="amber">your clock is not read by these beats yet</Hint>
            </>
          )}
        </p>
      </section>

      {/* SCRIPT BEHIND THE BOARD. The cut is composed once and then edited; it
          does not follow the picks. So when the spine on Step 1 moves past
          the one this cut came from, it is said here, with the way to take
          the new spine — and what that costs. */}
      {api.staleSpine === true && (
        <div className="mt-4">
          <Notice severity="warning" title="the spine was recomposed after this cut">
            {/* WHAT THE BUTTON BELOW WOULD DO, as three marks rather than as a
                sentence about consequence. The Notice title already says the
                spine moved. */}
            <p
              data-testid="trailer-stale-spine"
              className="font-jetbrains flex flex-wrap items-center gap-x-3 gap-y-1 text-label"
            >
              <span className="text-white/40">rebuilding</span>
              <span className="text-cyan-200/85">
                <span aria-hidden>↻ </span>beats from the board&rsquo;s picks
              </span>
              <span className="text-rose-200/85">
                <span aria-hidden>✕ </span>
                <span className="sr-only">discards </span>your edits here
              </span>
              <span className="text-emerald-200/85">
                <span aria-hidden>✓ </span>
                <span className="sr-only">keeps </span>the withholding budget
              </span>
            </p>
            <button
              type="button"
              data-testid="recompose-cut"
              onClick={api.recompose}
              className="font-jetbrains mt-2 rounded-full border border-amber-400/40 px-3.5 py-1.5 text-label text-amber-200 transition hover:bg-amber-400/10"
            >
              rebuild from the new spine
            </button>
          </Notice>
        </div>
      )}
      {/* ONE CHIP PER SPINE STATE. Each used to be a paragraph explaining what
          its own state implied. */}
      {api.staleSpine === null && (
        <p
          data-testid="trailer-spine-unknown"
          className="font-jetbrains mt-3 flex items-center gap-1.5 text-label text-white/35"
        >
          <span aria-hidden>spine ?</span>
          <span className="sr-only">spine state</span>
          unknown
          <Hint>composed before spines were stamped — rebuild from Step 1 to be sure</Hint>
        </p>
      )}
      {api.spineReopened && api.staleSpine !== true && (
        <p
          data-testid="trailer-spine-reopened"
          className="font-jetbrains mt-3 flex items-center gap-1.5 text-label text-white/35"
        >
          <span aria-hidden>spine ⌛</span>
          <span className="sr-only">spine state</span>
          reopened in step 1
          <Hint>the last composed cut, and it stays until a new one is composed</Hint>
        </p>
      )}

      <div className="mt-4">
        <EnergyCurve cut={cut} />
      </div>

      <div className="mt-4 space-y-3">{sections}</div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <PromiseLedger cut={cut} onPayer={api.setPayer} onAdd={api.addPromise} />
        <WithholdingPanel budget={budget} onAllowance={api.setAllowance} />
      </div>

      <div className="mt-4">
        <StructurePanel report={report} cut={cut} />
      </div>
    </div>
  );
}
