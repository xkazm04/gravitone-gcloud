"use client";

// THE STEP'S READ (variant "focus"): under the lead, what is there - the rows of ./rows.ts in the quiet read, the
// sleeve beside them where the step is about the picture, a plain track picker where the step reads one track at a
// time, and the step's one `Edit` on the first heading line. It rises into the lead's place (a layout move) when the
// lead shrinks to `clear`.
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import type { Release } from "@gt/domain/release";

import type { StepId } from "../../../../../_release/wizard/steps.ts";
import { ReadList, type ReadGroup } from "./Read.tsx";
import { ROWS, type RowCtx } from "./rows.ts";
import s from "./focus.module.css";

const ART: ReadonlySet<StepId> = new Set(["sleeve", "review"]);
const PER_TRACK: ReadonlySet<StepId> = new Set(["rights"]);
const EDIT_LABEL: Readonly<Record<StepId, string | null>> = { tracks: "Edit", details: "Edit", rights: "Edit", sleeve: "Edit", channels: "Edit", extras: "Open", review: null };

/** A plain row of track numbers: the one track a per-track read shows. Kit candidate `TrackPick`. */
export function TrackPick({ release, current, onPick }: { readonly release: Release; readonly current: number; readonly onPick: (i: number) => void }) {
  if (release.tracks.length < 2) return null;
  return (
    <div className={s.pick} role="group" aria-label="track">
      {release.tracks.map((t, i) => (
        <button key={t.takeId} type="button" className={s.pickBtn} aria-pressed={i === current} aria-label={`track ${i + 1}, ${t.title}`} onClick={() => onPick(i)}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}

function Art({ r }: { readonly r: Release }) {
  return r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt={`sleeve of ${r.title}`} className={s.art} width={220} aspect={1} /> : <PlateMissing label="no sleeve" className={s.art} aspect={1} />;
}

export function Summary({ step, ctx, focus, setTrack }: { readonly step: StepId; readonly ctx: RowCtx; readonly focus: string | null; readonly setTrack: (i: number) => void }) {
  const reduce = useReducedMotion();
  const raw: ReadGroup[] = ROWS[step](ctx);
  const edit = EDIT_LABEL[step];
  const groups = raw.map((g, i) => (i === 0 && edit !== null ? { ...g, action: <Button label={edit} size="sm" onPress={() => ctx.open(step === "extras" ? "previews" : "edit", ctx.track)} /> } : g));
  return (
    <motion.div layout={reduce ? false : "position"} transition={{ duration: reduce ? 0 : 0.22 }} className={s.summary} data-art={ART.has(step) ? "" : undefined}>
      {ART.has(step) && <Art r={ctx.release} />}
      <div className={s.summaryRead}>
        {PER_TRACK.has(step) && <TrackPick release={ctx.release} current={ctx.track} onPick={setTrack} />}
        <ReadList groups={groups} focus={focus} label={`${step} values`} />
      </div>
    </motion.div>
  );
}
