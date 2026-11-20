"use client";

// WALKING INTO A LOT - its pictures, its own words, its road to the calendar (a kept reel), where it was decided, the
// episode it serves, the notes pinned on it, what it grew from and into, and its night's street. The winner's
// sheet.js SHEETS.item.

import { isArchiveNode } from "@gt/domain/scoutGraph";

import type { Item } from "../../scene/types.ts";
import { CHAIN_DONE } from "../../tables.ts";
import { useCanvas } from "../../useCanvas.ts";
import { ChainSteps } from "../ChainPips.tsx";
import { Chip, StateChip } from "../kit.tsx";
import s from "../sheet.module.css";
import { crumbsFor, Head } from "./Head.tsx";
import { dayLabel, EpCard, MediaStrip, NotesSec, Rows, Sec, stageName } from "./shared.tsx";

export function ItemSheet({ it }: { readonly it: Item }) {
  const st = useCanvas();
  const sel = { type: "item", ref: it } as const;
  const n = it.node;
  const e = it.ep;
  const ch = e === null ? null : (st.scene.chanById.get(e.channel) ?? null);
  const a = it.audio;
  const slot = a?.slot ?? null;

  const ups: Item[] = [];
  const dns: Item[] = [];
  if (n !== null) {
    let cur = n.id;
    for (let guard = 0; guard < 12; guard++) {
      const up = st.scene.up.get(cur)?.[0];
      if (up === undefined) break;
      cur = up;
      const x = st.scene.itemBy.get(cur);
      if (x !== undefined) ups.unshift(x);
    }
    for (const d of st.scene.down.get(n.id) ?? []) {
      const x = st.scene.itemBy.get(d);
      if (x !== undefined) dns.push(x);
    }
  }
  const sib = n === null ? [] : it.town.items.filter((x) => x !== it && x.at === it.at);
  const facets = n === null ? "" : [n.audience, n.genre].filter((x) => x !== undefined).join(" · ");

  return (
    <>
      <Head
        sel={sel}
        crumbs={crumbsFor(st, sel)}
        title={n !== null ? n.kind.charAt(0).toUpperCase() + n.kind.slice(1) : "Episode outline"}
        small
        chips={
          <>
            <StateChip state={it.state} />
            <Chip>{stageName(it.si)}</Chip>
            {n?.audience !== undefined && <Chip>{facets}</Chip>}
            {n?.subgenre !== undefined && <Chip>{n.subgenre}</Chip>}
            {n !== null && isArchiveNode(n) && <Chip tone="violet">archive</Chip>}
            {it.block === "audio" && <Chip tone="amber">no audio stream</Chip>}
            {slot !== null && <Chip tone="violet">{`${dayLabel(st.view.today, slot.day)} ${slot.time}`}</Chip>}
          </>
        }
      />
      <div className={s.body}>
        <MediaStrip it={it} />
        <Sec>
          <p className={s.read}>{n !== null ? n.label : (e?.title ?? it.label)}</p>
        </Sec>
        {a !== null && it.state === "kept" && (
          <Sec title="Road to the calendar" n={`${a.step} of ${CHAIN_DONE}`}>
            <ChainSteps it={it} />
          </Sec>
        )}
        {n !== null && (
          <Sec>
            <dl className={s.kv}>
              <dt>night</dt>
              <dd>{n.at}</dd>
              <dt>packet</dt>
              <dd>
                <code>{n.packet}</code>
              </dd>
              {n.seed !== undefined && (
                <>
                  <dt>seed</dt>
                  <dd>
                    <code>{n.seed}</code>
                  </dd>
                </>
              )}
              <dt>id</dt>
              <dd>
                <code>{n.id}</code>
              </dd>
            </dl>
          </Sec>
        )}
        {e !== null && (
          <Sec
            title={
              <>
                {`Episode · ${e.id} `}
                {ch !== null && <Chip tone="emerald">{`${ch.id} ${ch.name}`}</Chip>}
              </>
            }
          >
            <EpCard e={e} open />
          </Sec>
        )}
        <NotesSec sel={sel} />
        {ups.length > 0 && (
          <Sec title="Grew from" n={ups.length}>
            <Rows its={ups} />
          </Sec>
        )}
        {dns.length > 0 && (
          <Sec title="Grew into" n={dns.length}>
            <Rows its={dns} />
          </Sec>
        )}
        {sib.length > 0 && (
          <Sec title={`Same street · ${it.at}`} n={sib.length}>
            <Rows its={sib} cap={6} />
          </Sec>
        )}
      </div>
    </>
  );
}
