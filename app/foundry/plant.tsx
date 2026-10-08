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
import { Dot, TONE_TEXT, type Tone } from "./ui";

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

const plural = (n: number | undefined, one: string, many = `${one}s`) => (n === 1 ? one : many);

interface EngineLine {
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

const ENGINE: Record<Tab, { name: string; icon: typeof Flame }> = {
  cull: { name: "Forge · Cull", icon: Flame },
  extract: { name: "Extract", icon: Pipette },
  styles: { name: "Styles", icon: Palette },
  dojo: { name: "Dojo", icon: Swords },
  pipeline: { name: "Pipeline", icon: Workflow },
  strips: { name: "Strips", icon: Clapperboard },
};

function lines(runs: RunSummary[] | null, plant: Plant): Record<Tab, EngineLine | null> {
  // NULL FOR THE PIPELINE, deliberately. Its figures — cards per stage, how many
  // are at the gate — come from `CanvasStatus`, which does not exist until the
  // canvas has mounted inside the tab. `usePlant` reads three lists and none of
  // them is the pipeline's. A wrong number on a tab rail is worse than no number.
  return {
    cull: forgeLine(runs),
    extract: extractLine(plant.extract),
    styles: stylesLine(plant.catalogue),
    dojo: dojoLine(plant.cycles),
    strips: stripsLine(plant.strips),
    pipeline: null,
  };
}

/** Roving arrows for a hand-built tablist: the same manual-activation rule
 *  TabRail keeps (components/ui/signal/TabRail.tsx) — arrows move focus,
 *  Enter/Space select. */
function tabKeys(e: React.KeyboardEvent<HTMLElement>) {
  const list = e.currentTarget.closest('[role="tablist"]');
  if (!list) return;
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
  const i = tabs.indexOf(e.currentTarget);
  const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
  if (to === null) return;
  e.preventDefault();
  tabs[(to + tabs.length) % tabs.length]?.focus();
}

/* ── The stations ─────────────────────────────────────────────────────────── */

// ONE ROW, LITERALLY (round 1 of the pipeline exercise). Round 3 claimed "one
// row tall" and meant one CARD tall: inside it the name and the figures were two
// stacked lines, so a station stood ~80px and five of them took the top of the
// page away from the board below — which is what the operator's round-1 verdict
// on the pipeline canvas named first. Now the four things a station says sit on
// ONE line in the operator's own order: icon, title, status dot, figures.
//
// The picture tray is GONE, and that reverses a round-2 decision deliberately.
// It was why this direction was picked then; on one line it is what the figures
// were losing their width to, and a station whose numbers are cut mid-glyph has
// stopped being navigation. The pictures are not lost — every engine's own tab
// opens on its output, larger than a 48px thumb ever showed it.

export function PipelineHeader({
  tab,
  onSelect,
  runs,
  plant,
}: {
  tab: Tab;
  onSelect: (t: Tab) => void;
  runs: RunSummary[] | null;
  plant: Plant;
}) {
  const ln = lines(runs, plant);
  const cat = plant.catalogue;

  const station = (t: Tab, allFigures: { n: number | undefined; label: string; tone?: Tone }[], failed = false) => {
    // A list that could not be read draws no figure (see usePlant), never a bare `…`.
    // TWO FIGURES, ACTIONABLE FIRST, and the number is measured rather than
    // chosen: at 1920px a station has about 276px for its name and its figures,
    // "Forge · Cull" takes 100 of it, and three figures ("6 runs · 3 to cull ·
    // 20 kept") want 254 more. Photographed, the third ran through the card's
    // edge and printed over the station beside it. A toned figure is one that
    // wants something — `to cull`, `at the gate`, `proven` — so those are the
    // ones kept when only two fit, and the plain total is what gives way. The
    // original order survives, because a station whose figures reorder as the
    // numbers change is a station nobody can read at a glance.
    const picked = failed ? [] : allFigures;
    const wanted = picked.filter((f) => f.tone);
    const keep = new Set([...wanted, ...picked.filter((f) => !f.tone)].slice(0, 2));
    const figures = picked.filter((f) => keep.has(f));
    const on = t === tab;
    const E = ENGINE[t];
    const l = ln[t];
    return (
      <button
        key={t}
        type="button"
        role="tab"
        aria-selected={on}
        tabIndex={on ? 0 : -1}
        data-testid={`foundry-tab-${t}`}
        onClick={() => onSelect(t)}
        onKeyDown={tabKeys}
        className={`group relative flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2 text-left backdrop-blur-[14px] transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
          on
            ? "border-cyan-400/45 bg-gradient-to-b from-cyan-400/[0.10] to-cyan-400/[0.02] shadow-[0_0_0_1px_var(--gt-ring-cyan),var(--gt-shadow-glow)]"
            : "border-white/8 bg-gradient-to-b from-white/[0.05] to-white/[0.015] hover:border-white/15"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
          <E.icon aria-hidden className={`h-4 w-4 shrink-0 ${on ? "text-cyan-200" : "text-white/50"}`} />
          {/* A FLOOR ON THE NAME, because the cut before this one let it reach
              zero: the Forge station rendered as an icon, a dot and figures with
              no word at all, and the Dojo's read `D…`. A figure clipped at the
              card's edge is a number you can still mostly read; a name clipped
              to nothing is a station you have to hover to identify. 4.5rem is
              about seven characters — enough for "Forge ·…", "Extract", "Dojo". */}
          <span className={`font-instrument min-w-[4.5rem] truncate text-content ${on ? "text-white" : "text-white/85"}`}>{E.name}</span>
          {l && <Dot tone={l.tone} pulse={l.pulse} />}
          {/* THE TITLE GIVES UP ITS WIDTH, NOT THE FIGURES — and the pictures gave
              up the row. Two cuts of this were photographed before it fit. With
              `shrink-0` on the name the figures were squeezed to about 135px and
              cut MID-GLYPH: the Forge station read `Forge · Cull ● ( : : g`,
              which is not a truncated figure, it is rubbish. Reversing it made
              the figures whole and pushed them straight through the card's edge,
              over the thumbnails and into the next station. Neither is a layout
              bug — five stations across 1920px simply have no room for a name, a
              dot, three figures AND three 16:9 thumbnails, and the operator's
              round-1 list for this row is title, icon, status dot, data stats.
              The thumbnails are what the data was losing to, so they went; each
              engine's own tab shows its output at a size worth looking at. */}
          <span className="font-jetbrains flex min-w-0 items-baseline gap-x-3 overflow-hidden text-label whitespace-nowrap">
            {figures.map((f) => (
              <span key={f.label} className="text-white/45">
                <span className={`tabular-nums ${f.tone ? TONE_TEXT[f.tone] : "text-white/85"}`}>{f.n ?? "…"}</span> {f.label}
              </span>
            ))}
            {/* The engine's line only when it says something the figures do
                not: a run in motion. A parked count is already a figure. */}
            {l?.pulse && <span className={`truncate ${TONE_TEXT[l.tone]}`}>{l.text}</span>}
          </span>
        </span>
      </button>
    );
  };

  const arrow = (
    <span aria-hidden className="hidden shrink-0 items-center self-center lg:flex">
      <span className="h-px w-5 bg-gradient-to-r from-white/10 to-cyan-300/50" />
      <span className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-cyan-300/60" />
    </span>
  );

  const proven = cat?.styles.filter((s) => s.status === "proven").length;
  const kept = runs?.reduce((a, r) => a + r.kept, 0);
  const toCull = runs?.filter((r) => ["ready", "inc"].includes(runKind(r.status))).length;
  const exToCull = plant.extract?.filter((r) => r.status === "done").length;
  const found = plant.extract?.reduce((a, r) => a + r.styles, 0);
  const parked = plant.cycles?.filter((c) => c.status === "awaiting-gate").length;
  const toTriage = plant.strips?.filter((r) => r.status === "awaiting-triage").length;
  const stripsKept = plant.strips?.reduce((a, r) => a + r.kept, 0);
  return (
    <div role="tablist" aria-label="foundry stations" className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      {station(
        "extract",
        [
          { n: plant.extract?.length, label: plural(plant.extract?.length, "run") },
          { n: exToCull, label: "to cull", tone: exToCull ? "amber" : undefined },
          { n: found, label: plural(found, "style") + " found" },
        ],
        plant.failed?.extract,
      )}
      {arrow}
      {station("styles", [{ n: cat?.styles.length, label: plural(cat?.styles.length, "style") }, { n: proven, label: "proven", tone: proven ? "emerald" : undefined }], plant.failed?.catalogue)}
      {arrow}
      {station(
        "cull",
        [
          { n: runs?.length, label: plural(runs?.length, "run") },
          { n: toCull, label: "to cull", tone: toCull ? "amber" : undefined },
          { n: kept, label: "kept", tone: kept ? "emerald" : undefined },
        ],
      )}
      <span aria-hidden className="mx-1 hidden w-px self-stretch bg-gradient-to-b from-transparent via-white/12 to-transparent lg:block" />
      {station("dojo", [{ n: plant.cycles?.length, label: plural(plant.cycles?.length, "cycle") }, { n: parked, label: "at the gate", tone: parked ? "amber" : undefined }], plant.failed?.cycles)}
      {station(
        "strips",
        [
          { n: plant.strips?.length, label: plural(plant.strips?.length, "run") },
          { n: toTriage, label: "to triage", tone: toTriage ? "amber" : undefined },
          { n: stripsKept, label: "kept", tone: stripsKept ? "emerald" : undefined },
        ],
        plant.failed?.strips,
      )}
      <span aria-hidden className="mx-1 hidden w-px self-stretch bg-gradient-to-b from-transparent via-white/12 to-transparent lg:block" />
      {/* No figures: see `lines()` above. The station is the name, the icon and
          whether it is the open tab. */}
      {station("pipeline", [])}
    </div>
  );
}
