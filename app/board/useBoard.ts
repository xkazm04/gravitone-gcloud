"use client";

// THE BOARD'S STATE — one hook, three variants. The variants compete on
// layout and navigation, never on plumbing (the same split
// app/_phases/frames/alternatives/useAlternatives.ts makes for its views).
//
// What lives here: which sources have answered and how (lib/board/registry.ts
// SourceState), the URL query (lib/board/url.ts), the session undo stack
// (lib/board/undo.ts), and the one decide path every key and button goes
// through. A refusal from a source (lib/board/source.ts VerdictRefused) is a
// toast with the source's own words and a link to where it CAN be decided —
// never a write that pretends.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/kit";
import { useAuth } from "@/lib/useAuth";
import {
  createRegistry,
  stateOfCount,
  stateOfEntries,
  stateOfError,
  type Registry,
  type SourceState,
} from "@/lib/board/registry";
import { countEntries, keyOf, SOURCE_ORDER, VerdictRefused, type BoardCount, type BoardEntry } from "@/lib/board/source";
import type { BoardSourceId, BoardVerdict } from "@/lib/board/types";
import { diffVerdicts, popUndo, pushUndo, reversal, undoFor, withoutUndo, type UndoChange, type UndoEntry, type VerdictState } from "@/lib/board/undo";
import { inFilter, parseQuery, writeQuery, type BoardFilter, type BoardQuery } from "@/lib/board/url";

const IDLE: SourceState = { kind: "idle" };
const initialStates = (): Record<BoardSourceId, SourceState> =>
  Object.fromEntries(SOURCE_ORDER.map((id) => [id, IDLE])) as Record<BoardSourceId, SourceState>;

const stateOfItem = (e: BoardEntry): VerdictState => ({ verdict: e.item.verdict, reasons: e.item.reasons, note: e.item.note });

export const VERB: Record<"approve" | "reject" | "clear", string> = { approve: "Approved", reject: "Rejected", clear: "Cleared" };

export interface BoardApi {
  query: BoardQuery;
  setQuery: (patch: Partial<BoardQuery>) => void;
  states: Record<BoardSourceId, SourceState>;
  /** Every loaded entry of the sources in view, before the filter. */
  inView: BoardEntry[];
  /** `inView` under the filter — what the queue shows. */
  visible: BoardEntry[];
  /** Read-only lane: rejected entries in view. */
  rejected: BoardEntry[];
  selected: BoardEntry | null;
  select: (id: string | null) => void;
  move: (delta: 1 | -1) => void;
  busy: ReadonlySet<string>;
  decide: (entry: BoardEntry, verdict: BoardVerdict, reasons?: string[]) => Promise<void>;
  decideMany: (entries: BoardEntry[], verdict: BoardVerdict) => Promise<void>;
  undo: () => Promise<void>;
  undoItem: (itemId: string) => Promise<void>;
  canUndo: (itemId: string) => boolean;
  undoDepth: number;
  reload: (id: BoardSourceId) => void;
  toasts: ReturnType<typeof useToast>;
  countsOf: (id: BoardSourceId) => BoardCount | null;
  reasonAxes: (id: BoardSourceId) => string[];
  commitsOn: (id: BoardSourceId) => { href: string; label: string } | null;
  nativeOf: (id: BoardSourceId) => { href: string; label: string } | null;
}

export function useBoard(): BoardApi {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = useMemo(() => parseQuery(params), [params]);

  const setQuery = useCallback(
    (patch: Partial<BoardQuery>) => {
      const next = { ...parseQuery(params), ...patch };
      const qs = writeQuery(params.toString(), next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // One registry per account: it caches each adapter module and is rebuilt
  // only when the account changes, never by a re-render.
  const registry = useMemo<Registry>(() => createRegistry({ uid }), [uid]);
  const [states, setStates] = useState(initialStates);
  const [meta, setMeta] = useState<Partial<Record<BoardSourceId, { axes: string[]; commitsOn: { href: string; label: string } | null; native: { href: string; label: string } }>>>({});
  const [stack, setStack] = useState<UndoEntry[]>([]);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const toasts = useToast();
  const { push } = toasts;
  const seq = useRef(0);

  const put = useCallback((id: BoardSourceId, s: SourceState) => setStates((all) => ({ ...all, [id]: s })), []);

  /* ── counts first, for every source ─────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    for (const id of SOURCE_ORDER) {
      void registry
        .get(id)
        .then(async (src) => {
          if (!alive) return;
          setMeta((m) => ({ ...m, [id]: { axes: src.reasonAxes, commitsOn: src.commitsOn, native: src.native } }));
          setStates((all) => (all[id].kind === "idle" ? { ...all, [id]: { kind: "loading", count: null } } : all));
          const count = await src.count();
          if (!alive) return;
          setStates((all) => {
            // Items (or their failure) may already have landed — a source in
            // view loads in parallel — and a later count must not hide them.
            const cur = all[id];
            if (cur.kind !== "idle" && cur.kind !== "loading") return all;
            return { ...all, [id]: stateOfCount(count) };
          });
        })
        .catch((e) => {
          if (alive) put(id, stateOfError(e));
        });
    }
    return () => {
      alive = false;
    };
  }, [registry, put]);

  /* ── items, only for the sources in view ────────────────────────────────── */
  const inViewIds = useMemo(() => (query.src ? [query.src] : SOURCE_ORDER), [query.src]);
  const requested = useRef(new Set<string>());

  const loadSource = useCallback(
    async (id: BoardSourceId): Promise<BoardEntry[] | null> => {
      try {
        const src = await registry.get(id);
        const entries = await src.loadEntries();
        put(id, stateOfEntries(countEntries(entries), entries));
        return entries;
      } catch (e) {
        put(id, stateOfError(e));
        return null;
      }
    },
    [registry, put],
  );

  useEffect(() => {
    for (const id of inViewIds) {
      const key = `${uid}:${id}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      void loadSource(id);
    }
  }, [inViewIds, uid, loadSource]);

  const reload = useCallback(
    (id: BoardSourceId) => {
      put(id, { kind: "loading", count: null });
      void loadSource(id);
    },
    [loadSource, put],
  );

  /* ── what is on screen ──────────────────────────────────────────────────── */
  const inView = useMemo(() => {
    const out: BoardEntry[] = [];
    for (const id of inViewIds) {
      const s = states[id];
      if (s.kind === "loaded") out.push(...s.entries);
    }
    return out;
  }, [inViewIds, states]);

  const visible = useMemo(() => inView.filter((e) => inFilter(e.item, query.st)), [inView, query.st]);
  const rejected = useMemo(() => inView.filter((e) => e.item.verdict === "reject"), [inView]);
  // A NAMED item that is not in view selects NOTHING; only an unnamed
  // selection defaults to the head of the queue. Falling back to visible[0]
  // for a stale ?i= handed the next keypress an item the user never opened —
  // measured 2026-10-05, when a verification run's X landed on another run's
  // frame. Every path that changes the view (source, filter, advancePast)
  // sets `i` itself, so a stale one only arrives by URL.
  const selected = useMemo(
    () => (query.i ? (visible.find((e) => e.item.id === query.i) ?? null) : (visible[0] ?? null)),
    [visible, query.i],
  );

  const select = useCallback((id: string | null) => setQuery({ i: id }), [setQuery]);
  const move = useCallback(
    (delta: 1 | -1) => {
      if (!visible.length) return;
      const at = selected ? visible.findIndex((e) => e.item.id === selected.item.id) : -1;
      const next = visible[Math.max(0, Math.min(visible.length - 1, at + delta))];
      if (next) setQuery({ i: next.item.id });
    },
    [visible, selected, setQuery],
  );

  /* ── the one write path ─────────────────────────────────────────────────── */

  /** Fold new verdict states into a loaded source, recounting it. */
  const patchEntries = useCallback((id: BoardSourceId, changes: Map<string, VerdictState>) => {
    setStates((all) => {
      const s = all[id];
      if (s.kind !== "loaded") return all;
      const entries = s.entries.map((e) => {
        const c = changes.get(e.item.id);
        return c ? { ...e, item: { ...e.item, verdict: c.verdict, reasons: c.reasons, note: c.note } } : e;
      });
      return { ...all, [id]: stateOfEntries(countEntries(entries), entries) };
    });
  }, []);

  /** Decide one entry against its source; the changes it caused, or null. */
  const apply = useCallback(
    async (entry: BoardEntry, verdict: BoardVerdict, reasons: string[] = []): Promise<UndoChange[] | null> => {
      const id = entry.item.source;
      const refusal = entry.refuse[keyOf(verdict)];
      if (refusal) throw new VerdictRefused(refusal);
      const src = await registry.get(id);
      const before = stateOfItem(entry);
      const s = states[id];
      const snapshot = new Map((s.kind === "loaded" ? s.entries : [entry]).map((e) => [e.item.id, stateOfItem(e)]));
      await src.decide(entry.item.id, verdict, verdict === "reject" ? reasons : [], entry.item.note ?? undefined);
      if (src.exclusive) {
        // One pick moved its siblings: read the truth back and record them all.
        const after = await src.loadEntries();
        put(id, stateOfEntries(countEntries(after), after));
        return diffVerdicts(snapshot, new Map(after.map((e) => [e.item.id, stateOfItem(e)])));
      }
      const next: VerdictState = { verdict, reasons: verdict === "reject" ? reasons : [], note: entry.item.note };
      patchEntries(id, new Map([[entry.item.id, next]]));
      return [{ itemId: entry.item.id, prev: before, next }];
    },
    [registry, states, put, patchEntries],
  );

  /** After a decision under the pending filter the item leaves the queue —
   *  hand the selection to its neighbour before it goes. */
  const advancePast = useCallback(
    (ids: Set<string>, verdict: BoardVerdict) => {
      const leaves = (st: BoardFilter) => (st === "pending" ? verdict !== null : st === "rejected" ? verdict !== "reject" : verdict === null);
      if (!leaves(query.st) || !selected || !ids.has(selected.item.id)) return;
      const at = visible.findIndex((e) => e.item.id === selected.item.id);
      const rest = visible.filter((e) => !ids.has(e.item.id));
      const next = rest[Math.min(at, rest.length - 1)] ?? null;
      setQuery({ i: next?.item.id ?? null });
    },
    [query.st, selected, visible, setQuery],
  );

  const failed = useCallback(
    (entry: BoardEntry, e: unknown) => {
      const refused = e instanceof VerdictRefused;
      push({
        kind: refused ? "info" : "failed",
        key: `fail:${entry.item.id}`,
        text: `${entry.item.title} — ${e instanceof Error ? e.message : String(e)}`,
        ttl: refused ? 6000 : null,
      });
    },
    [push],
  );

  const decide = useCallback(
    async (entry: BoardEntry, verdict: BoardVerdict, reasons: string[] = []) => {
      const id = entry.item.id;
      if (busy.has(id)) return;
      setBusy((b) => new Set(b).add(id));
      try {
        const changes = await apply(entry, verdict, reasons);
        advancePast(new Set([id]), verdict);
        if (changes?.length) {
          const undoEntry: UndoEntry = { id: ++seq.current, itemId: id, label: entry.item.title, at: Date.now(), changes };
          setStack((st) => pushUndo(st, undoEntry));
          push({ kind: "ok", key: "decided", text: `${VERB[keyOf(verdict)]} · ${entry.item.title}` });
        }
      } catch (e) {
        failed(entry, e);
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          n.delete(id);
          return n;
        });
      }
    },
    [busy, apply, advancePast, push, failed],
  );

  /** A batch is ONE undo entry: Z after "reject 12" puts all twelve back. */
  const decideMany = useCallback(
    async (entries: BoardEntry[], verdict: BoardVerdict) => {
      const all: UndoChange[] = [];
      let refused = 0;
      for (const entry of entries) {
        try {
          const changes = await apply(entry, verdict);
          if (changes) all.push(...changes);
        } catch (e) {
          refused++;
          failed(entry, e);
        }
      }
      advancePast(new Set(entries.map((e) => e.item.id)), verdict);
      if (all.length) {
        const undoEntry: UndoEntry = {
          id: ++seq.current,
          itemId: entries[0].item.id,
          label: `${entries.length - refused} items`,
          at: Date.now(),
          changes: all,
        };
        setStack((st) => pushUndo(st, undoEntry));
        push({ kind: "ok", key: "decided", text: `${VERB[keyOf(verdict)]} · ${entries.length - refused} of ${entries.length}` });
      }
    },
    [apply, advancePast, push, failed],
  );

  const entryById = useCallback(
    (itemId: string): BoardEntry | null => {
      for (const id of SOURCE_ORDER) {
        const s = states[id];
        if (s.kind !== "loaded") continue;
        const hit = s.entries.find((e) => e.item.id === itemId);
        if (hit) return hit;
      }
      return null;
    },
    [states],
  );

  const runUndo = useCallback(
    async (entry: UndoEntry) => {
      const writes = reversal(entry);
      let done = 0;
      for (const w of writes) {
        const target = entryById(w.itemId);
        if (!target) continue;
        try {
          const src = await registry.get(target.item.source);
          await src.decide(w.itemId, w.to.verdict, w.to.reasons, w.to.note ?? undefined);
          patchEntries(target.item.source, new Map([[w.itemId, w.to]]));
          done++;
        } catch (e) {
          failed(target, e);
        }
      }
      setStack((st) => withoutUndo(st, entry.id));
      if (done) push({ kind: "ok", key: "decided", text: `Undone · ${entry.label}` });
    },
    [entryById, registry, patchEntries, failed, push],
  );

  const undo = useCallback(async () => {
    const [top] = popUndo(stack);
    if (top) await runUndo(top);
  }, [stack, runUndo]);

  const undoItem = useCallback(
    async (itemId: string) => {
      const e = undoFor(stack, itemId);
      if (e) await runUndo(e);
    },
    [stack, runUndo],
  );

  const canUndo = useCallback((itemId: string) => undoFor(stack, itemId) !== null, [stack]);

  const countsOf = useCallback(
    (id: BoardSourceId): BoardCount | null => {
      const s = states[id];
      return s.kind === "loaded" || s.kind === "empty" || s.kind === "counted" ? s.count : s.kind === "loading" ? s.count : null;
    },
    [states],
  );

  return {
    query,
    setQuery,
    states,
    inView,
    visible,
    rejected,
    selected,
    select,
    move,
    busy,
    decide,
    decideMany,
    undo,
    undoItem,
    canUndo,
    undoDepth: stack.length,
    reload,
    toasts,
    countsOf,
    reasonAxes: (id) => meta[id]?.axes ?? [],
    commitsOn: (id) => meta[id]?.commitsOn ?? null,
    nativeOf: (id) => meta[id]?.native ?? null,
  };
}
