"use client";

// THE PROJECT'S OUTPUTS, for one project id. The read reruns whenever `enabled`
// turns on or the project changes, and what it returns is only ever the read
// that belongs to THIS project: moving from A to B answers null until B's read
// lands, never A's list.

import { useEffect, useState } from "react";

import type { ProjectOutputs } from "./projectOutputs";

// THE READER IS IMPORTED WHEN IT IS ASKED, not with the hook. StudioView calls
// this for the closed Outputs tally, so a static import put projectOutputs and
// everything it reads — the frames and score record defs, their output
// derivations and the sound store's client — into the studio shell's chunk,
// whichever step was open. The tally reads once after the project lands, so a
// dynamic import costs one chunk fetch at that moment and nothing on paint.
const loadReader = () => import("./projectOutputs").then((m) => m.readOutputs);

export function useProjectOutputs(projectId: string, enabled: boolean): ProjectOutputs | null {
  const [read, setRead] = useState<ProjectOutputs | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadReader()
      .then((readOutputs) => readOutputs(projectId))
      .then((r) => {
        if (live) setRead(r);
      })
      // A chunk that would not load leaves the tally unread — the same blank
      // the button draws before any read lands — rather than an unhandled
      // rejection. readOutputs itself never rejects; it reports per source.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId, enabled]);

  return read && read.projectId === projectId ? read : null;
}
