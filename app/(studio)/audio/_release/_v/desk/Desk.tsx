"use client";

// LAYOUT VARIANT "desk" (spark audio-distribution, S1): one page, everything at once, like a mixing
// desk for a release. The strip of releases across the top; under it three columns that scroll on
// their own - the shelf of kept takes (left), the release sheet with its tracks (centre), and the
// readiness rail (right: problems, sleeve, channels, extras, the slots Publish would make and
// Schedule). A desk always has a release on it: with none named by the URL, the newest is drawn.
//
// Nothing about the release lives here: picks, which tracks are unfolded and the master timers
// are the desk's own; every field is the draft's, dispatched through the one reducer.
import { useEffect, useRef, useState } from "react";

import type { Release } from "@gt/domain/release";
import { releaseProblems, type ProblemAt } from "@gt/domain/release.problems";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";

import { plannedMaster, type DraftState } from "../../draft.ts";
import type { VariantProps } from "../props.ts";
import { anchorOf } from "./fmt.ts";
import { Rail } from "./Rail.tsx";
import { Sheet } from "./Sheet.tsx";
import { Shelf } from "./Shelf.tsx";
import { Strip } from "./Strip.tsx";
import s from "./desk.module.css";

/** S1's master press: the trial runs separately, so the planned result lands after this long. */
const MASTER_MS = 1500;

const calm = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Desk({ read, state, dispatch, newId }: VariantProps) {
  const current = state.releases.find((r) => r.id === state.openId) ?? state.releases[0] ?? null;
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set(current?.tracks[0] === undefined ? [] : [current.tracks[0].takeId]));
  // The master timer fires against the draft as it is then (a track may have moved meanwhile).
  const latest = useRef<DraftState>(state);
  useEffect(() => {
    latest.current = state;
  });
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  const takesOf = (ids: readonly string[]) => read.shelf.filter((t) => ids.includes(t.takeId));
  const create = () => {
    dispatch({ type: "create", id: newId(), artist: read.artist, takes: takesOf(picked) });
    setPicked([]);
  };
  const addPicked = () => {
    if (current === null) return;
    for (const take of takesOf(picked)) dispatch({ type: "addTrack", id: current.id, take });
    setPicked([]);
  };
  const pick = (takeId: string) => setPicked((p) => (p.includes(takeId) ? p.filter((x) => x !== takeId) : [...p, takeId]));

  const master = (rel: Release, index: number) => {
    const t = rel.tracks[index];
    if (t === undefined || t.master.state === "running") return;
    const take = read.shelf.find((x) => x.takeId === t.takeId);
    const before =
      t.master.before !== null
        ? { lufs: t.master.before.lufs, truePeakDb: t.master.before.truePeakDb }
        : take !== undefined && take.lufs !== null && take.truePeakDb !== null
          ? { lufs: take.lufs, truePeakDb: take.truePeakDb }
          : null;
    dispatch({ type: "master", id: rel.id, index, master: { state: "running", recipe: "uni-1", takeId: null, audioHref: null, before: t.master.before, after: null, error: null } });
    timers.current.push(
      window.setTimeout(() => {
        const r = latest.current.releases.find((x) => x.id === rel.id);
        const i = r === undefined ? -1 : r.tracks.findIndex((x) => x.takeId === t.takeId);
        const now = r?.tracks[i];
        if (now === undefined || now.master.state !== "running") return;
        dispatch({ type: "master", id: rel.id, index: i, master: plannedMaster(now, before) });
      }, MASTER_MS),
    );
  };
  const masterAll = (rel: Release) => {
    rel.tracks.forEach((t, i) => {
      if (t.master.state === "none" || t.master.state === "failed") master(rel, i);
    });
  };

  const fold = (takeId: string, open: boolean) =>
    setUnfolded((u) => {
      const next = new Set(u);
      if (open) next.add(takeId);
      else next.delete(takeId);
      return next;
    });

  const jump = (at: ProblemAt) => {
    if (current !== null && at.startsWith("track:")) {
      const t = current.tracks[Number(at.slice(6)) - 1];
      if (t !== undefined) fold(t.takeId, true);
    }
    window.requestAnimationFrame(() => {
      const el = document.getElementById(anchorOf(at));
      if (el === null) return;
      el.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
    });
  };

  const problems = current === null ? [] : releaseProblems(current);

  return (
    <div className={s.desk} data-variant-body="desk">
      <Strip releases={state.releases} currentId={current?.id ?? null} picked={picked.length} onOpen={(id) => dispatch({ type: "open", id })} onNew={create} />
      <div className={s.cols} data-open={current !== null}>
        <Shelf shelf={read.shelf} picked={picked} current={current} onPick={pick} onClear={() => setPicked([])} onNew={create} onAdd={addPicked} />
        {current === null ? (
          <div className={s.none}>
            <Empty label="no release open" action={{ label: "New release", tone: "cyan", onPress: create }} />
          </div>
        ) : (
          <>
            <Sheet
              release={current}
              problems={problems}
              read={read}
              dispatch={dispatch}
              unfolded={unfolded}
              onFold={fold}
              onMaster={(i) => master(current, i)}
              onMasterAll={() => masterAll(current)}
            />
            <Rail release={current} problems={problems} read={read} dispatch={dispatch} onJump={jump} />
          </>
        )}
      </div>
    </div>
  );
}
