"use client";

// /board — every human gate in the app, decided in one vocabulary.
//
// Three directional prototypes behind `?v=` (components/ui/VariantSwitch.tsx),
// one state (./useBoard.ts), one keymap (lib/board/keys.ts), one loupe:
//   1 Inbox        source rail · queue · detail
//   2 Light table  one item, large, a filmstrip under it, keyboard-first
//   3 Wall         a justified media wall grouped by source, batch decide
//
// Drawn in the Obsidian palette through the kit, the way /foundry is
// (app/foundry/FoundryView.tsx: StudioFrame's own header, a kit body under
// `WorldRoot world="obsidian"`).

import { useState } from "react";

import { Button, PageHead, TabRail, Tally, ToastTray, WorldRoot } from "@/components/kit";
import { useVariant, VariantSwitch } from "@/components/ui/VariantSwitch";
import { SOURCE_ORDER } from "@/lib/board/source";
import type { BoardFilter } from "@/lib/board/url";

import InboxVariant from "./InboxVariant";
import LightTableVariant from "./LightTableVariant";
import { Loupe } from "./Loupe";
import { BoardKeymap } from "./parts";
import type { VariantProps } from "./shared";
import { useBoard, type BoardApi } from "./useBoard";
import WallVariant from "./WallVariant";

export default function BoardView() {
  const api = useBoard();
  const [v] = useVariant();
  const [loupe, setLoupe] = useState(false);

  const totalPending = SOURCE_ORDER.reduce((s, id) => s + (api.countsOf(id)?.pending ?? 0), 0);
  const props: VariantProps = { api, openLoupe: () => setLoupe(true), loupeOpen: loupe, closeLoupe: () => setLoupe(false) };

  return (
    <WorldRoot world="obsidian">
      <main tabIndex={-1} className="pb-24">
        <PageHead eyebrow="Decisions" title="Board" figure={<Tally value={totalPending} label="pending" tone={totalPending ? "amber" : "neutral"} />} />
        <FilterRail api={api} />
        <section className="pt-5">
          {v === 1 ? <InboxVariant {...props} /> : v === 2 ? <LightTableVariant {...props} /> : <WallVariant {...props} />}
        </section>
      </main>
      {loupe && <Loupe api={api} entry={api.selected} onClose={() => setLoupe(false)} />}
      <ToastTray toasts={api.toasts.toasts} onDismiss={api.toasts.dismiss} />
      <VariantSwitch labels={["Inbox", "Light table", "Wall"]} />
    </WorldRoot>
  );
}

/** Pending · decided · rejected, counted over the sources in view. */
function FilterRail({ api }: { api: BoardApi }) {
  const n = (st: BoardFilter) =>
    api.inView.filter((e) => (st === "pending" ? e.item.verdict === null : st === "rejected" ? e.item.verdict === "reject" : e.item.verdict !== null)).length;
  return (
    <TabRail
      label="Board filter"
      active={api.query.st}
      onSelect={(st) => api.setQuery({ st, i: null })}
      tabs={[
        { id: "pending", label: "Pending", tally: { value: n("pending"), tone: "amber" } },
        { id: "decided", label: "Decided", tally: { value: n("decided") } },
        { id: "rejected", label: "Rejected", tally: { value: n("rejected"), tone: "rose" } },
      ]}
      trailing={
        <span className="flex items-center gap-3">
          <Button variant="ghost" size="sm" disabled={!api.undoDepth} onClick={() => void api.undo()} aria-label="Undo the last decision (Z)">
            Undo{api.undoDepth ? ` · ${api.undoDepth}` : ""}
          </Button>
          <BoardKeymap />
        </span>
      }
    />
  );
}
