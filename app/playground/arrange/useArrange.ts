"use client";

// THE BOARD'S DATA — kept takes of one kind and the groups file, read from the
// sound store (lib/sound/client.ts) and written back one patch at a time.
//
// Every write is OPTIMISTIC WITH ROLLBACK: the card moves the instant it is
// dropped, the patch goes out, and if the engine refuses, the card goes back
// where it was and the engine's own words are shown (client.ts resolves every
// call to `{ ok, error }`, never throws). One write per card at a time — a
// second drag of a card whose first patch is still in flight is refused at the
// board, because the rollback of the first would otherwise land on top of the
// second.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLoadFor } from "@/app/_phases/_shared/useLoadFor";
import { measureAndStore } from "@/app/playground/shared/measure";
import { useSoundLab } from "@/app/playground/shared/shell";
import { getGroups, listTakes, patchTake, putGroups, uploadTake } from "@/lib/sound/client";
import type { SoundGroups, SoundKind, SoundTake, Stage } from "@/lib/sound/types";

import {
  addGroup,
  checkMove,
  deleteGroup,
  matchesSuggestion,
  movedSentence,
  moveGroup,
  renameGroup,
  rowsFor,
  stackVersions,
  type Cell,
  type GroupEdit,
  type Stack,
} from "./model";

export interface Notice {
  tone: "ok" | "error";
  text: string;
  at: number;
}

type Loaded = { takes: SoundTake[]; groups: SoundGroups } | { error: string };

const EMPTY_GROUPS: SoundGroups = { music: [], sfx: [] };

export function useArrange(kind: SoundKind) {
  const shell = useSoundLab();
  const [takes, setTakes] = useState<SoundTake[]>([]);
  const [groups, setGroups] = useState<SoundGroups>(EMPTY_GROUPS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reload, setReload] = useState(0);
  // The latest takes, for a rollback that must restore what was there when
  // the write left — not what a later render closed over.
  const live = useRef(takes);
  const liveGroups = useRef(groups);
  useEffect(() => {
    live.current = takes;
    liveGroups.current = groups;
  });

  const ready = useLoadFor<Loaded>(
    `${kind}#${reload}`,
    async () => {
      const [t, g] = await Promise.all([listTakes({ kind, verdict: "kept" }), getGroups()]);
      if (!t.ok) return { error: t.error };
      if (!g.ok) return { error: g.error };
      return { takes: t.data.takes, groups: g.data.groups };
    },
    (v) => {
      if ("error" in v) {
        setLoadError(v.error);
        setTakes([]);
        return;
      }
      setLoadError(null);
      setTakes(v.takes);
      setGroups(v.groups);
    },
  );

  const stacks = useMemo(() => stackVersions(takes), [takes]);
  const rows = useMemo(() => rowsFor(groups[kind], stacks), [groups, kind, stacks]);

  // Every notice goes to the shell's flash line (one voice for the lab); a
  // refusal ALSO stays on the board's toolbar until dismissed, because the
  // engine's words are the one thing the operator may need to read twice.
  const shellSay = shell.say;
  const say = useCallback(
    (text: string, tone: Notice["tone"] = "ok") => {
      shellSay(text, tone);
      setNotice(tone === "error" ? { text, tone, at: Date.now() } : null);
    },
    [shellSay],
  );
  const refresh = shell.refresh;
  const mark = (id: string, on: boolean) =>
    setBusy((b) => {
      const n = new Set(b);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  /** Replace takes by id, in place. */
  const swap = (next: SoundTake[]) =>
    setTakes((cur) => {
      const by = new Map(next.map((t) => [t.id, t]));
      return cur.map((t) => by.get(t.id) ?? t);
    });

  /**
   * Move a stack to a cell. Resolves to the refusal reason when the board
   * itself refuses (so the caller can open the label prompt for
   * "needs-label"), or to null once the write has settled either way.
   */
  const move = useCallback(
    async (s: Stack, to: Cell, label?: string | null): Promise<"needs-label" | "same-cell" | "unknown-row" | "busy" | null> => {
      if (busy.has(s.head.id)) return "busy";
      const c = checkMove(s, to, rows, label);
      if (!c.ok) return c.reason;
      const before = live.current.find((t) => t.id === s.head.id) ?? s.head;
      swap([{ ...before, ...c.patch } as SoundTake]);
      mark(s.head.id, true);
      const r = await patchTake(s.head.id, c.patch);
      mark(s.head.id, false);
      if (r.ok) {
        swap([r.data.take]);
        say(movedSentence(s.head.title, to));
        // The rail's "finalized" tally moved if this crossed that column.
        if (to.stage === "finalized" || before.stage === "finalized") refresh();
      } else {
        swap([before]);
        say(`${s.head.title} · refused · ${r.error}`, "error");
      }
      return null;
    },
    [busy, rows, say, refresh],
  );

  /** Write the groups file, optimistically; false (and the engine's words) on refusal. */
  const writeGroups = useCallback(
    async (edit: GroupEdit): Promise<boolean> => {
      if (!edit.ok) {
        say(edit.error, "error");
        return false;
      }
      const before = liveGroups.current;
      setGroups(edit.groups);
      const r = await putGroups(edit.groups);
      if (r.ok) {
        setGroups(r.data.groups);
        return true;
      }
      setGroups(before);
      say(`groups · refused · ${r.error}`, "error");
      return false;
    },
    [say],
  );

  /** Patch many takes' group at once; each that is refused is rolled back alone. */
  const regroup = async (list: SoundTake[], group: string | null) => {
    const before = new Map(list.map((t) => [t.id, t]));
    swap(list.map((t) => ({ ...t, group })));
    const results = await Promise.all(list.map((t) => patchTake(t.id, { group })));
    const back: SoundTake[] = [];
    const refused: string[] = [];
    results.forEach((r, i) => {
      if (r.ok) back.push(r.data.take);
      else {
        back.push(before.get(list[i].id)!);
        refused.push(r.error);
      }
    });
    swap(back);
    return refused;
  };

  const createGroup = useCallback(
    (name: string) => writeGroups(addGroup(liveGroups.current, kind, name)),
    [kind, writeGroups],
  );

  /** Create a suggested row and file into it the ungrouped heads that carry it. */
  const adoptSuggestion = useCallback(
    async (name: string) => {
      if (!(await writeGroups(addGroup(liveGroups.current, kind, name)))) return;
      const heads = stackVersions(live.current)
        .filter((s) => matchesSuggestion(s, name, kind))
        .map((s) => s.head);
      if (!heads.length) return;
      const refused = await regroup(heads, name.trim());
      say(
        refused.length ? `${name} · ${refused.length} of ${heads.length} refused · ${refused[0]}` : `${name} · ${heads.length} filed`,
        refused.length ? "error" : "ok",
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `regroup` only calls stable setters
    [kind, say, writeGroups],
  );

  /** Adopt a group the takes carry but the file does not list. */
  const adoptOrphan = useCallback(
    (name: string) => writeGroups({ ok: true, groups: { ...liveGroups.current, [kind]: [...liveGroups.current[kind], name] } }),
    [kind, writeGroups],
  );

  /** Rename the row, then every take of this kind that carries the old name —
   *  older versions too, so a stack never straddles two names. */
  const rename = useCallback(
    async (from: string, to: string) => {
      const edit = renameGroup(liveGroups.current, kind, from, to);
      if (!(await writeGroups(edit))) return false;
      const carried = live.current.filter((t) => t.group === from);
      if (!carried.length) return true;
      const refused = await regroup(carried, to.trim());
      if (refused.length) say(`${to} · ${refused.length} take${refused.length === 1 ? "" : "s"} kept “${from}” · ${refused[0]}`, "error");
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `regroup` only calls stable setters
    [kind, say, writeGroups],
  );

  const reorder = useCallback(
    (name: string, by: -1 | 1) => writeGroups(moveGroup(liveGroups.current, kind, name, by)),
    [kind, writeGroups],
  );

  const remove = useCallback(
    (name: string) => writeGroups(deleteGroup(liveGroups.current, kind, name, stackVersions(live.current))),
    [kind, writeGroups],
  );

  /**
   * File what Suno's studio handed back as the stack's next version. It
   * inherits the head's group, technique, terms and prompt, carries
   * `parentId` = the head, lands kept (it is a version of a kept track, not a
   * new candidate for Triage), and sits at `stage` — the column the operator
   * dropped it toward. Its peaks are measured here, from the bytes in hand,
   * so the new head draws a real waveform on its first render.
   */
  const fileReturn = useCallback(
    async (s: Stack, file: File, stage: Stage, label?: string | null): Promise<boolean> => {
      const h = s.head;
      mark(h.id, true);
      const meta: Partial<SoundTake> = {
        kind: h.kind,
        title: h.title,
        origin: "suno-return",
        provider: "suno",
        op: "manual",
        parentId: h.id,
        group: h.group,
        stage,
        verdict: "kept",
        technique: h.technique,
        terms: h.terms,
        prompt: h.prompt,
        negative: h.negative,
        loop: h.loop,
        ...(label?.trim() ? { label: label.trim() } : {}),
      };
      const r = await uploadTake(file, file.name, meta);
      if (!r.ok) {
        mark(h.id, false);
        say(`${h.title} · return refused · ${r.error}`, "error");
        return false;
      }
      let t = r.data.take;
      // The store may file an upload unjudged and unstaged whatever the meta
      // said (POST /api/sound/takes is the import door for every origin). A
      // return that landed elsewhere is put where the operator dropped it.
      if (t.verdict !== "kept" || t.stage !== stage || t.group !== h.group || (label?.trim() && t.label !== label.trim())) {
        const fix = await patchTake(t.id, {
          verdict: "kept",
          stage,
          group: h.group,
          ...(label?.trim() ? { label: label.trim() } : {}),
        });
        if (fix.ok) t = fix.data.take;
        else say(`${h.title} · v${s.versions.length + 1} filed, not placed · ${fix.error}`, "error");
      }
      mark(h.id, false);
      setTakes((cur) => [t, ...cur]);
      if (t.verdict === "kept") say(`${h.title} · v${s.versions.length + 1} · ${stage}`);
      if (stage === "finalized") refresh();
      // Peaks from the bytes now on the server, through the lab's one
      // measuring path, so the new head draws its real waveform.
      void measureAndStore(t).then((m) => {
        if (m.take) swap([m.take]);
      });
      return true;
    },
    [say, refresh],
  );

  /** Put a take the store handed back (a measurement) in place. */
  const replace = useCallback((t: SoundTake) => swap([t]), []);

  return {
    ready,
    loadError,
    retry: () => setReload((n) => n + 1),
    stacks,
    rows,
    declared: groups[kind],
    busy,
    notice,
    dismiss: () => setNotice(null),
    say,
    move,
    createGroup,
    adoptSuggestion,
    adoptOrphan,
    rename,
    reorder,
    remove,
    fileReturn,
    replace,
  };
}

export type Arrange = ReturnType<typeof useArrange>;
