"use client";

// THE PROJECT'S OUTPUTS, for one project id. The read reruns whenever `enabled`
// turns on or the project changes, and what it returns is only ever the read
// that belongs to THIS project: moving from A to B answers null until B's read
// lands, never A's list.

import { useEffect, useState } from "react";

import { readOutputs, type ProjectOutputs } from "./projectOutputs";

export function useProjectOutputs(projectId: string, enabled: boolean): ProjectOutputs | null {
  const [read, setRead] = useState<ProjectOutputs | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void readOutputs(projectId).then((r) => {
      if (live) setRead(r);
    });
    return () => {
      live = false;
    };
  }, [projectId, enabled]);

  return read && read.projectId === projectId ? read : null;
}
