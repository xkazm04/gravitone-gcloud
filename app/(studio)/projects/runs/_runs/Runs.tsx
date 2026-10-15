"use client";

// RUNS - the day-line across every resource, read-only (Phase 2; prototype projects.html#runs).
//
// The page's data arrives from the Server Component (./load.ts -> ./model.ts); what lives here
// is what the operator is doing with it: the selection (a job, a project), the zoom, which
// lanes are opened past their +N, and where the view is centred. Selection is in the URL
// (`?project=&job=&zoom=`), written with history.replaceState, which Next's router observes
// without a server round trip - a click must not re-read eleven v1 stores.
//
// READ-ONLY, AND SAYS SO BY ABSENCE. Phase 2 has no writer for v1 work, so the prototype's
// pause, retry, re-route, earlier/later, launch and compose are not drawn - not even disabled:
// a control that cannot act is a dead door. Their keys stay unbound (the keymap rows exist for
// Phase 4; no handler is registered for their verbs, so a press is nobody's). The verbs bound
// here: R runs (re-centre on NOW), P plan (v1's /projects until Phase 4), J/K and ⇧↓/⇧↑ walk
// jobs, ↑/↓ walk projects, Esc deselects.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Crumbs } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { RunsDayline } from "@gt/ui/components/runs/RunsDayline.tsx";
import { ZOOMS, isZoom, type Zoom } from "@gt/ui/components/runs/dayline.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { StaleBadge } from "@gt/ui/components/stalebadge/StaleBadge.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";
import { useFreshness, usePollBackstop } from "@gt/ui/freshness/useFreshness";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { RunsData } from "./load.ts";
import { Inspector } from "./Inspector.tsx";
import { Compositions } from "./Compositions.tsx";
import { BACKSTOP_MS, openFeed } from "./liveFeed.ts";
import { barsOf, blockedOf, depsOf, heldMoney, litOf, pinsOf, projectsOf, rowsOf, step, totalsOf, walkPool } from "./view.ts";
import s from "./Runs.module.css";

export type Selection = { readonly job: string | null; readonly project: string | null; readonly zoom: Zoom };

const LEGEND: readonly { readonly look: string; readonly label: string }[] = [
  { look: "running", label: "running" },
  { look: "idle", label: "queued" },
  { look: "awaiting", label: "at weir" },
  { look: "failed", label: "failed" },
  { look: "paused", label: "paused" },
  { look: "done", label: "done" },
];

function urlOf(sel: Selection): string {
  const q = new URLSearchParams();
  if (sel.project !== null) q.set("project", sel.project);
  if (sel.job !== null) q.set("job", sel.job);
  if (sel.zoom !== "24h") q.set("zoom", sel.zoom);
  const qs = q.toString();
  return `${window.location.pathname}${qs === "" ? "" : `?${qs}`}`;
}

export function Runs({ data, initial }: { readonly data: RunsData; readonly initial: Selection }) {
  const m = data.model;
  const router = useRouter();
  const [sel, setSel] = useState<Selection>(initial);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [hover, setHover] = useState<string | null>(null);
  // A link that arrives with `?job=` opens centred on that job; otherwise on NOW.
  const [centre, setCentre] = useState<{ readonly key: string; readonly at: number | "now" }>(() => {
    const j = m.jobs.find((x) => x.key === initial.job);
    const w = m.weir.find((x) => x.key === initial.job);
    return { key: "first", at: j !== undefined ? (j.s + j.e) / 2 : w !== undefined ? w.at : "now" };
  });
  // Live: ./liveFeed.ts says how; here is only its lifetime. The stream starts from the FIRST
  // render's seq (a ref, so a refresh does not reopen it); every render confirms freshness.
  const [fresh, feed] = useFreshness<number>();
  const firstHead = useRef(data.head);
  useEffect(() => {
    feed({ kind: "value", value: m.now, at: Date.now() });
  }, [m.now, feed]);
  usePollBackstop(() => router.refresh(), BACKSTOP_MS);
  useEffect(() => openFeed({ head: firstHead.current, refresh: () => router.refresh(), fail: () => feed({ kind: "fail", at: Date.now() }) }), [router, feed]);

  useEffect(() => {
    const next = urlOf(sel);
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [sel]);

  const deps = useMemo(() => depsOf(m), [m]);
  const blocked = useMemo(() => blockedOf(m, deps), [m, deps]);
  const rows = useMemo(() => rowsOf(m), [m]);
  const bars = useMemo(() => barsOf(m, blocked), [m, blocked]);
  const pins = useMemo(() => pinsOf(m), [m]);
  const projects = useMemo(() => projectsOf(m), [m]);
  const totals = totalsOf(m);
  const money = heldMoney(m);
  // A job that left the page's data (it finished and aged out, or its source failed) is not
  // selected any more; the URL keeps the id until the operator moves on.
  const job = sel.job !== null && bars.some((b) => b.id === sel.job) ? sel.job : null;
  // Hover lights a thread only where there is one to light (projects.js mouseover lit a project).
  const hoverLit = hover !== null && deps.some((d) => d.from === hover || d.to === hover) ? hover : null;
  const lit = litOf(m, { job: job ?? (sel.project === null ? hoverLit : null), project: sel.project }, deps, blocked);

  const select = (id: string | null, recentre = false): void => {
    setSel((cur) => ({ ...cur, job: id }));
    if (recentre && id !== null) {
      const b = bars.find((x) => x.id === id);
      if (b !== undefined) setCentre({ key: `job:${id}`, at: (b.s + b.e) / 2 });
    }
  };
  const walkJob = (dir: 1 | -1): void => select(step(walkPool(m, sel.project), job, dir), true);
  const walkProject = (dir: 1 | -1): void => {
    const ids = projects.map((p) => p.id);
    const next = step(ids, sel.project, dir);
    if (next !== null) setSel((cur) => ({ ...cur, project: next, job: null }));
  };

  useKeys(
    "projects",
    {
      runs: () => setCentre({ key: `now:${Date.now()}`, at: "now" }),
      plan: () => router.push("/projects"),
      // J and ⇧↓ walk forward, K and ⇧↑ back: keys ["J","K"] then alias ["⇧↓","⇧↑"] (bindings.ts).
      job: ({ index }) => walkJob(index % 2 === 0 ? 1 : -1),
      project: ({ cap }) => (projects.length === 0 ? false : walkProject(cap === "↓" ? 1 : -1)),
      deselect: () => select(null),
    },
    { facts: job === null ? [] : ["job"] },
  );

  const zoomTo = (z: Zoom): void => {
    setSel((cur) => ({ ...cur, zoom: z }));
    setCentre({ key: `zoom:${z}:${Date.now()}`, at: job === null ? "now" : (bars.find((b) => b.id === job)?.s ?? "now") });
  };

  const total = bars.length + pins.length;
  const name = `Runs day-line: ${rows.length} rows, ${m.jobs.length} jobs, ${m.weir.length} weir piles, ${pins.length} slots`;

  return (
    <div className={s.proj}>
      <Compositions projects={projects} current={sel.project} floorRuns={m.jobs.filter((j) => j.projectId === undefined && j.from !== "ledger").length} resources={rows.length - 2} onPick={(p) => setSel((cur) => ({ ...cur, project: p, job: null }))} />
      <section className={s.pmain} aria-label="Runs">
        <div className={s.ptop}>
          <div className={s.row}>
            <div className={s.crumbs}>
              <Crumbs trail={[{ label: "Projects", href: "/projects" }]} here={sel.project ?? "All lanes"} />
            </div>
            <TabRail
              label="view"
              mode="projects"
              current="runs"
              tabs={[
                { id: "plan", label: "Plan", href: "/projects", verb: "plan" },
                { id: "runs", label: "Runs", href: "/projects/runs", verb: "runs" },
              ]}
            />
          </div>
          <div className={s.row}>
            <h1 className={s.title}>{sel.project ?? "Runs · every resource"}</h1>
            <div className={s.totals}>
              {/* projects.js totals: the count first, the word bold after it. */}
              <Chip label={String(totals.running)} value="running" tone="cyan" name={`${totals.running} running`} />
              <Chip label={String(totals.waiting)} value="waiting" name={`${totals.waiting} waiting`} />
              <Chip label={String(totals.weir)} value="at the weir" tone="amber" name={`${totals.weir} at the weir`} />
              <Chip label={String(totals.failed)} value="failed" tone="rose" name={`${totals.failed} failed`} />
              {money.n > 0 && <Chip label={money.usd > 0 ? `$${money.usd.toFixed(2)}` : `${Math.round(money.audioS)} s`} value="held" tone="violet" name={`${money.n} open spend holds`} />}
            </div>
          </div>
        </div>
        <div className={s.runs}>
          <div className={s.dl}>
            <div className={s.dlbar}>
              <Seg label="zoom" options={ZOOMS.map((z) => ({ value: z.id, label: z.id }))} value={sel.zoom} onChange={(v) => (isZoom(v) ? zoomTo(v) : undefined)} />
              <Button size="sm" label={`NOW ${new Date(m.now).toISOString().slice(11, 16)}`} onPress={() => setCentre({ key: `now:${Date.now()}`, at: "now" })} />
              <StaleBadge edge={fresh.edge} feed="runs" {...(fresh.ageMs === undefined ? {} : { ageMs: fresh.ageMs })} />
              <div className={s.legend} aria-hidden="true">
                {LEGEND.map((l) => (
                  <span key={l.look} className={s.lg}>
                    <i className={s[`sw-${l.look}`]} />
                    {l.label}
                  </span>
                ))}
              </div>
              <SourceTag kind={data.universe} />
            </div>
            {[...m.failures, ...data.problems].map((f) => (
              <div key={f.source} className={s.fail}>
                <ErrorLine message={`${f.source}: ${f.error}`} />
              </div>
            ))}
            <RunsDayline
              name={total === 0 ? `${name}; nothing in the window` : name}
              rows={rows}
              bars={bars}
              pins={pins}
              span={m.span}
              zoom={sel.zoom}
              now={m.now}
              selected={job}
              lit={lit}
              open={open}
              onSelect={(id) => select(id)}
              onHover={sel.project === null && job === null ? setHover : undefined}
              onToggleRow={(r) => setOpen((cur) => (cur.has(r) ? new Set([...cur].filter((x) => x !== r)) : new Set([...cur, r])))}
              centre={centre}
            />
          </div>
          <Inspector m={m} job={job} project={sel.project} deps={deps} blocked={blocked} onSelect={(id) => select(id, true)} />
        </div>
      </section>
    </div>
  );
}
