"use client";

// 3 · HUNT — manual analysis (round 4, platform-consolidation). An idea goes
// in; the text engine drafts a MAP of variants — the axes worth varying and a
// concrete prompt for each answer (POST /api/sound/hunts). The operator picks
// which leaves are worth hearing and pays only for those (the render bar
// prices the selection in seconds of audio), carries Suno leaves by hand,
// auditions what came back side by side, crowns the winners — a crown is a
// keep, so the take lands in Arrangement as pending — and signs the lesson
// the hunt taught, which the next prompt is composed from.
//
// The shell (../PlaygroundView.tsx) mounts this under its tab with the kind on
// screen; the open hunt rides in the URL (`?h=`) so a reload, or a link,
// lands on the same map.

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Headphones, Network, X } from "lucide-react";

import { Panel } from "@/components/ui/Primitives";
import {
  Ghost,
  Keycaps,
  PipRow,
  Provenance,
  Tally,
} from "@/components/ui/signal";
import { typing } from "@/lib/board/keys";
import type { Hunt, HuntNode, SoundKind, SoundTake } from "@/lib/sound/types";

import { dur } from "../shared/format";
import { measureAndStore, needsMeasure } from "../shared/measure";
import { SpendButton } from "../shared/price";
import { ErrorLine } from "../shared/shell";
import { BTN, BTN_REJECT, CAPS } from "../shared/ui";
import { Audition } from "./Audition";
import { Board } from "./Board";
import { Inspector } from "./Inspector";
import { LessonPanel } from "./Lesson";
import {
  EMPTY_SELECTION,
  buildTree,
  clickSelect,
  countsOf,
  marqueeSelect,
  renderPlan,
  toggleGroup,
  type Selection,
} from "./model";
import { Start } from "./Start";
import { useHunt, type HuntApi } from "./useHunt";

export default function HuntModule({ kind }: { kind: SoundKind }) {
  const api = useHunt(kind);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get("h");
  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (id) p.set("h", id);
    else p.delete("h");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (!api.ready && !api.loadError)
    return <Ghost shape="card" count={2} label="Reading the hunts" />;
  const hunt = openId
    ? (api.hunts?.find((h) => h.id === openId) ?? null)
    : null;

  return (
    <div data-module="hunt" data-kind={kind} className="grid gap-4">
      <ErrorLine text={api.loadError} />
      {hunt ? (
        <HuntView
          key={hunt.id}
          api={api}
          hunt={hunt}
          onBack={() => setOpen(null)}
        />
      ) : (
        <Start api={api} kind={kind} onOpen={(h) => setOpen(h.id)} />
      )}
    </div>
  );
}

/** The shared typing guard, plus a focused button: A on a leaf's checkbox or
 *  the render button is that control's, not "select every leaf". */
const ownsKeys = (target: EventTarget | null) =>
  typing(target) || (target as Element | null)?.tagName === "BUTTON";

function HuntView({
  api,
  hunt,
  onBack,
}: {
  api: HuntApi;
  hunt: Hunt;
  onBack: () => void;
}) {
  const tree = useMemo(() => buildTree(hunt.nodes), [hunt.nodes]);
  const order = useMemo(() => tree.leaves.map((l) => l.id), [tree]);
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);
  const [focus, setFocus] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "audition">("map");
  const counts = countsOf(hunt);
  const plan = renderPlan(hunt.nodes, sel.ids, api.reach);
  const run = api.run?.huntId === hunt.id ? api.run : null;

  // A node's takes, newest first: the ids it lists, and any the store filed
  // against it that the list has not caught up with. Indexed ONCE per change
  // of the takes or the map: as a per-call filter it scanned every take for
  // every leaf on every render, and the board re-renders on each pointer move
  // of a marquee. The index also keeps `takeOf` stable, so a leaf card whose
  // take did not change can skip its render (./Board.tsx#LeafCard).
  const byNode = useMemo(() => {
    const owner = new Map<string, string[]>();
    for (const n of hunt.nodes)
      for (const id of n.takeIds) owner.set(id, [...(owner.get(id) ?? []), n.id]);
    const m = new Map<string, SoundTake[]>();
    for (const t of api.takes) {
      const to = new Set(owner.get(t.id) ?? []);
      if (t.huntId === hunt.id && t.nodeId) to.add(t.nodeId);
      for (const id of to) m.set(id, [...(m.get(id) ?? []), t]);
    }
    for (const list of m.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return m;
  }, [api.takes, hunt.nodes, hunt.id]);
  const takesOf = useCallback((n: HuntNode): SoundTake[] => byNode.get(n.id) ?? [], [byNode]);
  const takeOf = useCallback((n: HuntNode) => byNode.get(n.id)?.[0] ?? null, [byNode]);
  const heard = useMemo(
    () => tree.leaves.filter((l) => l.state === "rendered" && takeOf(l)),
    [tree, takeOf],
  );

  // Heard takes with no peaks are measured once (shared/measure.ts dedupes by
  // id across modules) and the stored take replaces the local one.
  const unmeasured = api.takes.filter(
    (t) => t.huntId === hunt.id && needsMeasure(t),
  );
  const unmeasuredKey = unmeasured.map((t) => t.id).join(",");
  useEffect(() => {
    for (const t of unmeasured)
      void measureAndStore(t).then((r) => r.take && api.putTake(r.take));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ids; the list is rebuilt every render
  }, [unmeasuredKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        view !== "map" ||
        ownsKeys(e.target) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setSel({ ids: order, anchor: order[0] ?? null });
      } else if (e.key === "Escape") {
        setSel(EMPTY_SELECTION);
        setFocus(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, order]);

  // Stable, so a memoised leaf card is not re-rendered by a new closure.
  const onLeaf = useCallback(
    (id: string, mods: { shift: boolean; toggle: boolean }) => {
      setSel((s) => clickSelect(s, order, id, mods));
      setFocus(id);
    },
    [order],
  );

  const focused = focus
    ? (hunt.nodes.find((n) => n.id === focus) ?? null)
    : null;

  return (
    <>
      {/* ── the hunt, named ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onBack}
          className={BTN}
          aria-label="All hunts"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          hunts
        </button>
        <h2 className="min-w-0 max-w-[52rem] truncate font-instrument text-2xl text-white">
          {hunt.idea}
        </h2>
        {hunt.draftedBy && <Provenance model={hunt.draftedBy} />}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Tally
            value={counts.rendered}
            of={counts.leaves}
            label="heard"
            tone={counts.rendered ? "cyan" : "neutral"}
          />
          {counts.awaiting > 0 && (
            <Tally value={counts.awaiting} label="suno" tone="amber" />
          )}
          {counts.failed > 0 && (
            <Tally value={counts.failed} label="failed" tone="rose" />
          )}
          <Tally
            value={counts.winners}
            label="won"
            tone={counts.winners ? "emerald" : "neutral"}
          />
        </div>
        <div
          role="tablist"
          aria-label="View"
          className="flex gap-1 rounded-full border border-white/8 bg-white/[0.02] p-1"
        >
          {(
            [
              ["map", "map", Network],
              ["audition", `audition ${heard.length}`, Headphones],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 font-jetbrains text-label transition ${
                view === id
                  ? "bg-white/[0.09] text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "map" ? (
        <>
          {/* ── the render bar: what the selection will cost, before the click ── */}
          <div className="flex min-h-[3.75rem] flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-2.5">
            <Tally
              value={sel.ids.length}
              of={order.length}
              label="selected"
              tone={sel.ids.length ? "cyan" : "neutral"}
            />
            <button
              type="button"
              onClick={() => setSel({ ids: order, anchor: order[0] ?? null })}
              className={`${BTN} px-3 py-1`}
            >
              all
            </button>
            {sel.ids.length > 0 && (
              <button
                type="button"
                onClick={() => setSel(EMPTY_SELECTION)}
                className={`${BTN} px-3 py-1`}
                aria-label="Clear the selection"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
            <span className="flex flex-wrap items-center gap-1.5">
              {plan.byHand.length > 0 && (
                <Tally
                  value={plan.byHand.length}
                  label="suno by hand"
                  tone="amber"
                />
              )}
              {plan.unreachable.length > 0 && (
                <Tally
                  value={plan.unreachable.length}
                  label="not installed"
                  tone="neutral"
                />
              )}
              {plan.settled.length > 0 && (
                <Tally
                  value={plan.settled.length}
                  label="heard"
                  tone="neutral"
                />
              )}
            </span>
            <Keycaps
              map={[
                { keys: ["click"], does: "focus" },
                { keys: ["Ctrl", "click"], does: "toggle" },
                { keys: ["Shift", "click"], does: "range" },
                { keys: ["drag"], does: "marquee" },
                { keys: ["A"], does: "all" },
                { keys: ["Esc"], does: "clear" },
              ]}
            />
            <span className="ml-auto flex items-center gap-3">
              {run ? (
                <>
                  <span className="grid gap-1">
                    <span className="font-jetbrains text-label text-cyan-100/90">
                      rendering {Math.min(run.done + 1, run.total)} of{" "}
                      {run.total}
                      {run.current && (
                        <span className="text-white/45">
                          {" "}
                          ·{" "}
                          {hunt.nodes.find((n) => n.id === run.current)?.label}
                        </span>
                      )}
                    </span>
                    <PipRow
                      states={Array.from({ length: run.total }, (_, i) =>
                        i < run.done
                          ? "filled"
                          : i === run.done
                            ? "amber"
                            : "hollow",
                      )}
                      label={`${run.done} of ${run.total} rendered`}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={api.cancel}
                    disabled={run.cancelling}
                    className={BTN_REJECT}
                  >
                    {run.cancelling ? "stopping after this one" : "cancel"}
                  </button>
                </>
              ) : (
                <SpendButton
                  cost={api.cost(plan.seconds)}
                  disabled={plan.render.length === 0 || !!api.run}
                  onClick={() =>
                    void api.render(
                      hunt.id,
                      plan.render.map((n) => n.id),
                    )
                  }
                >
                  render {plan.render.length}
                </SpendButton>
              )}
            </span>
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
            <Panel className="min-w-0 p-2">
              <Board
                hunt={hunt}
                tree={tree}
                selected={sel.ids}
                focus={focus}
                takeOf={takeOf}
                onLeaf={onLeaf}
                onBranch={(ids) => setSel((s) => toggleGroup(s, order, ids))}
                onMarquee={(hits, add) =>
                  setSel((s) => marqueeSelect(s, order, hits, add))
                }
                onClear={() => {
                  setSel(EMPTY_SELECTION);
                  setFocus(null);
                }}
              />
            </Panel>
            <Panel
              as="aside"
              className="grid min-w-0 gap-4 p-5 xl:sticky xl:top-4 [&>*]:min-w-0"
            >
              {focused ? (
                <Inspector
                  key={focused.id}
                  api={api}
                  hunt={hunt}
                  node={focused}
                  takes={takesOf(focused)}
                />
              ) : (
                <SelectionList hunt={hunt} ids={sel.ids} onFocus={setFocus} />
              )}
            </Panel>
          </div>
        </>
      ) : heard.length === 0 ? (
        <Ghost
          shape="card"
          count={2}
          label="nothing heard yet"
          action={
            <button
              type="button"
              onClick={() => setView("map")}
              className={BTN}
            >
              <Network className="h-4 w-4" aria-hidden />
              map
            </button>
          }
        />
      ) : (
        <Audition api={api} hunt={hunt} heard={heard} takeOf={takeOf} />
      )}

      {heard.length > 0 && (
        <Panel as="section" className="grid gap-4 p-5">
          <h3 className={CAPS}>lesson</h3>
          <LessonPanel api={api} hunt={hunt} />
        </Panel>
      )}
    </>
  );
}

/** Nothing in focus: what is selected, so the render bar's figure has names. */
function SelectionList({
  hunt,
  ids,
  onFocus,
}: {
  hunt: Hunt;
  ids: readonly string[];
  onFocus: (id: string) => void;
}) {
  if (!ids.length)
    return <Ghost shape="row" count={3} label="no leaf in focus" />;
  const nodes = hunt.nodes.filter((n) => ids.includes(n.id));
  return (
    <div className="grid gap-2">
      <span className={CAPS}>selected</span>
      <ul className="grid gap-1">
        {nodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onFocus(n.id)}
              className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
            >
              <span className="min-w-0 truncate font-hanken text-label text-white/85">
                {n.label}
              </span>
              <span className="shrink-0 font-jetbrains text-label tabular-nums text-white/40">
                {n.provider === "elevenlabs" ? dur(n.durationS) : n.provider}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
