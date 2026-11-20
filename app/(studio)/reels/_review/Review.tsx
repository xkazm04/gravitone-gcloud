"use client";

// THE REEL REVIEW (spark reel-studio WP3): the desktop film at 1x and the phone film at 2x side by side on ONE
// clock (./useLinked.ts), one scrubber and one play under both, the film's twelve frames under that - a frame seeks
// both - and the stop that is open: the film's (take / redo / drop) or the release's (keep / reject). A redo's
// notes are pinned to moments of the film and drawn as marks on the scrubber and the strip; the author turn reads
// them in time order. The verdicts already given, current and history, follow.
//
// Which pictures play: the release copies once they exist (what will be published), else the masters with their
// bed laid under them, else the silent masters.
import { useState } from "react";

import type { ReelPin } from "@/lib/reel/store";

import { Filmstrip } from "@gt/ui/components/filmstrip/Filmstrip.tsx";
import { Keycaps } from "@gt/ui/components/keycaps/Keycaps.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { ReelDetail } from "../_port/types.ts";
import { History } from "./History.tsx";
import { byTime, marksOf, neighbour, pinnable } from "./pins.ts";
import type { ReviewActions } from "./props.ts";
import { Transport } from "./Transport.tsx";
import { useLinked } from "./useLinked.ts";
import { VerdictBar, type Draft } from "./VerdictBar.tsx";
import r from "./review.module.css";

type Stop = "film" | "release";

/** The stop the reel is waiting at, if any. */
export const openStop = (stage: ReelDetail["stage"]): Stop | undefined => (stage === "review" ? "film" : stage === "release" ? "release" : undefined);

function picture(d: ReelDetail): { readonly desktop?: string; readonly phone?: string; readonly kind: "release" | "mix" | "master" } {
  const m = d.media;
  if (m.releaseDesktop !== undefined || m.releasePhone !== undefined) return { ...(m.releaseDesktop === undefined ? {} : { desktop: m.releaseDesktop }), ...(m.releasePhone === undefined ? {} : { phone: m.releasePhone }), kind: "release" };
  if (m.mixDesktop !== undefined || m.mixPhone !== undefined) return { ...(m.mixDesktop === undefined ? {} : { desktop: m.mixDesktop }), ...(m.mixPhone === undefined ? {} : { phone: m.mixPhone }), kind: "mix" };
  return { ...(m.desktop === undefined ? {} : { desktop: m.desktop }), ...(m.phone === undefined ? {} : { phone: m.phone }), kind: "master" };
}

const EMPTY: Draft = { reasons: [], text: "" };

export function Review({ detail, actions }: { readonly detail: ReelDetail; readonly actions: ReviewActions }) {
  const pic = picture(detail);
  const { desk, phone, t, duration, playing, toggle, seek, step } = useLinked(detail.seconds?.desktop ?? 0);
  const stop = openStop(detail.stage);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pins, setPins] = useState<readonly ReelPin[]>([]);
  // With no stop open, the marks are the current film verdict's own pins (a redo waiting on its author).
  const shown = stop === "film" ? pins : (detail.verdicts.film?.current === true ? (detail.verdicts.film.pins ?? []) : []);
  const marks = marksOf(shown, duration);
  const at = duration > 0 ? t / duration : 0;

  const pinHere = () => {
    if (stop !== "film" || !pinnable(draft.reasons, draft.text)) return false;
    setPins((ps) => byTime([...ps, { t: Math.round(t * 1000) / 1000, reasons: draft.reasons, text: draft.text.trim() }]));
    setDraft(EMPTY);
    return true;
  };
  const jump = (dir: -1 | 1) => {
    const p = neighbour(shown, t, dir);
    if (p === undefined) return false;
    seek(p.t);
    return true;
  };

  useKeys("reel", {
    play: () => toggle(),
    frame: ({ index }) => step(index === 0 ? -1 : 1),
    note: ({ index }) => (jump(index === 0 ? -1 : 1) ? undefined : false),
    pin: () => (pinHere() ? undefined : false),
  });

  return (
    <div className={r.review}>
      <div className={r.players} data-kind={pic.kind}>
        <figure className={r.desk}>
          {pic.desktop !== undefined ? (
            <video ref={desk} className={r.video} src={pic.desktop} preload="metadata" playsInline {...(detail.media.posterDesktop === undefined ? {} : { poster: detail.media.posterDesktop })} muted={pic.kind === "master"} aria-label={`${detail.title}, desktop film`} />
          ) : (
            <span className={r.noFace}>desktop</span>
          )}
          <figcaption className={r.face}>desktop 1×</figcaption>
        </figure>
        <figure className={r.phone}>
          {pic.phone !== undefined ? (
            <video ref={phone} className={r.video} src={pic.phone} preload="metadata" playsInline muted {...(detail.media.posterPhone === undefined ? {} : { poster: detail.media.posterPhone })} aria-label={`${detail.title}, phone film`} />
          ) : (
            <span className={r.noFace}>phone</span>
          )}
          <figcaption className={r.face}>phone 2×</figcaption>
        </figure>
      </div>
      <Transport t={t} duration={duration} playing={playing} marks={marks} onToggle={toggle} onSeek={seek} />
      <Filmstrip frames={detail.strip} label={`${detail.title}, twelve frames`} size="rail" at={at} marks={marks} seconds={duration} onPick={(_, x) => seek(x * duration)} />
      {stop !== undefined && (
        <VerdictBar
          key={`${stop}:${detail.subjectSha?.[stop] ?? ""}`}
          slug={detail.slug}
          stop={stop}
          of={detail.subjectSha?.[stop]}
          reasons={detail.reasons[stop]}
          draft={draft}
          onDraft={setDraft}
          pins={pins}
          onPin={pinHere}
          onUnpin={(p) => setPins((ps) => ps.filter((x) => x !== p))}
          onSeek={seek}
          actions={actions}
        />
      )}
      <History verdicts={detail.verdicts} onSeek={seek} />
      <Keycaps mode="reel" label="reel keys" />
    </div>
  );
}
