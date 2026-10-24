"use client";

// PLAN (prototype projects.html `#plan`, projects.js `renderTop`, `renderPlan`, `PlanRow`,
// `ResourceSummary`): the composition list on the left; on the right the crumbs, the Plan · Runs
// rail, the title (a field while the plan is a draft), its sub-line and totals, the plan per
// resource, and the per-resource summary that ends in Launch.
//
// Writes go through the port with the plan's revision (`setPart`, `rename`, `discard`); each
// answers the plan as it now reads, which replaces this page's copy, so the estimate, the
// schedule and the summary move together with the choice that moved them. A write that lost a
// race (`conflict`) re-reads the page rather than guessing. Units are typed freely and sent
// coalesced: one write in flight per page, the newest units waiting behind it.
//
// Launch is a receipt and a confirm (../_plan/receipt.tsx), never the press itself.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import type { PartPatch, PlanView, ProjectList } from "@gt/domain/produce";
import { isEditorKind } from "@gt/domain/partView";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Crumbs } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { LedgerLink } from "@gt/ui/components/ledgerlink/LedgerLink.tsx";
import { PlanTable } from "@gt/ui/components/produce/PlanTable.tsx";
import { costWords, fmtDur, fmtUsd, isWork, when } from "@gt/ui/components/produce/produce.ts";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { StatusPill } from "@gt/ui/components/status/StatusPill.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { FIELD_ATTR } from "@gt/ui/keymap/target";

import { settled } from "../../audio/_hunt/settled.ts";
import { useShell } from "../../_shell/Providers.tsx";
import type { ComposeChoices, ProducePort } from "../_port/contract.ts";
import { CompositionList, ordered } from "./CompositionList.tsx";
import { useCompose } from "./compose.tsx";
import { PlanSummary } from "./PlanSummary.tsx";
import { outcomeOf, useReceipt } from "./receipt.tsx";
import s from "./Plan.module.css";

export type PlanProps = {
  readonly view: PlanView;
  readonly list: ProjectList;
  readonly choices: ComposeChoices | null;
  readonly port: ProducePort;
  readonly nowMs: number;
  readonly floorRuns: number;
  /** Arrived straight from Compose: the title field takes focus (projects.js `composeRecipe`). */
  readonly composed: boolean;
  /** Arrived asking to compose (`/projects?compose=1`): the dialog opens over the plan. */
  readonly composing?: boolean;
};

const runtime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function Plan({ view: first, list, choices, port, nowMs, floorRuns, composed, composing = false }: PlanProps) {
  const router = useRouter();
  const { toast } = useShell();
  const [view, setView] = useState(first);
  const [seen, setSeen] = useState(first);
  if (seen !== first) {
    // The server read again (router.refresh): its copy is newer than ours.
    setSeen(first);
    setView(first);
  }
  const [title, setTitle] = useState(first.project.title);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const flow = useReceipt(nowMs);
  const compose = useCompose(port, choices, composing);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const p = view.project;
  const draft = !p.launched;

  // Only on arrival from Compose: a later render must not steal the caret back.
  useEffect(() => {
    if (composed && draft) titleRef.current?.select();
  }, [composed, draft]);

  // One write in flight; the newest patch per part waits behind it.
  const queue = useRef(new Map<string, PartPatch>());
  const busy = useRef(false);
  const rev = useRef(p.rev);
  useEffect(() => {
    rev.current = p.rev;
  }, [p.rev]);
  const drain = async (): Promise<void> => {
    if (busy.current) return;
    const next = queue.current.entries().next();
    if (next.done === true) return;
    const [partId, patch] = next.value;
    queue.current.delete(partId);
    busy.current = true;
    const r = await settled(port.setPart({ id: p.id, rev: rev.current, partId, patch }));
    busy.current = false;
    if (r.ok) {
      rev.current = r.value.project.rev;
      setView(r.value);
      setErr(null);
      void drain();
    } else {
      setErr(r.error.error);
      if (r.error.code === "conflict") router.refresh();
    }
  };
  const patch = (partId: string, pt: PartPatch): void => {
    queue.current.set(partId, { ...queue.current.get(partId), ...pt });
    void drain();
  };

  const commitTitle = (): void => {
    const t = title.trim();
    if (!draft || t === "" || t === p.title) return;
    void settled(port.rename({ id: p.id, rev: p.rev, title: t })).then((r) => {
      if (r.ok) {
        setView(r.value);
        router.refresh();
      } else setErr(r.error.error);
    });
  };

  const launch = (): void | false => {
    if (!draft || flow.reading) return false;
    void flow.open({
      trail: [{ label: "Projects", href: "/projects" }],
      here: `${p.title} · launch plan`,
      read: (mode) => port.planReceipt({ id: p.id, mode }),
      armable: true,
      confirm: async (token, ceilingUsd, mode) =>
        outcomeOf(await port.launchPlan({ id: p.id, rev: rev.current, token, mode, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }), (v) => {
          if (v.kind !== "stale") return { kind: "done", note: `${p.title} · launched · ${v.jobIds.length} jobs`, ledger: { href: `/ledger?q=${encodeURIComponent(p.id)}`, subject: p.title } };
          // The fresh receipt was read at the plan's current revision: the next confirm names it.
          if (v.fresh.subject.kind === "project") rev.current = v.fresh.subject.rev;
          return { kind: "stale", fresh: v.fresh };
        }),
      done: (note, ledger) => {
        toast(note, ledger);
        router.push(`/projects/runs?project=${encodeURIComponent(p.id)}`);
      },
      failed: (m) => toast(m),
    });
  };

  const discard = (): void => {
    void settled(port.discard({ id: p.id, rev: p.rev })).then((r) => {
      if (!r.ok) return setErr(r.error.error);
      toast(`${p.title} · discarded`, { href: `/ledger?q=${encodeURIComponent(p.id)}`, subject: p.title });
      const next = ordered(list).find((x) => x.id !== p.id);
      router.push(next === undefined ? "/projects/runs" : `/projects/${encodeURIComponent(next.id)}`);
    });
  };

  const rows = ordered(list);
  const work = view.parts.filter(isWork);
  // THE PLAN ROW LINK (Phase 4 wave C, L38): a part with an editor opens it - the row on a click
  // that is not on one of its own controls, the selected row on E. PlanRow is L28's @gt/ui
  // component and draws no anchor (asked: an `href` per row there retires this delegation).
  const editorHref = (partId: string): string | null => {
    const part = view.parts.find((x) => x.id === partId);
    if (part === undefined || !isEditorKind(part.kind)) return null;
    return `/projects/${encodeURIComponent(p.id)}/${encodeURIComponent(part.id.slice(p.id.length + 1))}`;
  };
  const openRow = (e: MouseEvent<HTMLDivElement>): void => {
    if (!(e.target instanceof Element) || e.target.closest("select,input,button,a") !== null) return;
    const id = e.target.closest("tr[data-part]")?.getAttribute("data-part");
    const to = id === null || id === undefined ? null : editorHref(id);
    if (to !== null) router.push(to);
  };
  const selHref = sel === null ? null : editorHref(sel);
  const walk = (dir: 1 | -1): void => {
    const ids = work.map((x) => x.id);
    const i = sel === null ? (dir === 1 ? -1 : ids.length) : ids.indexOf(sel);
    setSel(ids[(i + dir + ids.length) % ids.length] ?? null);
  };
  useKeys(
    "projects",
    {
      compose: () => compose.open(),
      runs: () => router.push(`/projects/runs?project=${encodeURIComponent(p.id)}`),
      plan: () => false,
      launch: () => launch(),
      job: ({ index }) => (work.length === 0 ? false : walk(index % 2 === 0 ? 1 : -1)),
      project: ({ cap }) => {
        const i = rows.findIndex((x) => x.id === p.id);
        const next = rows[i + (cap === "↓" ? 1 : -1)];
        if (next === undefined) return false;
        router.push(`/projects/${encodeURIComponent(next.id)}`);
      },
      deselect: () => setSel(null),
      "open-part": () => (selHref === null ? false : router.push(selHref)),
      rename: () => {
        commitTitle();
        titleRef.current?.blur();
      },
      "leave-field": () => {
        setTitle(p.title);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      },
    },
    { facts: [...(draft ? ["unlaunched"] : []), ...(sel === null ? [] : ["job"]), ...(selHref === null ? [] : ["editor"])] },
  );

  const t = view.totals;
  return (
    <div className={s.proj}>
      <CompositionList list={list} current={p.id} nowMs={nowMs} onCompose={compose.open} floorRuns={floorRuns} />
      <section className={s.pmain} aria-label="Plan">
        <div className={s.ptop}>
          <div className={s.row}>
            <div className={s.crumbs}>
              <Crumbs trail={[{ label: "Projects", href: "/projects" }]} here={p.title} />
            </div>
            <Chip label={p.recipeLabel} casing="lower" />
            <TabRail
              label="view"
              mode="projects"
              current="plan"
              tabs={[
                { id: "plan", label: "Plan", href: `/projects/${encodeURIComponent(p.id)}`, verb: "plan" },
                { id: "runs", label: "Runs", href: `/projects/runs?project=${encodeURIComponent(p.id)}`, verb: "runs" },
              ]}
            />
          </div>
          <div className={s.row}>
            <h1 className={s.title}>
              {draft ? (
                <input
                  ref={titleRef}
                  className={s.titleIn}
                  aria-label="title"
                  value={title}
                  onChange={(e) => setTitle(e.currentTarget.value)}
                  onBlur={commitTitle}
                  {...{ [FIELD_ATTR]: "title" }}
                />
              ) : (
                p.title
              )}
            </h1>
            <span className={s.sub}>{[p.runtimeS === undefined ? null : runtime(p.runtimeS), p.styleId ?? p.topic ?? null].filter((x) => x !== null).join(" · ")}</span>
            <div className={s.totals}>
              {draft ? <Chip label="plan" casing="lower" /> : <StatusPill machine="project" state={p.state} />}
              <Chip label={fmtDur(t.seconds)} value="work" />
              <Chip label="est" value={t.usdRange !== undefined ? costWords(t) : fmtUsd(t.usd)} />
              <SourceTag kind={t.src} />
              <Chip label="eta" value={t.etaAt === null ? "—" : when(t.etaAt, nowMs)} tone={p.launched ? "cyan" : "neutral"} />
              <LedgerLink href={`/ledger?q=${encodeURIComponent(p.id)}`} subject={p.title} />
            </div>
          </div>
        </div>
        <div className={s.plan} data-component="PlanBreakdown">
          <div className={s.planMain} onClick={openRow}>
            {err !== null && <ErrorLine message={err} live />}
            <PlanTable parts={view.parts} selectedId={sel} draft={draft} nowMs={nowMs} onModel={(id, option) => patch(id, { option })} onUnits={(id, units) => patch(id, { units })} />
          </div>
          <PlanSummary view={view} nowMs={nowMs} busy={flow.reading} onLaunch={() => void launch()} onDiscard={discard} />
        </div>
      </section>
      {compose.dialog}
      {flow.sheet}
    </div>
  );
}
