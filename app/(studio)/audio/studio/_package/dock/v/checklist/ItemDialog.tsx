"use client";

// AN ITEM'S DETAIL (prototype dock-package, round 2, variant "checklist"): everything the row does not say - the
// store's rule for each of the item's problems (PROBLEM_TEXT, verbatim), the agent's suggestion with its source and
// Accept / Dismiss, and the item's editor - in the prototype's one dialog. A per-track item picks its track here, each
// track number carrying the item's mark on that track. The dialog reads the item fresh each render, so an accept or
// an edit moves its mark while it is open.
import { useState } from "react";

import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";
import type { Release } from "@gt/domain/release";

import type { ReleaseRead } from "../../../../../_release/_port/port.ts";
import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import type { StepId } from "../../../../../_release/wizard/steps.ts";
import { Dialog } from "../_kit/Dialog.tsx";
import { EDITORS, SELF_CONTAINED, WIDE } from "./editors/registry.ts";
import { CopyToAll } from "./editors/rights.tsx";
import { StateMark } from "./ItemList.tsx";
import { markOf, type EditorKey, type Item } from "./model.ts";
import { Suggestion } from "./Suggestion.tsx";
import d from "./detail.module.css";

interface Ctx {
  readonly r: Release;
  readonly read: ReleaseRead;
  readonly problems: readonly ReleaseProblem[];
  readonly session: ReleaseSessionApi;
  readonly go: (step: StepId, track?: number) => void;
}

const RIGHTS_EDITORS: ReadonlySet<EditorKey> = new Set<EditorKey>(["ai", "persona", "licence", "tier", "generator", "provenance"]);
const onTrack = (item: Item, i: number) => ({
  problems: item.problems.filter((p) => p.at === `track:${i + 1}`),
  pending: item.pending.filter((p) => p.path.startsWith(`track:${i + 1}.`)),
});

/** The track numbers of a per-track item, each with the item's mark on that track (kit candidate `TrackPick`). */
function TrackPick({ item, r, at, onPick }: { readonly item: Item; readonly r: Release; readonly at: number; readonly onPick: (i: number) => void }) {
  return (
    <div className={d.pick} role="group" aria-label="track">
      {r.tracks.map((t, i) => {
        const own = onTrack(item, i);
        const mark = markOf(own.problems, own.pending.length, "x");
        return (
          <button key={t.takeId} type="button" className={d.pickTrack} aria-pressed={i === at} aria-label={`track ${i + 1}, ${t.title}`} onClick={() => onPick(i)}>
            <span>{i + 1}</span>
            {mark !== "done" && <StateMark mark={mark} />}
          </button>
        );
      })}
    </div>
  );
}

function Body({ item, ctx, onClose }: { readonly item: Item; readonly ctx: Ctx; readonly onClose: () => void }) {
  const { r, session } = ctx;
  const firstAsk = r.tracks.findIndex((_, i) => {
    const own = onTrack(item, i);
    return own.problems.length + own.pending.length > 0;
  });
  const [picked, setPicked] = useState(item.track ?? Math.max(0, firstAsk));
  const track = Math.max(0, Math.min(picked, r.tracks.length - 1));
  const own = item.perTrack ? onTrack(item, track) : { problems: item.problems, pending: item.pending };
  const self = SELF_CONTAINED.has(item.editor);
  const Editor = EDITORS[item.editor];
  const props = { item, r, read: ctx.read, problems: ctx.problems, session, track, go: ctx.go, close: onClose };
  return (
    <div className={d.stack}>
      {item.perTrack && r.tracks.length > 1 && (
        <div className={d.trackBar}>
          <TrackPick item={item} r={r} at={track} onPick={setPicked} />
          <span className={d.trackName}>{r.tracks[track]?.title ?? ""}</span>
        </div>
      )}
      {!self && own.problems.length > 0 && (
        <ul className={d.rules} aria-label="rules">
          {own.problems.map((p, i) => (
            <li key={`${p.code}:${p.at}:${i}`} className={d.rule}>
              <StateMark mark={p.severity === "block" ? "need" : "warn"} />
              <span>{PROBLEM_TEXT[p.code]}</span>
            </li>
          ))}
        </ul>
      )}
      {!self && own.pending.map((p) => <Suggestion key={p.id} p={p} session={session} />)}
      <div className={d.editor}>
        <Editor {...props} />
      </div>
      {RIGHTS_EDITORS.has(item.editor) && r.tracks.length > 1 && (
        <div className={d.after}>
          <CopyToAll {...props} />
        </div>
      )}
    </div>
  );
}

export function ItemDialog({ open, item, ctx, onClose }: { readonly open: boolean; readonly item: Item | null; readonly ctx: Ctx; readonly onClose: () => void }) {
  const head =
    item === null ? undefined : (
      <span className={d.head}>
        <StateMark mark={item.mark} />
        <span className={d.headTitle}>{item.label}</span>
        <span className={d.headValue}>{item.value}</span>
      </span>
    );
  return (
    <Dialog open={open && item !== null} onClose={onClose} title={item?.label ?? ""} {...(head === undefined ? {} : { head })} className={`${d.panel} ${item !== null && (item.editor === "sleeve" || item.editor === "previews") ? d.huge : ""}`} width={item !== null && WIDE.has(item.editor) ? "wide" : "narrow"}>
      {item !== null && <Body key={item.id} item={item} ctx={ctx} onClose={onClose} />}
    </Dialog>
  );
}
