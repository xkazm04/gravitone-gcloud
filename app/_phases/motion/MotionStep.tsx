"use client";

// STEP 4 — MOTION. Stage 1 of video-clip-pipeline-B: each plate Frames drew is
// READ, and either gets a proposed motion line (with the reading it was written
// from) or is DECLINED with the reason. The creator accepts or edits; the line
// lands on the frame's own clip (`FrameClip.motion`). Nothing here renders —
// the render queue, takes and adoption are later stages — so nothing here
// claims a render either: no progress bar, no preview, `clip.status` untouched.
//
// Signal vocabulary only (components/ui/signal): counts are Tallies, a missing
// plate is a Ghost, an empty cut is an UpstreamBreak, who read a plate is
// Provenance. The proposal, the moves, a decline's reason and a failure's
// machine line are the work, and are shown verbatim.

import { useState } from "react";

import { Button } from "@/components/ui/Primitives";
import { TextArea } from "@/components/ui/Field";
import { CHIP_CLASS, Ghost, Provenance, TALLY_TONE, Tally, UpstreamBreak } from "@/components/ui/signal";
import { getProject, type Discipline } from "@/lib/projects";

import { useLoadFor } from "../_shared/useLoadFor";
import type { Frame } from "../frames/frames";

import AdsMotion from "./ads/AdsMotion";

import { plateImage, type MotionOutcome } from "./direction";
import { useMotion } from "./useMotion";

/** THE ROUTER — FramesStep.tsx's shape: an ads project's clips are animated
 *  from its adopted key images (./ads), and it is routed away HERE, before
 *  `useMotion` mounts and reads a frame ledger an ads project does not have. */
export default function MotionStep({ projectId }: { projectId: string }) {
  const [discipline, setDiscipline] = useState<Discipline | undefined>(undefined);
  const hydrated = useLoadFor(
    projectId,
    (id) => getProject(id),
    (p) => setDiscipline(p?.discipline ?? "educational"),
  );

  if (!hydrated)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
        reading the cut…
      </p>
    );
  if (discipline === "ads") return <AdsMotion projectId={projectId} />;
  return <StandardMotion projectId={projectId} />;
}

function StandardMotion({ projectId }: { projectId: string }) {
  const m = useMotion(projectId);

  if (!m.loaded)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
        reading the cut…
      </p>
    );

  if (m.trouble)
    return (
      <UpstreamBreak
        blockedAt="frames"
        current="motion"
        done={m.doneUp}
        severity="error"
        detail={`${m.trouble.kind} · on ${m.trouble.op} of the ${m.trouble.phase} step — ${m.trouble.message}`}
      />
    );

  if (m.frames.length === 0)
    return (
      <UpstreamBreak
        blockedAt="frames"
        current="motion"
        done={m.doneUp}
        action={{ label: "Open Frames", href: `/studio/${projectId}?step=frames` }}
      />
    );

  const moving = m.frames.filter((f) => f.clip?.motion?.trim()).length;
  const declined = Object.values(m.outcomes).filter((o) => o.kind === "declined").length;

  return (
    <section className="space-y-4" aria-label="Motion">
      <div className="flex flex-wrap items-center gap-2">
        <Tally value={moving} of={m.frames.length} label="moving" tone={moving ? "cyan" : "neutral"} />
        {declined > 0 && <Tally value={declined} label="declined" tone="amber" />}
      </div>
      {m.refused && (
        <p className="font-jetbrains text-label text-rose-200/90">
          {m.refused.refused} · {m.refused.detail}
        </p>
      )}
      <ol className="space-y-3">
        {m.frames.map((f) => (
          <FrameRow
            key={f.id}
            frame={f}
            outcome={m.outcomes[f.id]}
            call={m.calls[f.id]}
            onDirect={() => void m.direct(f.id)}
            onAccept={(line) => void m.accept(f.id, line)}
          />
        ))}
      </ol>
    </section>
  );
}

function FrameRow({
  frame,
  outcome,
  call,
  onDirect,
  onAccept,
}: {
  frame: Frame;
  outcome: MotionOutcome | undefined;
  call: { busy: true } | { busy: false; error: string } | undefined;
  onDirect: () => void;
  onAccept: (line: string) => void;
}) {
  const directable = plateImage(frame.plate?.src) !== null;
  const busy = call?.busy === true;
  const line = frame.clip?.motion?.trim() ?? "";

  return (
    <li className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
      {directable ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: URL plate; next/image cannot optimise it
        <img src={frame.plate.src} alt={frame.title} className="aspect-video w-full rounded-lg object-cover" />
      ) : (
        <Ghost shape="card" label="no plate" className="aspect-video w-full" />
      )}
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-jetbrains text-label text-white/40">{frame.at}</span>
          <span className="text-content text-white/85">{frame.title}</span>
        </div>
        {line && <p className="text-content text-cyan-100/85">{line}</p>}
        {outcome?.kind === "proposed" && (
          <Proposal key={`${outcome.at}`} outcome={outcome} accepted={line === outcome.motion} onAccept={onAccept} />
        )}
        {outcome?.kind === "declined" && (
          <p className="flex flex-wrap items-baseline gap-2 text-content text-white/70">
            <span className={`${CHIP_CLASS} ${TALLY_TONE.amber}`}>declined</span>
            {outcome.reason}
          </p>
        )}
        {call && !call.busy && (
          <p className="font-jetbrains text-label text-rose-200/90">
            {call.error}
          </p>
        )}
        {directable && (
          <Button size="sm" variant="ghost" onClick={onDirect} disabled={busy} aria-busy={busy}>
            {outcome ? "Direct again" : "Direct"}
          </Button>
        )}
      </div>
    </li>
  );
}

function Proposal({
  outcome,
  accepted,
  onAccept,
}: {
  outcome: Extract<MotionOutcome, { kind: "proposed" }>;
  accepted: boolean;
  onAccept: (line: string) => void;
}) {
  const [draft, setDraft] = useState(outcome.motion);
  return (
    <div className="space-y-2">
      <TextArea
        aria-label="Proposed motion"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-full"
      />
      <ul className="flex flex-wrap gap-1.5" aria-label="Moves">
        {outcome.basis.moves.map((mv) => (
          <li key={mv.element} className={`${CHIP_CLASS} ${TALLY_TONE.cyan}`}>
            {mv.element} · {mv.verb}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onAccept(draft)} disabled={!draft.trim() || (accepted && draft === outcome.motion)}>
          Accept
        </Button>
        <Provenance model={outcome.basis.model} vendor={outcome.basis.provider} />
      </div>
    </div>
  );
}
