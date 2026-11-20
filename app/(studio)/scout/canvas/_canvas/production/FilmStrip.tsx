"use client";

// C · THE FILM STRIP - the production as its scenes: each take a frame of film, shown by the keyframe it starts from,
// with its place on the clock, its section, its own keyframes and the eye's reading. The look and the cast are pinned
// above the strip as cards; a core dragged from the tray onto the cast card asks the swap's preview. The storyboard
// frames no take is made from stand before the strip as one ghost frame; the cut runs under it.

import { cx, Kbd } from "../ui/kit.tsx";
import k from "../ui/kit.module.css";
import { caption, clock, counts, countLine, scenesOf, unfed, type FilmScene } from "./model.ts";
import { useCoreDrop, type StreetProps } from "./parts.tsx";
import { Tile } from "./Tile.tsx";
import v from "./variants.module.css";

const STEP_MS = 180;

function Pinned({ props }: { readonly props: StreetProps }) {
  const { p, focus, onPick, onSwap, onDropCore } = props;
  const drop = useCoreDrop(onDropCore);
  const plates = p.nodes.filter((n) => n.station === "look" && n.id !== "look");
  const cast = p.nodes.find((n) => n.station === "cast");
  return (
    <div className={v.pinned}>
      <section className={v.card} aria-label={`Look, ${plates.length} plates`}>
        <div className={v.grow}>
          <span className={v.h3}>Look</span>
          <p className={v.read}>{p.look}</p>
          <div className={v.plates}>
            {plates.slice(0, 10).map((n) => (
              <Tile key={n.id} n={n} on={focus === n.id} caption={caption(n)} compact onPick={onPick} />
            ))}
          </div>
        </div>
      </section>
      <section className={cx(v.card, drop.over && v.drop)} aria-label={`Cast, ${p.cast.name}`} data-role="cast-card" {...drop.on}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={v.portrait} src={p.cast.portrait} alt={`${p.cast.name}, portrait`} />
        <div className={v.grow}>
          <span className={v.h3}>Cast</span>
          <b>{p.cast.name}</b>
          <p className={v.read}>{p.cast.identity}</p>
          <span className={v.facts}>{p.cast.origin}</span>
          {cast !== undefined && cast.state !== "made" && <span className={v.amberText}>{cast.state}</span>}
          <span>
            <button type="button" className={k.btn} onClick={onSwap} aria-label={`Swap ${p.cast.name}`}>
              Swap <Kbd verb="cores" />
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}

function Frame({ sc, ix, props }: { readonly sc: FilmScene; readonly ix: number; readonly props: StreetProps }) {
  const { focus, rippling, onPick } = props;
  const c = counts(sc.keyframes);
  const at = sc.clip.at ?? 0;
  const lead = sc.first ?? sc.clip;
  const ripple = rippling?.has(sc.clip.id) === true ? ix * STEP_MS : null;
  return (
    <section className={v.film} aria-label={`${sc.clip.label}, ${clock(at)} to ${clock(at + (sc.clip.dur ?? 0))}, ${sc.section}`} data-scene={sc.clip.id}>
      <div className={v.row}>
        <b>{sc.clip.label}</b>
        <span>
          {clock(at)}–{clock(at + (sc.clip.dur ?? 0))}
        </span>
        <span>{sc.section}</span>
      </div>
      <Tile n={{ ...sc.clip, media: lead.media ?? sc.clip.media }} on={focus === sc.clip.id} ripple={ripple} caption={caption(lead)} onPick={() => onPick(sc.clip)} />
      <div className={v.row}>
        <span>{sc.keyframes.length} keyframes</span>
        {c.stale > 0 && <span className={v.amberText}>{c.stale} stale</span>}
      </div>
      <div className={v.kfs}>
        {sc.keyframes.slice(0, 6).map((n, i) => (
          <Tile key={n.id} n={n} on={focus === n.id} ripple={rippling?.has(n.id) === true ? ix * STEP_MS + 60 + i * 20 : null} compact onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

export function FilmStrip(props: StreetProps) {
  const p = props.p;
  const scenes = scenesOf(p);
  const before = unfed(p);
  const cut = p.nodes.find((n) => n.station === "cut");
  const first = scenes[0]?.clip.at ?? 0;
  return (
    <div data-variant="c">
      <Pinned props={props} />
      <div className={v.strip} role="list" aria-label={`${scenes.length} takes`}>
        {before.length > 0 && (
          <section className={cx(v.film, v.ghostFilm)} role="listitem" aria-label={`${clock(0)} to ${clock(first)}, ${before.length} keyframes, no take`}>
            <div className={v.row}>
              <b>{clock(0)}–{clock(first)}</b>
            </div>
            <div className={v.row}>
              <span>{before.length} keyframes · no take</span>
            </div>
            <div className={v.kfs}>
              {before.slice(0, 12).map((n) => (
                <Tile key={n.id} n={n} on={props.focus === n.id} compact onPick={props.onPick} />
              ))}
            </div>
          </section>
        )}
        {scenes.map((sc, ix) => (
          <div key={sc.clip.id} role="listitem">
            <Frame sc={sc} ix={ix} props={props} />
          </div>
        ))}
      </div>
      {cut !== undefined && (
        <div className={v.cutBar}>
          <span className={v.facts}>
            {cut.label} · {clock(cut.dur ?? 0)} · {countLine(counts([cut]))}
          </span>
        </div>
      )}
    </div>
  );
}
