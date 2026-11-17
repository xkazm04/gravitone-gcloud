"use client";

// Side B3, the inserts: what travels with the record away from the stores - the smart-link page, a 9:16 canvas of the
// sleeve, the promo card - each drawn small from the sleeve and the metadata already in the draft and opened large on a
// card; and the splits sheet as one bar of shares.
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CHANNEL_NAMES, type Release } from "@gt/domain/release";

import { day } from "../../../../../../_release/wizard/fmt.ts";
import { Splits } from "../../../../../../_release/wizard/Splits.tsx";
import { problemsOf } from "../../../../../../_release/wizard/steps.ts";
import { SleeveFace } from "../Art.tsx";
import { titleOf, worst, type SideProps } from "../liner.ts";
import { ProblemDot } from "../Print.tsx";
import { PrintedCard } from "../PrintedCard.tsx";
import s from "./side.module.css";

type Kind = "link" | "canvas" | "promo";
const KIND_NAME: Readonly<Record<Kind, string>> = { link: "smart link", canvas: "canvas · 9:16", promo: "promo · 1:1" };
const TONES = ["cyan", "violet", "emerald", "amber"] as const;

/** One insert drawn from the release. Kit candidate: `ReleaseInsert` (kind, size). */
function Insert({ r, kind, large }: { readonly r: Release; readonly kind: Kind; readonly large: boolean }) {
  const out = r.releaseDate === null ? "out soon" : `out ${day(r.releaseDate)}`;
  // A small link page shows two doors and the count of the rest; the large one shows them all.
  const doors = large ? r.channels : r.channels.slice(0, 2);
  const more = r.channels.length - doors.length;
  return (
    <span className={s.insert} data-kind={kind} data-large={large ? "" : undefined} role="img" aria-label={`${KIND_NAME[kind]}: ${titleOf(r)}, ${r.artist}`}>
      <span className={s.insertArt}>
        <SleeveFace release={r} width={large ? 420 : 200} />
      </span>
      <span className={s.insertText} aria-hidden="true">
        {kind === "promo" && <span className={s.insertOut}>{out}</span>}
        <span className={s.insertTitle}>{titleOf(r)}</span>
        <span className={s.insertArtist}>{r.artist}</span>
      </span>
      {kind === "link" && (
        <span className={s.doors} aria-hidden="true">
          {r.channels.length === 0 && <span className={s.door} data-empty="" />}
          {doors.map((c) => (
            <span key={c} className={s.door}>
              {CHANNEL_NAMES[c]}
            </span>
          ))}
          {more > 0 && <span className={s.door}>+{more}</span>}
        </span>
      )}
    </span>
  );
}

/** The splits sheet as one bar: a segment per name, the sum beside it. Kit candidate: `ShareBar`. */
function ShareBar({ r, level }: { readonly r: Release; readonly level: "block" | "warn" | null }) {
  const sum = Math.round(r.splits.reduce((a, x) => a + x.share, 0) * 100) / 100;
  return (
    <span className={s.shares}>
      <span className={s.shareBar} aria-hidden="true">
        {r.splits.map((x, i) => (
          <span key={i} className={s.shareSeg} data-tone={TONES[i % TONES.length]} style={{ width: `${Math.min(100, x.share)}%` }} />
        ))}
      </span>
      <span className={s.chips}>
        {r.splits.length === 0 ? <Chip label="no splits" ghost casing="lower" /> : r.splits.map((x, i) => <Chip key={i} label={x.name.trim() === "" ? `split ${i + 1}` : x.name} value={`${x.share}%`} tone={TONES[i % TONES.length]} casing="lower" />)}
        {r.splits.length > 0 && <Chip label="sum" value={`${sum}%`} tone={level === "block" ? "rose" : "emerald"} />}
        <ProblemDot level={level} />
      </span>
    </span>
  );
}

export function ExtrasSide({ release: r, problems, dispatch }: SideProps) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [splits, setSplits] = useState(false);
  const level = worst(problemsOf(problems, "extras"));
  return (
    <div className={s.side}>
      <section className={s.block} aria-label="inserts">
        <h3 className={s.blockHead}>inserts</h3>
        <ul className={s.inserts}>
          {(["link", "canvas", "promo"] as const).map((k) => (
            <li key={k}>
              <button type="button" className={s.insertDoor} onClick={() => setOpen(k)} aria-label={`open the ${KIND_NAME[k]}`}>
                <Insert r={r} kind={k} large={false} />
                <span className={s.insertName} aria-hidden="true">
                  {KIND_NAME[k]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className={s.block} aria-label="splits">
        <h3 className={s.blockHead}>splits</h3>
        <button type="button" className={s.shareDoor} onClick={() => setSplits(true)} aria-label={`splits: ${r.splits.length} names, open the sheet`}>
          <ShareBar r={r} level={level} />
        </button>
      </section>
      <PrintedCard open={open !== null} onClose={() => setOpen(null)} title={open === null ? "" : KIND_NAME[open]} mark={`B3 · ${titleOf(r)}`} wide>
        {open !== null && (
          <div className={s.insertLarge}>
            <Insert r={r} kind={open} large />
          </div>
        )}
      </PrintedCard>
      {/* STOP-GAP (prototype dock-package): the wizard's splits sheet, reused inside the card. */}
      <PrintedCard open={splits} onClose={() => setSplits(false)} title="Splits" mark={`B3 · ${r.splits.length} names`} wide foot={<Button label="Done" size="sm" tone="cyan" onPress={() => setSplits(false)} />}>
        <Splits release={r} problems={problems} dispatch={dispatch} />
      </PrintedCard>
    </div>
  );
}
