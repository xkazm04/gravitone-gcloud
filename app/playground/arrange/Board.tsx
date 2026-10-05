"use client";

// THE BOARD — stages across, groups down, version stacks in the cells.
//
// DRAG IS POINTER EVENTS, NOT A LIBRARY. package.json carries no DnD
// dependency and motion/react's `drag` moves an element without knowing what
// it was dropped on; what this board needs is the opposite — the element stays
// put, a ghost follows the pointer, and the cell under the pointer is the
// answer. That is ~60 lines over `elementFromPoint` + `[data-cell]`, works for
// mouse, pen and touch alike, and costs no dependency. (Native HTML5 drag was
// the other option: no touch, an un-styleable ghost, and it would collide
// with the Suno drop zones, which ARE native file drops.)
//
// THE KEYBOARD PATH IS COMPLETE ON ITS OWN. A focused card: arrows walk to the
// nearest card in that direction; Shift+arrows move the card one cell; M opens
// the move map (Card.tsx#MoveMap); Space plays; V opens the versions; A
// switches between the head and the version under it at the same position.
// Every move is said once through the module's live region.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowDown, ArrowUp, CircleDashed, Hand, Pencil, Plus, Tag, Trash2 } from "lucide-react";

import { Hint, Tally } from "@/components/ui/signal";
import { STAGES, type SoundKind, type Stage } from "@/lib/sound/types";

import { Card } from "./Card";
import { LabelPrompt } from "./LabelPrompt";
import {
  agentLine,
  buildBoard,
  cellKey,
  cellOf,
  checkMove,
  rowWord,
  sameCell,
  STAGE_WORD,
  stageCounts,
  step,
  suggestLabel,
  type Cell,
  type Dir,
  type Row,
  type Stack,
} from "./model";
import { CopyButton } from "./parts";
import { CAPS as CAPS_TONED, CAPS_BARE as CAPS } from "@/app/playground/shared/ui";
import { PROVIDER_NAME } from "@/app/playground/shared/format";
import { transport } from "@/app/playground/shared/transport";
import { TakeWave } from "@/app/playground/shared/Wave";
import type { Arrange } from "./useArrange";

interface Drag {
  s: Stack;
  sx: number;
  sy: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  w: number;
  started: boolean;
  over: string | null;
}

const ARROW: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

const STAGE_HEAD: Record<Stage, { icon: React.ReactNode; tone: string; cell: string }> = {
  pending: { icon: <CircleDashed className="h-4 w-4" aria-hidden />, tone: "text-white/65", cell: "bg-white/[0.012]" },
  remaster: { icon: <Hand className="h-4 w-4" aria-hidden />, tone: "text-amber-200/85", cell: "bg-amber-200/[0.012]" },
  edit: { icon: <Hand className="h-4 w-4" aria-hidden />, tone: "text-amber-200/85", cell: "bg-amber-200/[0.012]" },
  finalized: { icon: <Tag className="h-4 w-4" aria-hidden />, tone: "text-emerald-300/90", cell: "bg-emerald-300/[0.015]" },
};

export function Board({ a, kind }: { a: Arrange; kind: SoundKind }) {
  const { stacks, rows } = a;
  const board = useMemo(() => buildBoard(stacks, rows), [stacks, rows]);
  const counts = useMemo(() => stageCounts(stacks), [stacks]);
  const cellCounts = useMemo(() => new Map([...board].map(([k, v]) => [k, v.length])), [board]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [finalizing, setFinalizing] = useState<{ rootId: string; to: Cell } | null>(null);
  const [mapFor, setMapFor] = useState<string | null>(null);
  const [openVersions, setOpenVersions] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  // A card that moved was re-mounted in its new cell; hand focus to it there,
  // on the render that follows the move (every move re-renders: it sets takes).
  const focusNext = useRef<string | null>(null);
  const setFocusId = (id: string) => {
    focusNext.current = id;
  };
  useEffect(() => {
    rowsRef.current = rows;
    const id = focusNext.current;
    if (!id) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
    if (el && document.activeElement !== el) el.focus();
    if (el) focusNext.current = null;
  });

  /** Every attempted move lands here: drag, Shift+arrow and the move map. */
  const attempt = useCallback(
    async (s: Stack, to: Cell) => {
      setMapFor(null);
      const r = await a.move(s, to);
      if (r === "needs-label") setFinalizing({ rootId: s.rootId, to });
      else if (r === "busy") a.say(`${s.head.title} · still saving`, "error");
      else setFocusId(s.rootId);
    },
    [a],
  );
  const attemptRef = useRef(attempt);
  useEffect(() => {
    attemptRef.current = attempt;
  });

  /* ── pointer drag ──────────────────────────────────────────────────── */

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>, s: Stack) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("[data-nodrag],button,a,input,textarea,[role=slider]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.focus();
    dragRef.current = { s, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, started: false, over: null };

    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.started && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 6) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-cell]");
      const next: Drag = { ...d, started: true, x: ev.clientX, y: ev.clientY, over: el?.dataset.cell ?? null };
      dragRef.current = next;
      setDrag(next);
      if (ev.clientY < 70) window.scrollBy(0, -14);
      else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
    };
    const end = (drop: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      document.documentElement.classList.remove("select-none");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", esc, true);
      if (drop && d?.started && d.over) {
        const [stage, rk] = d.over.split("|") as [Stage, string];
        const row = rowsRef.current.find((x) => x.key === rk);
        if (row) void attemptRef.current(d.s, { stage, group: row.name });
      }
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const esc = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      end(false);
    };
    document.documentElement.classList.add("select-none");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", esc, true);
  }, []);
  /* ── keyboard ──────────────────────────────────────────────────────── */

  const walk = (from: HTMLElement, dir: Dir) => {
    const r0 = from.getBoundingClientRect();
    const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    let best: { el: HTMLElement; d: number } | null = null;
    root.current?.querySelectorAll<HTMLElement>("[data-card]").forEach((el) => {
      if (el === from) return;
      const r = el.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const dx = c.x - c0.x;
      const dy = c.y - c0.y;
      const along = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
      const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) return;
      const d = along + across * 2;
      if (!best || d < best.d) best = { el, d };
    });
    (best as { el: HTMLElement } | null)?.el.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>, s: Stack) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = ARROW[e.key];
    if (dir && e.shiftKey) {
      e.preventDefault();
      const to = step(cellOf(s), dir, rows);
      if (to) void attempt(s, to);
      else a.say(`${s.head.title} · edge of the board`);
      return;
    }
    if (dir) {
      e.preventDefault();
      walk(e.currentTarget, dir);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "m") {
      e.preventDefault();
      setMapFor(s.rootId);
    } else if (e.key === " ") {
      e.preventDefault();
      if (s.head.file) transport.toggle(s.head.id, s.head.durationS);
    } else if (k === "v" && s.versions.length > 1) {
      e.preventDefault();
      toggleVersions(s.rootId);
    } else if (k === "a" && s.versions.length > 1) {
      e.preventDefault();
      const cur = transport.getSnapshot();
      const other = cur?.id === s.head.id ? s.versions[1] : s.head;
      // A/B: the other version from the SAME position, so the two are
      // compared at one instant rather than each from the top.
      const at = cur && s.versions.some((v) => v.id === cur.id) ? cur.position : 0;
      transport.play(other.id, at, other.durationS);
      a.say(`${s.head.title} · v${s.versions.length - s.versions.indexOf(other)}`);
    }
  };

  const toggleVersions = (id: string) =>
    setOpenVersions((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /* ── render ────────────────────────────────────────────────────────── */

  const dragCheck = drag?.started && drag.over ? overCheck(drag, rows) : null;
  const finStack = finalizing ? stacks.find((s) => s.rootId === finalizing.rootId) ?? null : null;

  return (
    <div ref={root} className="relative">
      <div aria-label={`${kind} arrangement`} role="region" className="grid grid-cols-[12.5rem_repeat(4,minmax(0,1fr))] gap-2">
        {/* the column heads */}
        <div className="contents">
          <div aria-hidden className="sticky top-0 z-20" />
          {STAGES.map((st) => (
            <div
              key={st}
              className="sticky top-0 z-20 flex items-center gap-2 rounded-xl border border-white/8 bg-[var(--gt-ink)]/80 px-3 py-2.5 backdrop-blur-xl"
            >
              <span className={STAGE_HEAD[st].tone}>{STAGE_HEAD[st].icon}</span>
              <span className={`${CAPS} ${STAGE_HEAD[st].tone}`}>{STAGE_WORD[st]}</span>
              <Tally value={counts[st]} tone={st === "finalized" && counts[st] ? "emerald" : st !== "pending" && counts[st] ? "amber" : "neutral"} />
              {(st === "remaster" || st === "edit") && <Hint tone="amber">done by hand in Suno Studio</Hint>}
            </div>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row.key} className="contents">
            <RowHead a={a} row={row} n={stacks.filter((s) => (s.head.group ?? null) === row.name).length} />
            {STAGES.map((st) => {
              const cell: Cell = { stage: st, group: row.name };
              const key = cellKey(cell);
              const list = board.get(key) ?? [];
              const over = drag?.started && drag.over === key;
              const prompt = finalizing && finStack && sameCell(finalizing.to, cell) ? finStack : null;
              return (
                <div
                  key={st}
                  role="group"
                  data-cell={key}
                  aria-label={`${STAGE_WORD[st]} · ${rowWord(row.name)}, ${list.length} card${list.length === 1 ? "" : "s"}`}
                  className={`relative flex min-h-[8.5rem] flex-col gap-2 rounded-xl border p-2 transition-colors ${STAGE_HEAD[st].cell} ${
                    over
                      ? dragCheck === "needs-label"
                        ? "border-emerald-300/55 bg-emerald-300/[0.06] shadow-[0_0_24px] shadow-emerald-300/10"
                        : dragCheck === "same-cell"
                          ? "border-white/20"
                          : "border-cyan-300/55 bg-cyan-300/[0.06] shadow-[0_0_24px] shadow-cyan-300/10"
                      : "border-white/[0.06]"
                  }`}
                >
                  {prompt && (
                    <LabelPrompt
                      title={prompt.head.title}
                      initial={prompt.head.label ?? suggestLabel(prompt.head, row.name)}
                      busy={a.busy.has(prompt.head.id)}
                      onCancel={() => {
                        setFinalizing(null);
                        setFocusId(prompt.rootId);
                      }}
                      onConfirm={async (label) => {
                        setFinalizing(null);
                        await a.move(prompt, cell, label);
                        setFocusId(prompt.rootId);
                      }}
                    />
                  )}
                  {list.map((s) => (
                    <Card
                      key={s.rootId}
                      stack={s}
                      counts={cellCounts}
                      rows={rows}
                      busy={a.busy.has(s.head.id)}
                      away={(drag?.started && drag.s.rootId === s.rootId) || finalizing?.rootId === s.rootId}
                      onPointerDown={onPointerDown}
                      onKeyDown={onKeyDown}
                      onMove={(x, to) => void attempt(x, to)}
                      onFile={a.fileReturn}
                      onStored={a.replace}
                      mapOpen={mapFor === s.rootId}
                      setMapOpen={(o) => setMapFor(o ? s.rootId : null)}
                      versionsOpen={openVersions.has(s.rootId)}
                      setVersionsOpen={() => toggleVersions(s.rootId)}
                    />
                  ))}
                  {over && dragCheck === "needs-label" && (
                    <span className="flex items-center justify-center gap-2 py-1 font-jetbrains text-label text-emerald-200/80">
                      <Tag className="h-4 w-4" aria-hidden />
                      label next
                    </span>
                  )}
                  {st === "finalized" && list.length > 0 && <AgentLine kind={kind} group={row.name} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {drag?.started && <DragGhost d={drag} />}
    </div>
  );
}

function overCheck(d: Drag, rows: readonly Row[]) {
  const [stage, rk] = (d.over ?? "").split("|") as [Stage, string];
  const row = rows.find((r) => r.key === rk);
  if (!row) return null;
  const c = checkMove(d.s, { stage, group: row.name }, rows);
  return c.ok ? "ok" : c.reason;
}

/** What follows the pointer: the card's face, lifted. */
function DragGhost({ d }: { d: Drag }) {
  const h = d.s.head;
  return (
    <div
      aria-hidden
      style={{ left: d.x - d.dx, top: d.y - d.dy, width: d.w }}
      className="pointer-events-none fixed z-50 rotate-[1.2deg] rounded-xl border border-cyan-300/45 bg-[var(--gt-ink)]/90 p-3 shadow-2xl shadow-cyan-400/15 backdrop-blur-xl"
    >
      <p className="truncate font-instrument text-xl text-white">{h.title}</p>
      <p className="mt-1 font-jetbrains text-label text-white/50">
        {PROVIDER_NAME[h.provider]}
        {d.s.versions.length > 1 ? ` · v${d.s.versions.length}` : ""}
      </p>
      <div className="mt-2">
        <TakeWave take={h} bars={48} height="h-7" />
      </div>
    </div>
  );
}

/** The line an agent runs to pick what this row finalized — data, copyable. */
function AgentLine({ kind, group }: { kind: SoundKind; group: string | null }) {
  const line = agentLine(kind, group);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/6 bg-black/20 px-2.5 py-1.5">
      <code className="min-w-0 flex-1 whitespace-normal break-words font-jetbrains text-label leading-snug text-white/50">{line}</code>
      <CopyButton text={line} label={`Copy the agent command for ${rowWord(group)}`} />
    </div>
  );
}

/* ── the row head: a group ─────────────────────────────────────────────── */

function RowHead({ a, row, n }: { a: Arrange; row: Row; n: number }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(row.name ?? "");
  const declared = a.declared;
  const i = row.name === null ? -1 : declared.indexOf(row.name);
  const btn =
    "grid h-7 w-7 cursor-pointer place-items-center rounded-full text-white/35 transition hover:bg-white/[0.06] hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-25";

  return (
    <div className="flex min-h-[8.5rem] flex-col gap-2 rounded-xl px-2 py-2.5">
      {editing && row.name !== null ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (v.trim() === row.name) return setEditing(false);
            if (await a.rename(row.name!, v)) setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setV(row.name ?? "");
              setEditing(false);
            }
          }}
        >
          <input
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => setEditing(false)}
            aria-label={`Rename ${row.name}`}
            maxLength={40}
            className="w-full rounded-lg border border-cyan-300/40 bg-white/[0.04] px-2 py-1 font-instrument text-xl text-white focus:outline-none"
          />
        </form>
      ) : (
        <div className="min-w-0">
          <h3 className={`truncate ${row.name === null ? CAPS_TONED : "font-instrument text-2xl leading-tight text-white/90"}`}>
            {rowWord(row.name)}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Tally value={n} label="cards" />
            {row.orphan && <Tally value={n} label="orphan" tone="amber" hint={<Hint tone="amber">takes carry this group; the groups file does not</Hint>} />}
          </div>
        </div>
      )}
      {row.name !== null && !editing && (
        <div className="flex items-center gap-0.5">
          {row.orphan ? (
            <button
              type="button"
              onClick={() => void a.adoptOrphan(row.name!)}
              className="cursor-pointer rounded-full border border-amber-300/35 px-2.5 py-0.5 font-jetbrains text-label text-amber-100 transition hover:bg-amber-300/10"
            >
              adopt
            </button>
          ) : (
            <>
              <button
                type="button"
                className={btn}
                aria-label={`Rename ${row.name}`}
                onClick={() => {
                  setV(row.name ?? "");
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" className={btn} aria-label={`Move ${row.name} up`} disabled={i <= 0} onClick={() => void a.reorder(row.name!, -1)}>
                <ArrowUp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className={btn}
                aria-label={`Move ${row.name} down`}
                disabled={i < 0 || i >= declared.length - 1}
                onClick={() => void a.reorder(row.name!, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              {n === 0 && (
                <button type="button" className={`${btn} hover:text-rose-200`} aria-label={`Delete the empty row ${row.name}`} onClick={() => void a.remove(row.name!)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── the toolbar: new rows ─────────────────────────────────────────────── */

export function NewRow({ a }: { a: Arrange }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-jetbrains text-label text-white/70 transition hover:border-white/25 hover:text-white"
      >
        <Plus className="h-4 w-4" aria-hidden />
        row
      </button>
    );
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await a.createGroup(v)) {
          setV("");
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-label="New row name"
        placeholder="group"
        maxLength={40}
        className="w-44 rounded-full border border-cyan-300/40 bg-white/[0.04] px-3 py-1.5 font-hanken text-label text-white placeholder:text-white/30 focus:outline-none"
      />
      <button type="submit" disabled={!v.trim()} className="cursor-pointer rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1.5 font-jetbrains text-label text-cyan-100 disabled:opacity-40">
        add
      </button>
    </form>
  );
}
