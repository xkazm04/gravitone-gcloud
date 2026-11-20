"use client";

// THE INBOX - what waits on the operator, studio-wide: one weir per blocking kind (tables.ts BLOCK). A count that
// moved drops in again; the audio weirs turn cyan while a reel's road is running. A weir opens the surface that
// clears it (the winner's chrome.js Inbox + WS.openBlock).

import { useState } from "react";

import { BLOCK, BLOCK_KINDS, type BlockKind } from "../tables.ts";
import { useCanvas } from "../useCanvas.ts";
import { cx, kit, Weir } from "./kit.tsx";
import t from "./toolbar.module.css";

export function Inbox() {
  const st = useCanvas();
  const total = st.scene.total;
  const busy = st.scene.reels.some((it) => (it.audio?.run ?? null) !== null);
  // The counts last drawn, and the kinds whose count moved since (they drop in again).
  const now = BLOCK_KINDS.map((k) => total[k]).join("|");
  const [seen, setSeen] = useState<{ readonly at: string; readonly fall: readonly BlockKind[] }>({ at: now, fall: [] });
  if (seen.at !== now) {
    const was = seen.at.split("|").map(Number);
    setSeen({ at: now, fall: BLOCK_KINDS.filter((k, i) => was[i] !== total[k]) });
  }

  const open = (k: BlockKind): void => {
    if (total[k] === 0) return st.say(`0 ${BLOCK[k].name.toLowerCase()}`);
    if (BLOCK[k].tool === "gallery") st.openSurface({ kind: "gallery", scope: { type: "all" }, block: k, focus: null });
    else st.openSurface({ kind: "audio", scope: { type: "all" } });
  };

  return (
    <div data-role="inbox" className={t.inbox} role="group" aria-label="Waiting on you">
      {BLOCK_KINDS.map((k) => {
        const n = total[k];
        const isBusy = busy && (k === "audio" || k === "slot") && n > 0;
        return (
          <Weir
            key={`${k}:${n}`}
            kind={k}
            n={n}
            className={cx(kit.pill, n === 0 && kit.zero, isBusy && kit.busy, seen.fall.includes(k) && kit.fall)}
            onClick={() => open(k)}
          />
        );
      })}
    </div>
  );
}
