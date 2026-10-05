"use client";

// The pieces all three variants draw the same way: an item's media, its
// verdict keys, its reject reasons, the sealed machine pick, a source's state,
// the per-run commit line and the Rejected lane. A variant that needs a
// different SHAPE of one of these is a finding against this file, not a
// licence for a second spelling.

import Link from "next/link";

import { Button, Chip, Chips, Ghost, Hint, StatusGlyph, Tally, VerdictKeys, type KeyBinding } from "@/components/kit";
import { Keycaps } from "@/components/ui/signal";
import type { SourceState } from "@/lib/board/registry";
import { SOURCE_LABEL } from "@/lib/board/registry";
import type { BoardEntry } from "@/lib/board/source";
import type { BoardItem, BoardMedia, BoardSourceId, BoardVerdict } from "@/lib/board/types";

import type { BoardApi } from "./useBoard";

/* ── media ────────────────────────────────────────────────────────────────── */

export function Media({ media, alt, fit = "cover" }: { media: BoardMedia; alt: string; fit?: "cover" | "contain" }) {
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";
  if (media.kind === "image" && media.src)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam, or a data: proof
      <img src={media.src} alt={alt} loading="lazy" draggable={false} className={`block h-full w-full ${fitClass}`} />
    );
  if (media.kind === "video" && media.src) return <video src={media.src} controls muted className={`block h-full w-full ${fitClass}`} aria-label={alt} />;
  if (media.kind === "audio" && media.src) return <audio src={media.src} controls className="w-full" aria-label={alt} />;
  return <p className="font-hanken text-content leading-relaxed text-[var(--al-vellum)]">{media.text || "—"}</p>;
}

/** The first picture an item has, or its first words. */
export function leadMedia(item: BoardItem): BoardMedia | null {
  return item.media.find((m) => m.kind === "image" || m.kind === "video") ?? item.media[0] ?? null;
}

export function ItemThumb({ item, className = "" }: { item: BoardItem; className?: string }) {
  const lead = leadMedia(item);
  const pic = lead && (lead.kind === "image" || lead.kind === "video");
  return (
    <span className={`relative block overflow-hidden rounded-[3px] border border-[var(--al-line)] ${className}`} aria-hidden="true">
      {pic ? (
        <Media media={lead} alt="" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-instrument text-content text-[var(--al-vellum)]">
          {SOURCE_GLYPH[item.source]}
        </span>
      )}
    </span>
  );
}

/** A letter for the text-only sources' thumbnails — the source, not a decoration. */
const SOURCE_GLYPH: Record<BoardSourceId, string> = {
  cull: "C",
  extract: "E",
  dojo: "D",
  proof: "P",
  adoption: "A",
  alternative: "Alt",
  triage: "T",
  publish: "Pub",
};

/* ── verdict ──────────────────────────────────────────────────────────────── */

const toKit = (v: BoardVerdict) => (v === "approve" ? "keep" : v === "reject" ? "reject" : null);

export function VerdictControls({
  entry,
  api,
  variant = "card",
}: {
  entry: BoardEntry;
  api: BoardApi;
  variant?: "tile" | "card";
}) {
  const { item, refuse } = entry;
  const busy = api.busy.has(item.id);
  return (
    <span className="inline-flex items-center gap-2" aria-busy={busy}>
      <VerdictKeys
        variant={variant}
        value={toKit(item.verdict)}
        keepWord="Approve"
        keepKey="A"
        subject={item.title}
        clear={!refuse.clear}
        onVerdict={(v) => void api.decide(entry, v === "keep" ? "approve" : v === "reject" ? "reject" : null)}
      />
      {refuse.reject && (
        <Hint variant="lock" label="Why reject is refused">
          {refuse.reject}
        </Hint>
      )}
    </span>
  );
}

export function VerdictWord({ verdict }: { verdict: BoardVerdict }) {
  if (verdict === null) return <StatusGlyph kind="undecided" />;
  return <StatusGlyph kind={verdict === "approve" ? "keep" : "reject"} label={verdict === "approve" ? "approved" : "rejected"} />;
}

/** Two-axis reject, where a source has axes (dojo, cull). Pressing an axis on a
 *  rejected item re-decides it with that axis toggled; on an undecided item it
 *  rejects with that axis. */
export function ReasonChips({ entry, api }: { entry: BoardEntry; api: BoardApi }) {
  const axes = api.reasonAxes(entry.item.source);
  if (!axes.length || entry.refuse.reject) return null;
  const on = new Set(entry.item.verdict === "reject" ? entry.item.reasons : []);
  return (
    <span role="group" aria-label="Reject reasons" className="inline-flex flex-wrap items-center gap-1.5">
      {axes.map((axis) => {
        const pressed = on.has(axis);
        return (
          <button
            key={axis}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              const next = new Set(on);
              if (pressed) next.delete(axis);
              else next.add(axis);
              void api.decide(entry, "reject", [...next]);
            }}
            className={`rounded-[3px] border px-2 py-0.5 font-jetbrains text-label ${
              pressed ? "border-[var(--al-ant)] text-[var(--al-ant-t)]" : "border-[var(--al-line)] text-[var(--al-vellum)] hover:text-[var(--al-white)]"
            }`}
          >
            {axis}
          </button>
        );
      })}
    </span>
  );
}

/** The machine's own answer — SEALED until the human has decided, so the
 *  human verdict stays an independent measurement of the machine. */
export function MachinePick({ item }: { item: BoardItem }) {
  if (!item.machinePick) return null;
  if (item.verdict === null)
    return (
      <span className="k-chip" aria-label="Machine pick sealed until you decide">
        <StatusGlyph kind="lock" decorative /> machine
      </span>
    );
  return <Chip name="machine">{item.machinePick}</Chip>;
}

export function Facts({ entry }: { entry: BoardEntry }) {
  if (!entry.facts.length) return null;
  return (
    <Chips>
      {entry.facts.map((f) => (
        <Chip key={f.name} name={f.name} wrap>
          {f.value}
        </Chip>
      ))}
    </Chips>
  );
}

export function NativeLink({ entry }: { entry: BoardEntry }) {
  return (
    <Link href={entry.href} className="font-jetbrains text-label text-[var(--al-gold)] underline-offset-4 hover:underline">
      open ↗
    </Link>
  );
}

/* ── per-run commit line (foundry sources) ────────────────────────────────── */

export function CommitLine({ api, source, group }: { api: BoardApi; source: BoardSourceId; group: string | null }) {
  const on = api.commitsOn(source);
  if (!on || !group) return null;
  const s = api.states[source];
  if (s.kind !== "loaded") return null;
  const rows = s.entries.filter((e) => e.item.group === group);
  const decided = rows.filter((e) => e.item.verdict !== null).length;
  return (
    <span className="inline-flex items-center gap-2 font-jetbrains text-label text-[var(--al-vellum)]">
      <Tally value={decided} of={rows.length} label="decided" tone={decided === rows.length ? "emerald" : "neutral"} />
      <Link href={on.href} className="text-[var(--al-gold)] underline-offset-4 hover:underline">
        {on.label} ↗
      </Link>
    </span>
  );
}

/* ── a source's state ─────────────────────────────────────────────────────── */

export function SourceMark({ state }: { state: SourceState }) {
  switch (state.kind) {
    case "idle":
    case "loading":
      return <StatusGlyph kind="queued" label="loading" />;
    case "counted":
    case "loaded":
      return <StatusGlyph kind={(state.count.pending ?? 0) > 0 ? "gate" : "ready"} label={(state.count.pending ?? 0) > 0 ? "waiting on you" : "all decided"} />;
    case "empty":
      return <StatusGlyph kind="undecided" label="empty" />;
    case "unavailable":
      return <StatusGlyph kind="lock" label="unavailable" />;
    case "error":
      return <StatusGlyph kind="failed" label="failed" />;
  }
}

/** The one-line state of a source, in words of the work: a count, "empty", or
 *  the reason it could not be read. */
export function SourceMeta({ state }: { state: SourceState }) {
  switch (state.kind) {
    case "idle":
    case "loading":
      return <span className="k-muted">…</span>;
    case "counted":
    case "loaded": {
      const { pending, total } = state.count;
      return (
        <span className="k-num">
          {pending === null ? "—" : pending} / {total === null ? "—" : total}
        </span>
      );
    }
    case "empty":
      return <span>empty</span>;
    case "unavailable":
      return <span>unavailable · {state.reason}</span>;
    case "error":
      return <span>{state.message}</span>;
  }
}

/** What a source shows where its items would be when it has none to show. */
export function SourceAbsence({ id, state, api }: { id: BoardSourceId; state: SourceState; api: BoardApi }) {
  const native = api.nativeOf(id);
  if (state.kind === "unavailable" || state.kind === "error")
    return (
      <div className="k-errbox" role={state.kind === "error" ? "alert" : "status"}>
        <b>
          {SOURCE_LABEL[id]} · {state.kind === "error" ? state.message : state.reason}
        </b>
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => api.reload(id)}>
            Retry
          </Button>
          {native && (
            <Link href={native.href} className="font-jetbrains text-label text-[var(--al-gold)] underline-offset-4 hover:underline">
              {native.label} ↗
            </Link>
          )}
        </div>
      </div>
    );
  return <Ghost shape="row" count={2} label={`${SOURCE_LABEL[id]}: nothing waiting`} />;
}

/* ── the Rejected lane ────────────────────────────────────────────────────── */

/** Read-only: a rejected item is shown, not re-decided, here. Undo is offered
 *  for decisions made in this session — the stack is the session's — and a
 *  rejection from an earlier one is decided again on its native surface. */
export function RejectedLane({ api, entries }: { api: BoardApi; entries: BoardEntry[] }) {
  if (!entries.length) return <Ghost shape="row" count={1} label="nothing rejected" />;
  return (
    <ul className="flex flex-col gap-1" aria-label="Rejected">
      {entries.map((e) => (
        <li key={e.item.id} className="flex items-center gap-3 rounded-[3px] border border-[var(--al-line)] px-2 py-1.5">
          <ItemThumb item={e.item} className="h-10 w-16 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-hanken text-content text-[var(--al-white)]">{e.item.title}</span>
            <span className="block truncate font-jetbrains text-label text-[var(--al-vellum)]">
              {SOURCE_LABEL[e.item.source]}
              {e.item.group ? ` · ${e.item.group}` : ""}
              {e.item.reasons.length ? ` · ${e.item.reasons.join(", ")}` : ""}
            </span>
          </span>
          <MachinePick item={e.item} />
          {api.canUndo(e.item.id) ? (
            <Button variant="ghost" size="sm" onClick={() => void api.undoItem(e.item.id)} aria-label={`Undo the rejection of ${e.item.title}`}>
              Undo
            </Button>
          ) : (
            <NativeLink entry={e} />
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── the keymap ───────────────────────────────────────────────────────────── */

export const BOARD_KEYS: KeyBinding[] = [
  { keys: ["A"], does: "approve" },
  { keys: ["X"], does: "reject" },
  { keys: ["U"], does: "clear" },
  { keys: ["J", "K"], does: "next · previous" },
  { keys: ["Enter"], does: "loupe" },
  { keys: ["Esc"], does: "close" },
  { keys: ["Z"], does: "undo" },
];

export function BoardKeymap() {
  return <Keycaps map={BOARD_KEYS} label="Board keys" />;
}
