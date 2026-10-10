"use client";

// THE ITEM'S OWN FACTS, media and href — the content, and the modal that mounts
// it. ONE component for the content on purpose: until round 1 it had two mounts,
// this modal and a docked pane beside the board, which was the whole bet of the
// Workbench direction. That direction lost and its pane went with it; the split
// between the content and its mount is kept because it costs nothing and it is
// what made the bet testable in the first place.

import { ExternalLink } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Tally } from "@/components/ui/signal";
import type { PipelineEntry } from "@/lib/board/pipeline";

import { dwell } from "../dwell";
import { STAGE_TONE } from "../../pipeline";
import { Art, Glass, Label } from "../../ui";

function Media({ media, title }: { media: PipelineEntry["item"]["media"]; title: string }) {
  if (media.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {media.map((m, i) => {
        const key = `${m.kind}-${m.src ?? i}`;
        if (m.kind === "image") return <Art key={key} src={m.src} alt={title} fit="contain" className="aspect-video" />;
        // A generated take has no caption track; the heading above it is its
        // name, which is what `aria-label` carries here.
        //
        // NO `video` BRANCH. Neither v1 lane emits one — Articles emits `image`
        // and `text`, Audio emits `audio` and `text` — and the Image/Video lanes
        // are deferred by the operator's own scoping. A branch for a media kind
        // nothing produces cannot be exercised, so it is a guess about a lane
        // that has not been designed yet; the one that eventually needs it will
        // add it against a real card. The raw <audio> below is the reviewed
        // exception the kit census ratchets: `components/kit/Player` is a
        // CONTROLLED part that owns no element by design, so a surface that
        // actually plays something holds the element itself (app/board/parts.tsx
        // carries four such, accepted the same way).
        if (m.kind === "audio") return <audio key={key} src={m.src} controls preload="none" aria-label={title} className="w-full" />;
        return (
          <Glass key={key} className="p-3.5">
            <pre className="font-jetbrains text-label leading-7 whitespace-pre-wrap text-white/80">{m.text}</pre>
          </Glass>
        );
      })}
    </div>
  );
}

/**
 * The item's own facts, verbatim, with its media and the surface it is decided
 * on. One component, two mounts — the modal and the docked pane — so a variant
 * that bets on the pane is betting on the LAYOUT and not on different content.
 */
export function ItemDetail({ entry, stageWord, actions }: { entry: PipelineEntry; stageWord: string; actions?: React.ReactNode }) {
  const { item, facts, href } = entry;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-jetbrains rounded-full border px-2.5 py-0.5 text-label ${STAGE_TONE[entry.placement.stage].card} ${STAGE_TONE[entry.placement.stage].head}`}>{stageWord}</span>
        {entry.placement.band && (
          <span className="font-jetbrains rounded-full border border-white/12 px-2.5 py-0.5 text-label text-white/60">{entry.placement.band}</span>
        )}
        <span className="font-jetbrains rounded-full border border-white/12 px-2.5 py-0.5 text-label text-white/60">{item.lane}</span>
        {item.verdict && (
          <span className={`font-jetbrains rounded-full border px-2.5 py-0.5 text-label ${item.verdict === "reject" ? "border-rose-400/35 text-rose-200" : "border-emerald-400/35 text-emerald-200"}`}>
            {item.verdict}
          </span>
        )}
        {item.reasons.length > 0 && <Tally label="reasons" value={item.reasons.length} tone="rose" />}
      </div>

      <Media media={item.media} title={item.title} />

      {/* THE FACTS, and `standing` is here because round 1 took it off the card.
          The ledger's card carried vendor / state / dwell under its title and the
          operator's verdict was that those four facts were costing the title its
          readability. Three of them were already in this list or in the chips
          above; how long it has stood was not, and a figure removed from one
          surface and added to none is a figure deleted. */}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.name} className="min-w-0">
            <dt>
              <Label>{f.name}</Label>
            </dt>
            <dd className="font-jetbrains mt-0.5 text-label break-words text-white/85">{f.value}</dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt>
            <Label>standing</Label>
          </dt>
          <dd className="font-jetbrains mt-0.5 text-label text-white/85">
            {dwell(item.createdAt) || "—"} <span className="text-white/45">· {item.createdAt}</span>
          </dd>
        </div>
      </dl>

      {item.machinePick && (
        <div>
          <Label>machine pick</Label>
          <p className="font-jetbrains mt-0.5 text-label text-white/75">{item.machinePick}</p>
        </div>
      )}

      {item.reasons.length > 0 && (
        <div>
          <Label>reasons</Label>
          <p className="font-jetbrains mt-0.5 text-label text-white/75">{item.reasons.join(" · ")}</p>
        </div>
      )}

      {item.note && (
        <Glass className="p-3.5">
          <Label>note</Label>
          <p className="font-hanken mt-1 text-content leading-relaxed text-white/80">{item.note}</p>
        </Glass>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={href}
          className="font-jetbrains inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-label text-white/85 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          Open
        </a>
        {actions}
      </div>
    </div>
  );
}

export function DetailModal({
  entry,
  stageWord,
  actions,
  onClose,
}: {
  entry: PipelineEntry | null;
  stageWord: string;
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal open={Boolean(entry)} onClose={onClose} title={entry?.item.title ?? ""} eyebrow={<Label>{entry?.item.source ?? ""}</Label>} className="max-w-2xl">
      {entry && <ItemDetail entry={entry} stageWord={stageWord} actions={actions} />}
    </Modal>
  );
}
