"use client";

// THE PLANT'S STATE — what each engine of the foundry is doing, read once, and
// the three ways the round-2 prototypes draw it in place of the page title.
//
// /foundry used to open on a 90px serif "Foundry" and the Fornax constellation
// — a decorative figure whose four stars were the four tabs — and then a flat
// tab row. StudioFrame's nav already names the place; what the top of a plant's
// page owes the reader is the plant: which engine is running, which one is
// waiting on a human, what each last produced. So the header IS the navigation
// and it carries that state:
//
//   1 · Control room   one glass bar of four engine segments, each with its
//                      live status line
//   2 · Gallery        the Library's own TabRail with a tally per module, the
//                      forge's live state riding quietly on the same row
//   3 · Pipeline       the plant as a flow — Extract → Styles → Forge · Cull —
//                      with the Dojo loop beside it, each station a glass card
//                      carrying its counts and its latest output
//
// THE FLOW'S ORDER IS THE DATA'S, not the tab row's. The suggested reading was
// Forge → Cull → Extract → Styles → Dojo; the code says otherwise. Extract
// writes styles into pipeline/foundry/styles.json, the forge renders THOSE
// styles × mechanisms (plans name style ids), the cull judges what it rendered
// and writes its evidence back onto the same styles. The Dojo is a separate
// loop over prompt recipes. A flow drawn in tab order would be a diagram of the
// UI, not of the plant.

import { Flame, Palette, Pipette, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { TabRail } from "@/components/ui/signal";
import type { ExtractSummary } from "@/lib/foundry/extract/types";
import type { TrainingCycleSummary } from "@/lib/foundry/training/types";
import type { Catalogue, RunSummary } from "@/lib/foundry/types";

import { extractFileUrl, fetchExtractRun, fetchExtractRuns } from "./extractClient";
import { fetchCatalogue, fetchRun, fetchTrainingCycle, fetchTrainingCycles, fileUrl } from "./foundryClient";
import { EXTRACT_LIVE, LIVE, STATUS_WORD, runKind } from "./parts";
import { heroOf, keptRows } from "./styleArt";
import { Art, Dot, StatusChip, TONE_TEXT, type Tone } from "./ui";

export type Tab = "cull" | "extract" | "styles" | "dojo";

/* ── Reads ────────────────────────────────────────────────────────────────── */

export interface Plant {
  extract?: ExtractSummary[];
  catalogue?: Catalogue;
  cycles?: TrainingCycleSummary[];
  /** The newest extract run's pictures and the newest cycle's challengers. */
  extractArt: string[];
  dojoArt: string[];
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
  const [p, setP] = useState<Omit<Plant, "extractArt" | "dojoArt"> & { extractArt?: string[]; dojoArt?: string[] }>({});
  useEffect(() => {
    const put = (patch: Partial<Plant>) => setP((c) => ({ ...c, ...patch }));
    const drop = () => undefined;
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
    }, drop);
    fetchCatalogue().then((c) => put({ catalogue: c }), drop);
    fetchTrainingCycles().then((c) => {
      put({ cycles: c });
      const newest = c[0];
      if (newest)
        fetchTrainingCycle(newest.id).then((d) => {
          const files = d.cycle.improvements.flatMap((i) => (i.pairs ?? []).filter((x) => !x.challenger.deleted).map((x) => x.challenger.poster ?? x.challenger.file));
          put({ dojoArt: files.filter((f) => /\.(png|jpe?g)$/i.test(f)).slice(0, 3).map((f) => fileUrl(d.cycle.id, f, "training")) });
        }, drop);
    }, drop);
  }, []);
  return { ...p, extractArt: p.extractArt ?? [], dojoArt: p.dojoArt ?? [] };
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

/** The latest output of each engine, as up to three picture URLs — what the
 *  Control room's segments and the Pipeline's stations show of each. */
export function useEngineArt(runs: RunSummary[] | null, plant: Plant, previews: Record<string, RunPreview>): Record<Tab, string[]> {
  const cat = plant.catalogue;
  const styles = useMemo(() => {
    if (!cat) return [];
    const out: string[] = [];
    for (const s of cat.styles) {
      const h = heroOf(s, keptRows(cat, s));
      if (h) out.push(h.url);
      if (out.length === 3) break;
    }
    return out;
  }, [cat]);
  const cull = (runs ?? []).flatMap((r) => previews[r.id]?.thumbs ?? []).slice(0, 3);
  return { cull, extract: plant.extractArt, styles, dojo: plant.dojoArt };
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

const ENGINE: Record<Tab, { name: string; icon: typeof Flame }> = {
  cull: { name: "Forge · Cull", icon: Flame },
  extract: { name: "Extract", icon: Pipette },
  styles: { name: "Styles", icon: Palette },
  dojo: { name: "Dojo", icon: Swords },
};

function lines(runs: RunSummary[] | null, plant: Plant): Record<Tab, EngineLine | null> {
  return { cull: forgeLine(runs), extract: extractLine(plant.extract), styles: stylesLine(plant.catalogue), dojo: dojoLine(plant.cycles) };
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

/* ── 1 · Control room ─────────────────────────────────────────────────────── */

export function ControlHeader({
  tab,
  onSelect,
  runs,
  plant,
  previews,
}: {
  tab: Tab;
  onSelect: (t: Tab) => void;
  runs: RunSummary[] | null;
  plant: Plant;
  previews: Record<string, RunPreview>;
}) {
  const ln = lines(runs, plant);
  const art = useEngineArt(runs, plant, previews);
  return (
    <div role="tablist" aria-label="foundry engines" className="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-2 backdrop-blur-[14px] lg:grid-cols-4">
      {(Object.keys(ENGINE) as Tab[]).map((t) => {
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
            className={`group flex min-w-0 cursor-pointer items-center gap-3.5 rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
              on ? "border-cyan-400/40 bg-cyan-400/[0.09] shadow-[0_0_0_1px_var(--gt-ring-cyan)]" : "border-transparent hover:border-white/12 hover:bg-white/[0.04]"
            }`}
          >
            <span
              aria-hidden
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${
                on ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-200" : "border-white/10 bg-white/[0.04] text-white/55 group-hover:text-white/80"
              }`}
            >
              <E.icon className="h-[18px] w-[18px]" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={`font-hanken text-content ${on ? "text-white" : "text-white/80"}`}>{E.name}</span>
              <span className="font-jetbrains flex min-w-0 items-center gap-2 text-label">
                {l ? (
                  <>
                    <Dot tone={l.tone} pulse={l.pulse} />
                    <span className={`truncate ${l.tone === "neutral" ? "text-white/45" : TONE_TEXT[l.tone]}`}>{l.text}</span>
                  </>
                ) : (
                  <span className="text-white/30">…</span>
                )}
              </span>
            </span>
            {/* The engine's latest output, as a monitor would show it. */}
            <span aria-hidden className="ml-auto hidden shrink-0 gap-1 xl:flex">
              {art[t].slice(0, 2).map((u) => (
                <Art key={u} src={u} alt="" className={`h-9 w-14 transition ${on ? "opacity-100" : "opacity-60 group-hover:opacity-90"}`} rounded="rounded-md" />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── 2 · Gallery ──────────────────────────────────────────────────────────── */

export function GalleryHeader({ tab, onSelect, runs, plant }: { tab: Tab; onSelect: (t: Tab) => void; runs: RunSummary[] | null; plant: Plant }) {
  const live = runs?.find((r) => LIVE.includes(r.status));
  const parked = plant.cycles?.filter((c) => c.status === "awaiting-gate").length;
  const anyLive = Boolean(live);
  const tally = (value: number | undefined, tone: "neutral" | "amber") => (value === undefined ? undefined : { value, tone });
  return (
    <TabRail
      label="foundry modules"
      active={tab}
      onSelect={onSelect}
      tabs={[
        { id: "cull", label: "Cull", testId: "foundry-tab-cull", tally: tally(runs?.length, anyLive ? "amber" : "neutral") },
        { id: "extract", label: "Extract", testId: "foundry-tab-extract", tally: tally(plant.extract?.length, "neutral") },
        { id: "styles", label: "Styles", testId: "foundry-tab-styles", tally: tally(plant.catalogue?.styles.length, "neutral") },
        { id: "dojo", label: "Dojo", testId: "foundry-tab-dojo", tally: tally(parked, parked ? "amber" : "neutral") },
      ]}
      trailing={live ? <StatusChip kind="live" word={`forge · ${STATUS_WORD[live.status]} ${live.progress.done}/${live.progress.total}`} className="ml-auto" /> : undefined}
    />
  );
}

/* ── 3 · Pipeline ─────────────────────────────────────────────────────────── */

export function PipelineHeader({
  tab,
  onSelect,
  runs,
  plant,
  previews,
}: {
  tab: Tab;
  onSelect: (t: Tab) => void;
  runs: RunSummary[] | null;
  plant: Plant;
  previews: Record<string, RunPreview>;
}) {
  const ln = lines(runs, plant);
  const cat = plant.catalogue;
  const art = useEngineArt(runs, plant, previews);
  const styleArt = art.styles;
  const forgeArt = art.cull;

  const station = (t: Tab, figures: { n: number | undefined; label: string; tone?: Tone }[], art: string[]) => {
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
        className={`group relative flex min-w-0 flex-1 cursor-pointer flex-col gap-3 rounded-2xl border p-3.5 text-left backdrop-blur-[14px] transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
          on
            ? "border-cyan-400/45 bg-gradient-to-b from-cyan-400/[0.10] to-cyan-400/[0.02] shadow-[0_0_0_1px_var(--gt-ring-cyan),var(--gt-shadow-glow)]"
            : "border-white/8 bg-gradient-to-b from-white/[0.05] to-white/[0.015] hover:border-white/15"
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2.5">
            <E.icon aria-hidden className={`h-4 w-4 shrink-0 ${on ? "text-cyan-200" : "text-white/50"}`} />
            <span className={`font-instrument truncate text-xl ${on ? "text-white" : "text-white/85"}`}>{E.name}</span>
          </span>
          {l && <Dot tone={l.tone} pulse={l.pulse} />}
        </span>
        <span aria-hidden className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <Art key={i} src={art[i]} alt="" state={art[i] ? "ready" : "blank"} className="aspect-video" rounded="rounded-lg">
            </Art>
          ))}
        </span>
        <span className="font-jetbrains flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-label">
          {figures.map((f) => (
            <span key={f.label} className="text-white/45">
              <span className={`tabular-nums ${f.tone ? TONE_TEXT[f.tone] : "text-white/85"}`}>{f.n ?? "…"}</span> {f.label}
            </span>
          ))}
        </span>
        {/* The engine's line only when it says something the figures do not:
            a run in motion. A parked count is already a figure, in amber. */}
        {l?.pulse && <span className={`font-jetbrains truncate text-label ${TONE_TEXT[l.tone]}`}>{l.text}</span>}
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
  return (
    <div role="tablist" aria-label="foundry stations" className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      {station(
        "extract",
        [
          { n: plant.extract?.length, label: plural(plant.extract?.length, "run") },
          { n: exToCull, label: "to cull", tone: exToCull ? "amber" : undefined },
          { n: found, label: plural(found, "style") + " found" },
        ],
        plant.extractArt,
      )}
      {arrow}
      {station("styles", [{ n: cat?.styles.length, label: plural(cat?.styles.length, "style") }, { n: proven, label: "proven", tone: proven ? "emerald" : undefined }], styleArt)}
      {arrow}
      {station(
        "cull",
        [
          { n: runs?.length, label: plural(runs?.length, "run") },
          { n: toCull, label: "to cull", tone: toCull ? "amber" : undefined },
          { n: kept, label: "kept", tone: kept ? "emerald" : undefined },
        ],
        forgeArt,
      )}
      <span aria-hidden className="mx-1 hidden w-px self-stretch bg-gradient-to-b from-transparent via-white/12 to-transparent lg:block" />
      {station("dojo", [{ n: plant.cycles?.length, label: plural(plant.cycles?.length, "cycle") }, { n: parked, label: "at the gate", tone: parked ? "amber" : undefined }], plant.dojoArt)}
    </div>
  );
}
