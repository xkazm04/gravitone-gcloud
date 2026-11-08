"use client";

// THE SHEET'S BINDER: every cover made so far, filed by where its work stands - what is moving first, then what
// waits on the owner's ear, then drafts, failures and the finished - each group headed by its count. A rights
// filter (own · licensed · uncleared, each a chip with how many) and a title filter narrow it. A row is the cover's title,
// its rights, its song's length and its age; a brief in flight rides on the row. When a re-read moves a cover to
// another state, its row slides to its new group (a layout animation, off under reduced motion).
import { LayoutGroup, motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";

import { type CoverCard, type CoverDeskView, type CoverRights, type CoverState } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import { BRIEF_TONE, briefInFlight } from "../brief/brief.ts";
import { readSnapshot, serverReadSnapshot, subscribeRead } from "../brief/readClock.ts";
import type { Desk } from "../useDesk.ts";
import { clock, RIGHTS_TONE, STATE_TONE } from "../words.ts";
import { useMoves } from "./motion.ts";
import s from "./sheet.module.css";

/** Moving first, then what waits on the owner, then the rest. */
const GROUPS: readonly CoverState[] = ["rendering", "queued", "judging", "draft", "failed", "picked"];

type RightsPick = CoverRights | "all";
/** The rail's short words for a declaration: the whole phrase is the row's accessible name. */
const SHORT: Readonly<Record<CoverRights, string>> = { own: "own", licensed: "licensed", "third-party-uncleared": "uncleared" };

/** How long ago, coarse: minutes, hours, days. */
export function ago(at: string, nowMs: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "—";
  const m = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function Row({ c, here, desk, nowMs }: { readonly c: CoverCard; readonly here: boolean; readonly desk: Desk; readonly nowMs: number | null }) {
  const r = c.record;
  const moves = useMoves();
  const b = r.brief;
  return (
    <motion.li {...(moves.layout ? { layout: "position" as const, layoutId: `v3-cover-${r.id}`, transition: { duration: 0.3 } } : {})}>
      <a
        className={s.hrow}
        href={desk.hrefOf(r.id)}
        aria-current={here ? "page" : undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          desk.open(r.id);
        }}
      >
        <span className={s.htitle}>{r.title}</span>
        <span className={s.hmeta}>
          <Chip label={SHORT[r.rights]} tone={RIGHTS_TONE[r.rights]} casing="lower" name={`rights ${r.rights}`} />
          <span className={s.time}>{clock(r.source.durationS)}</span>
          {nowMs !== null && <span className={s.time}>{ago(r.createdAt, nowMs)}</span>}
          {b !== undefined && (briefInFlight(b) || b.state === "failed") && <Chip label="brief" value={b.state} tone={BRIEF_TONE[b.state]} dot casing="lower" />}
        </span>
      </a>
    </motion.li>
  );
}

export function History({ desk, view }: { readonly desk: Desk; readonly view: CoverDeskView }) {
  const [rights, setRights] = useState<RightsPick>("all");
  const [text, setText] = useState("");
  const nowMs = useSyncExternalStore(subscribeRead, readSnapshot, serverReadSnapshot);
  const moves = useMoves();
  const here = view.current?.record.id;
  const count = (k: CoverRights): number => view.covers.filter((c) => c.record.rights === k).length;
  const options = [
    { value: "all" as const, label: "all", count: view.covers.length },
    { value: "own" as const, label: "own", count: count("own") },
    { value: "licensed" as const, label: "licensed", count: count("licensed") },
    { value: "third-party-uncleared" as const, label: "uncleared", count: count("third-party-uncleared") },
  ];
  const needle = text.trim().toLowerCase();
  const shown = view.covers.filter((c) => (rights === "all" || c.record.rights === rights) && (needle === "" || c.record.title.toLowerCase().includes(needle)));
  return (
    <nav className={s.binder} aria-label="covers">
      <div className={s.binderHead}>
        <Button label="New cover" size="sm" tone="cyan" onPress={() => desk.open(undefined)} />
        <div className={s.chips} role="group" aria-label="rights">
          {options.map((o) => (
            <Chip key={o.value} label={o.label} value={o.count} casing="lower" pressed={rights === o.value} onPress={() => setRights(o.value)} />
          ))}
        </div>
        <Field label="title filter" value={text} onChange={setText} placeholder="title" />
      </div>
      {shown.length === 0 ? (
        <Empty label="no covers match" />
      ) : (
        <LayoutGroup id="v3-binder">
          {GROUPS.map((g) => {
            const rows = shown.filter((c) => c.record.state === g);
            if (rows.length === 0) return null;
            return (
              <motion.section key={g} {...(moves.layout ? { layout: "position" as const } : {})} className={s.group} aria-label={g} data-tone={STATE_TONE[g]}>
                <CapsHeading text={g} tally={{ value: rows.length }} level={4} />
                <ul className={s.hlist}>
                  {rows.map((c) => (
                    <Row key={c.record.id} c={c} here={c.record.id === here} desk={desk} nowMs={nowMs} />
                  ))}
                </ul>
              </motion.section>
            );
          })}
        </LayoutGroup>
      )}
    </nav>
  );
}
