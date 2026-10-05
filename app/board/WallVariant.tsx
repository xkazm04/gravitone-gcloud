"use client";

// V3 · WALL — everything in view at once, as a justified media wall grouped
// by source, and decided in batches. Click a tile to point at it, tick it (or
// Shift-click a range) to gather a batch; with a batch gathered, A / X / U act
// on the whole batch and Z puts the whole batch back (one undo entry,
// app/board/useBoard.ts decideMany). With none, the keys act on the pointed
// tile like every other variant.
//
// Justified, not gridded: each tile's width follows its picture's own aspect
// ratio (read off the image as it loads), so a row of 9:16 proofs and 16:9
// plates both fill the line without cropping either.

import { useMemo, useState } from "react";

import { Button, Loading, Tile } from "@/components/kit";
import { SOURCE_LABEL } from "@/lib/board/registry";
import { SOURCE_ORDER, type BoardEntry } from "@/lib/board/source";
import type { BoardSourceId } from "@/lib/board/types";

import { CommitLine, leadMedia, MachinePick, Media, RejectedLane, SourceAbsence, VerdictControls } from "./parts";
import { defaultHandlers, SourceChips, type VariantProps } from "./shared";
import type { BoardApi } from "./useBoard";
import { useBoardKeys } from "./useBoardKeys";

const ROW_H = 190;
const TEXT_RATIO = 1.25;

export default function WallVariant(props: VariantProps) {
  const { api } = props;
  const [batch, setBatch] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [ratios, setRatios] = useState<Record<string, number>>({});

  // A batch only ever holds what is on screen: a filter change that hides an
  // item takes it out of the batch rather than deciding it unseen.
  const visibleIds = useMemo(() => new Set(api.visible.map((e) => e.item.id)), [api.visible]);
  const picked = useMemo(() => api.visible.filter((e) => batch.has(e.item.id)), [api.visible, batch]);

  const base = defaultHandlers(props);
  useBoardKeys({
    ...base,
    approve: picked.length ? () => void decideBatch("approve") : base.approve,
    reject: picked.length ? () => void decideBatch("reject") : base.reject,
    clear: picked.length ? () => void decideBatch(null) : base.clear,
    close: () => {
      if (props.loupeOpen) props.closeLoupe();
      else setBatch(new Set());
    },
  });

  async function decideBatch(v: "approve" | "reject" | null) {
    const these = picked;
    setBatch(new Set());
    await api.decideMany(these, v);
  }

  const toggle = (id: string, range: boolean) => {
    setBatch((prev) => {
      const next = new Set([...prev].filter((x) => visibleIds.has(x)));
      if (range && anchor) {
        const ids = api.visible.map((e) => e.item.id);
        const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) for (const x of ids.slice(a, b + 1)) next.add(x);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };

  const groups = useMemo(() => {
    const by = new Map<BoardSourceId, BoardEntry[]>();
    for (const e of api.visible) {
      const list = by.get(e.item.source) ?? [];
      list.push(e);
      by.set(e.item.source, list);
    }
    return SOURCE_ORDER.filter((id) => by.has(id)).map((id) => ({ id, entries: by.get(id)! }));
  }, [api.visible]);

  const inViewIds = api.query.src ? [api.query.src] : SOURCE_ORDER;
  const settling = inViewIds.some((id) => ["idle", "loading", "counted"].includes(api.states[id].kind));
  const absent = inViewIds.filter((id) => ["unavailable", "error"].includes(api.states[id].kind));

  return (
    <div className="flex flex-col gap-6">
      <SourceChips api={api} />

      {api.query.st === "rejected" ? (
        <RejectedLane api={api} entries={api.visible} />
      ) : (
        groups.map(({ id, entries }) => (
          <section key={id} aria-label={SOURCE_LABEL[id]} className="flex flex-col gap-2">
            <header className="flex flex-wrap items-center gap-3">
              <h2 className="font-instrument text-[1.6rem] text-[var(--al-white)]">{SOURCE_LABEL[id]}</h2>
              <span className="k-num font-jetbrains text-label text-[var(--al-vellum)]">{entries.length}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBatch((prev) => new Set([...prev, ...entries.map((e) => e.item.id)]))}
                aria-label={`Select every ${SOURCE_LABEL[id]} item`}
              >
                Select all
              </Button>
              {[...new Set(entries.map((e) => e.item.group))].map((g) => (
                <CommitLine key={g ?? "none"} api={api} source={id} group={g} />
              ))}
            </header>
            <div className="flex flex-wrap gap-2">
              {entries.map((e) => (
                <WallTile
                  key={e.item.id}
                  entry={e}
                  api={api}
                  ratio={ratios[e.item.id] ?? (leadMedia(e.item)?.kind === "text" ? TEXT_RATIO : 16 / 9)}
                  onRatio={(r) => setRatios((m) => (m[e.item.id] === r ? m : { ...m, [e.item.id]: r }))}
                  focused={e.item.id === api.selected?.item.id}
                  inBatch={batch.has(e.item.id)}
                  onToggle={(range) => toggle(e.item.id, range)}
                  onOpen={() => {
                    api.select(e.item.id);
                    props.openLoupe();
                  }}
                />
              ))}
              {/* Absorbs the last row's slack, so a short row is not stretched. */}
              <span aria-hidden="true" className="grow-[10]" />
            </div>
          </section>
        ))
      )}

      {settling && !api.visible.length && <Loading />}
      {absent.map((id) => (
        <SourceAbsence key={id} id={id} state={api.states[id]} api={api} />
      ))}

      {picked.length > 0 && (
        <div
          role="toolbar"
          aria-label="Batch"
          className="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-[3px] border border-[var(--al-line-strong)] bg-[var(--al-deep)] px-3 py-2 shadow-[var(--gt-shadow-float)]"
        >
          <span className="k-num font-jetbrains text-label text-[var(--al-white)]">{picked.length}</span>
          <Button variant="keep" size="sm" onClick={() => void decideBatch("approve")}>
            Approve
          </Button>
          <Button variant="reject" size="sm" onClick={() => void decideBatch("reject")}>
            Reject
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void decideBatch(null)}>
            Clear
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setBatch(new Set())} aria-label="Deselect the batch">
            ×
          </Button>
        </div>
      )}
    </div>
  );
}

function WallTile({
  entry,
  api,
  ratio,
  onRatio,
  focused,
  inBatch,
  onToggle,
  onOpen,
}: {
  entry: BoardEntry;
  api: BoardApi;
  ratio: number;
  onRatio: (r: number) => void;
  focused: boolean;
  inBatch: boolean;
  onToggle: (range: boolean) => void;
  onOpen: () => void;
}) {
  const { item } = entry;
  const lead = leadMedia(item);
  const pic = lead?.kind === "image" && lead.src ? lead.src : undefined;
  const tick = (
    <button
      type="button"
      role="checkbox"
      aria-checked={inBatch}
      aria-label={`Add ${item.title} to the batch`}
      onClick={(ev) => {
        ev.stopPropagation();
        onToggle(ev.shiftKey);
      }}
      className={`flex h-6 w-6 items-center justify-center rounded-[3px] border font-jetbrains text-label ${
        inBatch ? "border-[var(--al-gold)] bg-[var(--al-gold)] text-[var(--al-deep)]" : "border-[var(--al-vellum)] bg-[var(--al-deep)] text-transparent"
      }`}
    >
      ✓
    </button>
  );
  return (
    <div
      style={{ flexGrow: ratio, flexBasis: `${Math.round(ratio * ROW_H)}px`, maxWidth: `${Math.round(ratio * ROW_H * 1.6)}px` }}
      className={`relative ${inBatch ? "outline outline-2 outline-offset-2 outline-[var(--al-gold)]" : ""}`}
      onClick={(ev) => {
        if (ev.shiftKey) onToggle(true);
        else api.select(item.id);
      }}
      onDoubleClick={onOpen}
    >
      {pic ? (
        <>
          <Tile
            label={item.title}
            src={pic}
            alt={item.title}
            ratio={`${ratio}`}
            verdict={item.verdict === "approve" ? "keep" : item.verdict === "reject" ? "reject" : null}
            keepStamp="approved"
            focused={focused}
            actions={<VerdictControls entry={entry} api={api} variant="tile" />}
            onOpen={onOpen}
          />
          {/* The batch tick sits top-LEFT: the kit Tile's own top-right corner
              belongs to its verdict keys (k-tile__vb), which cover a flag. */}
          <span className="absolute top-2 left-2 z-10">{tick}</span>
          {/* The ratio probe: the Tile's own <img> is the kit's, so the
              natural size is read off a second, hidden decode of the same
              (cached) URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- size probe for the justified row */}
          <img
            src={pic}
            alt=""
            aria-hidden="true"
            className="hidden"
            onLoad={(ev) => {
              const im = ev.currentTarget;
              if (im.naturalWidth && im.naturalHeight) onRatio(Math.round((im.naturalWidth / im.naturalHeight) * 100) / 100);
            }}
          />
        </>
      ) : (
        <div
          role="group"
          aria-label={item.title}
          className={`flex h-full flex-col gap-2 rounded-[3px] border p-3 ${
            item.verdict === "approve"
              ? "border-[var(--al-ald)]"
              : item.verdict === "reject"
                ? "border-dashed border-[var(--al-ash)]"
                : focused
                  ? "border-[var(--al-gold)]"
                  : "border-[var(--al-line)]"
          }`}
          style={{ aspectRatio: `${ratio}` }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-hanken text-content text-[var(--al-white)]">{item.title}</span>
            {tick}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{lead && <Media media={lead} alt="" />}</div>
          <div className="flex flex-wrap items-center gap-2">
            <VerdictControls entry={entry} api={api} />
            <MachinePick item={item} />
          </div>
        </div>
      )}
    </div>
  );
}
