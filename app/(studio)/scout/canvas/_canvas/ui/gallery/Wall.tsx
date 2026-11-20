"use client";

// THE WALL - every candidate under the point, grouped by river (basin › river, what is left there), one tile each:
// its first picture and frame count, or its words when it has no picture; a kept or rejected one carries its badge.

import { Fragment } from "react";

import { shortNight } from "../../scene/geo.ts";
import type { Item, River, Scene } from "../../scene/types.ts";
import s from "../gallery.module.css";
import { cx, Gl } from "../kit.tsx";
import { images, left, riverName, verdictOf, video, type G } from "./model.tsx";

const basinName = (scene: Scene, r: River): string => scene.basins.find((b) => b.key === r.basin)?.name ?? r.basin;

function Tile({ it, i, on, onTile, onOpen }: { readonly it: Item; readonly i: number; readonly on: boolean; readonly onTile: (i: number, el: HTMLButtonElement | null) => void; readonly onOpen: (i: number) => void }) {
  const v = verdictOf(it);
  const im = images(it)[0];
  const meta = [it.node !== null ? it.node.kind : "outline", shortNight(it.at), it.node?.subgenre].filter((x): x is string => x !== undefined && x !== "").join(" · ");
  const badge = v !== "" && (
    <span className={s.badge} role="img" aria-label={v}>
      <Gl name={v === "kept" ? "check" : "x"} size={14} />
    </span>
  );
  const ref = (el: HTMLButtonElement | null): void => onTile(i, el);
  const vClass = v === "kept" ? s.kept : v === "rejected" ? s.rejected : undefined;
  if (im !== undefined && it.media !== null) {
    return (
      <button ref={ref} type="button" data-role="gallery-tile" className={cx(s.tile, vClass, on && s.cur)} aria-current={on} onClick={() => onOpen(i)}>
        <span className={s.ph}>
          <img src={im.src} alt={it.label} loading="lazy" />
          <span className={s.cnt}>
            {video(it) !== null && <Gl name="play" size={10} />}
            {it.media.files.length}
          </span>
        </span>
        <span className={s.cap}>
          <b>{it.short ?? it.label}</b>
          <small>{meta}</small>
        </span>
        {badge}
      </button>
    );
  }
  return (
    <button ref={ref} type="button" data-role="gallery-tile" className={cx(s.tile, s.txt, vClass, on && s.cur)} aria-current={on} onClick={() => onOpen(i)}>
      <span className={s.cap}>
        <span className={s.para}>{it.label}</span>
        <small>{meta}</small>
      </span>
      {badge}
    </button>
  );
}

export function Wall({ g, scene, onTile, onOpen }: { readonly g: G; readonly scene: Scene; readonly onTile: (i: number, el: HTMLButtonElement | null) => void; readonly onOpen: (i: number) => void }) {
  const groups: { r: River; from: number; its: Item[] }[] = [];
  g.list.forEach((it, i) => {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.r === it.river) last.its.push(it);
    else groups.push({ r: it.river, from: i, its: [it] });
  });
  return (
    <div className={s.wall}>
      {groups.map(({ r, from, its }) => (
        <Fragment key={`${r.key}@${from}`}>
          <h3>
            {basinName(scene, r)} › {riverName(r)}
            <span className={s.n}>{left(g.list.filter((x) => x.river === r))} left</span>
          </h3>
          <div className={cx(s.grid, its[0] !== undefined && images(its[0]).length === 0 && s.text)}>
            {its.map((it, k) => (
              <Tile key={it.id} it={it} i={from + k} on={from + k === g.idx} onTile={onTile} onOpen={onOpen} />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
