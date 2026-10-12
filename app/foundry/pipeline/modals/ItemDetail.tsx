"use client";

// THE ITEM'S OWN FACTS, media and href — the content, and the modal that mounts
// it. ONE component for the content on purpose: until round 1 it had two mounts,
// this modal and a docked pane beside the board, which was the whole bet of the
// Workbench direction. That direction lost and its pane went with it; the split
// between the content and its mount is kept because it costs nothing and it is
// what made the bet testable in the first place.

import { useEffect, useState } from "react";

import { Check, Copy, ExternalLink } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Tally } from "@/components/ui/signal";
import type { PipelineEntry } from "@/lib/board/pipeline";

import { dwell } from "../dwell";
import { STAGE_TONE } from "../../pipeline";
import { Art, Glass, Label } from "../../ui";

function Media({ media, title }: { media: PipelineEntry["item"]["media"]; title: string }) {
  if (media.length === 0) return null;
  // A video's still is its POSTER, not a second picture under it: the first
  // image rides on the <video> and is not drawn again.
  const video = media.some((m) => m.kind === "video" && m.src);
  const poster = video ? media.find((m) => m.kind === "image" && m.src)?.src : undefined;
  return (
    <div className="flex flex-col gap-3">
      {media.map((m, i) => {
        const key = `${m.kind}-${m.src ?? i}`;
        if (m.kind === "image") return m.src && m.src === poster ? null : <Art key={key} src={m.src} alt={title} fit="contain" className="aspect-video" />;
        // A generated take has no caption track; the heading above it is its
        // name, which is what `aria-label` carries here.
        //
        // THE `video` BRANCH, and why it is here now. It was left out on the
        // ground that no lane emitted one - a branch for a media kind nothing
        // produces cannot be exercised. Audio's Settled column now does: a
        // music-video job's render (lib/board/sources/audio.ts `mvItem`), the
        // real card this was waiting for. `preload="metadata"` reads the length
        // and the first frame's size and no more; the poster is the still, so
        // nothing streams until Play. A visualizer has no words to caption.
        //
        // The raw <audio> and <video> are the reviewed exception the kit census
        // ratchets: `components/kit/Player` is a CONTROLLED part that owns no
        // element by design, so a surface that actually plays something holds
        // the element itself (app/board/parts.tsx carries four such, accepted
        // the same way).
        if (m.kind === "video" && m.src)
          return <video key={key} src={m.src} poster={poster} controls preload="metadata" aria-label={title} className="aspect-video w-full rounded-xl bg-black" data-testid="pipeline-detail-video" />;
        if (m.kind === "video") return null;
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

/** LONG TEXT HANDED ON WHOLE (`PipelineEntry.texts`): a label, the text as it
 *  will be pasted, and a copy button named for what it copies. The check mark
 *  is the copy's answer; a clipboard the browser refuses says so in place. */
function TextBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState<"yes" | "refused" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  const copy = () => {
    // No clipboard at all (an insecure origin) is a refusal too.
    if (!navigator.clipboard) return setCopied("refused");
    navigator.clipboard.writeText(value).then(
      () => setCopied("yes"),
      () => setCopied("refused"),
    );
  };
  return (
    <Glass className="p-3.5">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="font-jetbrains inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-2.5 text-label text-white/75 transition hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {copied === "yes" ? <Check aria-hidden className="h-3.5 w-3.5 text-emerald-300" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          {copied === "refused" ? "clipboard refused" : copied === "yes" ? "copied" : "copy"}
        </button>
      </div>
      <pre className="font-jetbrains mt-2 max-h-64 overflow-auto text-label leading-7 whitespace-pre-wrap text-white/85">{value}</pre>
    </Glass>
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

      {entry.texts?.map((t) => <TextBlock key={t.label} label={t.label} value={t.value} />)}

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
