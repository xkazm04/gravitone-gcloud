"use client";

// A CANDIDATE'S OWN WORDS - its episode's title and logline (or its label), the seed it grew from for a derived seed,
// its facts as chips (state, kind, stage, audience · genre, subgenre, channel, night, packet), and where it sits in
// the list.

import { chanFor, epFor } from "../../scene/scopes.ts";
import type { Item, Scene } from "../../scene/types.ts";
import { STAGE_NAME, STAGES } from "../../tables.ts";
import s from "../gallery.module.css";
import { Chip, cx, kit, StateChip } from "../kit.tsx";
import type { G } from "./model.tsx";

export function Words({ g, it, scene }: { readonly g: G; readonly it: Item; readonly scene: Scene }) {
  const n = it.node;
  const e = epFor(scene, it);
  const c = chanFor(scene, it);
  const upId = scene.up.get(it.id)?.[0];
  const up = upId === undefined ? undefined : scene.itemBy.get(upId);
  const seed = n !== null && n.kind === "seed";
  const title = e !== null && n !== null && !seed ? e.title : seed ? "" : it.label;
  const stage = STAGES[it.si];
  const chan = c === null ? undefined : scene.chanById.get(c);
  return (
    <div className={s.words} data-role="gallery-words">
      <div>
        {title !== "" && <h2>{title}</h2>}
        {e !== null ? <p>{e.logline}</p> : n !== null && !seed && it.label !== title ? <p>{it.label}</p> : null}
        {up !== undefined && seed && <p className={s.from}>from · {up.label}</p>}
        <div className={cx(kit.chips, s.chips)}>
          <StateChip state={it.state} />
          <Chip>{n !== null ? n.kind : "outline"}</Chip>
          {stage !== undefined && <Chip>{STAGE_NAME[stage]}</Chip>}
          {n !== null && (n.audience ?? "") !== "" && <Chip>{`${n.audience ?? ""} · ${n.genre ?? ""}`}</Chip>}
          {n !== null && (n.subgenre ?? "") !== "" && <Chip>{n.subgenre}</Chip>}
          {c !== null && <Chip tone="emerald">{`${c} ${chan?.name ?? ""}`}</Chip>}
          <Chip>{it.at}</Chip>
          {n !== null && <Chip tone="faint">{n.packet}</Chip>}
        </div>
      </div>
      <div className={s.left}>
        <span>
          {g.idx + 1} / {g.list.length}
        </span>
      </div>
    </div>
  );
}
