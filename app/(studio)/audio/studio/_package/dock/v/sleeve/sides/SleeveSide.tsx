"use client";

// Side B1, the sleeve: the sleeve itself, travelled here from the masthead (a shared layoutId), large; beside it the
// store's three specs as marks (square, 3000 px, RGB), where it came from, and the prompt its takes are made from,
// quoted. The sources - generate, upload, a music-video still - open on a card.
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { SLEEVE_PX, type Sleeve } from "@gt/domain/release";

import { pendingIn } from "../../../../../../_release/pending.ts";
import { StepSleeve } from "../../../../../../_release/wizard/StepSleeve.tsx";
import { SleeveFace } from "../Art.tsx";
import type { SideProps } from "../liner.ts";
import { SLEEVE_LAYOUT } from "../Masthead.tsx";
import { PencilMark, WriteIn } from "../Print.tsx";
import { PrintedCard } from "../PrintedCard.tsx";
import s from "./side.module.css";

const SOURCE_LABEL: Readonly<Record<Sleeve["source"], string>> = { generated: "generated", upload: "upload", "mv-look": "MV still" };

/** One store spec as a mark: what the sleeve has against what stores ask. Kit candidate: `SpecMark`. */
function Spec({ term, have, ok, meter }: { readonly term: string; readonly have: string; readonly ok: boolean | null; readonly meter?: number }) {
  return (
    <li className={s.spec} data-ok={ok === null ? undefined : ok ? "yes" : "no"}>
      <span className={s.specTerm}>{term}</span>
      <span className={s.specHave}>{have}</span>
      {meter !== undefined && (
        <span className={s.meter} aria-hidden="true">
          <span style={{ width: `${Math.round(Math.min(1, meter) * 100)}%` }} />
        </span>
      )}
      <span className={s.specMark} aria-label={ok === null ? "unknown" : ok ? "meets the spec" : "short of the spec"} role="img">
        {ok === null ? "·" : ok ? "✓" : "✕"}
      </span>
    </li>
  );
}

export function SleeveSide(side: SideProps) {
  const { release: r, dispatch, session } = side;
  const [open, setOpen] = useState(false);
  const sl = r.sleeve;
  const pencilled = pendingIn(session.pending, "sleeve").length;
  const short = sl === null ? null : Math.min(sl.widthPx, sl.heightPx);
  return (
    <div className={s.sleeveSide}>
      <div className={s.sleeveHero}>
        <SleeveFace release={r} width={640} layoutId={SLEEVE_LAYOUT} />
      </div>
      <div className={s.sleeveFacts}>
        <ul className={s.specs} aria-label="store specs">
          <Spec term="shape" have={sl === null ? "—" : `${sl.widthPx} × ${sl.heightPx}`} ok={sl === null ? null : sl.widthPx === sl.heightPx} />
          <Spec term="size" have={short === null ? "—" : `${short} / ${SLEEVE_PX} px`} ok={short === null ? null : short >= SLEEVE_PX} {...(short === null ? {} : { meter: short / SLEEVE_PX })} />
          <Spec term="colour" have={sl === null ? "—" : sl.rgb ? "RGB" : "not RGB"} ok={sl === null ? null : sl.rgb} />
        </ul>
        <span className={s.chips}>
          {sl === null ? <Chip label="no sleeve" tone="rose" ghost /> : <Chip label={SOURCE_LABEL[sl.source]} casing="lower" />}
        </span>
        <figure className={s.prompt}>
          <figcaption className={s.blockHead}>
            prompt
            {pencilled > 0 && <PencilMark />}
          </figcaption>
          {r.sleevePrompt === null ? <WriteIn what="sleeve prompt" /> : <blockquote className={s.promptText}>{r.sleevePrompt}</blockquote>}
        </figure>
        <span className={s.acts}>
          <Button label={sl === null ? "Make a sleeve" : "Change sleeve"} tone="cyan" onPress={() => setOpen(true)} />
          {sl !== null && <Button label="Remove" size="sm" tone="rose" onPress={() => dispatch({ type: "sleeve", id: r.id, sleeve: null })} />}
        </span>
      </div>
      {/* STOP-GAP (prototype dock-package): the wizard's sleeve flow - generate (real takes through sleeveActs.ts, priced
          by its receipt), upload, MV stills - reused whole inside the card; its own design is a later round. */}
      <PrintedCard open={open} onClose={() => setOpen(false)} title="Sleeve" mark="B1 · sources" wide>
        <StepSleeve {...side} />
      </PrintedCard>
    </div>
  );
}
