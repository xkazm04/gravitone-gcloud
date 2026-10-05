"use client";

// V2 · LIGHT TABLE — one item at a time, as large as the screen allows, with
// the queue as a filmstrip under it. Built for the hand on the keys: A / X /
// U decide and the strip advances, J / K walk it, Enter puts the item in the
// loupe. The Rejected lane folds away under the strip.

import { useEffect } from "react";

import { Ghost, Loading } from "@/components/kit";
import { SOURCE_LABEL } from "@/lib/board/registry";
import { SOURCE_ORDER } from "@/lib/board/source";

import {
  BoardKeymap,
  CommitLine,
  Facts,
  ItemThumb,
  MachinePick,
  Media,
  NativeLink,
  ReasonChips,
  RejectedLane,
  SourceAbsence,
  VerdictControls,
  VerdictWord,
} from "./parts";
import { defaultHandlers, SourceChips, type VariantProps } from "./shared";
import { useBoardKeys } from "./useBoardKeys";

const STRIP = 40;

export default function LightTableVariant(props: VariantProps) {
  const { api } = props;
  useBoardKeys(defaultHandlers(props));
  const sel = api.selected;
  const at = sel ? api.visible.findIndex((e) => e.item.id === sel.item.id) : -1;
  // The strip is a window around the current item, not the whole queue: a
  // thousand thumbnails is a thousand decoded pictures for one decision.
  const from = Math.max(0, Math.min(at - STRIP / 2, api.visible.length - STRIP));
  const strip = api.visible.slice(from, from + STRIP);

  useEffect(() => {
    if (!sel) return;
    document.getElementById(`lt-${sel.item.id}`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [sel]);

  const inViewIds = api.query.src ? [api.query.src] : SOURCE_ORDER;
  const settling = inViewIds.some((id) => ["idle", "loading", "counted"].includes(api.states[id].kind));
  const absent = inViewIds.filter((id) => ["unavailable", "error"].includes(api.states[id].kind));

  if (api.query.st === "rejected")
    return (
      <div className="flex flex-col gap-4">
        <SourceChips api={api} />
        <RejectedLane api={api} entries={api.visible} />
      </div>
    );

  const pictures = sel ? sel.item.media.filter((m) => m.kind !== "text") : [];
  const words = sel ? sel.item.media.filter((m) => m.kind === "text") : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SourceChips api={api} />
        <span className="font-jetbrains text-label text-[var(--al-vellum)] k-num">
          {at >= 0 ? at + 1 : 0} / {api.visible.length}
        </span>
      </div>

      {sel ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div
            className={`grid min-h-[58vh] gap-3 rounded-[3px] border border-[var(--al-line)] p-3 ${pictures.length > 1 ? "md:grid-cols-2" : ""}`}
            onDoubleClick={props.openLoupe}
          >
            {pictures.length ? (
              pictures.map((m, i) => (
                <div key={i} className="h-[58vh] overflow-hidden">
                  <Media media={m} alt={`${sel.item.title}, ${i + 1} of ${pictures.length}`} fit="contain" />
                </div>
              ))
            ) : (
              <div className="flex items-center p-6">
                <div className="max-w-[60ch]">
                  {words.map((m, i) => (
                    <Media key={i} media={m} alt="" />
                  ))}
                </div>
              </div>
            )}
          </div>
          <aside className="flex flex-col gap-4" aria-label="Decision">
            <div>
              <p className="font-jetbrains text-label uppercase tracking-[0.14em] text-[var(--al-vellum)]">
                {SOURCE_LABEL[sel.item.source]}
                {sel.item.group ? ` · ${sel.item.group}` : ""}
              </p>
              <h2 className="font-instrument text-[2rem] leading-tight text-[var(--al-white)]">{sel.item.title}</h2>
            </div>
            <div className="flex items-center gap-3">
              <VerdictControls entry={sel} api={api} />
              <BoardKeymap />
            </div>
            <ReasonChips entry={sel} api={api} />
            <span className="self-start">
              <MachinePick item={sel.item} />
            </span>
            {pictures.length > 0 && words.map((m, i) => <Media key={i} media={m} alt="" />)}
            <Facts entry={sel} />
            <div className="flex flex-wrap items-center gap-3">
              <CommitLine api={api} source={sel.item.source} group={sel.item.group} />
              <NativeLink entry={sel} />
            </div>
          </aside>
        </div>
      ) : settling ? (
        <Loading />
      ) : (
        <Ghost shape="card" count={1} label="nothing waiting here" />
      )}

      {strip.length > 0 && (
        <ol aria-label="Queue" className="flex gap-2 overflow-x-auto pb-2">
          {strip.map((e) => {
            const on = e.item.id === sel?.item.id;
            return (
              <li key={e.item.id} id={`lt-${e.item.id}`} className="shrink-0">
                <button
                  type="button"
                  aria-current={on ? "true" : undefined}
                  aria-label={e.item.title}
                  onClick={() => api.select(e.item.id)}
                  className={`relative block rounded-[3px] border-2 ${on ? "border-[var(--al-gold)]" : "border-transparent"}`}
                >
                  <ItemThumb item={e.item} className="h-16 w-28" />
                  <span className="absolute right-1 bottom-1">
                    <VerdictWord verdict={e.item.verdict} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {absent.map((id) => (
        <SourceAbsence key={id} id={id} state={api.states[id]} api={api} />
      ))}

      <details className="rounded-[3px] border border-[var(--al-line)] p-3">
        <summary className="cursor-pointer font-jetbrains text-label uppercase tracking-[0.14em] text-[var(--al-vellum)]">
          Rejected · <span className="k-num">{api.rejected.length}</span>
        </summary>
        <div className="mt-3">
          <RejectedLane api={api} entries={api.rejected} />
        </div>
      </details>
    </div>
  );
}
