"use client";

// V1 · INBOX — a mail client's shape. The source rail says what is waiting
// where (and which sources could not be read at all), the queue is the
// filtered list, the detail pane is the selected item with its keys. Dense,
// mouse- and keyboard-equal; the Rejected filter turns the queue into the
// read-only lane.

import { useEffect } from "react";

import { Ghost, Loading, Pager, SideItem, SideList, useWindow } from "@/components/kit";
import { SOURCE_LABEL } from "@/lib/board/registry";
import { SOURCE_ORDER, type BoardEntry } from "@/lib/board/source";

import {
  CommitLine,
  Facts,
  ItemThumb,
  MachinePick,
  Media,
  NativeLink,
  ReasonChips,
  RejectedLane,
  SourceAbsence,
  SourceMark,
  SourceMeta,
  VerdictControls,
  VerdictWord,
} from "./parts";
import { defaultHandlers, type VariantProps } from "./shared";
import type { BoardApi } from "./useBoard";
import { useBoardKeys } from "./useBoardKeys";

export default function InboxVariant(props: VariantProps) {
  const { api, openLoupe } = props;
  useBoardKeys(defaultHandlers(props));
  const w = useWindow(api.visible, { size: 60 });
  const selectedId = api.selected?.item.id ?? null;

  // Keep the selected row in view as J/K walk past the fold.
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(rowId(selectedId))?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const inViewIds = api.query.src ? [api.query.src] : SOURCE_ORDER;
  // Unreadable sources always say so; an EMPTY one only when it is the one
  // picked — under "All" the rail already reads "empty" beside it.
  const absent = inViewIds.filter((id) => {
    const k = api.states[id].kind;
    return k === "unavailable" || k === "error" || (k === "empty" && api.query.src === id);
  });
  const settling = inViewIds.some((id) => ["idle", "loading", "counted"].includes(api.states[id].kind));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,380px)_minmax(0,1fr)]">
      <SideList
        label="Sources"
        heading="Sources"
        pinned={<SideItem title="All" current={api.query.src === null} onSelect={() => api.setQuery({ src: null, i: null })} />}
      >
        {SOURCE_ORDER.map((id) => (
          <SideItem
            key={id}
            glyph={<SourceMark state={api.states[id]} />}
            title={SOURCE_LABEL[id]}
            meta={<SourceMeta state={api.states[id]} />}
            current={api.query.src === id}
            onSelect={() => api.setQuery({ src: id, i: null })}
          />
        ))}
      </SideList>

      <div className="flex min-w-0 flex-col gap-3" aria-label="Queue">
        {api.query.st === "rejected" ? (
          <RejectedLane api={api} entries={api.visible} />
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {w.visible.map((e) => (
                <QueueRow key={e.item.id} entry={e} on={e.item.id === selectedId} api={api} onOpen={openLoupe} />
              ))}
            </ul>
            {api.visible.length > 0 && <Pager shown={w.shown} total={w.total} onMore={w.more} onAll={w.all} noun="items" auto />}
          </>
        )}
        {settling && !api.visible.length && <Loading />}
        {absent.map((id) => (
          <SourceAbsence key={id} id={id} state={api.states[id]} api={api} />
        ))}
        {!settling && !absent.length && !api.visible.length && api.query.st !== "rejected" && (
          <Ghost shape="row" count={2} label="nothing waiting here" />
        )}
      </div>

      <div className="min-w-0">{api.selected && api.query.st !== "rejected" ? <Detail entry={api.selected} api={api} /> : null}</div>
    </div>
  );
}

const rowId = (id: string) => `board-row-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

function QueueRow({ entry, on, api, onOpen }: { entry: BoardEntry; on: boolean; api: BoardApi; onOpen: () => void }) {
  const { item } = entry;
  return (
    <li>
      <button
        id={rowId(item.id)}
        type="button"
        aria-current={on ? "true" : undefined}
        onClick={() => api.select(item.id)}
        onDoubleClick={onOpen}
        className={`flex w-full items-center gap-3 rounded-[3px] border px-2 py-1.5 text-left transition-colors ${
          on ? "border-[var(--al-gold)] bg-[var(--al-field)]" : "border-[var(--al-line)] hover:border-[var(--al-line-strong)]"
        }`}
      >
        <ItemThumb item={item} className="h-11 w-[4.5rem] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-hanken text-content text-[var(--al-white)]">{item.title}</span>
          <span className="block truncate font-jetbrains text-label text-[var(--al-vellum)]">
            {SOURCE_LABEL[item.source]}
            {item.group ? ` · ${item.group}` : ""}
          </span>
        </span>
        <VerdictWord verdict={item.verdict} />
      </button>
    </li>
  );
}

function Detail({ entry, api }: { entry: BoardEntry; api: BoardApi }) {
  const { item } = entry;
  const pictures = item.media.filter((m) => m.kind !== "text");
  const words = item.media.filter((m) => m.kind === "text");
  return (
    <article aria-label={item.title} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-jetbrains text-label uppercase tracking-[0.14em] text-[var(--al-vellum)]">
            {SOURCE_LABEL[item.source]}
            {item.group ? ` · ${item.group}` : ""}
          </p>
          <h2 className="font-instrument text-[2rem] leading-tight text-[var(--al-white)]">{item.title}</h2>
        </div>
        <VerdictControls entry={entry} api={api} />
      </header>
      {pictures.length > 0 && (
        <div className={`grid gap-3 ${pictures.length > 1 ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}>
          {pictures.map((m, i) => (
            <div key={i} className="aspect-video overflow-hidden rounded-[3px] border border-[var(--al-line)]">
              <Media media={m} alt={`${item.title}, ${i + 1} of ${pictures.length}`} fit="contain" />
            </div>
          ))}
        </div>
      )}
      {words.map((m, i) => (
        <Media key={`t${i}`} media={m} alt="" />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <ReasonChips entry={entry} api={api} />
        <MachinePick item={item} />
        <CommitLine api={api} source={item.source} group={item.group} />
        <NativeLink entry={entry} />
      </div>
      <Facts entry={entry} />
    </article>
  );
}
