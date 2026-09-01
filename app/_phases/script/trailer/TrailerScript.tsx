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

import type { Discipline } from "@/lib/projects";

import Notice from "../../_shared/ui/Notice";

import EnergyCurve from "./EnergyCurve";
import MovementSection from "./MovementSection";
import PromiseLedger from "./PromiseLedger";
import StructurePanel from "./StructurePanel";
import WithholdingPanel from "./WithholdingPanel";
import type { TrailerBeat } from "./types";
import { useTrailerCut } from "./useTrailerCut";

export default function TrailerScript({
  projectId,
  discipline,
  title,
}: {
  projectId: string;
  discipline: Discipline;
  title: string;
}) {
  const api = useTrailerCut({ projectId, discipline, title });

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
        <p className="font-jetbrains shrink-0 text-label leading-snug text-white/30">
          the picks and their rationale
          <br />
          live in step 1
        </p>
      </section>

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
