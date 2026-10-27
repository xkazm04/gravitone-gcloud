"use client";

// THE ARRANGE BOARD ON THE AUDIO DESK (owner ruling 2026-10-17: every Sound lab tool is absorbed
// into /audio). Kept takes as version stacks, stages across, groups down; a card moves by drag or
// by ⇧arrow, finalize asks for the library label first, a manual stage carries the Suno round
// trip, and the rows are edited in place. v1 app/playground/arrange/{index,Board,useArrange}.tsx
// absorbed; the rules are @gt/ui audio/arrange.ts, the writes lib/sound/arrange.ts.
//
// THE REQUEST POSTURE (drag-drop ownership-boundaries). The sound store owns the arrangement, so
// a move is drawn PROVISIONAL at its target (dashed, aria-busy) until the store answers: accepted,
// it settles and is said once in the toast region; refused, the card returns and the store's own
// sentence stays over the board until the next success. One write per card at a time - a second
// gesture on a card whose first is in flight is refused here, because the first's rollback would
// land on top of it (v1's rule); a move and a Suno return are both writes (`inFlight`). A request with no answer in ANSWER_MS resolves to refused with
// that sentence and the page re-reads the store, so nothing floats provisional forever - and a
// request that REJECTS (the action's round trip failed) is refused with its words the same way.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { errorMessage } from "@gt/domain/errors";
import { ArrangeBoard } from "@gt/ui/components/audio/ArrangeBoard.tsx";
import { buildBoard, cellKey, cellOf, checkMove, movedSentence, nextStage, REFUSAL_WORDS, rowsFor, stackVersions, STAGES, step, suggestLabel, walk, type Cell, type Dir, type Stack, type Stage } from "@gt/ui/components/audio/arrange.ts";
import { seedSuggestions, type GroupOp } from "@gt/ui/components/audio/arrangeGroups.ts";
import { LabelPrompt } from "@gt/ui/components/audio/LabelPrompt.tsx";
import { RoundTrip } from "@gt/ui/components/audio/RoundTrip.tsx";
import { RowFoot, RowHead } from "@gt/ui/components/audio/RowHead.tsx";
import { TakeCard, type CardTake } from "@gt/ui/components/audio/TakeCard.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { useShell } from "../../_shell/Providers.tsx";
import { copyText } from "../../_shell/clipboard.ts";
import { can, engineById } from "../../../../lib/sound/engines.ts";
import type { editRows, moveCard } from "./arrangeActs.ts";
import type { ArrangeView } from "./arrangeRead.ts";
import { uploadReturn } from "./returnClient.ts";
import { useCardDrag } from "./useCardDrag.ts";
import { useTransport } from "./useTransport.ts";
import s from "./audio.module.css";

export type ArrangeActs = { readonly moveCard: typeof moveCard; readonly editRows: typeof editRows };

/** A store that has not answered in this long is answered for: refused, and the page re-reads. */
export const ANSWER_MS = 15_000;
export const ARRANGE_MODE = "audio.arrange";

type Pending = { readonly to: Cell; readonly label?: string; readonly landed: boolean };
type Ask = { readonly id: string; readonly to: Cell; readonly file?: File };

const DIR: Readonly<Record<string, Dir>> = { "←": "left", "→": "right", "↑": "up", "↓": "down", "⇧←": "left", "⇧→": "right", "⇧↑": "up", "⇧↓": "down" };
const opId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 20);

/** The write a card has in flight, in words, or null: a move not yet answered, or a return uploading. */
export function inFlight(pending: ReadonlyMap<string, { readonly landed: boolean }>, uploading: ReadonlySet<string>, id: string): string | null {
  if (pending.get(id)?.landed === false) return "a move is still in flight";
  if (uploading.has(id)) return "a return is still uploading";
  return null;
}

function withPending(takes: readonly CardTake[], pending: ReadonlyMap<string, Pending>): CardTake[] {
  return takes.map((t) => {
    const p = pending.get(t.id);
    return p === undefined ? t : { ...t, stage: p.to.stage, group: p.to.group, ...(p.label === undefined ? {} : { label: p.label }) };
  });
}

/** A write that threw: the words it threw with. */
export type Threw = { readonly threw: string };
const threw = (v: unknown): v is Threw => typeof v === "object" && v !== null && "threw" in v;

/**
 * A write's answer within `ms`: its own, "no-answer" past the wait, or the words of a write that
 * REJECTED (a Server Action whose request never came back rejects; it does not answer `ok: false`).
 * Never a rejection itself, so the caller's settle always runs, and the timer goes with the answer.
 */
export async function answered<T>(p: Promise<T>, ms: number): Promise<T | "no-answer" | Threw> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.catch((e: unknown): Threw => ({ threw: errorMessage(e) })),
      new Promise<"no-answer">((r) => {
        timer = setTimeout(() => r("no-answer"), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function Arrange({ view, acts }: { readonly view: ArrangeView; readonly acts: ArrangeActs }) {
  const router = useRouter();
  const { toast } = useShell();
  const served = useMemo(() => (view.takes.ok ? view.takes.value : []), [view.takes]);
  const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(new Map());
  const [refusal, setRefusal] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [ask, setAsk] = useState<Ask | null>(null);
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());
  const [rowsBusy, setRowsBusy] = useState(false);
  const transport = useTransport((w) => setRefusal(w));

  // A landed move stays drawn where it landed until the store's re-read says the same: pruned
  // when a new read arrives, during render (React's "adjust state when a prop changes").
  const [seen, setSeen] = useState(served);
  if (seen !== served) {
    setSeen(served);
    const kept = new Map([...pending].filter(([id, p]) => !p.landed || !served.some((t) => t.id === id && t.stage === p.to.stage && t.group === p.to.group)));
    if (kept.size !== pending.size) setPending(kept);
  }

  const stacks = useMemo(() => stackVersions(withPending(served, pending)), [served, pending]);
  const rows = useMemo(() => rowsFor(view.groups, stacks), [view.groups, stacks]);
  const board = useMemo(() => buildBoard(stacks, rows), [stacks, rows]);
  const suggestions = useMemo(() => seedSuggestions(stacks, view.groups, view.kind), [stacks, view.groups, view.kind]);
  const stackOf = (id: string): Stack<CardTake> | undefined => stacks.find((x) => x.head.id === id);
  const canReturn = can(engineById(view.registry, "suno"), "file-return");

  // Focus rides with the card (drag-drop keyboard-alternatives): a moved card re-mounts in its new
  // cell, and focus that fell to the page goes back to it.
  useEffect(() => {
    if (focused === null || (document.activeElement !== null && document.activeElement !== document.body)) return;
    document.querySelector<HTMLElement>(`[data-card="${CSS.escape(focused)}"]`)?.focus();
  }, [stacks, focused]);

  const settle = (id: string, p: Pending | null): void =>
    setPending((cur) => {
      const next = new Map(cur);
      if (p === null) next.delete(id);
      else next.set(id, p);
      return next;
    });

  const move = async (stack: Stack<CardTake>, to: Cell, label?: string): Promise<void> => {
    const h = stack.head;
    const busy = inFlight(pending, uploading, h.id);
    if (busy !== null) {
      setRefusal(`${h.title} · ${busy}`);
      return;
    }
    const c = checkMove(stack, to, rows, label);
    if (!c.ok) {
      if (c.reason === "needs-label") setAsk({ id: h.id, to });
      else if (c.reason !== "same-cell") setRefusal(`${h.title} · ${REFUSAL_WORDS[c.reason]}`);
      return;
    }
    // Where the store has the card: the served row, or where a landed move put it before the re-read.
    const truth = served.find((t) => t.id === h.id);
    const landed = pending.get(h.id);
    const from: Cell = landed?.landed === true ? landed.to : { stage: truth?.stage ?? "pending", group: truth?.group ?? null };
    setAsk(null);
    settle(h.id, { to, ...(c.patch.label === undefined ? {} : { label: c.patch.label }), landed: false });
    const r = await answered(acts.moveCard({ id: h.id, from, to, opId: opId(), ...(c.patch.label === undefined ? {} : { label: c.patch.label }) }), ANSWER_MS);
    if (r !== "no-answer" && !threw(r) && r.ok) {
      settle(h.id, { to, ...(c.patch.label === undefined ? {} : { label: c.patch.label }), landed: true });
      setRefusal(null);
      toast(movedSentence(h.title, to));
    } else {
      settle(h.id, null);
      const words = r === "no-answer" ? `no answer from the sound store in ${ANSWER_MS / 1000} s` : threw(r) ? r.threw : r.error.error;
      setRefusal(`${h.title} · refused · ${words}`);
      toast(`${h.title} · refused`);
    }
    router.refresh();
  };

  const upload = async (stack: Stack<CardTake>, file: File, to: Stage, label?: string): Promise<void> => {
    const h = stack.head;
    const busy = inFlight(pending, uploading, h.id);
    if (busy !== null) {
      setRefusal(`${h.title} · ${busy}`);
      return;
    }
    setAsk(null);
    setUploading((u) => new Set(u).add(h.id));
    const r = await uploadReturn({ head: h.id, stage: to, file, op: opId(), ...(label === undefined ? {} : { label }) });
    setUploading((u) => {
      const n = new Set(u);
      n.delete(h.id);
      return n;
    });
    if (r.ok) {
      setRefusal(null);
      toast(`${h.title} · v${r.value.version} · ${to}`);
    } else setRefusal(`${h.title} · return refused · ${r.error}`);
    router.refresh();
  };

  const edit = async (op: GroupOp): Promise<void> => {
    if (rowsBusy) return;
    setRowsBusy(true);
    const r = await answered(acts.editRows({ kind: view.kind, op, opId: opId() }), ANSWER_MS);
    setRowsBusy(false);
    if (r !== "no-answer" && !threw(r) && r.ok) {
      setRefusal(null);
      toast(r.value.carried > 0 ? `rows · ${r.value.carried} filed` : "rows saved");
    } else setRefusal(`rows · refused · ${r === "no-answer" ? `no answer from the sound store in ${ANSWER_MS / 1000} s` : threw(r) ? r.threw : r.error.error}`);
    router.refresh();
  };

  const at = (id: string): { cell: Cell; index: number } | null => {
    const st = stackOf(id);
    if (st === undefined) return null;
    const cell = cellOf(st);
    return { cell, index: (board.get(cellKey(cell)) ?? []).findIndex((x) => x.head.id === id) };
  };
  const focus = (id: string): void => {
    setFocused(id);
    document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)?.focus();
  };

  useKeys(
    ARRANGE_MODE,
    {
      walk: (hit) => {
        const dir = DIR[hit.cap];
        const here = focused === null ? null : at(focused);
        if (dir === undefined || here === null) return false;
        const to = walk(board, rows, here.cell, here.index, dir);
        const target = to === null ? undefined : board.get(cellKey(to.cell))?.[to.index];
        if (target !== undefined) focus(target.head.id);
        return undefined;
      },
      move: (hit) => {
        const dir = DIR[hit.cap];
        const st = focused === null ? undefined : stackOf(focused);
        if (dir === undefined || st === undefined) return false;
        const to = step(cellOf(st), dir, rows);
        if (to !== null) void move(st, to);
        return undefined;
      },
      finalize: () => {
        const st = focused === null ? undefined : stackOf(focused);
        if (st === undefined || cellOf(st).stage === "finalized") return false;
        void move(st, { stage: "finalized", group: st.head.group });
        return undefined;
      },
      versions: () => {
        if (focused === null) return false;
        setOpen((o) => {
          const n = new Set(o);
          if (n.has(focused)) n.delete(focused);
          else n.add(focused);
          return n;
        });
        return undefined;
      },
      "leave-field": () => {
        setAsk(null);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (focused !== null) focus(focused);
        return undefined;
      },
    },
    { facts: focused === null ? [] : ["card"] },
  );

  const drag = useCardDrag((id, key) => {
    const st = stackOf(id);
    const to = rows.flatMap((r) => STAGES.map((stage) => ({ stage, group: r.name }))).find((c) => cellKey(c) === key);
    if (st !== undefined && to !== undefined) void move(st, to);
  });

  if (!view.takes.ok) return <ErrorLine message={`takes: ${view.takes.error}`} />;

  const card = (stack: Stack<CardTake>) => {
    const h = stack.head;
    const stage = cellOf(stack).stage;
    const asking = ask !== null && ask.id === h.id ? ask : null;
    const manual = stage === "remaster" || stage === "edit" ? stage : null;
    const next = manual === null ? null : nextStage(manual);
    return (
      <TakeCard
        stack={stack}
        focused={focused === h.id}
        pending={pending.get(h.id)?.landed === false || uploading.has(h.id) || drag.dragging === h.id}
        playing={transport.playing}
        open={open.has(h.id)}
        onFocus={() => setFocused(h.id)}
        onPointerDown={(e) => drag.start(h.id, e)}
        onPlay={(t) => {
          if (t.src !== null) transport.toggle(t.id, t.src);
        }}
        onVersions={() => setOpen((o) => (o.has(h.id) ? new Set([...o].filter((x) => x !== h.id)) : new Set(o).add(h.id)))}
      >
        {asking !== null && (
          <LabelPrompt
            title={`${h.title} → finalized`}
            initial={h.label ?? suggestLabel(h, h.group)}
            busy={uploading.has(h.id)}
            onCancel={() => setAsk(null)}
            onConfirm={(label) => void (asking.file === undefined ? move(stack, asking.to, label) : upload(stack, asking.file, "finalized", label))}
          />
        )}
        {manual !== null && next !== null && canReturn && asking === null && (
          <RoundTrip
            kind={view.kind}
            title={h.title}
            stage={manual}
            next={next}
            download={h.src === null ? null : { href: h.src, name: h.fileName ?? h.title }}
            busy={uploading.has(h.id)}
            onCopyPrompt={h.prompt.trim() === "" ? null : () => void copyText(h.prompt).then((r) => (r.ok ? toast("prompt copied") : setRefusal(`clipboard refused: ${r.error}`)))}
            onFile={(file, to) => {
              if (to === "finalized" && (h.label ?? "").trim() === "") setAsk({ id: h.id, to: { stage: "finalized", group: h.group }, file });
              else void upload(stack, file, to, to === "finalized" ? (h.label ?? undefined) : undefined);
            }}
          />
        )}
      </TakeCard>
    );
  };

  return (
    <section className={s.arrange} aria-label="arrange">
      {refusal !== null && <ErrorLine message={refusal} live />}
      {view.measures !== null && <ErrorLine message={`measures: ${view.measures}`} />}
      {view.rows !== null && <ErrorLine message={`rows: ${view.rows}`} />}
      {stacks.length === 0 ? (
        <Empty label="no kept takes of this kind" action={{ label: "Triage", href: "/floor?lane=audio" }} />
      ) : (
        <ArrangeBoard
          stacks={stacks}
          rows={rows}
          over={drag.over}
          renderCard={card}
          renderRowHead={(row, held) => {
            const i = view.groups.indexOf(row.name ?? "");
            return <RowHead row={row} held={held} first={i <= 0} last={i < 0 || i === view.groups.length - 1} onEdit={(op) => void edit(op)} />;
          }}
        />
      )}
      <RowFoot suggestions={suggestions} busy={rowsBusy} onEdit={(op) => void edit(op)} />
    </section>
  );
}
