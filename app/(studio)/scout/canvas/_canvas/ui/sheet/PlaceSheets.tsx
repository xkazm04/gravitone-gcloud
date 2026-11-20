"use client";

// WALKING INTO A TOWN, A RIVER, A PROVINCE OR A BASIN - the winner's sheet.js SHEETS.town / river / prov / basin.
// A town lists its lots by state; a river its verdict history, its reach, its port and its open, kept and dry work;
// a province and a basin their rivers by what was kept (a basin also its family's stations).

import { sum } from "../../scene/geo.ts";
import type { Basin, Item, Province, River, Town } from "../../scene/types.ts";
import { ITEM_STATES, STATE, type ItemState } from "../../tables.ts";
import { useCanvas } from "../../useCanvas.ts";
import { Chip, StateChip, kit } from "../kit.tsx";
import s from "../sheet.module.css";
import { crumbsFor, Head } from "./Head.tsx";
import { SongSheet } from "./PortSheets.tsx";
import { go, History, NotesSec, Pipeline, ProjBox, RiverRow, Rows, Sec, stageName, stateC, StagePips } from "./shared.tsx";

const TOWN_ORDER: readonly ItemState[] = ["open", "made", "pending", "in-production", "kept", "outline-kept", "failed", "rejected", "thrown", "paused"];

export function TownSheet({ t }: { readonly t: Town }) {
  const st = useCanvas();
  const sel = { type: "town", ref: t } as const;
  const rv = t.river;
  const counts = ITEM_STATES.filter((k) => (t.c[k] ?? 0) > 0).sort((p, q) => STATE[p].ord - STATE[q].ord);
  const by = new Map<ItemState, Item[]>();
  for (const it of t.items) by.set(it.state, [...(by.get(it.state) ?? []), it]);
  return (
    <>
      <Head sel={sel} crumbs={crumbsFor(st, sel)} title={`${rv.chan !== null ? rv.chan.id : rv.name} · ${stageName(t.si)}`} chips={counts.map((k) => <StateChip key={k} state={k} n={t.c[k] ?? 0} />)} />
      <div className={s.body}>
        <NotesSec sel={sel} />
        {TOWN_ORDER.map((k) => {
          const its = by.get(k);
          if (its === undefined) return null;
          return (
            <Sec
              key={k}
              title={
                <>
                  <span style={{ color: stateC(k) }}>●</span> {STATE[k].word}
                </>
              }
              n={its.length}
            >
              <Rows its={its} cap={k === "open" || k === "kept" ? 14 : 6} />
            </Sec>
          );
        })}
      </div>
    </>
  );
}

export function RiverSheet({ rv }: { readonly rv: River }) {
  const st = useCanvas();
  if (rv.synthetic) return <SongSheet />;
  const sel = { type: "river", ref: rv } as const;
  const ord = (p: Item, q: Item): number => q.si - p.si;
  const open = rv.items.filter((it) => it.state === "open" || it.state === "pending").sort(ord);
  const kept = rv.items.filter((it) => it.state === "kept").sort(ord);
  const dead = rv.items.filter((it) => it.state === "failed" || it.state === "rejected");
  const port = rv.chan?.port ?? null;
  return (
    <>
      <Head
        sel={sel}
        crumbs={crumbsFor(st, sel)}
        title={rv.name}
        chips={
          <>
            <Chip>{`${rv.live} live`}</Chip>
            {rv.dead > 0 && <Chip tone="rose">{`${rv.dead} dead`}</Chip>}
            {rv.paused && <Chip tone="faint">‖ paused</Chip>}
          </>
        }
      />
      <div className={s.body}>
        <History r={rv} />
        <Sec title="Reach">
          <StagePips r={rv} />
        </Sec>
        <NotesSec sel={sel} />
        {rv.chan !== null && (
          <>
            <Sec title="Port">
              <div className={s.rows}>
                <button type="button" className={s.row} disabled={port === null} onClick={() => port !== null && go(st, { type: "port", ref: port })}>
                  <span className={kit.dot} style={{ background: "var(--emerald)" }} />
                  <span className={s.t}>{`${rv.chan.id} · ${rv.chan.name}`}</span>
                  <span className={s.m}>{`${rv.chan.episodes.length} episodes`}</span>
                </button>
              </div>
            </Sec>
            <ProjBox p={port} />
          </>
        )}
        {open.length > 0 && (
          <Sec title="Awaiting" n={open.length}>
            <Rows its={open} cap={6} />
          </Sec>
        )}
        {kept.length > 0 && (
          <Sec title="Furthest kept" n={kept.length}>
            <Rows its={kept} cap={6} />
          </Sec>
        )}
        {dead.length > 0 && (
          <Sec title="Dry" n={dead.length}>
            <Rows its={dead} cap={4} />
          </Sec>
        )}
      </div>
    </>
  );
}

const byKept = (rs: readonly River[]): River[] => rs.filter((r) => !r.synthetic).sort((x, y) => y.score - x.score || y.reach - x.reach || y.live - x.live);

export function ProvSheet({ p }: { readonly p: Province }) {
  const sel = { type: "prov", ref: p } as const;
  const rs = byKept(p.rivers);
  return (
    <>
      <Head
        sel={sel}
        crumbs={[{ t: "Studio" }, { t: p.basin.name, go: { type: "basin", ref: p.basin } }]}
        title={p.name}
        chips={
          <>
            <Chip>{`${p.rivers.length} rivers`}</Chip>
            <Chip>{`${sum(p.rivers, (r) => r.live)} live`}</Chip>
            {p.bundle !== null && <Chip tone="amber">{`${p.bundle.rivers.length} seeds only`}</Chip>}
          </>
        }
      />
      <div className={s.body}>
        <NotesSec sel={sel} />
        <Sec title="Rivers, by what was kept" n={rs.length}>
          <div className={s.rows}>
            {rs.map((r) => (
              <RiverRow key={r.key} rv={r} />
            ))}
          </div>
        </Sec>
      </div>
    </>
  );
}

export function BasinSheet({ b }: { readonly b: Basin }) {
  const sel = { type: "basin", ref: b } as const;
  const rs = byKept(b.rivers);
  return (
    <>
      <Head
        sel={sel}
        crumbs={[{ t: "Studio" }]}
        title={b.name}
        chips={
          b.key === "song" ? undefined : (
            <>
              <Chip>{`${b.live} live`}</Chip>
              <Chip tone="amber">{`${b.open} undecided`}</Chip>
              <Chip tone="rose">{`${b.failed} failed`}</Chip>
              <Chip tone="emerald">{`${b.outputs} kept outputs`}</Chip>
            </>
          )
        }
      />
      <div className={s.body}>
        <Sec>
          <p className={s.read}>{b.fam.engine}</p>
          <p className={s.vol}>{b.fam.volume}</p>
        </Sec>
        <NotesSec sel={sel} />
        <Sec title="Rivers, by what was kept">
          <div className={s.rows}>
            {rs.map((r) => (
              <RiverRow key={r.key} rv={r} />
            ))}
          </div>
        </Sec>
        <Sec title="Pipeline">
          <Pipeline fam={b.fam} />
        </Sec>
      </div>
    </>
  );
}
