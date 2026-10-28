// THE STUDIO DESK (spark audio-agent-studio, variant "desk"): a calm DAW-lite for someone who has
// never opened one. Above, one sentence strip: what the agent heard and any two wishes that pull
// apart. The main frame is a timeline - the transport (with the duel as an A/B switch), the
// sections ruler, the track as the master lane, one lane per part beneath with a "try instead"
// drawer docked to the part it would replace - and one playhead across all of it. The arrangement
// stays on the desk until a newer answer replaces it. Right: next steps, and what works without
// the agent. Every piece is drawn through the kind registry (./registry.tsx); nothing runs because
// it rendered.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { sectionSpans } from "@gt/ui/components/audio/mix.ts";
import { droppedWords } from "@gt/ui/components/dock/dock.ts";
import { axisTemplate, deskAxis, deskPieces, fracAt } from "@gt/ui/components/studio-desk/desk.ts";

import type { VariantProps } from "../../_host/types.ts";
import { deskPresses, deskSound, type DeskCtx } from "./ctx.ts";
import { stemsOnDesk } from "./Lanes.tsx";
import { TransportBar } from "./Master.tsx";
import { NextSteps } from "./NextSteps.tsx";
import { drawKind, extras } from "./registry.tsx";
import { usePlayhead } from "./usePlayhead.ts";
import lanes from "./lanes.module.css";
import s from "./desk.module.css";

export function Variant(v: VariantProps) {
  const { session, transport, dock } = v;
  const visible = session.visible;
  const desk = useMemo(() => deskPieces(session.turns, visible?.turn.id ?? null), [session.turns, visible]);
  const timeline = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({});

  const track = desk.track[0];
  const sections = desk.sections[0];
  const all = deskSound(v, desk);
  const mixKey = track === undefined ? null : `${track.turnId}/${track.node.id}`;
  const key = transport.sounding?.key ?? null;
  // The arrangement sounds: every part, one part, the finished mix, or a whole-track comparison; not a candidate on its own.
  const arrangement = key !== null && transport.state === "playing" && !key.endsWith(":alone") && !key.includes("/side");
  const mixHref = track?.node.mix.href;
  const length = transport.duration;
  // The track's length, learned the first time it sounds (React's adjust-state-while-rendering pattern).
  if (mixHref !== undefined && length !== null && key !== null && measured[mixHref] === undefined && (key === mixKey || (all !== null && key.startsWith(all.key)))) {
    setMeasured({ ...measured, [mixHref]: length });
  }

  const totalS = track?.node.lengthS ?? (mixHref === undefined ? undefined : measured[mixHref]) ?? null;
  const spans = sections === undefined ? null : sectionSpans(sections.node.rows, track?.node.bpm);
  const axis = sections === undefined ? null : deskAxis(sections.node.rows, spans, totalS);

  const hrefs = useMemo(() => [...(desk.track[0] === undefined ? [] : [desk.track[0].node.mix.href]), ...(desk.stems[0]?.node.rows.flatMap((r) => (r.audio === undefined ? [] : [r.audio.href])) ?? [])], [desk]);
  const { decode } = transport;
  useEffect(() => {
    if (hrefs.length > 0) decode(hrefs);
  }, [decode, hrefs]);

  usePlayhead(timeline, arrangement, transport.position, transport.duration, transport.clock, axis?.audio ?? 1);

  if (visible === null) return <p className={s.waiting}>The agent has not answered yet.</p>;

  const ctx: DeskCtx = {
    v,
    desk,
    visibleId: visible.turn.id,
    actions: visible.turn.actions,
    axis,
    totalS,
    agentOpen: dock.state === "listening",
    head: arrangement ? fracAt(transport.clock, transport.duration) : null,
    slot: (kind, only) => drawKind(kind, ctx, only),
    ...deskPresses(v, desk),
  };
  const onDesk = stemsOnDesk(desk.stems[0]?.node);
  const notes = droppedWords(v.dropped);
  const more = extras(ctx);
  const strip = desk.heard.length + desk.pull.length > 0;

  return (
    <div className={s.desk} data-variant="desk">
      <div className={s.main}>
        {strip && (
          <section className={s.strip} aria-label="what I heard">
            {ctx.slot("heard")}
            {ctx.slot("pull")}
          </section>
        )}
        <div ref={timeline} className={`${s.timeline} ${lanes.axis}`} style={{ "--desk-cols": axisTemplate(axis) } as CSSProperties} data-playing={arrangement}>
          <TransportBar ctx={ctx} />
          {ctx.slot("sections")}
          {ctx.slot("track")}
          {ctx.slot("stems")}
          {ctx.slot("candidates", (c) => c.kind === "candidates" && !("stem" in c.for && onDesk.has(c.for.stem)))}
        </div>
        {(notes !== null || more.length > 0) && (
          <section className={s.notes} aria-label="desk notes">
            <span className={s.kicker}>desk notes</span>
            {notes !== null && <b className={s.noteHead}>{notes.summary}</b>}
            <ul className={s.noteList}>
              {[...(notes?.rows ?? []), ...more].map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <NextSteps ctx={ctx} />
    </div>
  );
}
