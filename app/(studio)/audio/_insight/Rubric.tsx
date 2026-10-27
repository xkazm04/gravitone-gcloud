"use client";

// THE RUBRIC SECTION OF THE AUDIO DESK (scout A.1 item 2): the judged takes of one kind, unscored
// first, each scored 1-10 per dimension with its brief held against its bytes beside it (v1
// app/playground/triage/Judge.tsx's rubric and right column; the verdict itself stays the
// Board's). One transport for the pile (../_audio/useTransport.ts), so two takes never sound
// at once.
//
// A SCORE IS OPTIMISTIC PER DIMENSION. A step lights at once and the dimension is aria-busy
// until the store answers; refused, the step goes back and the store's sentence stays over the
// pile until the next success. Writes to one take chain (v1 useTriage's rule, and lib/sound/
// takes.ts merges the bag for the same reason): two fast keys on one take cannot race each
// other out of it. The pile keeps the order it was served in until the page is read again, so a
// take does not jump away from under the hand that just scored it. A write whose round trip
// fails rejects; it waits through ../_hunt/settled.ts, so its step goes back and its dimension
// stops being busy, and the take's chain waits for each write to SETTLE, so one failed write
// never stops the next key on that take from being sent.
import { useMemo, useRef, useState } from "react";

import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { RubricCard } from "@gt/ui/components/audio/Rubric.tsx";
import { readRubric, scoreOfKey, type Ratings } from "@gt/ui/components/audio/rubric.ts";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { useShell } from "../../_shell/Providers.tsx";
import { useTransport } from "../_audio/useTransport.ts";
import { settled } from "../_hunt/settled.ts";
import type { scoreTake } from "./acts.ts";
import type { RubricTake, RubricView } from "./read.ts";
import s from "./insight.module.css";

export const RUBRIC_MODE = "audio.rubric";

const opId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 20);

type Busy = ReadonlyMap<string, readonly string[]>;

/** Queue `job` behind the take's last write, run once that write has settled either way. */
export function chainOn(chains: Map<string, Promise<void>>, id: string, job: () => Promise<void>): Promise<void> {
  const run = (chains.get(id) ?? Promise.resolve()).catch(() => undefined).then(job);
  chains.set(id, run);
  return run;
}

export function RubricDesk({ view, acts }: { readonly view: RubricView; readonly acts: { readonly scoreTake: typeof scoreTake } }) {
  const { toast } = useShell();
  const served = useMemo(() => (view.takes.ok ? view.takes.value : []), [view.takes]);
  // What the operator scored since the read, laid over the served bags.
  const [mine, setMine] = useState<ReadonlyMap<string, Ratings>>(new Map());
  const [busy, setBusy] = useState<Busy>(new Map());
  const [focused, setFocused] = useState<string | null>(null);
  const [dim, setDim] = useState(0);
  const [refusal, setRefusal] = useState<string | null>(null);
  const chains = useRef(new Map<string, Promise<void>>());
  const transport = useTransport((w) => setRefusal(w));

  const takes = useMemo(
    () =>
      served.map((t): RubricTake => {
        const over = mine.get(t.id);
        if (over === undefined) return t;
        const ratings = { ...t.ratings, ...over };
        return { ...t, ratings, rubric: readRubric({ kind: t.kind, loop: t.loop, verdict: t.verdict, ratings }) };
      }),
    [served, mine],
  );

  const mark = (id: string, d: string, on: boolean): void =>
    setBusy((cur) => {
      const next = new Map(cur);
      const have = (next.get(id) ?? []).filter((x) => x !== d);
      next.set(id, on ? [...have, d] : have);
      return next;
    });

  const score = (t: RubricTake, d: string, value: number | null): void => {
    const before = mine.get(t.id)?.[d] ?? t.ratings[d] ?? null;
    setMine((cur) => new Map(cur).set(t.id, { ...(cur.get(t.id) ?? {}), [d]: value }));
    mark(t.id, d, true);
    void chainOn(chains.current, t.id, async () => {
      const r = await settled(acts.scoreTake({ id: t.id, ratings: { [d]: value }, opId: opId() }));
      mark(t.id, d, false);
      if (r.ok) {
        setRefusal(null);
        setMine((cur) => new Map(cur).set(t.id, { ...(cur.get(t.id) ?? {}), ...r.value.ratings }));
        return;
      }
      setMine((cur) => new Map(cur).set(t.id, { ...(cur.get(t.id) ?? {}), [d]: before }));
      setRefusal(`${t.title} · refused · ${r.error.error}`);
      toast(`${t.title} · score refused`);
    });
  };

  const at = focused === null ? -1 : takes.findIndex((t) => t.id === focused);
  const current = at < 0 ? undefined : takes[at];
  const focus = (id: string): void => {
    setFocused(id);
    setDim(0);
    document.querySelector<HTMLElement>(`[data-take="${CSS.escape(id)}"]`)?.focus();
  };

  useKeys(
    RUBRIC_MODE,
    {
      score: (hit) => {
        const v = scoreOfKey(hit.cap);
        const d = current?.rubric.dims[dim];
        if (current === undefined || d === undefined || v === null) return false;
        score(current, d.dim, v);
        // The hand walks on to the next dimension, as v1's judge did after a score.
        setDim((x) => Math.min(x + 1, current.rubric.dims.length - 1));
        return undefined;
      },
      clear: () => {
        const d = current?.rubric.dims[dim];
        if (current === undefined || d === undefined || d.value === null) return false;
        score(current, d.dim, null);
        return undefined;
      },
      dim: (hit) => {
        if (current === undefined) return false;
        const by = hit.cap === "↑" ? -1 : 1;
        setDim((x) => Math.max(0, Math.min(current.rubric.dims.length - 1, x + by)));
        return undefined;
      },
      next: () => {
        const t = takes[at + 1];
        if (t === undefined) return false;
        focus(t.id);
        return undefined;
      },
      prev: () => {
        const t = takes[Math.max(0, at - 1)];
        if (t === undefined || at < 0) return false;
        focus(t.id);
        return undefined;
      },
      play: () => {
        if (current === undefined || current.src === null) return false;
        transport.toggle(current.id, current.src);
        return undefined;
      },
    },
    { facts: current === undefined ? [] : ["take"] },
  );

  if (!view.takes.ok) return <ErrorLine message={`takes: ${view.takes.error}`} />;
  const open = takes.filter((t) => t.rubric.scored < t.rubric.of).length;
  return (
    <section className={s.pile} aria-label="rubric">
      <CapsHeading text="rubric" tally={{ value: open, of: takes.length, label: "unscored" }} level={2} />
      {refusal !== null && <ErrorLine message={refusal} live />}
      {view.measures !== null && <ErrorLine message={`measures: ${view.measures}`} />}
      {takes.length === 0 ? (
        <Empty label="no judged takes of this kind" action={{ label: "Triage", href: "/floor?lane=audio" }} />
      ) : (
        <div className={s.cards}>
          {takes.map((t) => (
            <RubricCard
              key={t.id}
              take={t}
              focused={focused === t.id}
              dim={dim}
              playing={transport.playing === t.id}
              busy={busy.get(t.id) ?? []}
              onFocus={() => {
                if (focused !== t.id) {
                  setFocused(t.id);
                  setDim(0);
                }
              }}
              onPlay={() => {
                if (t.src !== null) transport.toggle(t.id, t.src);
              }}
              onScore={(d, v) => score(t, d, v)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
