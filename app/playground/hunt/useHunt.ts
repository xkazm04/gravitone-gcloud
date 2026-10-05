"use client";

// THE HUNT'S DATA — every read and write the module makes, through
// lib/sound/client.ts and nothing else.
//
// THE NODES ARE HELD HERE, and the server is told. A render loop, a winner
// toggle and a Suno copy can all touch the same hunt's node list within one
// second; each goes through `commit`, which reads the LATEST list from a ref,
// applies its change, and sends the whole list (PATCH /api/sound/hunts/[id]
// takes `nodes`, not a diff). A PATCH response is not applied back: two
// responses can land out of order, and the older one would quietly undo the
// newer edit. The local list is the truth; a failed PATCH is said aloud.
//
// SPEND IS SEQUENTIAL. A selection renders one leaf at a time, cancellable
// between calls — the music budget ceiling (lib/music/budget.ts) refuses a
// request, not a batch, so a run that meets it stops with what it bought, and
// a cancel never strands a request half-sent.

import { useCallback, useMemo, useRef, useState } from "react";

import { useLoadFor } from "@/app/_phases/_shared/useLoadFor";
import {
  addLesson,
  draftHunt,
  draftHuntLesson,
  generateTake,
  listHunts,
  listLessons,
  listTakes,
  patchHunt,
  patchTake,
  uploadTake,
} from "@/lib/sound/client";
import type {
  DefectCode,
  Hunt,
  HuntNode,
  Lesson,
  ProviderId,
  SoundKind,
  SoundTake,
} from "@/lib/sound/types";
import { capabilities } from "@/lib/capabilities";

import { engineRegistry, type EngineDef } from "../engines";
import { useMusicPrice } from "../shared/price";
import { useSoundLab } from "../shared/shell";
import {
  generateRequestFor,
  reconcile,
  renderPlan,
  withNode,
  type Reach,
} from "./model";

export interface RunState {
  huntId: string;
  total: number;
  done: number;
  current: string | null;
  cancelling: boolean;
}

/** Statuses that mean "stop spending", not "this leaf failed": the budget
 *  ceiling, the rate limit, an access refusal, an unreachable server. */
const STOP = new Set([0, 401, 402, 403, 429]);

export type LessonDraft = Omit<Lesson, "id" | "confirmedAt">;

export function useHunt(kind: SoundKind) {
  const [hunts, setHunts] = useState<Hunt[] | null>(null);
  const [takes, setTakes] = useState<SoundTake[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const huntsRef = useRef<Hunt[]>([]);

  const { say, refresh } = useSoundLab();

  // ── the shelf, per kind ──
  const ready = useLoadFor(
    kind,
    async (k) => {
      const [h, t, l] = await Promise.all([
        listHunts(k as SoundKind),
        listTakes({ kind: k as SoundKind }),
        listLessons(k as SoundKind),
      ]);
      return { h, t, l };
    },
    ({ h, t, l }) => {
      if (!h.ok) {
        setLoadError(h.error);
        return false;
      }
      setLoadError(t.ok ? (l.ok ? null : l.error) : t.error);
      const huntTakes = t.ok ? t.data.takes.filter((x) => x.huntId) : [];
      const list = h.data.hunts.map((x) => reconcile(x, huntTakes));
      huntsRef.current = list;
      setHunts(list);
      setTakes(huntTakes);
      setLessons(l.ok ? l.data.lessons : []);
    },
  );

  // ── the price, asked once (shared/price.tsx → lib/musicClient.ts#costLabel) ──
  const cost = useMusicPrice();

  // ── the engines, as this deployment declares them ──
  const [reg] = useState<EngineDef[]>(() => engineRegistry(capabilities()));
  const reach = useCallback(
    (p: ProviderId): Reach => {
      const e = reg.find((x) => x.id === p);
      if (!e) return "none";
      if (e.transport === "api")
        return e.ops.includes(kind === "sfx" ? "sfx" : "compose")
          ? "api"
          : "none";
      return e.transport;
    },
    [reg, kind],
  );

  // ── one write path for a hunt's nodes ──
  const putHunt = useCallback((h: Hunt) => {
    const list = huntsRef.current.some((x) => x.id === h.id)
      ? huntsRef.current.map((x) => (x.id === h.id ? h : x))
      : [h, ...huntsRef.current];
    huntsRef.current = list;
    setHunts(list);
  }, []);

  const commit = useCallback(
    async (huntId: string, change: (nodes: HuntNode[]) => HuntNode[]) => {
      const h = huntsRef.current.find((x) => x.id === huntId);
      if (!h) return;
      const nodes = change(h.nodes);
      putHunt({ ...h, nodes });
      const res = await patchHunt(huntId, { nodes });
      if (!res.ok) say(`map not saved · ${res.error}`, "error");
    },
    [putHunt, say],
  );

  const putTake = useCallback((t: SoundTake) => {
    setTakes((ts) =>
      ts.some((x) => x.id === t.id)
        ? ts.map((x) => (x.id === t.id ? t : x))
        : [t, ...ts],
    );
  }, []);

  // ── drafting a map ──
  const [drafting, setDrafting] = useState<{
    idea: string;
    error: string | null;
  } | null>(null);
  const draft = useCallback(
    async (idea: string): Promise<Hunt | null> => {
      setDrafting({ idea, error: null });
      const res = await draftHunt(kind, idea);
      if (!res.ok) {
        setDrafting({ idea, error: res.error });
        return null;
      }
      setDrafting(null);
      putHunt(res.data.hunt);
      refresh();
      return res.data.hunt;
    },
    [kind, putHunt, refresh],
  );

  // ── rendering a selection ──
  const [run, setRun] = useState<RunState | null>(null);
  const cancelRef = useRef(false);

  const render = useCallback(
    async (huntId: string, ids: readonly string[]) => {
      const h = huntsRef.current.find((x) => x.id === huntId);
      if (!h || run) return;
      const queue = renderPlan(h.nodes, ids, reach).render;
      if (!queue.length) return;
      cancelRef.current = false;
      let done = 0;
      setRun({
        huntId,
        total: queue.length,
        done,
        current: null,
        cancelling: false,
      });
      for (const leaf of queue) {
        if (cancelRef.current) break;
        setRun((r) => r && { ...r, current: leaf.id });
        await commit(huntId, (ns) =>
          withNode(ns, leaf.id, { state: "rendering", error: null }),
        );
        const latest =
          huntsRef.current
            .find((x) => x.id === huntId)
            ?.nodes.find((n) => n.id === leaf.id) ?? leaf;
        const res = await generateTake(generateRequestFor(h, latest));
        if (res.ok) {
          putTake(res.data.take);
          await commit(huntId, (ns) =>
            withNode(ns, leaf.id, {
              state: "rendered",
              error: null,
              takeIds: [
                ...(ns.find((n) => n.id === leaf.id)?.takeIds ?? []),
                res.data.take.id,
              ],
            }),
          );
        } else {
          await commit(huntId, (ns) =>
            withNode(ns, leaf.id, { state: "failed", error: res.error }),
          );
          if (STOP.has(res.status)) {
            say(`stopped · ${res.error}`, "error");
            break;
          }
        }
        done++;
        setRun((r) => r && { ...r, done });
      }
      if (cancelRef.current)
        say(`cancelled · ${done} of ${queue.length} rendered`, "info");
      else if (done === queue.length) say(`${done} rendered`);
      setRun(null);
      refresh();
    },
    [run, reach, commit, putTake, say, refresh],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setRun((r) => r && { ...r, cancelling: true });
  }, []);

  // ── the Suno round trip ──
  const awaitReturn = useCallback(
    (huntId: string, nodeId: string) =>
      commit(huntId, (ns) =>
        withNode(ns, nodeId, {
          state:
            ns.find((n) => n.id === nodeId)?.state === "rendered"
              ? "rendered"
              : "awaiting-return",
        }),
      ),
    [commit],
  );

  const fileReturn = useCallback(
    async (huntId: string, nodeId: string, file: File) => {
      const h = huntsRef.current.find((x) => x.id === huntId);
      const n = h?.nodes.find((x) => x.id === nodeId);
      if (!h || !n) return;
      const res = await uploadTake(file, file.name, {
        kind: h.kind,
        title: n.label,
        provider: "suno",
        op: "manual",
        origin: "suno-return",
        technique: n.technique,
        prompt: n.prompt,
        negative: n.negative,
        // What the leaf asked for travels with the return, so its row in the
        // ledger counts along the same terms as a rendered leaf's.
        terms: n.terms,
        tempoBpm: n.tempoBpm,
        key: n.key,
        loop: h.kind === "sfx" ? n.loop : null,
        huntId,
        nodeId,
      });
      if (!res.ok) {
        say(`return not filed · ${res.error}`, "error");
        return;
      }
      putTake(res.data.take);
      await commit(huntId, (ns) =>
        withNode(ns, nodeId, {
          state: "rendered",
          error: null,
          takeIds: [
            ...(ns.find((x) => x.id === nodeId)?.takeIds ?? []),
            res.data.take.id,
          ],
        }),
      );
      say(`returned · ${n.label}`);
      refresh();
    },
    [commit, putTake, say, refresh],
  );

  // ── verdicts ──
  const crown = useCallback(
    async (huntId: string, nodeId: string, take: SoundTake, on: boolean) => {
      // Un-crowning only reaches back into the take while it still sits where
      // a crown put it — once Arrangement has moved it on, it is that board's.
      const res = on
        ? await patchTake(take.id, { verdict: "kept" })
        : take.stage === null || take.stage === "pending"
          ? await patchTake(take.id, { verdict: "unjudged", stage: null })
          : null;
      if (res && !res.ok) {
        say(`verdict not saved · ${res.error}`, "error");
        return;
      }
      if (res) putTake(res.data.take);
      await commit(huntId, (ns) => withNode(ns, nodeId, { winner: on }));
      say(
        on ? "winner · in Arrangement, pending" : "crown removed",
        on ? "ok" : "info",
      );
      refresh();
    },
    [commit, putTake, say, refresh],
  );

  const reject = useCallback(
    async (take: SoundTake, reasons: DefectCode[]) => {
      const res = await patchTake(
        take.id,
        reasons.length
          ? { verdict: "rejected", reasons }
          : { verdict: "unjudged", reasons: [] },
      );
      if (!res.ok) {
        say(`verdict not saved · ${res.error}`, "error");
        return;
      }
      putTake(res.data.take);
      refresh();
    },
    [putTake, say, refresh],
  );

  // ── the lesson ──
  const draftLesson = useCallback(
    async (huntId: string) => draftHuntLesson(huntId),
    [],
  );

  const saveLesson = useCallback(
    async (huntId: string, lesson: LessonDraft) => {
      const res = await addLesson(lesson);
      if (!res.ok) {
        say(`lesson not saved · ${res.error}`, "error");
        return false;
      }
      setLessons((ls) => [res.data.lesson, ...ls]);
      const h = huntsRef.current.find((x) => x.id === huntId);
      if (h) putHunt({ ...h, lessonId: res.data.lesson.id });
      const p = await patchHunt(huntId, { lessonId: res.data.lesson.id });
      if (!p.ok) say(`lesson saved, not linked · ${p.error}`, "error");
      else say("lesson saved");
      return true;
    },
    [putHunt, say],
  );

  const takesById = useMemo(
    () => new Map(takes.map((t) => [t.id, t] as const)),
    [takes],
  );

  return {
    ready,
    hunts,
    loadError,
    takes,
    takesById,
    lessons,
    reg,
    reach,
    cost,
    say,
    drafting,
    clearDrafting: () => setDrafting(null),
    draft,
    run,
    render,
    cancel,
    awaitReturn,
    fileReturn,
    crown,
    reject,
    draftLesson,
    saveLesson,
    commit,
    putTake,
  };
}

export type HuntApi = ReturnType<typeof useHunt>;
