// THE "STAGE" VARIANT (spark audio-agent-studio WP4): the band on stage, seen from the audience. The
// song's house transport sits above the stage; every part of the song is a performer standing where a
// band stands (drums at the back, bass and chords on the flanks, tunes in front); the song's parts are
// a lighting strip along the stage front; players who could take a spot wait in the wing beside it;
// the agent's reading of your words is a director's note pinned at the stage edge, its measurements an
// engineer's readout in the corner, a duel two spotlights under the stage. Right: the next steps.
//
// Each piece is drawn by lookup in ./registry.tsx (one table, eight kinds, a boundary per piece). Every
// press goes through the host's dispatch. The stage adds one thing of its own: a mixer press (step
// back, spotlight, volume, left/right) made while the finished recording plays hands the song over to
// the band, part by part, at the same second, so the change is heard; a mixer step pressed from the
// side panel while nothing plays starts the band, so a press is never silent.
import { useEffect, useState } from "react";

import type { StudioAction, StudioNodeOf, StudioTurn } from "@gt/domain/audio.studio";
import { sectionAt, wingOf } from "@gt/ui/components/studio-stage/stage.ts";

import { nodeSound, soundKey, spansOf } from "../../_host/press.ts";
import type { Dispatch, VariantProps } from "../../_host/types.ts";
import { baseMix } from "./Band.tsx";
import { auditionOf, isMixPress, type StageCtx } from "./ctx.ts";
import { bandPress, House } from "./House.tsx";
import { NextSteps } from "./NextSteps.tsx";
import { Piece, placeOf } from "./registry.tsx";
import { wingTarget } from "./Wings.tsx";
import s from "./stage.module.css";

const first = <K extends "track" | "stems" | "sections">(turn: StudioTurn | null, kind: K): StudioNodeOf<K> | null =>
  (turn?.show.find((n) => n.kind === kind) as StudioNodeOf<K> | undefined) ?? null;

/** The turn whose band stands on stage: the newest answer shown that brought a band or a song. */
const stageOf = (turns: VariantProps["session"]["turns"], visible: StudioTurn | null): StudioTurn | null => {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]?.turn;
    if (t !== undefined && t.from === "agent" && t.show.some((n) => n.kind === "stems" || n.kind === "track")) return t;
  }
  return visible;
};

/** Every href worth decoding up front (waveforms and halos before the first press). */
const hrefsOf = (turn: StudioTurn | null): readonly string[] =>
  turn === null ? [] : turn.show.flatMap((n) => (n.kind === "stems" ? n.rows.flatMap((r) => (r.audio === undefined ? [] : [r.audio.href])) : []));

export function Variant({ session, dock, dispatch, transport, dropped, renders }: VariantProps) {
  const turn = session.visible?.turn ?? null;
  const [pickedAt, setPickedAt] = useState<{ readonly turn: string; readonly i: number } | null>(null);
  const offline = dock.state === "offline";
  const thinking = dock.state === "thinking";
  const stage = stageOf(session.turns, turn);
  const hrefs = hrefsOf(stage);
  const hrefKey = hrefs.join("|");
  const { decode } = transport;
  useEffect(() => {
    if (hrefKey !== "") decode(hrefKey.split("|"));
  }, [decode, hrefKey]);

  const track = first(stage, "track");
  const stems = first(stage, "stems");
  const sections = first(stage, "sections") ?? first(turn, "sections");

  const press: Dispatch = (a, turnId) => {
    dispatch(a, turnId);
    if (stage === null || stems === null || !isMixPress(a)) return;
    const band = nodeSound(stage, stems);
    const recording = track === null ? null : soundKey(stage.id, track.id);
    if (band !== null && transport.state === "playing" && transport.sounding?.key === recording)
      transport.play(band.key, band.layers, { spans: band.spans, name: "the band", from: transport.position() });
  };
  /** A proposal from the side panel: a mixer step while nothing plays starts the band too. */
  const step = (a: StudioAction): void => {
    press(a);
    if (stage === null || stems === null || !isMixPress(a) || transport.sounding !== null) return;
    const band = nodeSound(stage, stems);
    if (band !== null) transport.play(band.key, band.layers, { spans: band.spans, name: "the band" });
  };

  if (turn === null || stage === null)
    return (
      <div className={s.wrap} data-variant="stage">
        <div className={s.main}>
          <p className={s.emptyStage}>The band is setting up. The agent has not answered yet.</p>
        </div>
        <NextSteps ctx={null} actions={[]} offline={offline} thinking={thinking} onBand={null} onReset={null} dropped={dropped} missing={renders === "missing"} onStep={step} />
      </div>
    );

  const spans = spansOf({ show: [...(sections === null ? [] : [sections]), ...(track === null ? [] : [track])] });
  const key = transport.sounding?.key ?? null;
  const stemsKey = stems === null ? null : soundKey(stage.id, stems.id);
  const bandSounding = key !== null && ((stemsKey !== null && (key === stemsKey || key.startsWith(`${stemsKey}/`))) || (track !== null && key === soundKey(stage.id, track.id)));
  const live = bandSounding && transport.state === "playing" ? sectionAt(spans, transport.clock) : null;
  const picked = pickedAt?.turn === stage.id ? pickedAt.i : null;
  const ctx: StageCtx = {
    turn,
    stage,
    transport,
    press,
    offline,
    thinking,
    stems,
    sections,
    spans,
    focus: picked ?? live,
    picked,
    pick: (i) => setPickedAt(i === null ? null : { turn: stage.id, i }),
    live,
    audition: auditionOf(turn, transport.state === "idle" ? null : key),
    bandSounding,
  };

  /** The visible turn's pieces at a place (the house, the floor and the strip come from the band's turn). */
  const at = (place: ReturnType<typeof placeOf>) => turn.show.filter((n) => placeOf(n) === place);
  const wings = turn.show.filter((n): n is StudioNodeOf<"candidates"> => n.kind === "candidates");
  const wingAt = (side: "left" | "right") => wings.filter((n) => wingOf(wingTarget(n, ctx).role) === side);
  const left = wingAt("left");
  const right = wingAt("right");
  const changed = stems?.rows.some((r) => {
    const b = baseMix(r);
    const m = transport.mixOf(r.id, b);
    return m.muted !== b.muted || m.solo !== b.solo || (m.levelDb ?? 0) !== (b.levelDb ?? 0) || (m.pan ?? 0) !== (b.pan ?? 0);
  });
  const piece = (n: (typeof turn.show)[number]) => <Piece key={n.id} node={n} ctx={ctx} />;
  const notes = at("notes");
  const corner = at("corner");

  return (
    <div className={s.wrap} data-variant="stage">
      <div className={s.main}>
        {track === null ? <House node={null} ctx={ctx} /> : piece(track)}
        {(notes.length > 0 || corner.length > 0) && (
          <div className={s.rail}>
            <div className={s.notes}>{notes.map(piece)}</div>
            {corner.map(piece)}
          </div>
        )}
        <div className={s.theatre} data-wings={left.length > 0 && right.length > 0 ? "both" : left.length > 0 ? "left" : right.length > 0 ? "right" : "none"}>
          {left.length > 0 && <div className={s.wing} data-side="left">{left.map(piece)}</div>}
          <div className={s.stage} data-thinking={thinking || undefined}>
            {stage !== turn && <p className={s.carried}>On stage: the band from the agent&apos;s earlier answer.</p>}
            {stems === null ? <p className={s.emptyStage}>Nobody is on stage in this answer.</p> : piece(stems)}
            {sections !== null && piece(sections)}
          </div>
          {right.length > 0 && <div className={s.wing} data-side="right">{right.map(piece)}</div>}
        </div>
        {at("spotlights").map(piece)}
      </div>
      <NextSteps
        ctx={ctx}
        actions={turn.actions}
        offline={offline}
        thinking={thinking}
        onBand={bandPress(ctx, track)}
        onReset={changed === true ? () => transport.resetMix() : null}
        dropped={dropped}
        missing={renders === "missing"}
        onStep={step}
      />
    </div>
  );
}
