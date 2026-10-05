"use client";

// THE LOUPE — one item, full size, decided where it is seen. Enter opens it
// from any variant, Esc closes it, and the decision keys KEEP WORKING inside it:
// the kit Sheet is an aria-modal dialog, which the Board's key guard treats as
// an overlay that owns the keyboard, so the body carries the loupe mark
// (lib/board/keys.ts LOUPE_MARK) that exempts this one dialog — the same
// exemption StatReel's `.bd-lb` lightbox has (apps/studio/src/board/keys.ts).

import { Sheet } from "@/components/kit";
import { LOUPE_MARK } from "@/lib/board/keys";
import { SOURCE_LABEL } from "@/lib/board/registry";
import type { BoardEntry } from "@/lib/board/source";

import { CommitLine, Facts, MachinePick, Media, NativeLink, ReasonChips, VerdictControls } from "./parts";
import type { BoardApi } from "./useBoard";

export function Loupe({ api, entry, onClose }: { api: BoardApi; entry: BoardEntry | null; onClose: () => void }) {
  if (!entry) return null;
  const { item } = entry;
  const at = api.visible.findIndex((e) => e.item.id === item.id);
  const pictures = item.media.filter((m) => m.kind !== "text");
  const words = item.media.filter((m) => m.kind === "text");
  return (
    <Sheet
      open
      onClose={onClose}
      title={item.title}
      eyebrow={
        <span className="k-eb k-caps">
          {SOURCE_LABEL[item.source]}
          {item.group ? ` · ${item.group}` : ""}
        </span>
      }
      onPrev={at > 0 ? () => api.move(-1) : undefined}
      onNext={at >= 0 && at < api.visible.length - 1 ? () => api.move(1) : undefined}
      footer={
        <div data-world="obsidian" className="flex flex-wrap items-center gap-3">
          <ReasonChips entry={entry} api={api} />
          <MachinePick item={item} />
          <CommitLine api={api} source={item.source} group={item.group} />
          <NativeLink entry={entry} />
        </div>
      }
    >
      {/* The verdict keys live in the BODY, not the Sheet's `actions`: in the
          Obsidian world components/ui/Modal.tsx draws no actions slot. And the
          portal leaves the route's data-world subtree, so the body re-declares
          it for the --al-* vars the kit parts read. */}
      <div {...{ [LOUPE_MARK]: "" }} data-world="obsidian" className="flex flex-col gap-4">
        <VerdictControls entry={entry} api={api} />
        {pictures.length > 0 && (
          <div className={`grid gap-3 ${pictures.length > 1 ? "md:grid-cols-2" : ""}`}>
            {pictures.map((m, i) => (
              <div key={i} className="h-[52vh] overflow-hidden rounded-[3px] border border-[var(--al-line)]">
                <Media media={m} alt={`${item.title}, ${i + 1} of ${pictures.length}`} fit="contain" />
              </div>
            ))}
          </div>
        )}
        {words.map((m, i) => (
          <Media key={`t${i}`} media={m} alt="" />
        ))}
        <Facts entry={entry} />
      </div>
    </Sheet>
  );
}
