"use client";

// THE SOUND LAB (/playground) — three modules over one file-backed sound store
// (foundry-out/sound/, behind /api/sound/*; lib/sound/client.ts), each with its
// own job (round 4, platform-consolidation, 2026-10-05; the operator's words
// are in .vault/Spark/briefs/platform-consolidation/30-r4-sound-lab.md):
//
//   triage   ./triage   judge everything generated — mostly by agents through
//                       pipeline/sound.mts — and learn from it: which prompt
//                       techniques, genres and instruments each provider is
//                       good at. Lessons go to the ledger and knowledge/audio.
//   arrange  ./arrange  kept takes on a board: stages across, groups down;
//                       finalized takes carry the label agents select by.
//   hunt     ./hunt     one idea drafted into a map of variants, rendered,
//                       auditioned, the winner kept with a lesson.
//
// Round 3 shipped these as three competing prototypes behind a VariantSwitch;
// the operator kept all three as modules, so the switch became this rail. The
// shell owns only the rail, the kind and three tallies; each module owns
// everything below the rail (app/playground/shared/README.md is the contract
// the modules share).
//
// Music first; SFX is the same three jobs with shorter takes, a loop flag and
// its own rubric, so the kind is one switch at the top rather than a module.

import { useCallback, useMemo, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useLoadFor } from "@/app/_phases/_shared/useLoadFor";
import { TabRail, type TabDef } from "@/components/ui/signal";
import { listHunts, listTakes } from "@/lib/sound/client";
import type { SoundKind } from "@/lib/sound/types";

// Explicit `/index`: on a case-insensitive disk `./hunt` resolved to the
// round-3 `./Hunt.tsx` while that file existed (TS1261, 2026-10-05) — and a
// file named like a module directory can come back.
import ArrangeModule from "./arrange/index";
import HuntModule from "./hunt/index";
import { FlashLine, SoundLabContext, useFlash, type SoundLabShell } from "./shared/shell";
import TriageModule from "./triage/index";

type ModuleId = "triage" | "arrange" | "hunt";
const MODULES: readonly ModuleId[] = ["triage", "arrange", "hunt"];
const KINDS: readonly SoundKind[] = ["music", "sfx"];

interface Tallies {
  /** The kind these counts were read for; null before any read lands. */
  kind: SoundKind | null;
  unjudged: number | null;
  finalized: number | null;
  hunts: number | null;
}

/** The three numbers the rail carries. A count the store could not answer is
 *  null and its tally is not drawn — never a 0 standing in for "unknown". */
async function readTallies(kind: SoundKind): Promise<Tallies> {
  const [u, f, h] = await Promise.all([
    listTakes({ kind, verdict: "unjudged" }),
    listTakes({ kind, stage: "finalized" }),
    listHunts(kind),
  ]);
  return {
    kind,
    unjudged: u.ok ? u.data.takes.length : null,
    finalized: f.ok ? f.data.takes.length : null,
    hunts: h.ok ? h.data.hunts.length : null,
  };
}

export default function PlaygroundView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawM = params.get("m") as ModuleId | null;
  const active: ModuleId = rawM && MODULES.includes(rawM) ? rawM : "triage";
  const kind: SoundKind = params.get("kind") === "sfx" ? "sfx" : "music";

  const setParam = useCallback(
    (key: "m" | "kind", value: string, dflt: string) => {
      const p = new URLSearchParams(params.toString());
      if (value === dflt) p.delete(key);
      else p.set(key, value);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [version, setVersion] = useState(0);
  const [tallies, setTallies] = useState<Tallies>({ kind: null, unjudged: null, finalized: null, hunts: null });
  useLoadFor(`${kind}:${version}`, () => readTallies(kind), setTallies);
  // useLoadFor applies on resolve only, so after a kind switch `tallies` still
  // holds the previous kind's counts. They are drawn only for the kind they
  // were read for; a same-kind refresh (version++) keeps its numbers, no blink.
  const here: Tallies =
    tallies.kind === kind ? tallies : { kind: null, unjudged: null, finalized: null, hunts: null };

  const [flash, say] = useFlash();
  const shell: SoundLabShell = useMemo(
    () => ({ kind, version, refresh: () => setVersion((v) => v + 1), say }),
    [kind, version, say],
  );

  const tabs: TabDef<ModuleId>[] = [
    {
      id: "triage",
      label: "Triage",
      panelId: "sound-lab-panel",
      testId: "lab-triage",
      ...(here.unjudged == null
        ? {}
        : { tally: { value: here.unjudged, label: "to judge", tone: here.unjudged ? ("amber" as const) : ("neutral" as const) } }),
    },
    {
      id: "arrange",
      label: "Arrange",
      panelId: "sound-lab-panel",
      testId: "lab-arrange",
      ...(here.finalized == null
        ? {}
        : { tally: { value: here.finalized, label: "final", tone: here.finalized ? ("emerald" as const) : ("neutral" as const) } }),
    },
    {
      id: "hunt",
      label: "Hunt",
      panelId: "sound-lab-panel",
      testId: "lab-hunt",
      ...(here.hunts == null ? {} : { tally: { value: here.hunts, label: "hunts", tone: "neutral" as const } }),
    },
  ];

  return (
    <SoundLabContext.Provider value={shell}>
      <main tabIndex={-1} className="pb-24 pt-6">
        <h1 className="sr-only">Sound lab</h1>
        <TabRail
          label="sound lab modules"
          tabs={tabs}
          active={active}
          onSelect={(id) => setParam("m", id, "triage")}
          trailing={<KindSwitch kind={kind} onKind={(k) => setParam("kind", k, "music")} />}
        />
        <div id="sound-lab-panel" role="tabpanel" aria-label={active} className="mt-5">
          {active === "triage" ? (
            <TriageModule key={kind} kind={kind} />
          ) : active === "arrange" ? (
            <ArrangeModule key={kind} kind={kind} />
          ) : (
            <HuntModule key={kind} kind={kind} />
          )}
        </div>
        <FlashLine flash={flash} />
      </main>
    </SoundLabContext.Provider>
  );
}

/** music | sfx — a segmented pair, not a tab: it filters every module rather
 *  than choosing one, so it sits in the rail's `trailing` slot. */
function KindSwitch({ kind, onKind }: { kind: SoundKind; onKind: (k: SoundKind) => void }) {
  return (
    <div role="radiogroup" aria-label="sound kind" className="ml-auto inline-flex rounded-full border border-white/10 bg-white/[0.03] p-0.5">
      {KINDS.map((k) => {
        const on = k === kind;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            data-testid={`kind-${k}`}
            onClick={() => onKind(k)}
            className={`cursor-pointer rounded-full px-4 py-1 font-jetbrains text-label transition ${
              on ? "bg-cyan-400/15 text-cyan-100 shadow-[0_0_12px] shadow-cyan-400/15" : "text-white/50 hover:text-white/80"
            }`}
          >
            {k === "music" ? "music" : "sfx"}
          </button>
        );
      })}
    </div>
  );
}
