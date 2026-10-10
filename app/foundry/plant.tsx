"use client";

// THE PLANT'S STATE — what each engine of the foundry is doing, read once, and
// drawn in place of the page title as the plant itself.
//
// /foundry used to open on a 90px serif "Foundry" and the Fornax constellation
// — a decorative figure whose four stars were the four tabs — and then a flat
// tab row. StudioFrame's nav already names the place; what the top of a plant's
// page owes the reader is the plant: which engine is running, which one is
// waiting on a human, what each last produced. So the header IS the navigation
// and it carries that state, as a flow — Extract → Styles → Forge · Cull — with
// the Dojo loop beside it, each station a glass card carrying its counts and
// its latest output. (Round 2 drew it three ways; the operator picked this one
// and round 3 deleted the control-room bar and the gallery tab rail.)
//
// THE FLOW'S ORDER IS THE DATA'S, not the tab row's. The suggested reading was
// Forge → Cull → Extract → Styles → Dojo; the code says otherwise. Extract
// writes styles into pipeline/foundry/styles.json, the forge renders THOSE
// styles × mechanisms (plans name style ids), the cull judges what it rendered
// and writes its evidence back onto the same styles. The Dojo is a separate
// loop over prompt recipes. A flow drawn in tab order would be a diagram of the
// UI, not of the plant.

import { Clapperboard, Flame, Palette, Pipette, Swords, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ExtractSummary } from "@/lib/foundry/extract/types";
import type { StripRunSummary } from "@/lib/foundry/strips/triage";
import type { TrainingCycleSummary } from "@/lib/foundry/training/types";
import type { Catalogue, RunSummary } from "@/lib/foundry/types";

import { extractFileUrl, fetchExtractRun, fetchExtractRuns } from "./extractClient";
import { fetchCatalogue, fetchRun, fetchStripRun, fetchStripRuns, fetchTrainingCycle, fetchTrainingCycles, fileUrl } from "./foundryClient";
import { EXTRACT_LIVE, LIVE, STATUS_WORD, runKind } from "./parts";
import type { Tone } from "./ui";

// A FIFTH AND A SIXTH TAB, and nothing retires: the operator decided the four
// engines of the forge coexist with the pipeline board, and Strips landed beside
// it from another lane. `ENGINE`, `lines()` and `station()`
// below are all `Record<Tab, …>`, so tsc names every place a new member has to be
// answered for — which is the point of keeping the union here.
export type Tab = "cull" | "extract" | "styles" | "dojo" | "pipeline" | "strips";

/* ── Reads ────────────────────────────────────────────────────────────────── */

export interface Plant {
  extract?: ExtractSummary[];
  catalogue?: Catalogue;
  cycles?: TrainingCycleSummary[];
  strips?: StripRunSummary[];
  /** The list reads that were refused: their stations draw no figure, which is
   *  not the same as the ellipsis a read still in flight draws. */
  failed?: Partial<Record<"extract" | "catalogue" | "cycles" | "strips", true>>;
  /** The newest extract run's pictures, the newest cycle's challengers, the
   *  newest strip run's posters. */
  extractArt: string[];
  dojoArt: string[];
  stripArt: string[];
}

/** The three lists the header cannot derive from the cull's own state.
 *
 *  Each tab's view loads its own list when it opens; this asks for the same
 *  three lists once, at mount, so the header is honest before anything is
 *  clicked. A list that cannot be read leaves its figure OFF rather than
 *  showing a zero — a zero meaning "we could not ask" is worse than nothing,
 *  and the failure already has a home in each view's own error line.
 *
 *  NO `alive` GUARD, deliberately. Each list is asked for exactly once for the
 *  life of the page, so there is no newer response for a late one to
 *  overwrite, and a setState after unmount is a no-op. A REJECTION handler
 *  there must be: an unhandled one is picked up by GlobalErrorBridge and
 *  announced as the user's work failing to save. */
export function usePlant(): Plant {
  const [p, setP] = useState<Omit<Plant, "extractArt" | "dojoArt" | "stripArt"> & { extractArt?: string[]; dojoArt?: string[]; stripArt?: string[] }>({});
  useEffect(() => {
    const put = (patch: Partial<Plant>) => setP((c) => ({ ...c, ...patch }));
    // Pictures are decoration: a refused one is dropped. A refused LIST is recorded,
    // so its station draws no figure rather than a loading ellipsis for the life of
    // the page.
    const drop = () => undefined;
    const fail = (k: "extract" | "catalogue" | "cycles" | "strips") => () => setP((c) => ({ ...c, failed: { ...c.failed, [k]: true } }));
    fetchExtractRuns().then((r) => {
      put({ extract: r });
      // The newest run's pictures, for the station that shows "what Extract
      // made last": transfers first (the recipe on a scene the gallery never
      // showed), then sources.
      if (r[0])
        fetchExtractRun(r[0].id).then((d) => {
          const files = [...d.run.styles.flatMap((s) => s.transfers.map((t) => t.file)), ...d.run.sources.map((s) => s.file)].filter((f): f is string => Boolean(f));
          put({ extractArt: files.slice(0, 3).map((f) => extractFileUrl(d.run.id, f)) });
        }, drop);
    }, fail("extract"));
    fetchCatalogue().then((c) => put({ catalogue: c }), fail("catalogue"));
    fetchTrainingCycles().then((c) => {
      put({ cycles: c });
      const newest = c[0];
      if (newest)
        fetchTrainingCycle(newest.id).then((d) => {
          const files = d.cycle.improvements.flatMap((i) => (i.pairs ?? []).filter((x) => !x.challenger.deleted).map((x) => x.challenger.poster ?? x.challenger.file));
          put({ dojoArt: files.filter((f) => /\.(png|jpe?g)$/i.test(f)).slice(0, 3).map((f) => fileUrl(d.cycle.id, f, "training")) });
        }, drop);
    }, fail("cycles"));
    fetchStripRuns().then((r) => {
      put({ strips: r });
      if (r[0])
        fetchStripRun(r[0].id).then((d) => {
          const posters = d.run.cards.filter((c) => c.status === "rendered" && c.files.poster).map((c) => fileUrl(d.run.id, `${c.id}/${c.files.poster}`, "strips"));
          put({ stripArt: posters.slice(0, 3) });
        }, drop);
    }, fail("strips"));
  }, []);
  return { ...p, extractArt: p.extractArt ?? [], dojoArt: p.dojoArt ?? [], stripArt: p.stripArt ?? [] };
}

export interface RunPreview {
  source?: string;
  thumbs: string[];
}

/** A few pictures per forge run, for the run cards.
 *
 *  RunSummary carries counts and no files, so a card that shows what a run
 *  MADE has to read the run. Bounded twice: only the newest `limit` runs, and a
 *  run is re-read only when its status changes or a live one has moved on by
 *  four candidates — the 4s poll alone must not turn into eight manifest reads
 *  every four seconds. */
export function useRunPreviews(runs: RunSummary[] | null, limit = 8): Record<string, RunPreview> {
  const [map, setMap] = useState<Record<string, RunPreview>>({});
  const keys = useMemo(
    () => (runs ?? []).slice(0, limit).map((r) => `${r.id}|${r.status}|${Math.floor(r.progress.done / 4)}`),
    [runs, limit],
  );
  const joined = keys.join(",");
  useEffect(() => {
    for (const k of joined ? joined.split(",") : []) {
      const id = k.split("|")[0];
      fetchRun(id).then(
        (d) => {
          const ready = d.run.candidates.filter((c) => !c.deleted && (c.status === "graded" || c.status === "unmeasured" || c.status === "generated"));
          // Kept work first: a run's best face is what a human already chose.
          const kept = ready.filter((c) => d.verdicts[c.id]?.verdict === "keep");
          const rest = ready.filter((c) => d.verdicts[c.id]?.verdict !== "keep");
          setMap((m) => ({
            ...m,
            [id]: {
              source: d.run.scenes[0] ? fileUrl(id, d.run.scenes[0].source) : undefined,
              thumbs: [...kept, ...rest].slice(0, 6).map((c) => fileUrl(id, c.file)),
            },
          }));
        },
        () => undefined,
      );
    }
  }, [joined]);
  return map;
}

/* ── What each engine is doing, in a line ─────────────────────────────────── */

export interface EngineLine {
  tone: Tone;
  pulse?: boolean;
  text: string;
}

function forgeLine(runs: RunSummary[] | null): EngineLine | null {
  if (!runs) return null;
  const live = runs.find((r) => LIVE.includes(r.status));
  if (live) return { tone: "cyan", pulse: true, text: `${STATUS_WORD[live.status]} ${live.progress.done}/${live.progress.total}` };
  const toCull = runs.filter((r) => runKind(r.status) === "ready" || runKind(r.status) === "inc").length;
  if (toCull) return { tone: "amber", text: `${toCull} to cull` };
  if (!runs.length) return { tone: "neutral", text: "no runs yet" };
  return { tone: "emerald", text: `${runs.length} run${runs.length === 1 ? "" : "s"} · all culled` };
}

function extractLine(runs: ExtractSummary[] | undefined): EngineLine | null {
  if (!runs) return null;
  const live = runs.find((r) => EXTRACT_LIVE.includes(r.status));
  if (live) return { tone: "cyan", pulse: true, text: `${live.status} ${live.progress.done}/${live.progress.total}` };
  const toCull = runs.filter((r) => r.status === "done").length;
  if (toCull) return { tone: "amber", text: `${toCull} to cull` };
  return { tone: "neutral", text: runs.length ? `${runs.length} run${runs.length === 1 ? "" : "s"}` : "no extractions yet" };
}

function stylesLine(cat: Catalogue | undefined): EngineLine | null {
  if (!cat) return null;
  const proven = cat.styles.filter((s) => s.status === "proven").length;
  return { tone: proven ? "emerald" : "neutral", text: `${cat.styles.length} styles · ${proven} proven` };
}

function dojoLine(cycles: TrainingCycleSummary[] | undefined): EngineLine | null {
  if (!cycles) return null;
  const parked = cycles.filter((c) => c.status === "awaiting-gate").length;
  if (parked) return { tone: "amber", text: `${parked} at the gate` };
  const live = cycles.find((c) => ["planning", "generating", "judging"].includes(c.status));
  if (live) return { tone: "cyan", pulse: true, text: live.status };
  return { tone: "neutral", text: cycles.length ? `${cycles.length} cycle${cycles.length === 1 ? "" : "s"}` : "no cycles yet" };
}

function stripsLine(runs: StripRunSummary[] | undefined): EngineLine | null {
  if (!runs) return null;
  if (runs.some((r) => r.status === "running")) return { tone: "cyan", pulse: true, text: "rendering" };
  const toTriage = runs.filter((r) => r.status === "awaiting-triage").length;
  if (toTriage) return { tone: "amber", text: `${toTriage} to triage` };
  return { tone: "neutral", text: runs.length ? `${runs.length} run${runs.length === 1 ? "" : "s"}` : "no strips yet" };
}

/** Each station's name and glyph. Exported for ./FoundrySubnav, which draws
 *  the row; this file keeps the table because `Record<Tab, …>` here is what makes
 *  tsc name every place a new station has to be answered for. */
export const ENGINE: Record<Tab, { name: string; icon: typeof Flame }> = {
  cull: { name: "Forge · Cull", icon: Flame },
  extract: { name: "Extract", icon: Pipette },
  styles: { name: "Styles", icon: Palette },
  dojo: { name: "Dojo", icon: Swords },
  pipeline: { name: "Pipeline", icon: Workflow },
  strips: { name: "Strips", icon: Clapperboard },
};

export function engineLines(runs: RunSummary[] | null, plant: Plant): Record<Tab, EngineLine | null> {
  // NULL FOR THE PIPELINE, deliberately. Its figures — cards per stage, how many
  // are at the gate — come from `CanvasStatus`, which does not exist until the
  // canvas has mounted inside the tab. `usePlant` reads three lists and none of
  // them is the pipeline's. A wrong number on a tab rail is worse than no number.
  //
  // A FAILED READ IS NOT A LOADING READ, and that distinction now lives here.
  // It used to live in the station row, which drew no FIGURE for a list that
  // could not be read — `failed ? [] : allFigures` — so a refusal read as an
  // absence rather than as the ellipsis of a read still in flight. The row and
  // its figures are gone (./FoundrySubnav.tsx draws names and a dot), and with
  // them went the only place that told the two apart: an undefined list and a
  // refused one both produced no line and therefore no dot. So a refusal gets a
  // line of its own, in the one tone nothing else here uses. `unreadable` is the
  // work's word, not the app's: the list was asked for and the answer was no.
  const refused = (t: "extract" | "catalogue" | "cycles"): EngineLine | null =>
    plant.failed?.[t] ? { tone: "rose", text: "unreadable" } : null;
  return {
    cull: forgeLine(runs),
    extract: refused("extract") ?? extractLine(plant.extract),
    styles: refused("catalogue") ?? stylesLine(plant.catalogue),
    dojo: refused("cycles") ?? dojoLine(plant.cycles),
    strips: stripsLine(plant.strips),
    pipeline: null,
  };
}

/* ── The stations ─────────────────────────────────────────────────────────── */

// THE ROW ITSELF MOVED OUT, to ./FoundrySubnav.tsx, and what moved with it was
// three rounds of trying to make a station carry its own figures: a column with
// a picture tray (~180px), then one row of glass cards, then one row with two
// figures and a floor under the name. Each was smaller than the last and each
// still spent the top of the page on navigation. The operator's answer was to
// stop designing it — the app header already draws "which place am I in", and
// these are the same kind of thing one level down.
//
// What stays here is the DATA behind that row: `ENGINE` (name and glyph) and
// `engineLines()` (each station's one live fact). Both are `Record<Tab, …>` on
// purpose, so tsc names every place a new station must be answered for.

