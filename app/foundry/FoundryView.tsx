"use client";

// /foundry — the plant: what each engine of the foundry is doing, and the
// Pipeline board.
//
// WHAT LEFT IN PHASE 3 (decision 10). This page used to own the forge cull's
// whole state - the run strip, the grid, the lightbox, the commit dialog - and
// hosted the Extract bench, the Dojo gate and the Strips triage as tabs beside
// it. All four were decision surfaces, and every decision is a kernel packet
// now: a Weir pile on the Floor, decided on the Board (/board/<packet>), and
// delivered back into v1's own stores by the apply outbox
// (lib/decision/v1/applier.ts). So the four are doors in the station row
// (./FoundrySubnav.tsx, ./plant.tsx DECIDED_ON) and their views are gone.
//
// What stays is what is not a decision: the plant overview (the station row's
// status dots, read by ./plant.tsx usePlant and the forge's run list) and the
// Pipeline canvas. The Styles shelf left in Phase 5 (wave B, L54): a style is
// one record with its look, worked in the Library's style atelier, and its
// station is a door there (./plant.tsx DECIDED_ON). v1's shelf adopted a proven
// style into a SECOND record (an IndexedDB theme); the atelier adopts in place. The forge's runs are still polled -
// only for the cull station's dot ("1 to cull", "rendering") - and through
// `usePolling`, which pauses while the tab is hidden.
//
// THE STATION IS REMEMBERED (lib/useRemembered.ts). A value from an older build
// that named a retired tab ("cull", "dojo", "styles") reads as the Pipeline.

import { useCallback, useEffect, useState } from "react";

import dynamic from "next/dynamic";

import { pendingPanel } from "@/components/ui/Pending";
import StudioFrame from "@/components/ui/StudioFrame";
import type { RunSummary } from "@/lib/foundry/types";
import { usePolling } from "@/lib/usePolling";
import { useRemembered } from "@/lib/useRemembered";

import FoundrySubnav from "./FoundrySubnav";
import { fetchRuns } from "./foundryClient";
import { LIVE } from "./parts";
import { MEDIA, type MediaId } from "./pipeline/media";
import { engineLines, usePlant, type Tab } from "./plant";

// The pipeline board is the heaviest graph here; it loads when its tab opens.
const PipelineTab = dynamic(() => import("./PipelineTab"), { loading: pendingPanel });

/** Every tab, exhaustive by construction: the next member of `Tab` fails to compile here. */
const TAB_SET: Record<Tab, true> = { pipeline: true };
const TABS = Object.keys(TAB_SET) as readonly Tab[];

export default function FoundryView() {
  const [tab, setTab] = useRemembered<Tab>("foundry.tab", "pipeline", TABS);
  const [media, setMedia] = useState<MediaId>("articles");
  const plant = usePlant();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);

  const loadRuns = useCallback(
    () =>
      fetchRuns().then(
        (r) => {
          setRuns(r);
          setRunsError(null);
        },
        (e: unknown) => setRunsError(e instanceof Error ? e.message : "failed"),
      ),
    [],
  );
  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);
  // A live forge run rewrites its manifest after every candidate: its dot follows it.
  usePolling(loadRuns, 4000, (runs ?? []).some((r) => LIVE.includes(r.status)));

  return (
    <StudioFrame>
      {/* tabIndex={-1}: the landmark a closing dialog hands focus to when the
          control it was opened from did not survive it (components/ui/Modal.tsx). */}
      <main tabIndex={-1} className="pb-12">
        <h1 className="sr-only">Foundry</h1>
        <header className="pt-2">
          <FoundrySubnav tab={tab} onSelect={setTab} lines={engineLines(runs, plant)} media={tab === "pipeline" ? { value: media, options: MEDIA, onChange: setMedia } : undefined} />
          {runsError !== null && (
            <p role="status" className="font-jetbrains mt-2 text-label text-rose-300">
              forge runs · {runsError}
            </p>
          )}
        </header>
        <section role="tabpanel" aria-label={tab} className="mt-4">
          <PipelineTab media={media} />
        </section>
      </main>
    </StudioFrame>
  );
}
