"use client";

// What a release carries besides its audio: a smart-link page (one button per picked channel), an
// 8-second 9:16 loop and two promo cards cut from the sleeve, and the splits sheet.
import { CHANNEL_NAMES, type Release, type Split } from "@gt/domain/release";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Plate } from "@gt/ui/components/desk/Plate.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import { sectionOf, shortDate, type SectionProps } from "./board.ts";
import { ProblemLine } from "./Sheet.tsx";
import s from "./extras.module.css";
import sh from "./sheet.module.css";

const outOf = (r: Release): string => (r.releaseDate === null ? "Out soon" : `Out ${shortDate(r.releaseDate)}`);

/** The sleeve as a picture ground, or the blank sleeve's hatch when there is none. */
function Ground({ r, className }: { readonly r: Release; readonly className: string }) {
  const href = r.sleeve?.href ?? null;
  return href === null ? (
    <span className={cx(className, s.hatch)} aria-hidden="true" />
  ) : (
    <Plate src={href} alt="" className={className} />
  );
}

function SmartLink({ r }: { readonly r: Release }) {
  return (
    <figure className={s.phone} aria-label="smart link page">
      <Ground r={r} className={s.phoneBlur} />
      <div className={s.phoneBody}>
        <Ground r={r} className={s.phoneSleeve} />
        <span className={s.phoneTitle}>{r.title || "untitled"}</span>
        <span className={s.phoneArtist}>{r.artist}</span>
        <ul className={s.phoneLinks}>
          {r.channels.length === 0 ? (
            <li className={s.phoneNone}>no channel picked</li>
          ) : (
            r.channels.map((c) => (
              <li key={c} className={s.phoneLink}>
                <span>{CHANNEL_NAMES[c]}</span>
                <span className={s.phonePlay}>Play</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </figure>
  );
}

function Canvas({ r }: { readonly r: Release }) {
  return (
    <figure className={s.canvas} aria-label="9:16 loop, 8 s">
      <Ground r={r} className={s.canvasImg} />
      <span className={s.canvasSweep} aria-hidden="true" />
      <span className={s.canvasStamp} aria-hidden="true">
        8 s
      </span>
    </figure>
  );
}

function Promo({ r, tall }: { readonly r: Release; readonly tall: boolean }) {
  return (
    <figure className={cx(s.promo, tall && s.promoTall)} aria-label={tall ? "promo card 9:16" : "promo card square"}>
      <Ground r={r} className={s.promoImg} />
      <figcaption className={s.promoText}>
        <span className={s.promoTitle}>{r.title || "untitled"}</span>
        <span className={s.promoArtist}>{r.artist}</span>
        <span className={s.promoOut}>{outOf(r)}</span>
      </figcaption>
    </figure>
  );
}

function Splits({ r, set }: { readonly r: Release; readonly set: (xs: readonly Split[]) => void }) {
  const sum = r.splits.reduce((n, x) => n + x.share, 0);
  const whole = Math.abs(sum - 100) <= 0.001;
  const edit = (k: number, x: Partial<Split>) => set(r.splits.map((y, j) => (j === k ? { ...y, ...x } : y)));
  return (
    <div className={s.splits} data-jump="splits">
      <div className={s.splitsHead}>
        <CapsHeading text="splits" tally={{ value: r.splits.length }} variant="section" />
        {r.splits.length > 0 && <Chip label="sum" value={`${Number(sum.toFixed(2))}%`} tone={whole ? "emerald" : "rose"} />}
      </div>
      {r.splits.length === 0 ? (
        <Empty label="no splits" action={{ label: "add split", size: "sm", onPress: () => set([{ name: r.artist, share: 100 }]) }} />
      ) : (
        <>
          <ul className={s.splitRows}>
            {r.splits.map((x, k) => (
              <li key={k} className={s.splitRow}>
                <Field label={`split ${k + 1} name`} value={x.name} onChange={(v) => edit(k, { name: v })} />
                <Field label={`split ${k + 1} share, percent`} value={String(x.share)} onChange={(v) => edit(k, { share: Number.isFinite(Number(v)) ? Number(v) : 0 })} />
                <span className={s.splitBar} aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, x.share))}%` }} />
                </span>
                <Button label="remove" size="sm" onPress={() => set(r.splits.filter((_, j) => j !== k))} />
              </li>
            ))}
          </ul>
          <div>
            <Button label="add split" size="sm" onPress={() => set([...r.splits, { name: "", share: Math.max(0, 100 - sum) }])} />
          </div>
        </>
      )}
    </div>
  );
}

export function Extras({ release: r, problems, dispatch }: SectionProps) {
  const here = problems.filter((p) => sectionOf(p) === "extras");
  return (
    <div className={s.extras}>
      <div className={s.previews}>
        <div className={s.preview}>
          <CapsHeading text="smart link" variant="section" />
          <SmartLink r={r} />
        </div>
        <div className={s.preview}>
          <CapsHeading text="canvas" variant="section" />
          <Canvas r={r} />
        </div>
        <div className={s.preview}>
          <CapsHeading text="promo" variant="section" />
          <div className={s.promos}>
            <Promo r={r} tall={false} />
            <Promo r={r} tall />
          </div>
        </div>
      </div>
      <Splits r={r} set={(splits) => dispatch({ type: "splits", id: r.id, splits })} />
      {here.length > 0 && (
        <div className={sh.lines}>
          {here.map((p) => (
            <ProblemLine key={p.code} problem={p} />
          ))}
        </div>
      )}
    </div>
  );
}
