"use client";

// SPECIMENS for the deck in the world, context menu, folder tree, layer list,
// transport / waveform / player and timeline. Static fixtures and the repo's own
// pictures; nothing fetches, and the media parts are driven by a fake clock, not
// an <audio> element. Parts.tsx maps these onto the catalog (DEMOS).

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import {
  Button,
  Chip,
  Chips,
  ContextMenu,
  Deck,
  DeckCard,
  DeckStage,
  FolderTree,
  LayerList,
  Player,
  StageRail,
  StatusGlyph,
  Timeline,
  Transport,
  Waveform,
  clock,
  type DeckCardSpec,
  type DeckStageDef,
  type FolderNode,
  type Layer,
  type MenuItem,
  type RailStage,
  type TimelineCue,
  type TimelineTrack,
} from "@/components/kit";

const IMG = {
  blueprint: "/presets/blueprint.jpg",
  chalk: "/presets/chalk-argument.jpg",
  neon: "/presets/data-neon.jpg",
  news: "/presets/newsprint-cutout.jpg",
  paper: "/presets/paper-relief.jpg",
  ledger: "/presets/signal-ledger.jpg",
};

/** One named state of a part (same shape as Parts.tsx's own). */
function S({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <div className="kr-state">
      {name && <span className="k-caps">{name}</span>}
      {children}
    </div>
  );
}

/** A labelled cell whose card fills the row, so a row of cards is one height. */
function Cell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="kr-state" style={{ gridTemplateRows: "auto 1fr" }}>
      <span className="k-caps">{name}</span>
      <div style={{ display: "grid" }}>{children}</div>
    </div>
  );
}

const GRID = { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", alignItems: "stretch" } as const;

// ── deck ────────────────────────────────────────────────────────────────────

const DISCIPLINES: DeckCardSpec[] = [
  { id: "educational", title: "Educational video", footnote: "3–12 min", density: "hero", art: { kind: "emblem", emblemId: "discipline-educational" } },
  { id: "trailer", title: "Movie or game trailer", footnote: "60–150 s", density: "hero", art: { kind: "emblem", emblemId: "discipline-trailer" } },
  { id: "free", title: "Free form", footnote: "any length", density: "hero", art: { kind: "emblem", emblemId: "discipline-free" } },
];

const STYLES: DeckCardSpec[] = [
  {
    id: "paper",
    eyebrow: "ink family",
    title: "Paper Relief",
    body: "Cut paper in layers, one light from the left, every shadow a real edge.",
    chips: [{ label: "5 kept" }, { label: "flux-dev" }],
    risk: "flattens type smaller than 24px",
    footnote: "3 seeds · proven",
    art: { kind: "image", src: IMG.paper, alt: "Paper Relief render" },
  },
  {
    id: "blueprint",
    eyebrow: "ink family",
    title: "Blueprint",
    body: "Graph paper, one ink, no shadows; the frame is the drawing.",
    chips: [{ label: "3 kept" }],
    footnote: "3 seeds",
    art: { kind: "image", src: IMG.blueprint, alt: "Blueprint render" },
  },
  {
    id: "neon",
    eyebrow: "signal family",
    title: "Data Neon",
    body: "Bright strokes on a dark ground; numbers are the picture.",
    chips: [{ label: "candidate" }],
    art: { kind: "image", src: IMG.neon, alt: "Data Neon render" },
  },
];

function useDeckStages(): { stages: DeckStageDef[]; active: number; setActive: (i: number) => void } {
  const [active, setActive] = useState(0);
  const [disc, setDisc] = useState<string | null>("trailer");
  const [style, setStyle] = useState<string | null>(null);
  const stages: DeckStageDef[] = [
    {
      id: "discipline",
      label: "discipline",
      headline: "What are you making?",
      done: disc !== null,
      summary: disc ? DISCIPLINES.find((d) => d.id === disc)?.title : undefined,
      advance: "pick",
      content: <DeckStage cards={DISCIPLINES} pickedId={disc} noUnpick onPick={(id) => { setDisc(id); if (id) setActive(1); }} />,
    },
    {
      id: "style",
      label: "style",
      headline: "Which hand draws it?",
      done: style !== null,
      summary: style ? STYLES.find((d) => d.id === style)?.title : undefined,
      blockedHint: "pick a style to go on",
      content: <DeckStage cards={STYLES} pickedId={style} onPick={setStyle} />,
    },
    { id: "name", label: "name", headline: "What is it called?", done: false, blockedHint: "a name is required", content: <div className="k-panelbox">Harbour at dusk</div> },
  ];
  return { stages, active, setActive };
}

export function DeckDemo() {
  const { stages, active, setActive } = useDeckStages();
  return (
    <div className="k-deck-frame">
      <Deck stages={stages} active={active} onNavigate={setActive} finishLabel="Create and open" onFinish={() => {}} />
    </div>
  );
}

export function DeckStageDemo() {
  const [picked, setPicked] = useState<string | null>("blueprint");
  return <DeckStage cards={STYLES} pickedId={picked} onPick={setPicked} />;
}

export function DeckCardDemo() {
  const [picked, setPicked] = useState<string | null>("paper");
  const dense: DeckCardSpec = {
    id: "dense",
    density: "dense",
    eyebrow: "research pass",
    title: "Why the first trailer cut runs 96 seconds",
    chips: [{ label: "6 sources" }, { label: "1 gap" }],
    risk: "two claims rest on one source",
    footnote: "run-0412",
    art: { kind: "gradient", tone: "" },
    icon: <StatusGlyph kind="gate" decorative size={18} />,
    detail: "The reversal lands at 13 s in every cut that tested; the two that did not put it at 21 s.",
  };
  return (
    <div style={GRID}>
      <Cell name="showcase, picked">
        <DeckCard spec={STYLES[0]} picked={picked === "paper"} onPick={(id) => setPicked(id)} />
      </Cell>
      <Cell name="showcase">
        <DeckCard spec={STYLES[1]} picked={picked === "blueprint"} onPick={(id) => setPicked(id)} />
      </Cell>
      <Cell name="hero, emblem">
        <DeckCard spec={DISCIPLINES[1]} picked={false} noUnpick onPick={() => {}} />
      </Cell>
      <Cell name="dense, details">
        <DeckCard spec={dense} picked={false} onPick={() => {}} />
      </Cell>
      <Cell name="disabled">
        <DeckCard spec={{ ...STYLES[2], disabled: true }} picked={false} onPick={() => {}} />
      </Cell>
      <Cell name="no art">
        <DeckCard spec={{ id: "blank", title: "Newsprint Cutout", eyebrow: "paper family", body: "No render yet.", art: { kind: "gradient", tone: "" } }} picked={false} onPick={() => {}} />
      </Cell>
    </div>
  );
}

export function StageRailDemo() {
  const [active, setActive] = useState(1);
  const stages: RailStage[] = [
    { id: "d", label: "discipline", done: true, summary: "Movie or game trailer" },
    { id: "t", label: "template", done: true, summary: "Teaser · 45 s" },
    { id: "s", label: "style", done: false },
    { id: "n", label: "name", done: false },
  ];
  return <StageRail stages={stages} active={active} onNavigate={setActive} reachable={(i) => i <= 2} />;
}

// ── context menu ────────────────────────────────────────────────────────────

export function ContextMenuDemo() {
  // Closed on mount. A menu takes focus when it opens (components/kit/
  // ContextMenu.tsx), so a specimen drawn open stole the cursor from the sheet's
  // search box the moment a query matched it.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [said, setSaid] = useState("nothing chosen");
  const items: MenuItem[] = [
    { id: "open", label: "Open", onSelect: () => setSaid("Open"), keys: "Enter" },
    { id: "move", label: "Move to folder", onSelect: () => setSaid("Move to folder"), keys: "M" },
    { id: "rename", label: "Rename", onSelect: () => setSaid("Rename"), keys: "F2" },
    { id: "lock", label: "Replace file", onSelect: () => {}, disabled: true },
    { id: "del", label: "Delete asset", onSelect: () => setSaid("Delete asset"), destructive: true },
  ];
  return (
    <div
      style={{ position: "relative", minHeight: 300 }}
      onContextMenu={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setAt({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <Chips>
          <Chip>right-click anywhere here</Chip>
          <Chip><b>{said}</b></Chip>
        </Chips>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setAt({ x: 210, y: 46 })}>
        Open at row
      </Button>
      {at && <ContextMenu inline label="Actions for Blueprint" x={at.x} y={at.y} items={items} onClose={() => setAt(null)} />}
    </div>
  );
}

// ── folder tree ─────────────────────────────────────────────────────────────

const TREE: FolderNode[] = [
  {
    name: "presets", path: ["presets"], total: 30,
    children: [
      { name: "ink", path: ["presets", "ink"], total: 12, children: [] },
      { name: "paper", path: ["presets", "paper"], total: 9, children: [{ name: "relief", path: ["presets", "paper", "relief"], total: 4, children: [] }] },
    ],
  },
  { name: "proofs", path: ["proofs"], total: 14, children: [] },
  { name: "sources", path: ["sources"], total: 6, children: [] },
];

function renameIn(ns: FolderNode[], path: string[], name: string): FolderNode[] {
  const prefix = path.join("/");
  const at = path.length - 1;
  const fix = (p: string[]) => {
    const k = p.join("/");
    return k === prefix || k.startsWith(prefix + "/") ? p.map((s, i) => (i === at ? name : s)) : p;
  };
  // A rename onto a sibling's name MERGES: folders are only the paths their contents claim.
  const merge = (list: FolderNode[]): FolderNode[] => {
    const by = new Map<string, FolderNode>();
    for (const n of list) {
      const k = n.path.join("/");
      const seen = by.get(k);
      by.set(k, seen ? { ...seen, total: seen.total + n.total, children: [...seen.children, ...n.children] } : n);
    }
    return [...by.values()].map((n) => ({ ...n, children: merge(n.children) }));
  };
  const walk = (list: FolderNode[]): FolderNode[] =>
    list.map((n) => ({ ...n, name: n.path.join("/") === prefix ? name : n.name, path: fix(n.path), children: walk(n.children) }));
  return merge(walk(ns));
}

export function FolderTreeDemo() {
  const [nodes, setNodes] = useState(TREE);
  const [selected, setSelected] = useState<string[]>(["presets", "ink"]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["presets", "presets/paper"]));
  const [drag, setDrag] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ path: string[]; x: number; y: number } | null>(null);
  const toggle = (k: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <div style={{ position: "relative", maxWidth: 380 }}>
      <div style={{ marginBottom: 10 }}>
        <Chips>
          <Button size="sm" variant="ghost" aria-pressed={drag} onClick={() => { setDrag((d) => !d); setOver(null); }}>
            {drag ? "Stop the drag" : "Start a drag"}
          </Button>
          {dropped && <Chip>dropped on <b>{dropped}</b></Chip>}
        </Chips>
      </div>
      <FolderTree
        label="Asset folders"
        nodes={nodes}
        selected={selected}
        expanded={expanded}
        total={50}
        allLabel="All assets"
        onSelect={setSelected}
        onToggle={toggle}
        dragActive={drag}
        over={over}
        onOver={setOver}
        onDropOn={(p) => { setDropped(p.join(" / ")); setOver(null); setDrag(false); }}
        onRename={(p, name) => name.trim() && setNodes((ns) => renameIn(ns, p, name.trim()))}
        onMenu={(path, at) => {
          setMenu({ path, ...at });
        }}
      />
      {menu && (
        <ContextMenu
          label={`Actions for ${menu.path[menu.path.length - 1]}`}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { id: "rename", label: "Rename", keys: "F2", onSelect: () => {} },
            { id: "move", label: "Move", onSelect: () => {} },
            { id: "del", label: "Delete folder", destructive: true, onSelect: () => {} },
          ]}
        />
      )}
    </div>
  );
}

// ── layers ──────────────────────────────────────────────────────────────────

function move<T extends { id: string }>(list: T[], id: string, to: number): T[] {
  const from = list.findIndex((x) => x.id === id);
  if (from < 0) return list;
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export function LayerListDemo() {
  const [texts, setTexts] = useState<Layer[]>([
    { id: "t1", kind: "title", name: "The turn lands at 13 seconds" },
    { id: "t2", kind: "figure", name: "96 s", flag: "figure with no fact behind it" },
    { id: "t3", kind: "credit", name: "Gravitone", hidden: true },
  ]);
  const [els, setEls] = useState<Layer[]>([
    { id: "e1", kind: "arrow", name: "Hull to harbour wall" },
    { id: "e2", kind: "box", name: "Lantern glow" },
  ]);
  const [sel, setSel] = useState<string | null>("t1");
  const hide = (set: (f: (l: Layer[]) => Layer[]) => void) => (id: string) => set((l) => l.map((x) => (x.id === id ? { ...x, hidden: !x.hidden } : x)));
  const drop = (set: (f: (l: Layer[]) => Layer[]) => void) => (id: string) => set((l) => l.filter((x) => x.id !== id));
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 420 }}>
      <LayerList label="Text layers" heading="texts" layers={texts} selectedId={sel} emptyLabel="no texts" onSelect={setSel} onReorder={(id, to) => setTexts((l) => move(l, id, to))} onToggleHidden={hide(setTexts)} onRemove={drop(setTexts)} />
      <LayerList label="Element layers" heading="elements" layers={els} selectedId={sel} emptyLabel="no elements" onSelect={setSel} onReorder={(id, to) => setEls((l) => move(l, id, to))} onToggleHidden={hide(setEls)} onRemove={drop(setEls)} />
      <LayerList label="Clip layers" heading="clips" layers={[]} emptyLabel="no clips" onSelect={() => {}} onReorder={() => {}} onToggleHidden={() => {}} onRemove={() => {}} />
    </div>
  );
}

// ── player ──────────────────────────────────────────────────────────────────

const PEAKS = Array.from({ length: 168 }, (_, i) => {
  const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.21));
  const grain = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.9) * Math.cos(i * 0.47));
  return Math.min(1, env * grain + 0.06);
});
const SPOTS = [
  { at: 6, label: "spot 1, door slam" },
  { at: 13, label: "spot 2, the turn" },
  { at: 31, label: "spot 3, harbour bell" },
];

/** A fake clock: the specimen plays without an <audio> element. */
function useClock(duration: number, start = 0) {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(start);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPosition((p) => {
        if (p + 0.25 >= duration) {
          setPlaying(false);
          return duration;
        }
        return p + 0.25;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, duration]);
  return {
    playing,
    position,
    toggle: () => {
      if (position >= duration) setPosition(0);
      setPlaying((p) => !p);
    },
    seek: (s: number) => setPosition(s),
  };
}

export function TransportDemo() {
  const c = useClock(48, 12);
  return <Transport label="Take 2" playing={c.playing} position={c.position} duration={48} onToggle={c.toggle} onSeek={c.seek} />;
}

export function WaveformDemo() {
  const c = useClock(48, 17);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <S name="playing position, three spots">
        <Waveform label="Take 2 position" peaks={PEAKS} position={c.position} duration={48} marks={SPOTS} onSeek={c.seek} />
      </S>
      <S name="take missing">
        <Waveform label="Take 3 position" peaks={PEAKS} position={0} duration={48} disabled onSeek={() => {}} />
      </S>
    </div>
  );
}

export function PlayerDemo() {
  const a = useClock(48, 6);
  const v = useClock(36, 0);
  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 720 }}>
      <S name="audio, spots on the wave">
        <Player label="Spot 2, the turn" peaks={PEAKS} marks={SPOTS} playing={a.playing} position={a.position} duration={48} onToggle={a.toggle} onSeek={a.seek} />
      </S>
      <S name="video, picture above">
        <Player
          label="Cut preview"
          kind="video"
          screen={<Image src={IMG.paper} alt="Cut preview, frame at 0:00" width={640} height={360} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          peaks={PEAKS}
          playing={v.playing}
          position={v.position}
          duration={36}
          onToggle={v.toggle}
          onSeek={v.seek}
        />
      </S>
      <S name="no take yet">
        <Player label="Spot 4, no take" peaks={PEAKS} playing={false} position={0} duration={48} disabled onToggle={() => {}} onSeek={() => {}} />
      </S>
    </div>
  );
}

export function ClockDemo() {
  return (
    <Chips>
      {[7, 72, 754, 3723].map((s) => (
        <Chip key={s}><b>{s}</b> {clock(s)}</Chip>
      ))}
    </Chips>
  );
}

// ── timeline ────────────────────────────────────────────────────────────────

const TRACKS: TimelineTrack[] = [
  {
    id: "pic", label: "Picture",
    clips: [
      { id: "p1", label: "Harbour at dusk", start: 0, dur: 12 },
      { id: "p2", label: "Market at noon", start: 12, dur: 9, state: "drift", offset: 150 },
      { id: "p3", label: "The reversal", start: 21, dur: 14 },
      { id: "p4", label: "Empty quay", start: 35, dur: 13, state: "missing" },
    ],
  },
  {
    id: "vo", label: "Voice",
    clips: [
      { id: "v1", label: "Line 1", start: 1, dur: 10 },
      { id: "v2", label: "Line 2", start: 13, dur: 8 },
      { id: "v3", label: "Line 3", start: 36, dur: 9, state: "missing" },
    ],
  },
  {
    id: "sc", label: "Score",
    clips: [
      { id: "s1", label: "Cue A, low strings", start: 0, dur: 24 },
      { id: "s2", label: "Cue B, bell and pulse", start: 24, dur: 24 },
    ],
  },
];
const CUES: TimelineCue[] = [
  { at: 13, label: "the turn" },
  { at: 35, label: "the quay" },
];

export function TimelineDemo() {
  const [sel, setSel] = useState<string | null>("p2");
  const c = useClock(48, 13);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <S name="selectable clips, playhead running, cues on the ruler">
        <Timeline label="Cut, 48 seconds" duration={48} tracks={TRACKS} cues={CUES} playhead={c.position} selectedId={sel} onSelect={setSel} />
      </S>
      <div className="kr-row">
        <Transport label="Cut" playing={c.playing} position={c.position} duration={48} onToggle={c.toggle} onSeek={c.seek} />
      </div>
      <S name="read-only, no playhead">
        <Timeline label="Cut, 24 seconds" duration={24} tracks={TRACKS.slice(0, 2).map((t) => ({ ...t, clips: t.clips.filter((k) => k.start + k.dur <= 24) }))} />
      </S>
    </div>
  );
}
