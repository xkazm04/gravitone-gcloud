"use client";

// V1 · TRIAGE DESK — a refined inbox. The source rail says what is waiting
// where, with each source's own art beside its count (and which sources could
// not be read at all, in their own words); the queue is the filtered list as
// rich cards; the stage is the selected item at size with the decision bar
// under it. Mouse- and keyboard-equal. Under the Rejected filter the queue is
// the read-only lane and the bar becomes the stamp with its Undo.
//
// THE DESK FITS THE WINDOW. Rail, queue and stage each scroll inside their own
// panel, so J/K never scroll the page out from under the decision bar.

import { ChevronsDown, Maximize2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/ui/Primitives";
import { SOURCE_LABEL } from "@/lib/board/registry";
import { SOURCE_ORDER, type BoardEntry } from "@/lib/board/source";
import type { BoardSourceId } from "@/lib/board/types";

import { coverOf, metaOf, picturesOf, plateOwnsTitle, roleOf, SOURCE_ICON, splitTitle } from "./look";
import {
  Art,
  CommitLine,
  EmptyShape,
  FactGrid,
  MachinePick,
  NativeLink,
  pendingWord,
  Picture,
  ReasonChips,
  RejectedStamp,
  SourceAbsence,
  sourceLine,
  TextPlate,
  toneOf,
  VerdictBar,
  VerdictDot,
} from "./parts";
import { BoardBar, defaultHandlers, scopeOf, type VariantProps } from "./shared";
import type { BoardApi } from "./useBoard";
import { useBoardKeys } from "./useBoardKeys";

const PAGE = 80;
const rowId = (id: string) => `desk-row-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

export default function DeskVariant(props: VariantProps) {
  const { api, openLoupe } = props;
  useBoardKeys(defaultHandlers(props));
  const selectedId = api.selected?.item.id ?? null;
  const { settling, absent } = scopeOf(api);

  // A window over the queue, not the whole of it: a shelf of hundreds of
  // projects is thousands of research cards. It always reaches the selection.
  const [limit, setLimit] = useState(PAGE);
  const at = selectedId ? api.visible.findIndex((e) => e.item.id === selectedId) : -1;
  const shown = api.visible.slice(0, Math.max(limit, at + 12));

  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(rowId(selectedId))?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div>
      <BoardBar api={api} />
      <div className="grid h-[calc(100vh-14.5rem)] min-h-[560px] gap-4 lg:grid-cols-[18rem_25rem_minmax(0,1fr)]">
        <SourceRail api={api} />

        {!api.visible.length && !settling ? (
          // Nothing to queue and so nothing to stage: one composed absence
          // across both panels, not the same empty card printed twice.
          <Panel className="scroll-y flex min-h-0 flex-col justify-center gap-4 p-8 lg:col-span-2">
            {absent.map((id) => (
              <div key={id} className="mx-auto w-full max-w-2xl">
                <SourceAbsence id={id} state={api.states[id]} api={api} />
              </div>
            ))}
            {!absent.length && (
              <div className="mx-auto w-full max-w-3xl">
                <EmptyShape
                  icon={api.query.src}
                  title={emptyTitle(api)}
                  label="queue empty"
                  native={api.query.src ? api.nativeOf(api.query.src) : null}
                >
                  {api.inView.length > 0 && (
                    <span className="font-jetbrains text-label tabular-nums text-emerald-200/80">
                      {api.inView.filter((e) => e.item.verdict !== null).length}/{api.inView.length} decided
                    </span>
                  )}
                </EmptyShape>
              </div>
            )}
          </Panel>
        ) : (
          <>
            <Panel className="flex min-h-0 flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
                <span className="font-jetbrains text-label tracking-[0.16em] text-white/45 uppercase">{api.query.src ? SOURCE_LABEL[api.query.src] : "All sources"}</span>
                <span className="font-jetbrains ml-auto text-label tabular-nums text-white/40">
                  {at >= 0 ? `${at + 1} / ` : ""}
                  {api.visible.length}
                </span>
              </div>
              <ul aria-label="Queue" className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5 p-2">
                {shown.map((e, i) => {
                  const prev = shown[i - 1];
                  const turn = !prev || prev.item.source !== e.item.source || prev.item.group !== e.item.group;
                  return (
                    <Fragment key={e.item.id}>
                      {turn && <GroupDivider entry={e} first={i === 0} />}
                      <QueueCard entry={e} on={e.item.id === selectedId} api={api} onOpen={openLoupe} />
                    </Fragment>
                  );
                })}
                {api.visible.length > shown.length && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setLimit((n) => n + PAGE * 2)}
                      className="font-jetbrains flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 py-2.5 text-label text-white/55 transition hover:border-white/20 hover:text-white"
                    >
                      <ChevronsDown aria-hidden className="h-4 w-4" />
                      {api.visible.length - shown.length} more
                    </button>
                  </li>
                )}
                {settling && !api.visible.length && <QueueSkeleton />}
                {absent.map((id) => (
                  <li key={id} className="p-1">
                    <SourceAbsence id={id} state={api.states[id]} api={api} compact />
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel className="flex min-h-0 flex-col overflow-hidden">
              {api.selected ? <Stage key={api.selected.item.id} entry={api.selected} api={api} onOpen={openLoupe} /> : <StageSkeleton />}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

function emptyTitle(api: BoardApi): string {
  if (api.query.st === "pending") return api.inView.length ? "All decided" : `Nothing in ${api.query.src ? SOURCE_LABEL[api.query.src] : "any source"}`;
  return api.query.st === "rejected" ? "Nothing rejected" : "Nothing decided yet";
}

/** Where the queue turns to another run or project — named once, above it. */
function GroupDivider({ entry, first }: { entry: BoardEntry; first: boolean }) {
  const Icon = SOURCE_ICON[entry.item.source];
  return (
    <li aria-hidden className={`flex items-center gap-2 px-2 pb-0.5 ${first ? "pt-1" : "pt-3"}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-white/35" />
      <span className="font-jetbrains truncate text-label tracking-[0.12em] text-white/45 uppercase">{entry.item.group ?? SOURCE_LABEL[entry.item.source]}</span>
      <span className="h-px flex-1 bg-white/6" />
    </li>
  );
}

/* ── the rail ─────────────────────────────────────────────────────────────── */

function SourceRail({ api }: { api: BoardApi }) {
  const total = SOURCE_ORDER.reduce((s, id) => s + (api.countsOf(id)?.pending ?? 0), 0);
  const allArt = useMemo(() => {
    const out: BoardEntry[] = [];
    for (const id of SOURCE_ORDER) {
      const s = api.states[id];
      if (s.kind !== "loaded") continue;
      const hit = s.entries.find((e) => coverOf(e.item));
      if (hit) out.push(hit);
      if (out.length >= 4) break;
    }
    return out;
  }, [api.states]);
  return (
    <Panel as="nav" className="scroll-y flex min-h-0 flex-col gap-1 p-2">
      <h2 className="sr-only">Sources</h2>
      <RailItem
        on={api.query.src === null}
        onSelect={() => api.setQuery({ src: null, i: null })}
        art={<Mosaic entries={allArt} fallback={null} />}
        name="All sources"
        line={`${SOURCE_ORDER.filter((id) => (api.countsOf(id)?.pending ?? 0) > 0).length} waiting`}
        figure={String(total)}
        tone={total ? "waiting" : "clear"}
      />
      <div className="mx-2 my-1 h-px bg-white/6" />
      {SOURCE_ORDER.map((id) => {
        const s = api.states[id];
        const art = s.kind === "loaded" ? s.entries.filter((e) => coverOf(e.item)).slice(0, 4) : [];
        return (
          <RailItem
            key={id}
            on={api.query.src === id}
            onSelect={() => api.setQuery({ src: id, i: null })}
            art={<Mosaic entries={art} fallback={id} tone={toneOf(s)} />}
            name={SOURCE_LABEL[id]}
            line={sourceLine(s)}
            figure={pendingWord(s)}
            tone={toneOf(s)}
          />
        );
      })}
    </Panel>
  );
}

const FIGURE_TONE: Record<ReturnType<typeof toneOf>, string> = {
  waiting: "text-amber-200",
  clear: "text-emerald-200/80",
  empty: "text-white/25",
  locked: "text-white/35",
  failed: "text-rose-300",
  loading: "text-white/30",
};

function RailItem({
  on,
  onSelect,
  art,
  name,
  line,
  figure,
  tone,
}: {
  on: boolean;
  onSelect: () => void;
  art: React.ReactNode;
  name: string;
  line: string;
  figure: string;
  tone: ReturnType<typeof toneOf>;
}) {
  return (
    <button
      type="button"
      aria-current={on ? "true" : undefined}
      onClick={onSelect}
      className={`group flex w-full items-center gap-3 rounded-xl border p-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
        on ? "border-cyan-400/35 bg-cyan-400/[0.07]" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
      }`}
    >
      {art}
      <span className="min-w-0 flex-1">
        <span className={`font-hanken block truncate text-content ${on ? "text-white" : "text-white/85"}`}>{name}</span>
        <span className={`font-jetbrains block truncate text-label ${tone === "failed" ? "text-rose-300/80" : "text-white/40"}`}>{line}</span>
      </span>
      <span className={`font-instrument shrink-0 text-3xl leading-none tabular-nums ${FIGURE_TONE[tone]}`}>{figure}</span>
    </button>
  );
}

/** A source's own pictures, four up; its glyph when it has none to show. */
function Mosaic({ entries, fallback, tone = "waiting" }: { entries: BoardEntry[]; fallback: BoardSourceId | null; tone?: ReturnType<typeof toneOf> }) {
  if (entries.length) {
    const four = entries.length >= 4;
    return (
      <span aria-hidden className={`grid h-12 w-12 shrink-0 gap-0.5 overflow-hidden rounded-xl ring-1 ring-white/10 ${four ? "grid-cols-2" : ""}`}>
        {entries.slice(0, four ? 4 : 1).map((e) => (
          <Art key={e.item.id} entry={e} size="thumb" className="h-full w-full" />
        ))}
      </span>
    );
  }
  const Icon = fallback ? SOURCE_ICON[fallback] : SOURCE_ICON.cull;
  const hollow = tone === "empty" || tone === "locked";
  return (
    <span
      aria-hidden
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
        hollow
          ? "border border-dashed border-white/15"
          : tone === "failed"
            ? "border border-rose-400/30 bg-rose-400/10"
            : "border border-white/10 bg-gradient-to-br from-violet-400/15 via-white/[0.03] to-cyan-400/10"
      } ${tone === "loading" ? "animate-pulse" : ""}`}
    >
      <Icon className={`h-5 w-5 ${hollow ? "text-white/25" : tone === "failed" ? "text-rose-200" : "text-white/65"}`} strokeWidth={1.75} />
    </span>
  );
}

/* ── the queue ────────────────────────────────────────────────────────────── */

function QueueCard({ entry, on, api, onOpen }: { entry: BoardEntry; on: boolean; api: BoardApi; onOpen: () => void }) {
  const { item } = entry;
  const { title } = splitTitle(item);
  return (
    <li>
      <button
        id={rowId(item.id)}
        type="button"
        aria-current={on ? "true" : undefined}
        onClick={() => api.select(item.id)}
        onDoubleClick={onOpen}
        className={`relative flex w-full items-center gap-3 rounded-xl border p-1.5 pr-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
          on ? "border-cyan-400/40 bg-cyan-400/[0.08] shadow-lg shadow-cyan-500/5" : "border-white/6 bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.04]"
        }`}
      >
        {on && <span aria-hidden className="absolute top-3 bottom-3 -left-px w-0.5 rounded-full bg-cyan-300" />}
        <Art entry={entry} size="glyph" className={`h-16 w-24 shrink-0 rounded-lg ${item.verdict === "reject" ? "opacity-50 grayscale" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className={`font-hanken line-clamp-2 text-content leading-snug ${on ? "text-white" : "text-white/85"}`}>{title}</span>
          <span className="font-jetbrains mt-0.5 block truncate text-label text-white/40">
            {metaOf(entry)}
          </span>
        </span>
        <VerdictDot verdict={item.verdict} />
      </button>
    </li>
  );
}

function QueueSkeleton() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} aria-hidden className="flex animate-pulse items-center gap-3 rounded-xl border border-white/6 p-1.5" style={{ opacity: 1 - i * 0.16 }}>
          <span className="h-16 w-24 rounded-lg bg-white/[0.05]" />
          <span className="flex-1 space-y-2">
            <span className="block h-2.5 w-4/5 rounded-full bg-white/[0.08]" />
            <span className="block h-2 w-1/2 rounded-full bg-white/[0.05]" />
          </span>
        </li>
      ))}
      <li className="sr-only">reading sources</li>
    </>
  );
}

/* ── the stage ────────────────────────────────────────────────────────────── */

function Stage({ entry, api, onOpen }: { entry: BoardEntry; api: BoardApi; onOpen: () => void }) {
  const { item } = entry;
  const pictures = picturesOf(item);
  const Icon = SOURCE_ICON[item.source];
  const { kicker, title } = splitTitle(item);
  const rejectedLane = api.query.st === "rejected";
  const words = item.media.filter((m) => m.kind === "text" && m.text);
  return (
    <article aria-label={item.title} data-board-selected={item.id} className="gt-rise flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 px-6 pt-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
          <Icon aria-hidden className="h-4.5 w-4.5 text-cyan-200/80" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-jetbrains truncate text-label tracking-[0.14em] text-white/45 uppercase">
            {SOURCE_LABEL[item.source]}
            {item.group ? ` · ${item.group}` : ""}
            {kicker ? ` · ${kicker}` : ""}
          </p>
          <h2 className={plateOwnsTitle(item) ? "sr-only" : "font-instrument mt-0.5 line-clamp-2 text-3xl leading-tight text-white"}>{title}</h2>
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open in the loupe (Enter)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-100"
        >
          <Maximize2 aria-hidden className="h-4 w-4" />
        </button>
      </header>

      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-5 px-6 py-5">
        {pictures.length > 0 ? (
          <div className={`grid min-h-[16rem] flex-1 gap-4 ${pictures.length > 1 ? "grid-cols-2" : ""}`} onDoubleClick={onOpen}>
            {pictures.map((m, i) => (
              <Picture key={i} media={m} alt={`${item.title}, ${i + 1} of ${pictures.length}`} role={roleOf(item, i, pictures.length)} />
            ))}
          </div>
        ) : (
          <TextPlate entry={entry} withTitle={plateOwnsTitle(item)} className={plateOwnsTitle(item) ? "my-auto" : ""} />
        )}
        {pictures.length > 0 &&
          words.map((m, i) => (
            <p key={i} className="font-hanken max-w-[70ch] text-content leading-relaxed text-white/75">
              {m.text}
            </p>
          ))}
        <FactGrid entry={entry} columns={3} skip={item.source === "triage" ? ["kind", "confidence", "source"] : []} />
      </div>

      <footer className="flex flex-col gap-3 border-t border-white/6 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <MachinePick item={item} />
          {!rejectedLane && <ReasonChips entry={entry} api={api} />}
          <span className="ml-auto flex items-center gap-3">
            <CommitLine api={api} source={item.source} group={item.group} />
            <NativeLink entry={entry} />
          </span>
        </div>
        {rejectedLane ? <RejectedStamp entry={entry} api={api} /> : <VerdictBar entry={entry} api={api} size="lg" />}
      </footer>
    </article>
  );
}

function StageSkeleton() {
  return (
    <div aria-hidden className="flex flex-1 animate-pulse flex-col gap-4 p-6">
      <span className="h-3 w-40 rounded-full bg-white/[0.07]" />
      <span className="h-7 w-2/3 rounded-full bg-white/[0.08]" />
      <span className="flex-1 rounded-xl bg-white/[0.035]" />
      <span className="h-14 rounded-2xl bg-white/[0.04]" />
    </div>
  );
}
