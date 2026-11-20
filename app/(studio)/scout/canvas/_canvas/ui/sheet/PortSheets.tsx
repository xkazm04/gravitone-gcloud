"use client";

// WALKING INTO A PORT, A MOORED EPISODE, A STATION OR THE SONGS LANE - the winner's sheet.js SHEETS.port / ship /
// station / song. A port carries its channel's promise, gap and edge, its release calendar, the projected box and
// its moored episodes; a station its tool.

import { FAMILIES } from "../../pipelines.ts";
import type { Port, Post, Ship, StationPt } from "../../scene/types.ts";
import type { ItemState } from "../../tables.ts";
import { useCanvas } from "../../useCanvas.ts";
import { Chip, StateChip, kit } from "../kit.tsx";
import s from "../sheet.module.css";
import { crumbsFor, Head } from "./Head.tsx";
import { dayLabel, dayName, EpCard, go, MediaStrip, NotesSec, Pipeline, ProjBox, Rows, Sec } from "./shared.tsx";

const PORT_STATES: readonly ItemState[] = ["kept", "made", "in-production", "outline-kept", "thrown"];
const MOOR_ORDER: readonly ItemState[] = ["made", "in-production", "outline-kept", "kept", "thrown"];

export function PortSheet({ p }: { readonly p: Port }) {
  const st = useCanvas();
  const c = p.chan;
  if (p.song || c === null) return <SongSheet />;
  const sel = { type: "port", ref: p } as const;
  const slots = st.ui.slots.filter((x) => x.channel === c.id).sort((x, y) => x.day - y.day);
  const today = st.view.today;
  return (
    <>
      <Head
        sel={sel}
        crumbs={crumbsFor(st, sel)}
        title={`${c.id} · ${c.name}`}
        chips={
          <>
            <Chip>{c.group}</Chip>
            <Chip>{c.medium === "reel" ? "data reel" : "storyboard"}</Chip>
            {PORT_STATES.map((k) => {
              const n = c.episodes.filter((e) => e.state === k).length;
              return n > 0 ? <StateChip key={k} state={k} n={n} /> : null;
            })}
            {slots.length > 0 && <Chip tone="violet">{`${slots.length} slotted`}</Chip>}
          </>
        }
      />
      <div className={s.body}>
        <Sec>
          <p className={s.read}>{c.promise}</p>
        </Sec>
        <Sec>
          <dl className={s.kv}>
            <dt>audience</dt>
            <dd>{c.audience}</dd>
            <dt>gap</dt>
            <dd>{c.gap}</dd>
            <dt>edge</dt>
            <dd>{c.edge}</dd>
            {c.look !== undefined && c.look !== "" && (
              <>
                <dt>look</dt>
                <dd>{c.look}</dd>
              </>
            )}
          </dl>
        </Sec>
        <NotesSec sel={sel} />
        {slots.length > 0 && (
          <Sec title="Release calendar" n={slots.length}>
            <div className={s.rows}>
              {slots.map((x) => {
                const it = st.scene.itemBy.get(x.node);
                const pub = x.state === "published";
                return (
                  <button key={x.id} type="button" className={s.row} disabled={it === undefined} onClick={() => it !== undefined && go(st, { type: "item", ref: it })}>
                    <span className={kit.dot} style={{ background: pub ? "var(--emerald)" : "var(--violet)" }} />
                    <span className={s.t}>{x.title}</span>
                    <span className={s.m}>{pub ? "published" : `${dayName(today, x.day)} ${dayLabel(today, x.day)} ${x.time}`}</span>
                  </button>
                );
              })}
            </div>
          </Sec>
        )}
        <ProjBox p={p} />
        {c.episodes.length > 0 && (
          <Sec title="Moored" n={c.episodes.length}>
            {MOOR_ORDER.flatMap((k) => c.episodes.filter((e) => e.state === k)).map((e) => (
              <EpCard key={e.id} e={e} open={false} port={p} />
            ))}
          </Sec>
        )}
      </div>
    </>
  );
}

export function ShipSheet({ sh }: { readonly sh: Ship }) {
  const st = useCanvas();
  const sel = { type: "ship", ref: sh } as const;
  const e = sh.ep;
  const c = sh.chan;
  return (
    <>
      <Head
        sel={sel}
        crumbs={crumbsFor(st, sel)}
        title={e.title}
        chips={
          <>
            <StateChip state={e.state} />
            <Chip>{e.id}</Chip>
            <Chip tone="emerald">{`${c.id} ${c.name}`}</Chip>
          </>
        }
      />
      <div className={s.body}>
        <MediaStrip it={sh.it} open={false} />
        <EpCard e={e} open />
        {sh.it !== null && sh.it.node !== null && (
          <Sec title="On the map">
            <Rows its={[sh.it]} />
          </Sec>
        )}
      </div>
    </>
  );
}

export function StationSheet({ at }: { readonly at: StationPt | Post }) {
  const st = useCanvas();
  const sel = { type: "station", ref: at } as const;
  const x = at.s;
  const b = st.scene.basins.find((y) => y.key === at.fam) ?? st.scene.basins.find((y) => y.key === "song");
  return (
    <>
      <Head
        sel={sel}
        crumbs={[{ t: "Studio" }, b === undefined ? { t: FAMILIES[at.fam].name } : { t: b.name, go: { type: "basin", ref: b } }, { t: "pipeline" }]}
        title={x.name}
        small
        chips={x.exists ? <Chip>exists</Chip> : <Chip tone="planned">planned</Chip>}
      />
      <div className={s.body}>
        <Sec>
          <dl className={s.kv}>
            <dt>tool</dt>
            <dd>{x.tool}</dd>
          </dl>
        </Sec>
      </div>
    </>
  );
}

export function SongSheet() {
  const st = useCanvas();
  const song = FAMILIES.song;
  const basin = st.scene.basins.find((y) => y.key === "song");
  const port = st.scene.ports.find((p) => p.song) ?? null;
  return (
    <>
      <Head
        sel={{ type: "river", ref: st.scene.songRiver }}
        crumbs={[{ t: "Studio" }, basin === undefined ? { t: song.name } : { t: song.name, go: { type: "basin", ref: basin } }, { t: "Suno lane" }]}
        title={song.name}
        chips={
          <>
            <Chip>Suno v6 by hand</Chip>
            <Chip tone="amber">API lane paused</Chip>
          </>
        }
      />
      <div className={s.body}>
        <Sec>
          <p className={s.read}>{song.volume}</p>
        </Sec>
        <Sec title="Stations">
          <Pipeline fam={song} />
        </Sec>
        <ProjBox p={port} />
      </div>
    </>
  );
}
