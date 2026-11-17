"use client";

// EXTRAS ON THE CARD: the splits as one proportional bar (a share per person, the sum against 100) with its sheet
// behind a door, and the release as it looks away from the stores - smart link, canvas, promo square and story - as
// small previews, each opening large.
//
// STOP-GAP (prototype dock-package): the splits sheet inside the dialog is the wizard's own Splits, reused whole.
import { useState } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CHANNEL_NAMES, type Release } from "@gt/domain/release";

import { day } from "../../../../../../_release/wizard/fmt.ts";
import { Splits } from "../../../../../../_release/wizard/Splits.tsx";
import type { StepProps } from "../../../../../../_release/wizard/steps.ts";
import { Door, Sheet } from "../Door.tsx";
import { titleOf } from "../model.ts";
import { PREVIEWS, type PreviewId } from "./Previews.tsx";
import s from "./steps.module.css";

/** The splits as one bar: each person's share a segment, the sum's gap hatched, an overrun marked. */
function SplitBar({ r }: { readonly r: Release }) {
  const sum = Math.round(r.splits.reduce((a, x) => a + x.share, 0) * 100) / 100;
  const ok = r.splits.length === 0 || Math.abs(sum - 100) < 0.001;
  return (
    <div className={s.splitBar} data-ok={ok ? "" : undefined} data-empty={r.splits.length === 0 ? "" : undefined}>
      <span className={s.splitTrack} role="img" aria-label={r.splits.length === 0 ? "no splits" : `splits: ${r.splits.map((x) => `${x.name || "unnamed"} ${x.share}%`).join(", ")}; sum ${sum}%`}>
        {r.splits.map((x, i) => (
          <span key={i} className={s.splitSeg} data-n={i % 4} style={{ flexBasis: `${Math.min(100, x.share)}%` }}>
            <span className={s.splitName}>{x.name.trim() === "" ? "—" : x.name}</span>
            <span className={s.splitPct}>{x.share}%</span>
          </span>
        ))}
        {sum < 100 && <span className={s.splitGap} style={{ flexBasis: `${100 - sum}%` }} />}
      </span>
      <span className={s.splitSum}>
        <b>{r.splits.length === 0 ? "—" : `${sum}%`}</b>
        <span className={s.k}>{r.splits.length === 0 ? "no sheet" : "of 100"}</span>
      </span>
    </div>
  );
}

function Preview({ id, r }: { readonly id: PreviewId; readonly r: Release }) {
  const [open, setOpen] = useState(false);
  const p = PREVIEWS[id];
  return (
    <li>
      <button type="button" className={s.preview} aria-haspopup="dialog" aria-label={`${p.label} preview, open`} onClick={() => setOpen(true)}>
        <span className={s.previewFrame} data-shape={p.shape}>
          <p.Face r={r} size="sm" />
        </span>
        <span className={s.previewLabel}>{p.label}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={p.label}>
        <div className={s.previewLarge} data-shape={p.shape}>
          <p.Face r={r} size="lg" />
        </div>
      </Sheet>
    </li>
  );
}

export function ExtrasBody({ release: r, problems, dispatch }: StepProps) {
  return (
    <div className={s.body}>
      <section className={s.sub} aria-label="splits">
        <span className={s.subHead}>
          <span className={s.k}>splits · {r.splits.length}</span>
          <Door name="splits sheet" title="Splits" word="sheet" size="wide">
            <Splits release={r} problems={problems} dispatch={dispatch} />
          </Door>
        </span>
        <SplitBar r={r} />
      </section>
      <section className={s.sub} aria-label="previews">
        <span className={s.subHead}>
          <span className={s.k}>around the release</span>
          <Chip label={r.releaseDate === null ? "out soon" : `out ${day(r.releaseDate)}`} casing="lower" tone="violet" />
          <Chip label={`${r.channels.length} doors`} casing="lower" name={`${r.channels.map((c) => CHANNEL_NAMES[c]).join(", ")}`} />
        </span>
        <ul className={s.previews} aria-label={`previews of ${titleOf(r)}`}>
          {(Object.keys(PREVIEWS) as PreviewId[]).map((id) => (
            <Preview key={id} id={id} r={r} />
          ))}
        </ul>
      </section>
    </div>
  );
}
