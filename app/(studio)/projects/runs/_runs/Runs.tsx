"use client";

// RUNS - the day-line across every resource, read-only (Phase 2; prototype projects.html#runs).
//
// The page's data arrives from the Server Component (./load.ts -> ./model.ts); what lives here
// is what the operator is doing with it: the selection (a job, a project), the zoom, which
// lanes are opened past their +N, and where the view is centred. Selection is in the URL
// (`?project=&job=&zoom=`), written with history.replaceState, which Next's router observes
// without a server round trip - a click must not re-read eleven v1 stores.
//
// THE ACTS (Phase 4, L28): a produce job selected here can be paused or resumed (P), retried
// (T, under an optional raised ceiling), moved earlier or later in its lane (`[` `]`), re-routed
// (O focuses the alternatives; choosing one opens its RECEIPT), and a held lane acknowledged (A).
// Each is a Server Action over the produce port; its outcome is the toast, and the page re-reads.
// v1's live work stays read-only here - its writer is v1 until its producer migrates. N composes.
// The verbs bound: the `projects` rows (R runs, P plan, J/K and ⇧↓/⇧↑ jobs, ↑/↓ projects, Esc,
// N, T, [ ]) and the `projects.runs` rows that shadow or add to them (P pause, O, A).

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { RerouteOption } from "@gt/domain/produce";

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

import { useShell } from "../../../_shell/Providers.tsx";
import type { ProducePort } from "../../_port/contract.ts";
import { CompositionList } from "../../_plan/CompositionList.tsx";
import { useCompose } from "../../_plan/compose.tsx";
import { outcomeOf, useReceipt } from "../../_plan/receipt.tsx";
import type { RunsData } from "./load.ts";
import { canMove, canPause, canRetry } from "./Acts.tsx";
import { Inspector, type InspectorActs } from "./Inspector.tsx";
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

const runsHref = (id: string): string => `/projects/runs?project=${encodeURIComponent(id)}`;

export function Runs({ data, initial, port }: { readonly data: RunsData; readonly initial: Selection; readonly port: ProducePort }) {
  const m = data.model;
  const router = useRouter();
  const { toast } = useShell();
  const flow = useReceipt(m.now);
  const compose = useCompose(port, data.choices);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const [retryCeiling, setRetryCeiling] = useState("");
  const [alts, setAlts] = useState<{ readonly job: string; readonly options: readonly RerouteOption[] | null; readonly error?: string } | null>(null);
  const altsRef = useRef<HTMLDivElement | null>(null);
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
  const rows = useMemo(() => rowsOf(m, data.holds), [m, data.holds]);
  const bars = useMemo(() => barsOf(m, blocked), [m, blocked]);
  const pins = useMemo(() => pinsOf(m), [m]);
  const projects = useMemo(() => projectsOf(m), [m]);
  const produceIds = new Set(data.projects.projects.map((p) => p.id));
  const firstPlan = data.projects.projects[0];
  const planTab = sel.project !== null && produceIds.has(sel.project) ? `/projects/${encodeURIComponent(sel.project)}` : firstPlan === undefined ? "/projects" : `/projects/${encodeURIComponent(firstPlan.id)}`;
  const title = sel.project === null ? null : (data.projects.projects.find((p) => p.id === sel.project)?.title ?? sel.project);
  const totals = totalsOf(m);
  const money = heldMoney(m);
  // A job that left the page's data (it finished and aged out, or its source failed) is not
  // selected any more; the URL keeps the id until the operator moves on.
  const job = sel.job !== null && bars.some((b) => b.id === sel.job) ? sel.job : null;
  const act = job === null ? undefined : m.jobs.find((j) => j.key === job)?.act;

  // The selected job's alternatives, read when it is selected (latest wins: a fast J/K walk must
  // not draw one job's options under another).
  const actId = act?.reroutable === true ? act.id : null;
  useEffect(() => {
    if (actId === null) return;
    let live = true;
    void port.rerouteOptions({ jobId: actId }).then((r) => {
      if (live) setAlts(r.ok ? { job: actId, options: r.value } : { job: actId, options: null, error: r.error.error });
    });
    return () => {
      live = false;
    };
  }, [port, actId, m.now]);

  type Answer = { readonly ok: true; readonly value: { readonly note: string; readonly jobId: string } } | { readonly ok: false; readonly error: { readonly error: string } };
  /** One act at a time, disarmed synchronously; its words on the toast, then a re-read. */
  const run = (call: () => Promise<Answer>): void | false => {
    if (inflight.current) return false;
    inflight.current = true;
    setBusy(true);
    void call()
      .then((r) => {
        if (r.ok) toast(r.value.note, { href: `/ledger?q=${encodeURIComponent(r.value.jobId)}`, subject: r.value.jobId });
        else toast(r.error.error);
        if (r.ok) router.refresh();
      })
      .finally(() => {
        inflight.current = false;
        setBusy(false);
      });
  };
  const reroute = (key: string): void => {
    if (act === undefined) return;
    const jobId = act.id;
    void flow.open({
      trail: [{ label: "Runs", href: "/projects/runs" }],
      here: `${act.title} · re-route`,
      read: async () => {
        const r = await port.reroute({ jobId, option: key });
        if (!r.ok) return r;
        if (r.value.kind === "receipt") return { ok: true, value: r.value.receipt };
        if (r.value.kind === "stale") return { ok: true, value: r.value.fresh };
        return { ok: false, error: { error: "re-routed without a receipt", code: "internal" } };
      },
      confirm: async (token, ceilingUsd) =>
        outcomeOf(await port.reroute({ jobId, option: key, token, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }), (v) =>
          v.kind === "stale" ? { kind: "stale", fresh: v.fresh } : v.kind === "receipt" ? { kind: "stale", fresh: v.receipt } : { kind: "done", note: v.act.note, ledger: { href: `/ledger?q=${encodeURIComponent(v.act.jobId)}`, subject: v.act.jobId } },
        ),
      done: (note, ledger) => {
        toast(note, ledger);
        router.refresh();
      },
      failed: (msg) => toast(msg),
    });
  };
  const withAct = (f: (id: string) => Promise<Answer>): void => {
    if (act !== undefined) run(() => f(act.id));
  };
  const acts: InspectorActs = {
    busy,
    onPause: () => withAct((jobId) => port.pauseJob({ jobId })),
    onResume: () => withAct((jobId) => port.resumeJob({ jobId })),
    onRetry: (ceilingUsd) => withAct((jobId) => port.retryJob({ jobId, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) })),
    onMove: (dir) => withAct((jobId) => port.moveJob({ jobId, dir })),
    retryCeiling,
    onRetryCeiling: setRetryCeiling,
    options: alts !== null && alts.job === actId ? alts.options : null,
    ...(alts !== null && alts.job === actId && alts.error !== undefined ? { optionsError: alts.error } : {}),
    reading: flow.reading ? "reading" : null,
    onReroute: reroute,
    altsRef,
    holds: data.holds,
    onAck: (lane) => {
      run(() => port.ackLane({ lane }));
    },
  };
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

  const facts = [...(job === null ? [] : ["job"]), ...(act?.reroutable === true ? ["reroutable"] : []), ...(data.holds.length > 0 ? ["hold"] : [])];
  // Two scopes: the `projects` rows Plan shares, then the `projects.runs` rows only Runs has. The
  // dispatcher runs a row's handler from the scope of the row's own mode, and the page's mode is
  // the scope mounted last - `projects.runs`, so its P shadows Plan's P while a job is selected.
  useKeys(
    "projects",
    {
      runs: () => setCentre({ key: `now:${Date.now()}`, at: "now" }),
      plan: () => router.push(planTab),
      // J and ⇧↓ walk forward, K and ⇧↑ back: keys ["J","K"] then alias ["⇧↓","⇧↑"] (bindings.ts).
      job: ({ index }) => walkJob(index % 2 === 0 ? 1 : -1),
      project: ({ cap }) => (projects.length === 0 ? false : walkProject(cap === "↓" ? 1 : -1)),
      deselect: () => select(null),
      compose: () => compose.open(),
      retry: () => (act === undefined || !canRetry(act) ? false : acts.onRetry(undefined)),
      move: ({ index }) => (act === undefined || !canMove(act) ? false : acts.onMove(index === 0 ? "earlier" : "later")),
    },
    { facts },
  );
  useKeys(
    "projects.runs",
    {
      pause: () => {
        if (act === undefined) return false;
        if (act.state === "paused") return acts.onResume();
        if (!canPause(act)) return false;
        acts.onPause();
      },
      reroute: () => {
        const first = altsRef.current?.querySelector<HTMLButtonElement>("button");
        if (first === null || first === undefined) return false;
        first.focus();
      },
      "ack-lane": () => {
        const h = act === undefined ? data.holds[0] : data.holds.find((x) => x.lane === act.lane);
        if (h === undefined) return false;
        acts.onAck(h.lane);
      },
    },
    { facts },
  );

  const zoomTo = (z: Zoom): void => {
    setSel((cur) => ({ ...cur, zoom: z }));
    setCentre({ key: `zoom:${z}:${Date.now()}`, at: job === null ? "now" : (bars.find((b) => b.id === job)?.s ?? "now") });
  };

  const total = bars.length + pins.length;
  const name = `Runs day-line: ${rows.length} rows, ${m.jobs.length} jobs, ${m.weir.length} weir piles, ${pins.length} slots`;

  return (
    <div className={s.proj}>
      <CompositionList
        list={data.projects}
        current={sel.project}
        nowMs={m.now}
        onCompose={compose.open}
        floorRuns={m.jobs.filter((j) => j.projectId === undefined && j.from !== "ledger").length}
        hrefOf={runsHref}
        others={projects.filter((p) => !produceIds.has(p.id)).map((p) => ({ id: p.id, meta: `${p.jobs} jobs · ${p.slots} slots` }))}
      />
      <section className={s.pmain} aria-label="Runs">
        <div className={s.ptop}>
          <div className={s.row}>
            <div className={s.crumbs}>
              <Crumbs trail={[{ label: "Projects", href: "/projects/runs" }]} here={title ?? "All lanes"} />
            </div>
            <TabRail
              label="view"
              mode="projects"
              current="runs"
              tabs={[
                { id: "plan", label: "Plan", href: planTab, verb: "plan" },
                { id: "runs", label: "Runs", href: "/projects/runs", verb: "runs" },
              ]}
            />
          </div>
          <div className={s.row}>
            <h1 className={s.title}>{title ?? "Runs · every resource"}</h1>
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
              {data.produce === "fixture" && <Chip label="produce · fixture" casing="lower" />}
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
          <Inspector acts={acts} projectTitle={title} m={m} job={job} project={sel.project} deps={deps} blocked={blocked} onSelect={(id) => select(id, true)} />
        </div>
      </section>
      {compose.dialog}
      {flow.sheet}
    </div>
  );
}
