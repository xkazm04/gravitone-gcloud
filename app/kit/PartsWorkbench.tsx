"use client";

// SPECIMENS for the worked-rows parts: Table, Pager and useWindow, Steps, useRoving,
// and the account controls. Static fixtures only, the repo's own pictures; the
// account controls are the real ones (they read the jobs store and the auth
// context the /kit page already sits under), seeded open where a state needs showing.

import { useMemo, useState, type ReactNode } from "react";

import {
  Bar,
  Button,
  Chip,
  Crumbs,
  NotificationBell,
  Pager,
  ScoreChip,
  StatusGlyph,
  StatusPill,
  Steps,
  STUDIO_STEPS,
  Table,
  Tile,
  UserMenu,
  useRoving,
  useWindow,
  type StatusKind,
  type StepDef,
  type StepState,
  type TableColumn,
} from "@/components/kit";
import { Mark } from "@/components/kit/brand";

const IMG = ["/presets/blueprint.jpg", "/presets/chalk-argument.jpg", "/presets/data-neon.jpg", "/presets/newsprint-cutout.jpg", "/presets/paper-relief.jpg", "/presets/signal-ledger.jpg"];

/** One named state of a specimen (the sheet's own `S`, kept local so this file stands alone). */
function S({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <div className="kr-state">
      {name && <span className="k-caps">{name}</span>}
      {children}
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  title: string;
  phase: "research" | "script" | "frames" | "score" | "cut";
  kept: number | null;
  updated: number;
  spend: number | null;
}

const PHASE_KIND: Record<ProjectRow["phase"], StatusKind> = { research: "ready", script: "inc", frames: "live", score: "gate", cut: "committed" };

const PROJECTS: ProjectRow[] = [
  { id: "p-harbour", title: "Glass Harbor", phase: "frames", kept: 14, updated: Date.UTC(2026, 8, 27), spend: 12.4 },
  { id: "p-lantern", title: "The Lantern Year", phase: "cut", kept: 36, updated: Date.UTC(2026, 8, 19), spend: 48.1 },
  { id: "p-salt", title: "Salt Road", phase: "research", kept: null, updated: Date.UTC(2026, 8, 28), spend: null },
  { id: "p-tide", title: "Tide Tables", phase: "score", kept: 22, updated: Date.UTC(2026, 8, 3), spend: 31.75 },
  { id: "p-orchard", title: "Orchard After Rain", phase: "script", kept: 3, updated: Date.UTC(2026, 7, 30), spend: 4.2 },
  { id: "p-relay", title: "Relay", phase: "frames", kept: 9, updated: Date.UTC(2026, 8, 11), spend: 12.4 },
];

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

const PROJECT_COLUMNS: readonly TableColumn<ProjectRow>[] = [
  { id: "title", head: "Project", cell: (r) => <b>{r.title}</b>, sortBy: (r) => r.title },
  { id: "phase", head: "Step", cell: (r) => <StatusPill kind={PHASE_KIND[r.phase]}>{r.phase}</StatusPill>, sortBy: (r) => r.phase },
  { id: "kept", head: "Kept", cell: (r) => (r.kept === null ? <Chip>none yet</Chip> : r.kept), sortBy: (r) => r.kept, num: true },
  { id: "updated", head: "Updated", cell: (r) => day(r.updated), sortBy: (r) => r.updated, num: true },
  { id: "spend", head: "Spend", cell: (r) => (r.spend === null ? "n/a" : `$${r.spend.toFixed(2)}`), sortBy: (r) => r.spend, num: true },
  { id: "id", head: "Id", cell: (r) => <code>{r.id}</code> },
];

export function TableDemo() {
  const [opened, setOpened] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const long = useMemo<ProjectRow[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        ...PROJECTS[i % PROJECTS.length],
        id: `p-${i}-${PROJECTS[i % PROJECTS.length].id.slice(2)}`,
        kept: (i * 7) % 40,
        updated: Date.UTC(2026, 8, 28) - i * 86_400_000 * 2,
      })),
    [],
  );
  return (
    <>
      <S name="sorted by updated, newest first; press a head to re-sort">
        <Table label="Specimen projects" columns={PROJECT_COLUMNS} rows={PROJECTS} defaultSort={{ column: "updated", dir: "desc" }} />
      </S>
      <S name="sticky head over a scrolling body">
        <Table label="Specimen projects, scrolling" columns={PROJECT_COLUMNS} rows={long} defaultSort={{ column: "kept", dir: "desc" }} maxHeight="280px" />
      </S>
      <S name="rows that open">
        <Table label="Specimen projects, openable" columns={PROJECT_COLUMNS.slice(0, 4)} rows={PROJECTS.slice(0, 3)} onOpenRow={(r) => setOpened(r.title)} />
        {opened && <span className="kr-out">opened <b>{opened}</b></span>}
      </S>
      <S name="a row that expands, one at a time">
        <Table
          label="Specimen projects, expandable"
          columns={PROJECT_COLUMNS.slice(0, 4)}
          rows={PROJECTS.slice(0, 3)}
          expandedId={expanded ?? undefined}
          onExpand={setExpanded}
          renderExpansion={(r) => <span className="kr-out">expansion for <b>{r.title}</b></span>}
        />
      </S>
      <S name="empty">
        <Table label="Specimen, no projects" columns={PROJECT_COLUMNS.slice(0, 3)} rows={[]} empty="no projects yet" />
      </S>
    </>
  );
}

// ── Pager, useWindow ────────────────────────────────────────────────────────

const ASSETS: AssetRow[] = Array.from({ length: 46 }, (_, i) => ({
  id: `a${i}`,
  title: `asset-${String(412 - i).padStart(4, "0")}`,
  kind: (["ready", "committed", "keep", "queued"] as StatusKind[])[i % 4],
  meta: `${(i * 3) % 36 + 1} · ${["blueprint", "paper relief", "data neon"][i % 3]}`,
}));

interface AssetRow {
  id: string;
  title: string;
  kind: StatusKind;
  meta: string;
}

const ASSET_COLUMNS: readonly TableColumn<AssetRow>[] = [
  { id: "mark", head: "State", cell: (a) => <StatusGlyph kind={a.kind} /> },
  { id: "title", head: "Asset", cell: (a) => <b>{a.title}</b> },
  { id: "meta", head: "Frames · style", cell: (a) => a.meta },
];

export function PagerDemo() {
  const w = useWindow<AssetRow>(ASSETS, { size: 8, step: 8 });
  const auto = useWindow<AssetRow>(ASSETS, { size: 6, step: 6 });
  return (
    <>
      <S name="windowed, press +8 or all">
        <Table label="Specimen assets" columns={ASSET_COLUMNS} rows={w.visible} />
        <Pager shown={w.shown} total={w.total} onMore={w.more} onAll={w.all} step={8} noun="assets" />
      </S>
      <S name="halfway">
        <Pager shown={23} total={46} onMore={() => {}} onAll={() => {}} step={8} noun="assets" />
      </S>
      <S name="everything shown">
        <Pager shown={46} total={46} onMore={() => {}} noun="assets" />
      </S>
      <S name="auto: scrolling the rule into view widens the window">
        <div className="kr-frame kr-frame--pad" data-testid="pager-auto-scroller" style={{ maxHeight: 260, overflowY: "auto" }}>
          <Table label="Specimen assets, scrolling" columns={ASSET_COLUMNS} rows={auto.visible} />
          <Pager shown={auto.shown} total={auto.total} onMore={auto.more} step={6} noun="assets" auto />
        </div>
      </S>
    </>
  );
}

export function WindowDemo() {
  const w = useWindow(ASSETS, { size: 5, step: 10 });
  return (
    <div className="kr-out">
      <div>useWindow(46 items, size 5, step 10)</div>
      <div>shown <b>{w.shown}</b> · remaining <b>{w.remaining}</b> · total <b>{w.total}</b></div>
      <div className="kr-row" style={{ marginTop: 8 }}>
        <Button variant="ghost" size="sm" onClick={w.more}>more()</Button>
        <Button variant="ghost" size="sm" onClick={w.all}>all()</Button>
        <Button variant="ghost" size="sm" onClick={w.reset}>reset()</Button>
      </div>
    </div>
  );
}

// ── Steps ───────────────────────────────────────────────────────────────────

const RAIL: { state: StepState; tally?: StepDef["tally"] }[] = [
  { state: "done" },
  { state: "done" },
  { state: "review", tally: { value: 6, of: 9, label: "kept" } },
  { state: "working" },
  { state: "empty" },
];

export function StepsDemo() {
  const [cur, setCur] = useState("frames");
  const steps: StepDef[] = STUDIO_STEPS.map((s, i) => ({ ...s, ...RAIL[i], testId: `step-${s.id}` }));
  return (
    <>
      <S name="press a step">
        <Steps label="Specimen studio steps" steps={steps} current={cur} onSelect={setCur} />
      </S>
      <S name="a blocked step you are standing on; the last one not open yet">
        <Steps
          label="Specimen studio steps, blocked"
          current="score"
          steps={steps.map((s) => (s.id === "score" ? { ...s, state: "blocked" as const } : s.id === "cut" ? { ...s, locked: true } : s))}
        />
      </S>
      <S name="the five stars, every state">
        <div className="kr-row">
          {(["empty", "working", "review", "done", "blocked"] as StepState[]).map((st) => (
            <Steps key={st} label={`Specimen, ${st}`} current="none" steps={[{ id: st, label: st, state: st }]} />
          ))}
        </div>
      </S>
    </>
  );
}

export function StepsConstDemo() {
  return (
    <div className="kr-out">
      {STUDIO_STEPS.map((s, i) => (
        <div key={s.id}>
          {i + 1} · <b>{s.id}</b> · {s.label}
        </div>
      ))}
    </div>
  );
}

// ── useRoving ───────────────────────────────────────────────────────────────

export function RovingDemo() {
  const [opened, setOpened] = useState<number | null>(null);
  const r = useRoving({ count: 8, onActivate: setOpened });
  return (
    <>
      <div className="kr-row">
        <Button variant="ghost" size="sm">Tab lands here first</Button>
      </div>
      <div className="kr-tiles" role="group" aria-label="Specimen candidates, arrows move" {...r.containerProps}>
        {Array.from({ length: 8 }, (_, i) => (
          <Tile
            key={i}
            label={`Candidate ${i + 1}`}
            src={IMG[i % IMG.length]}
            ratio="16 / 10"
            rovingProps={r.itemProps(i)}
            onOpen={() => setOpened(i)}
            chips={<ScoreChip label="style" value={0.5 + ((i * 9) % 45) / 100} />}
          />
        ))}
      </div>
      <div className="kr-row">
        <Button variant="ghost" size="sm">Tab leaves here next</Button>
        <span className="kr-out">active <b>{r.active + 1}</b> of 8{opened !== null && <> · opened <b>{opened + 1}</b></>}</span>
      </div>
    </>
  );
}

// ── account ─────────────────────────────────────────────────────────────────

function Shell({ children, tall }: { children: ReactNode; tall?: boolean }) {
  return (
    <div className="kr-frame" style={tall ? { minHeight: 430 } : undefined}>
      <Bar
        brand={
          <span className="k-brand">
            <Mark size={30} construction={false} title="Gravitone" />
          </span>
        }
        crumbs={<Crumbs label="Specimen location" items={[{ label: "Projects", href: "/projects" }, { label: "Glass Harbor" }]} />}
        right={children}
      />
    </div>
  );
}

export function BellDemo() {
  return (
    <>
      <S name="in the bar, with the account menu">
        <Shell>
          <NotificationBell />
          <UserMenu />
        </Shell>
      </S>
      <S name="tray open">
        <Shell tall>
          <NotificationBell defaultOpen />
        </Shell>
      </S>
    </>
  );
}

export function UserDemo() {
  return (
    <S name="menu open">
      <Shell tall>
        <UserMenu defaultOpen />
      </Shell>
    </S>
  );
}
