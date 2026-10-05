"use client";

// THE SPECIMEN SHEET — every export of components/kit, drawn in each of its states
// from static fixtures. No fetching, no account data: the pictures are the repo's
// own public/presets and public/deck-art.
//
// The list of parts is catalog.ts. `DEMOS` is typed `Record<PartName, …>`, so a
// part added to the catalog does not typecheck until it has a specimen here, and
// the catalog probe fails until the catalog has every export of the kit.

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  Bar,
  Button,
  Card,
  CardGrid,
  CheckField,
  Callout,
  Field,
  NumberInput,
  Segmented,
  Select,
  TextArea,
  TextInput,
  ToastTray,
  useToast,
  Chip,
  Chips,
  Column,
  Command,
  ConfirmDialog,
  Count,
  Credit,
  Crumbs,
  DataTable,
  DefList,
  Doc,
  DocLede,
  DocSection,
  Dock,
  DockAction,
  Dropzone,
  Duo,
  Entry,
  ErrorBox,
  FieldRow,
  Figures,
  Final,
  FlagChip,
  Ghost,
  Hint,
  Kicker,
  KeyRow,
  Loading,
  LockNote,
  Magnitude,
  Matrix,
  Meridian,
  NumberField,
  OpenLink,
  PageHead,
  PanelBox,
  Plate,
  Prose,
  Report,
  RowHead,
  Rule,
  SaveState,
  Scene,
  ScoreChip,
  Sheet,
  SideItem,
  SideList,
  Sky,
  Stats,
  StackBar,
  StatusGlyph,
  StatusPill,
  StatusStrip,
  TabRail,
  Tag,
  Tally,
  TextField,
  Thumb,
  Tile,
  Verbatim,
  VerdictKeys,
  VerdictMark,
  WorldRoot,
  gradeOf,
  pct,
  type DuoArm,
  type FigureItem,
  type SaveKind,
  type StatusKind,
  type TileState,
  type VerdictValue,
} from "@/components/kit";
import { ASTERISM_PATH, ASTERISM_STARS, Mark, Wordmark } from "@/components/kit/brand";
import {
  BandTrack,
  CHIP_CLASS,
  HintPopover,
  Keycaps,
  PipRow,
  Provenance,
  StaleBadge,
  TALLY_TONE,
  UpstreamBreak,
  hintRootClass,
  useHint,
  type TallyTone,
} from "@/components/ui/signal";

import { KIT_GROUPS, PART_COUNT, type PartName } from "./catalog";
import { BellDemo, PagerDemo, RovingDemo, StepsConstDemo, StepsDemo, TableDemo, UserDemo, WindowDemo } from "./PartsWorkbench";
import {
  ClockDemo,
  ContextMenuDemo,
  DeckCardDemo,
  DeckDemo,
  DeckStageDemo,
  FolderTreeDemo,
  LayerListDemo,
  PlayerDemo,
  StageRailDemo,
  TimelineDemo,
  TransportDemo,
  WaveformDemo,
} from "./GrowG3Demos";

const IMG = {
  blueprint: "/presets/blueprint.jpg",
  chalk: "/presets/chalk-argument.jpg",
  neon: "/presets/data-neon.jpg",
  news: "/presets/newsprint-cutout.jpg",
  paper: "/presets/paper-relief.jpg",
  ledger: "/presets/signal-ledger.jpg",
};
const noop = () => {};

/** A static public picture at the width of its container. */
function Pic({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={640} height={360} unoptimized style={{ width: "100%", height: "auto", display: "block" }} />;
}

/** One named state of a part. */
function S({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <div className="kr-state">
      {name && <span className="k-caps">{name}</span>}
      {children}
    </div>
  );
}

function Spec({ name, api, wide, children }: { name: string; api: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`kr-spec${wide ? " kr-spec--wide" : ""}`} aria-label={name} data-part={name}>
      <header>
        <code>{name}</code>
        <span className="kr-api">{api}</span>
      </header>
      <div className="kr-spec__body">{children}</div>
    </section>
  );
}

// ── stateful specimens ──────────────────────────────────────────────────────

function TabsDemo() {
  const [tab, setTab] = useState("cull");
  return (
    <div className="kr-frame">
      <TabRail
        label="specimen modules"
        active={tab}
        onSelect={setTab}
        tabs={[
          { id: "cull", label: "Cull", tally: { value: 4, tone: "amber" } },
          { id: "extract", label: "Extract", tally: { value: 2 } },
          { id: "styles", label: "Styles", tally: { value: 13 } },
          { id: "dojo", label: "Dojo", tally: { value: 1, of: 3, tone: "emerald" } },
        ]}
      />
    </div>
  );
}

function VerdictDemo() {
  const [tile, setTile] = useState<VerdictValue | null>(null);
  const [row, setRow] = useState<VerdictValue | null>("keep");
  const [card, setCard] = useState<VerdictValue | null>("reject");
  return (
    <>
      <S name="tile">
        <VerdictKeys variant="tile" value={tile} onVerdict={setTile} />
      </S>
      <S name="row">
        <VerdictKeys variant="row" value={row} onVerdict={setRow} subject="the whole Blueprint row" />
      </S>
      <S name="card, decided (clear offered)">
        <VerdictKeys variant="card" value={card} onVerdict={setCard} clear />
      </S>
      <S name="card, approve wording">
        <VerdictKeys variant="card" value={null} onVerdict={noop} keepWord="Approve" toggle />
      </S>
    </>
  );
}

function PickTile() {
  const [v, setV] = useState<VerdictValue | null>(null);
  return (
    <Tile
      label="Blueprint, words only, seed 3"
      src={IMG.blueprint}
      ratio="16 / 10"
      verdict={v}
      chips={<ScoreChip label="style" value={0.84} />}
      actions={<VerdictKeys variant="tile" value={v} onVerdict={setV} />}
    />
  );
}

function TilesDemo() {
  const states: { name: string; state?: TileState; verdict?: VerdictValue; focused?: boolean; detail?: string; step?: number }[] = [
    { name: "queued", state: "queued" },
    { name: "generating", state: "generating", detail: "step 12/28", step: 0.43 },
    { name: "failed", state: "failed", detail: "flux-dev — CUDA out of memory" },
    { name: "deleted", state: "deleted", detail: "file gone, record stays" },
  ];
  return (
    <div className="kr-tiles">
      <S name="undecided, pick it">
        <PickTile />
      </S>
      <S name="kept">
        <Tile label="Paper Relief, seed 1" src={IMG.paper} ratio="16 / 10" verdict="keep" chips={<ScoreChip label="style" value={0.91} />} />
      </S>
      <S name="rejected">
        <Tile label="Data Neon, seed 2" src={IMG.neon} ratio="16 / 10" verdict="reject" chips={<ScoreChip label="style" value={0.31} />} />
      </S>
      <S name="focused">
        <Tile label="Signal Ledger, seed 4" src={IMG.ledger} ratio="16 / 10" focused chips={<ScoreChip label="style" value={0.66} />} />
      </S>
      <S name="flag">
        <Tile label="Newsprint Cutout, source" src={IMG.news} ratio="16 / 10" flag={<FlagChip kind="text" />} />
      </S>
      {states.map((s) => (
        <S key={s.name} name={s.name}>
          <Tile label={`Chalk Argument, ${s.name}`} ratio="16 / 10" state={s.state} detail={s.detail} step={s.step} />
        </S>
      ))}
    </div>
  );
}

function SideListDemo() {
  const [cur, setCur] = useState("r2");
  const [fam, setFam] = useState<string | null>("Ink");
  const runs: { id: string; title: string; kind: StatusKind; meta: string }[] = [
    { id: "r1", title: "run-0412", kind: "live", meta: "14/36 · 3 styles" },
    { id: "r2", title: "run-0411", kind: "ready", meta: "36/36 · 6 styles" },
    { id: "r3", title: "run-0410", kind: "failed", meta: "flux-dev — CUDA out of memory" },
    { id: "r4", title: "run-0409", kind: "committed", meta: "9 deleted · 3 kept" },
  ];
  return (
    <div className="kr-frame kr-frame--pad" style={{ maxWidth: 420 }}>
      <SideList label="specimen runs" heading="Runs" pinned={<SideItem title="+ new run" onSelect={noop} />}>
        {runs.map((r) => (
          <SideItem key={r.id} glyph={<StatusGlyph kind={r.kind} />} title={r.title} meta={r.meta} current={cur === r.id} onSelect={() => setCur(r.id)} />
        ))}
      </SideList>
      <div style={{ height: 16 }} />
      <SideList label="specimen families" heading="Families">
        {[["Ink", 5], ["Paper", 4], ["Signal", 4]].map(([f, n]) => (
          <SideItem key={f} title={f} count={n as number} pressed={fam === f} onSelect={() => setFam(fam === f ? null : (f as string))} />
        ))}
      </SideList>
    </div>
  );
}

function ConfirmDemo() {
  const [open, setOpen] = useState<null | "danger" | "failed" | "gold">(null);
  const rail = [
    { n: 3, tone: "emerald" as const, label: "kept" },
    { n: 7, tone: "rose" as const, label: "rejected" },
    { n: 2, tone: "rose" as const, label: "undecided", hatched: true },
  ];
  const close = () => setOpen(null);
  return (
    <>
      <div className="kr-row">
        <Button variant="danger" onClick={() => setOpen("danger")}>Open confirm</Button>
        <Button variant="ghost" onClick={() => setOpen("failed")}>Open, failed commit</Button>
        <Button variant="ghost" onClick={() => setOpen("gold")}>Open, write only</Button>
      </div>
      <ConfirmDialog
        open={open === "danger" || open === "failed"}
        onClose={close}
        onCancel={close}
        onConfirm={close}
        title="Commit run-0412"
        eyebrow={<Kicker>run-0412</Kicker>}
        railLabel="commit arithmetic"
        rail={rail}
        consequence="Deletes 9 files under pipeline/foundry/runs/run-0412 and writes verdicts.json."
        confirmLabel="Delete 9, keep 3"
      >
        {open === "failed" && <ErrorBox>EPERM: operation not permitted, unlink &apos;cell-s01-m3.png&apos;. Nothing was deleted.</ErrorBox>}
      </ConfirmDialog>
      <ConfirmDialog
        open={open === "gold"}
        onClose={close}
        onCancel={close}
        onConfirm={close}
        title="Approve 3 improvements"
        railLabel="approval arithmetic"
        rail={[{ n: 3, tone: "emerald", label: "approved" }, { n: 1, tone: "neutral", label: "untouched" }]}
        consequence="Writes 3 techniques to the ledger. The untouched one is left as it is."
        confirmLabel="Approve 3"
        tone="gold"
      />
    </>
  );
}

function SheetDemo() {
  const [sheet, setSheet] = useState<number | null>(null);
  return (
    <>
      <div className="kr-row">
        <Button variant="ghost" onClick={() => setSheet(1)}>Open sheet</Button>
      </div>
      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={["Blueprint", "Paper Relief", "Data Neon"][sheet ?? 0]}
        eyebrow={<Kicker>candidate {(sheet ?? 0) + 1} of 3</Kicker>}
        onPrev={sheet ? () => setSheet(sheet - 1) : undefined}
        onNext={sheet !== null && sheet < 2 ? () => setSheet(sheet + 1) : undefined}
        footer={<KeyRow label="Sheet keys" map={[{ keys: ["←", "→"], does: "step" }, { keys: ["Esc"], does: "close" }]} />}
      >
        <Plate>
          <Pic src={[IMG.blueprint, IMG.paper, IMG.neon][sheet ?? 0]} alt="" />
        </Plate>
      </Sheet>
    </>
  );
}

function TextDemo() {
  const f = useFields();
  return <TextField label="Style name" value={f.name} onChange={f.setName} placeholder="name" />;
}
function NumberDemo() {
  const f = useFields();
  return <NumberField label="Replicas" value={f.n} min={1} max={9} onChange={f.setN} hint="1–9" />;
}
function CheckDemo() {
  const f = useFields();
  return <CheckField label="Transfer onto a neutral scene" checked={f.c} onChange={f.setC} />;
}
function useFields() {
  const [name, setName] = useState("Paper Relief");
  const [n, setN] = useState(3);
  const [c, setC] = useState(true);
  return { name, setName, n, setN, c, setC };
}
function RowDemo() {
  const f = useFields();
  return (
    <FieldRow>
      <TextField label="Style name" value={f.name} onChange={f.setName} />
      <NumberField label="Replicas" value={f.n} min={1} max={9} onChange={f.setN} />
      <CheckField label="Transfer" checked={f.c} onChange={f.setC} />
    </FieldRow>
  );
}

function FieldDemo() {
  const [v, setV] = useState("Paper Relief");
  return (
    <div className="kr-fields">
      <S name="labelled, with a constraint">
        <Field label="Project name" htmlFor="kf-name" hint="Fixed at creation">
          <TextInput id="kf-name" value={v} onChange={(e) => setV(e.target.value)} />
        </Field>
      </S>
      <S name="empty, placeholder">
        <Field label="Working title" htmlFor="kf-empty">
          <TextInput id="kf-empty" value="" onChange={noop} placeholder="untitled" />
        </Field>
      </S>
      <S name="invalid">
        <Field label="Seeds" htmlFor="kf-bad" hint="1 to 9 per style">
          <TextInput id="kf-bad" value="12" onChange={noop} aria-invalid="true" />
        </Field>
      </S>
      <S name="disabled, dashed">
        <Field label="Engine" htmlFor="kf-dis">
          <TextInput id="kf-dis" value="flux-dev" onChange={noop} disabled />
        </Field>
      </S>
      <S name="group, no single input">
        <Field label="Visual style">
          <Button variant="ghost" size="sm">Choose</Button>
        </Field>
      </S>
    </div>
  );
}
function TextInputDemo() {
  const [v, setV] = useState("");
  return <TextInput aria-label="Search styles" value={v} onChange={(e) => setV(e.target.value)} placeholder="search styles" />;
}
function AreaDemo() {
  const [v, setV] = useState("A lighthouse keeper counts the ships that do not return.");
  return (
    <Field label="Logline" htmlFor="kf-area">
      <TextArea id="kf-area" value={v} onChange={(e) => setV(e.target.value)} rows={4} />
    </Field>
  );
}
function NumberInputDemo() {
  const [n, setN] = useState(300);
  return (
    <Field label="Duration" htmlFor="kf-dur">
      <NumberInput id="kf-dur" unit="sec" value={n} min={30} max={900} onChange={(e) => setN(Number(e.target.value))} />
    </Field>
  );
}
function SelectDemo() {
  const [v, setV] = useState("flux-dev");
  return (
    <div className="kr-fields">
      <S name="enabled">
        <Field label="Engine" htmlFor="kf-sel">
          <Select id="kf-sel" value={v} onChange={(e) => setV(e.target.value)}>
            <option value="flux-dev">flux-dev</option>
            <option value="flux-schnell">flux-schnell</option>
            <option value="sdxl">sdxl</option>
          </Select>
        </Field>
      </S>
      <S name="disabled, dashed">
        <Field label="Engine" htmlFor="kf-sel-d">
          <Select id="kf-sel-d" value="sdxl" onChange={noop} disabled>
            <option value="sdxl">sdxl</option>
          </Select>
        </Field>
      </S>
    </div>
  );
}
function SegmentedDemo() {
  const [v, setV] = useState("cinematic");
  return (
    <Segmented
      label="Aspect"
      value={v}
      onChange={setV}
      options={[
        { id: "cinematic", label: "2.39:1", note: "Anamorphic crop; 1920 x 803" },
        { id: "wide", label: "16:9" },
        { id: "tall", label: "9:16" },
      ]}
    />
  );
}
function ToastDemo() {
  const t = useToast();
  return (
    <>
      <div className="kr-row">
        <Button size="sm" variant="ghost" onClick={() => t.push({ kind: "ok", text: "Committed run-0412: kept 3, deleted 9" })}>Push ok</Button>
        <Button size="sm" variant="ghost" onClick={() => t.push({ kind: "info", text: "Extract started on 24 images" })}>Push info</Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => t.push({ kind: "failed", key: "kt-fail", text: "EPERM: operation not permitted, unlink 'cell-s01-m3.png'", action: <Button size="sm" variant="ghost">Retry</Button> })}
        >
          Push failure
        </Button>
      </div>
      <ToastTray inline toasts={t.toasts} onDismiss={t.dismiss} />
    </>
  );
}
const TOAST_FIXTURE = [
  { id: "a", kind: "ok", text: "Committed run-0412: kept 3, deleted 9" },
  { id: "b", kind: "info", text: "Extract started on 24 images" },
  { id: "c", kind: "failed", text: "Could not reach the imaging service: ECONNREFUSED 127.0.0.1:8188", action: <Button size="sm" variant="ghost">Retry</Button> },
] as const;

function DropDemo() {
  const [n, setN] = useState<number | null>(null);
  return (
    <>
      <Dropzone
        accept="image/*"
        label="Drop source images"
        constraints="PNG · JPEG · WebP · up to 60 · shrunk to 1280px before upload"
        onFiles={(files) => setN(files.length)}
      />
      {n !== null && <span className="kr-out">received <b>{n}</b> files</span>}
    </>
  );
}

function SaveDemo() {
  const kinds: SaveKind[] = ["idle", "saving", "saved", "error"];
  return (
    <>
      {kinds.map((k) => (
        <S key={k} name={k}>
          <SaveState state={k} />
        </S>
      ))}
      <S name="final">
        <SaveState state="idle" final />
      </S>
    </>
  );
}

function ArmPair(picked: 0 | 1 | null, gone = false): [DuoArm, DuoArm] {
  return [
    { src: gone ? undefined : IMG.chalk, alt: "baseline render", name: "baseline", picked: picked === 0 },
    { src: IMG.paper, alt: "challenger render", name: "challenger", picked: picked === 1 },
  ];
}

// ── the demos, one per catalog part ─────────────────────────────────────────

/** useHint + HintPopover + hintRootClass: the Hint disclosure hung on a trigger of the caller's own. */
function DisclosureDemo() {
  const d = useHint();
  return (
    <span {...d.rootProps} className={hintRootClass}>
      <button type="button" className="k-caps" {...d.triggerProps} onClick={d.toggle}>
        seed 3
      </button>
      <HintPopover d={d}>flux-dev · 36 candidates · 12 kept</HintPopover>
    </span>
  );
}

const TONES = Object.keys(TALLY_TONE) as TallyTone[];

const GLYPH_KINDS: StatusKind[] =["live", "ready", "inc", "failed", "committed", "gate", "keep", "reject", "undecided", "queued", "lock"];

const DEMOS: Record<PartName, () => ReactNode> = {
  WorldRoot: () => (
    <div className="kr-frame">
      <WorldRoot>
        <span className="k-caps">data-world=&quot;almanac&quot;</span>
      </WorldRoot>
    </div>
  ),
  Sky: () => (
    <div className="kr-frame kr-frame--sky">
      <Sky />
    </div>
  ),
  Bar: () => (
    <div className="kr-frame">
      <Bar
        brand={<span className="k-brand"><Mark size={30} construction={false} title="Gravitone" /></span>}
        crumbs={<Crumbs items={[{ label: "Foundry", href: "/foundry" }, { label: "run-0412" }]} />}
        nav={
          <>
            <Link href="/projects" aria-current="page">Projects</Link>
            <Link href="/library">Library</Link>
          </>
        }
        right={<Tally value={2} label="alerts" tone="amber" />}
      />
    </div>
  ),
  Crumbs: () => (
    <>
      <S name="three levels">
        <Crumbs label="Specimen location" items={[{ label: "Foundry", href: "/foundry" }, { label: "run-0412", onSelect: noop }, { label: "Blueprint · seed 3" }]} />
      </S>
      <S name="one level">
        <Crumbs label="Specimen location, one level" items={[{ label: "Kit" }]} />
      </S>
    </>
  ),
  PageHead: () => (
    <div className="kr-frame kr-frame--pad">
      <PageHead eyebrow="Foundry · Cull" title="Cull" figure={<Mark size={64} construction={false} title="Fornax" />} caption={<>Fornax <Tag>stylised</Tag></>} />
    </div>
  ),
  Tag: () => <Tag>stylised</Tag>,
  Kicker: () => <Kicker>run-0412 · candidate 7</Kicker>,
  TabRail: () => <TabsDemo />,
  Tally: () => (
    <div className="kr-row">
      <Tally value={12} />
      <Tally value={1} label="running" tone="amber" />
      <Tally value={12} of={36} label="kept" tone="emerald" />
      <Tally value={2} label="failed" tone="rose" />
      <Tally value={4} label="parked" hint="2 of 8 need a person" />
    </div>
  ),
  StackBar: () => (
    <StackBar
      label="commit arithmetic"
      segments={[
        { n: 3, tone: "emerald", label: "kept" },
        { n: 7, tone: "rose", label: "rejected" },
        { n: 2, tone: "rose", label: "undecided", hatched: true },
      ]}
    />
  ),
  StatusGlyph: () => (
    <div className="kr-row">
      {GLYPH_KINDS.map((k) => (
        <S key={k} name={k}>
          <StatusGlyph kind={k} size={28} />
        </S>
      ))}
    </div>
  ),
  StatusPill: () => (
    <div className="kr-row">
      <StatusPill kind="live">generating 14/36</StatusPill>
      <StatusPill kind="ready">ready to cull</StatusPill>
      <StatusPill kind="failed">failed</StatusPill>
      <StatusPill kind="committed">committed</StatusPill>
      <StatusPill kind="gate">awaiting your verdict</StatusPill>
    </div>
  ),
  StatusStrip: () => (
    <>
      <S name="live">
        <StatusStrip kind="live" word="generating" progress={{ done: 14, total: 36 }} facts={<><b>3</b> styles · <b>6</b> mechanisms</>} log="flux-dev · step 12/28 · seed 3" actions={<Button variant="ghost" size="sm">Pause</Button>} />
      </S>
      <S name="ready">
        <StatusStrip kind="ready" word="ready to cull" facts={<><b>36</b> candidates</>} />
      </S>
      <S name="failed">
        <StatusStrip kind="failed" word="failed" error="flux-dev — CUDA out of memory" actions={<Button variant="ghost" size="sm">Retry</Button>} />
      </S>
      <S name="committed">
        <StatusStrip kind="committed" word="committed" facts={<><b>3</b> kept · <b>9</b> deleted</>} />
      </S>
    </>
  ),
  Meridian: () => (
    <>
      <S name="0 of 36"><Meridian done={0} total={36} label="not started" /></S>
      <S name="14 of 36"><Meridian done={14} total={36} label="generating" /></S>
      <S name="36 of 36"><Meridian done={36} total={36} label="done" /></S>
    </>
  ),
  Magnitude: () => (
    <div className="kr-row">
      {[0.92, 0.62, 0.31, null].map((v, i) => (
        <S key={i} name={v === null ? "no score" : `${Math.round(v * 100)}%`}>
          <span style={{ width: 28, display: "block" }}><Magnitude value={v} /></span>
        </S>
      ))}
    </div>
  ),
  gradeOf: () => (
    <div className="kr-out">
      {[0.8, 0.6, 0.2, null].map((v, i) => (
        <div key={i}>
          gradeOf({v === null ? "null" : v}) → <b>{gradeOf(v)}</b>
        </div>
      ))}
    </div>
  ),
  ScoreChip: () => (
    <div className="kr-row">
      <ScoreChip label="style" value={0.92} />
      <ScoreChip label="subject" value={0.61} />
      <ScoreChip label="layout" value={0.28} />
      <ScoreChip label="text" value={null} />
    </div>
  ),
  FlagChip: () => (
    <div className="kr-row">
      <FlagChip kind="text" />
      <FlagChip kind="unmeasured" />
    </div>
  ),
  pct: () => (
    <div className="kr-out">
      <div>pct(0.734) → <b>{pct(0.734)}</b></div>
      <div>pct(null) → <b>{pct(null)}</b></div>
    </div>
  ),
  Credit: () => (
    <div className="kr-row">
      <Credit value={1}>shot size</Credit>
      <Credit value={0.5}>lighting</Credit>
      <Credit value={0}>lens</Credit>
      <Credit value={undefined}>palette</Credit>
    </div>
  ),
  Chip: () => (
    <div className="kr-row">
      <Chip name="shot size">extreme wide</Chip>
      <Chip name="stand-in" tone="gold">paper relief</Chip>
      <Chip name="fault" tone="ant">CUDA out of memory</Chip>
      <Chip>bare</Chip>
    </div>
  ),
  Chips: () => (
    <Chips>
      <Chip name="seed">3</Chip>
      <Chip name="lane">words only</Chip>
      <Chip name="engine">flux-dev</Chip>
    </Chips>
  ),
  Plate: () => (
    <div className="kr-row" style={{ alignItems: "flex-start" }}>
      <S name="plate">
        <div style={{ width: 200 }}>
          <Plate><Pic src={IMG.blueprint} alt="" /></Plate>
        </div>
      </S>
      <S name="flat">
        <div style={{ width: 200 }}>
          <Plate flat><Pic src={IMG.blueprint} alt="" /></Plate>
        </div>
      </S>
    </div>
  ),
  Tile: () => <TilesDemo />,
  VerdictKeys: () => <VerdictDemo />,
  Scene: () => (
    <Scene
      label="Scene s01"
      aside={
        <>
          <Plate><Pic src={IMG.ledger} alt="Scene s01 source frame" /></Plate>
          <div className="k-lab k-caps">s01 · harbour at dusk</div>
          <Chips><Chip name="lens">35mm</Chip></Chips>
        </>
      }
    >
      <div className="kr-out">pinned aside · Matrix beside it</div>
    </Scene>
  ),
  Matrix: () => (
    <Matrix
      label="Specimen trial matrix"
      columns={[
        { id: "m1", head: "M1", sub: "words only · seed 3" },
        { id: "m2", head: "M2", sub: "reference · seed 3" },
      ]}
      rows={[
        {
          id: "blueprint",
          head: <RowHead name="Blueprint" meta="ink family" />,
          cells: [
            <Tile key="a" label="Blueprint M1" src={IMG.blueprint} ratio="16 / 10" verdict="keep" />,
            <Tile key="b" label="Blueprint M2" src={IMG.blueprint} ratio="16 / 10" />,
          ],
        },
        {
          id: "neon",
          head: <RowHead name="Data Neon" meta="signal family" />,
          cells: [
            <Tile key="a" label="Data Neon M1" src={IMG.neon} ratio="16 / 10" verdict="reject" />,
            <Tile key="b" label="Data Neon M2" ratio="16 / 10" state="failed" detail="CUDA out of memory" />,
          ],
        },
      ]}
    />
  ),
  RowHead: () => (
    <RowHead name="Paper Relief" meta="paper family">
      <VerdictKeys variant="row" value={null} onVerdict={noop} subject="the whole Paper Relief row" />
    </RowHead>
  ),
  SideList: () => <SideListDemo />,
  SideItem: () => (
    <ul className="k-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      <SideItem glyph={<StatusGlyph kind="live" />} title="run-0412" meta="14/36 · 3 styles" current onSelect={noop} />
      <SideItem glyph={<StatusGlyph kind="committed" />} title="run-0409" meta="9 deleted · 3 kept" onSelect={noop} />
      <SideItem title="Ink" count={5} pressed onSelect={noop} />
    </ul>
  ),
  Entry: () => (
    <div className="kr-tiles kr-tiles--wide">
      {([["focused", undefined, true], ["kept", "keep", false], ["rejected", "reject", false]] as const).map(([name, verdict, focused]) => (
        <S key={name} name={name}>
          <Entry
            label="Paper Relief"
            focused={focused}
            verdict={verdict}
            title="Paper Relief"
            lede={<span className="k-muted">e-0412 · paper family</span>}
            aside={<><ScoreChip label="style" value={0.88} />{verdict && <VerdictMark verdict={verdict} />}</>}
          >
            <div className="kr-cols">
              <Column label="Sources"><Chips><Chip>6 read</Chip></Chips></Column>
              <Column label="Replicas"><Chips><Chip>3 held</Chip></Chips></Column>
            </div>
          </Entry>
        </S>
      ))}
    </div>
  ),
  VerdictMark: () => (
    <div className="kr-row">
      <VerdictMark verdict="keep" />
      <VerdictMark verdict="keep" keepWord="APPROVED" />
      <VerdictMark verdict="reject" />
    </div>
  ),
  Column: () => (
    <div className="kr-cols">
      <Column label="Sources"><Chips><Chip>6 read</Chip></Chips></Column>
      <Column label="Transfer"><Chips><Chip tone="gold">stand-in</Chip></Chips></Column>
    </div>
  ),
  Card: () => (
    <CardGrid>
      <Card label="Open Blueprint" src={IMG.blueprint} what="kept render" title="Blueprint" meta="ink family · 5 kept" status="proven" proven onOpen={noop} />
      <Card label="Open Chalk Argument" src={IMG.chalk} what="source" title="Chalk Argument" meta="ink family" status="candidate" onOpen={noop} />
      <Card label="Open Newsprint Cutout" title="Newsprint Cutout" meta="paper family" status="candidate" onOpen={noop} />
    </CardGrid>
  ),
  CardGrid: () => (
    <CardGrid>
      <Card label="Open Data Neon" src={IMG.neon} title="Data Neon" meta="signal family" status="proven" proven onOpen={noop} />
      <Card label="Open Signal Ledger" src={IMG.ledger} title="Signal Ledger" meta="signal family" status="candidate" onOpen={noop} />
    </CardGrid>
  ),
  Thumb: () => (
    <div className="kr-row" style={{ alignItems: "flex-start" }}>
      <S name="default">
        <div style={{ width: 180 }}><Thumb src={IMG.paper} alt="Paper Relief render" label="Open Paper Relief render" onOpen={noop} chips={<ScoreChip label="style" value={0.9} />} /></div>
      </S>
      <S name="recipe in force">
        <div style={{ width: 180 }}><Thumb src={IMG.blueprint} alt="Blueprint render" label="Open Blueprint render" onOpen={noop} inForce flag={<FlagChip kind="text" />} /></div>
      </S>
    </div>
  ),
  Figures: () => {
    const items: FigureItem[] = [
      { id: "1", src: IMG.blueprint, alt: "Blueprint source", caption: "blueprint.jpg", state: "read" },
      { id: "2", src: IMG.chalk, alt: "Chalk Argument source", caption: "chalk-argument.jpg" },
      { id: "3", src: IMG.news, alt: "Newsprint Cutout source", caption: "newsprint-cutout.jpg — unreadable", state: "failed" },
    ];
    return <Figures items={items} />;
  },
  Duo: () => (
    <div style={{ maxWidth: 560, display: "grid", gap: 14 }}>
      <S name="pick">
        <Duo scene="s01 · harbour at dusk" seed={3} arms={ArmPair(1)} judge={{ pick: "challenger", reason: "keeps the paper grain on the hull" }} />
      </S>
      <S name="tie, dissent, culled arm">
        <Duo
          scene="s02 · market at noon"
          seed={7}
          arms={ArmPair(null, true)}
          judge={{ pick: "tie", reason: "both hold the palette" }}
          dissent={{ who: "gemini", pick: "baseline", reason: "the challenger drops the signage" }}
        />
      </S>
    </div>
  ),
  Dock: () => (
    <div className="kr-frame">
      <Dock label="Specimen dock">
        <Count kind="keep" n={3} of={36} label="kept" />
        <Count kind="reject" n={7} label="rejected" />
        <Count kind="undecided" n={26} label="undecided" />
        <SaveState state="saved" />
        <DockAction>
          <LockNote>keep at least one candidate first</LockNote>
          <Button disabled>Commit</Button>
        </DockAction>
      </Dock>
    </div>
  ),
  Count: () => (
    <div className="kr-row">
      <Count kind="keep" n={3} of={36} label="kept" />
      <Count kind="reject" n={7} label="rejected" />
      <Count kind="undecided" n={26} label="undecided" />
      <Count n={36} label="candidates" />
    </div>
  ),
  SaveState: () => <SaveDemo />,
  KeyRow: () => (
    <KeyRow
      label="Cull keys"
      map={[
        { keys: ["←", "→", "↑", "↓"], does: "move" },
        { keys: ["K"], does: "keep" },
        { keys: ["X"], does: "reject" },
        { keys: ["U"], does: "clear" },
        { keys: ["Enter"], does: "compare" },
      ]}
    />
  ),
  LockNote: () => <LockNote>run is generating</LockNote>,
  Final: () => <Final>charted · read-only</Final>,
  DockAction: () => (
    <DockAction>
      <LockNote>keep at least one candidate first</LockNote>
      <Button disabled>Commit</Button>
    </DockAction>
  ),
  ConfirmDialog: () => <ConfirmDemo />,
  Sheet: () => <SheetDemo />,
  Report: () => <Report action={<OpenLink onClick={noop}>Read findings.md →</OpenLink>}>9 deleted · 3 kept · findings.md written</Report>,
  OpenLink: () => <OpenLink onClick={noop}>Read findings.md →</OpenLink>,
  Doc: () => (
    <Doc>
      <DocSection label="Recipe">
        <Rule>Graph paper, one ink, no shadows.</Rule>
      </DocSection>
    </Doc>
  ),
  DocLede: () => (
    <DocLede>
      <StatusPill kind="committed">proven</StatusPill> 3 renders kept
    </DocLede>
  ),
  DocSection: () => (
    <DocSection label="Observables">
      <Chips><Chip name="line">hairline</Chip><Chip name="fill">none</Chip></Chips>
    </DocSection>
  ),
  Rule: () => <Rule>Graph paper, one ink, no shadows.</Rule>,
  DefList: () => (
    <DefList
      items={[
        { term: "family", value: "ink" },
        { term: "engine", value: "flux-dev" },
        { term: "seeds", value: "1 · 3 · 7" },
      ]}
    />
  ),
  Stats: () => (
    <Stats items={[{ n: 36, label: "candidates" }, { n: 3, label: "kept" }, { n: "84%", label: "held" }]} />
  ),
  DataTable: () => (
    <DataTable
      head={["Field", "Credit", "Value"]}
      rows={[
        ["shot size", <Credit key="a" value={1}>matched</Credit>, "extreme wide"],
        ["lighting", <Credit key="b" value={0.5}>half</Credit>, "low key"],
        ["lens", <Credit key="c" value={0}>missed</Credit>, "35mm"],
      ]}
    />
  ),
  Verbatim: () => <Verbatim>{"run-0412 · committed\nkept  3  paper-relief, blueprint, data-neon\ndeleted  9"}</Verbatim>,
  Prose: () => (
    <>
      <S name="vellum"><Prose>The challenger holds the grain; the baseline flattens it.</Prose></S>
      <S name="ink"><Prose ink>The challenger holds the grain; the baseline flattens it.</Prose></S>
    </>
  ),
  ErrorBox: () => (
    <>
      <S name="alert, with retry">
        <ErrorBox action={<Button variant="ghost" size="sm">Retry</Button>}>Could not reach the imaging service: ECONNREFUSED 127.0.0.1:8188</ErrorBox>
      </S>
      <S name="status">
        <ErrorBox role="status">run-0412 has no findings.md</ErrorBox>
      </S>
    </>
  ),
  Loading: () => <Loading />,
  Command: () => <Command label="none yet — forge one">{"cd pipeline/foundry\npython forge.py plans/dry-run.json"}</Command>,
  Ghost: () => (
    <div className="kr-tiles">
      <S name="row × 2"><Ghost shape="row" count={2} label="no runs yet" /></S>
      <S name="tile"><div style={{ width: 120 }}><Ghost shape="tile" label="no candidate" /></div></S>
      <S name="slot"><Ghost shape="slot" label="no source frame" /></S>
      <S name="card, with action"><Ghost shape="card" label="no styles yet" action={<Button size="sm">Extract one</Button>} /></S>
    </div>
  ),
  Hint: () => (
    <div className="kr-row">
      <S name="info"><Hint>3 seeds per style</Hint></S>
      <S name="lock"><Hint variant="lock">committed runs are read-only</Hint></S>
      <S name="warn"><Hint variant="warn">flux-dev needs 24 GB</Hint></S>
      <S name="keys"><Hint variant="keys">K keep · X reject · U clear</Hint></S>
    </div>
  ),
  Dropzone: () => <DropDemo />,
  Field: () => <FieldDemo />,
  TextInput: () => <TextInputDemo />,
  TextArea: () => <AreaDemo />,
  NumberInput: () => <NumberInputDemo />,
  Select: () => <SelectDemo />,
  Segmented: () => <SegmentedDemo />,
  Callout: () => (
    <div className="kr-fields">
      <S name="gold, as returned"><Callout source="run-0412 · finding 3">The archive holds no record of a second keeper.</Callout></S>
      <S name="ald, held"><Callout tone="ald" source="held against 2 sources">The light was lit at dusk on 14 March.</Callout></S>
      <S name="ant, dashed: corrected"><Callout tone="ant" dashed source="corrected since">Eleven ships were lost that winter.</Callout></S>
      <S name="sm"><Callout size="sm" source="gate · promise 2">&ldquo;He never speaks of the tower again.&rdquo;</Callout></S>
    </div>
  ),
  useToast: () => <ToastDemo />,
  ToastTray: () => <ToastTray inline toasts={TOAST_FIXTURE} onDismiss={noop} />,
  TextField: () => <TextDemo />,
  NumberField: () => <NumberDemo />,
  CheckField: () => <CheckDemo />,
  FieldRow: () => <RowDemo />,
  PanelBox: () => (
    <PanelBox>
      <Chips><Chip name="engine">flux-dev</Chip><Chip name="seeds">3</Chip></Chips>
    </PanelBox>
  ),
  Button: () => (
    <>
      <div className="kr-row">
        <Button>Commit</Button>
        <Button variant="ghost">Not yet</Button>
        <Button variant="danger">Delete 9, keep 3</Button>
        <Button variant="keep">Keep</Button>
        <Button variant="reject">Reject</Button>
      </div>
      <div className="kr-row">
        <Button size="sm">Small</Button>
        <Button size="sm" variant="ghost">Small ruled</Button>
        <Button disabled>Disabled</Button>
      </div>
    </>
  ),
  Deck: () => <DeckDemo />,
  DeckStage: () => <DeckStageDemo />,
  DeckCard: () => <DeckCardDemo />,
  StageRail: () => <StageRailDemo />,
  ContextMenu: () => <ContextMenuDemo />,
  FolderTree: () => <FolderTreeDemo />,
  LayerList: () => <LayerListDemo />,
  Transport: () => <TransportDemo />,
  Waveform: () => <WaveformDemo />,
  Player: () => <PlayerDemo />,
  clock: () => <ClockDemo />,
  Timeline: () => <TimelineDemo />,
  Table: () => <TableDemo />,
  Pager: () => <PagerDemo />,
  useWindow: () => <WindowDemo />,
  Steps: () => <StepsDemo />,
  STUDIO_STEPS: () => <StepsConstDemo />,
  useRoving: () => <RovingDemo />,
  NotificationBell: () => <BellDemo />,
  UserMenu: () => <UserDemo />,
  PipRow: () => (
    <>
      <S name="three of five"><PipRow states={["filled", "filled", "filled"]} max={5} label="3 of 5 picked" /></S>
      <S name="mixed"><PipRow states={["filled", "amber", "rose", "hollow"]} label="1 kept, 1 running, 1 failed, 1 open" /></S>
    </>
  ),
  BandTrack: () => (
    <>
      <S name="inside"><BandTrack value={58} min={0} max={120} band={[45, 75]} unit="s" label="runtime 58s, band 45–75s" /></S>
      <S name="above, stand-in band"><BandTrack value={96} min={0} max={120} band={[45, 75]} unit="s" hatchBand showBounds label="runtime 96s, band 45–75s unmeasured" /></S>
    </>
  ),
  UpstreamBreak: () => (
    <>
      <S name="info">
        <UpstreamBreak blockedAt="script" current="frames" done={["research"]} action={{ label: "Open Script", onClick: noop }} />
      </S>
      <S name="error">
        <UpstreamBreak blockedAt="research" current="script" done={[]} severity="error" detail="notebook · load · 404 run-0412" />
      </S>
    </>
  ),
  Keycaps: () => (
    <Keycaps
      map={[
        { keys: ["K"], does: "keep" },
        { keys: ["X"], does: "reject" },
        { keys: ["U"], does: "undecided" },
        { keys: ["←", "→"], does: "move" },
      ]}
    />
  ),
  StaleBadge: () => (
    <div className="kr-row">
      <StaleBadge />
      <StaleBadge words="measured before" glyph="history" why="against notebook v3; now v5" />
    </div>
  ),
  Provenance: () => <Provenance model="flux-dev" run="run-0412" step="frames" vendor="Leonardo" cost="$0.04" />,
  useHint: () => <DisclosureDemo />,
  HintPopover: () => <DisclosureDemo />,
  hintRootClass: () => <Verbatim>{hintRootClass}</Verbatim>,
  CHIP_CLASS: () => <Verbatim>{CHIP_CLASS}</Verbatim>,
  TALLY_TONE: () => (
    <div className="kr-row">
      {TONES.map((t) => (
        <span key={t} className={`${CHIP_CLASS} ${TALLY_TONE[t]}`}>{t}</span>
      ))}
    </div>
  ),
  Mark: () => (
    <div className="kr-row" style={{ alignItems: "flex-end" }}>
      <S name="24, plain"><Mark size={24} construction={false} title="Gravitone, 24px" /></S>
      <S name="40, ring"><Mark size={40} title="Gravitone, 40px" /></S>
      <S name="72, heavy"><Mark size={72} strokeWidth={0.9} title="Gravitone, 72px" /></S>
    </div>
  ),
  ASTERISM_PATH: () => <Verbatim>{ASTERISM_PATH}</Verbatim>,
  ASTERISM_STARS: () => (
    <DataTable
      head={["Step", "x", "y", "r", "Bearing"]}
      rows={ASTERISM_STARS.map((s) => [s.step, s.x, s.y, s.r, s.bearing === null ? "inside" : `${s.bearing}°`])}
    />
  ),
  Wordmark: () => (
    <div className="kr-row" style={{ alignItems: "flex-end" }}>
      <S name="14"><Wordmark height={14} /></S>
      <S name="24"><Wordmark height={24} /></S>
      <S name="40"><Wordmark height={40} /></S>
    </div>
  ),
};

/** Parts whose specimen needs the whole row. */
const WIDE: ReadonlySet<PartName> = new Set<PartName>([
  "Table", "Pager", "Steps", "useRoving", "NotificationBell", "UserMenu",
  "Deck", "DeckStage", "DeckCard", "StageRail", "FolderTree", "ContextMenu", "LayerList", "Player", "Waveform", "Timeline",
  "Bar", "PageHead", "TabRail", "StatusStrip", "Tile", "Scene", "Matrix", "Entry", "Card", "CardGrid",
  "Dock", "ConfirmDialog", "Figures", "Doc", "DataTable", "Ghost", "Thumb", "Dropzone", "Plate", "Field", "Select", "Callout", "ToastTray", "useToast",
  "UpstreamBreak", "BandTrack", "CHIP_CLASS",
]);

export function Parts() {
  return (
    <div className="kr-page">
      <section className="kr-section" aria-labelledby="kr-parts-h">
        <Kicker>Specimen</Kicker>
        <h2 id="kr-parts-h">
          Every export, in each of its states <small className="k-num">{PART_COUNT} parts · {KIT_GROUPS.length} groups</small>
        </h2>
        <nav className="kr-jump k-caps" aria-label="Part groups">
          {KIT_GROUPS.map((g) => (
            <a key={g.id} href={`#g-${g.id}`}>{g.title}</a>
          ))}
        </nav>
        {KIT_GROUPS.map((g) => (
          <div key={g.id} id={`g-${g.id}`} style={{ scrollMarginTop: 140 }}>
            <h3 className="kr-sub k-caps">
              {g.title}
              <span className="k-muted" style={{ textTransform: "none", letterSpacing: 0 }}>{g.for}</span>
            </h3>
            <div className="kr-specs">
              {g.parts.map((p) => (
                <Spec key={p.name} name={p.name} api={p.api} wide={WIDE.has(p.name)}>
                  {DEMOS[p.name]()}
                </Spec>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
