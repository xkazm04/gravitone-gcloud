// THE TERRITORY'S SHAPES - what ./build.ts makes of a CanvasView and what the renderer, the sheet, the desk and the
// gallery read. One continent: BASINS (the three content families) hold PROVINCES (an audience, the channels, the early
// or archive nights), a province holds RIVERS (a genre, a channel, a night pile), a river holds TOWNS (one per stage
// column) and a town holds LOTS (items: graph nodes, and channel episodes no night took yet).
//
// These objects are mutable on purpose and live in the client store only: a verdict moves an item's state, the
// tallies are recounted in place (1,240 items: nothing) and the river's geometry is rebuilt. The server never sees them.

import type { GraphNode } from "@gt/domain/scoutGraph";
import type { Episode } from "@gt/domain/channel";

import type { CanvasChannel, CanvasMedia, CanvasSlot, ReelAudio } from "../../_port/contract.ts";
import type { Family, FamilyKey, Station } from "../pipelines.ts";
import type { BlockCounts, BlockKind, ChainKey, Decision, ItemState } from "../tables.ts";

/** A reel's road as the screen plays it: the server's ReelAudio plus the step running now (motion only). */
export type ItemAudio = {
  step: number;
  brief: ReelAudio["brief"] | null;
  decision: Decision | null;
  channel: string | null;
  slot: CanvasSlot | null;
  run: { readonly key: ChainKey; readonly t0: number; readonly dur: number } | null;
  queue: ChainKey[];
};

export type Item = {
  readonly id: string;
  /** The graph node; absent for an episode no night took yet (an outline lot). */
  readonly node: GraphNode | null;
  readonly label: string;
  /** The label without its channel's name, when it starts with it. */
  readonly short: string | null;
  state: ItemState;
  readonly at: string;
  /** Stage column: 0 seed ... 5 output. */
  readonly si: number;
  readonly ep: Episode | null;
  readonly media: CanvasMedia | null;
  readonly chanId: string | null;
  readonly outline: boolean;
  /** Set on a reel or a reel cut: its road to the calendar. */
  audio: ItemAudio | null;
  river: River;
  town: Town;
  /** The blocking point it is, recounted on every change. */
  block: BlockKind | null;
  /** Lot position inside its town (rx, ry) and in the world (x, y). */
  rx: number;
  ry: number;
  x: number;
  y: number;
};

export type Night = { readonly at: string; readonly items: Item[]; ry: number };

export type Town = {
  readonly river: River;
  readonly si: number;
  readonly items: Item[];
  /** Count by state. */
  c: Partial<Record<ItemState, number>>;
  n: number;
  blocks: BlockCounts;
  cols: number;
  bw: number;
  bh: number;
  nights: Night[];
  x: number;
  y: number;
  bx: number;
  by: number;
};

/** A point along a river: world position and the water's width there. */
export type RiverPt = { readonly x: number; readonly y: number; readonly w: number };
export type Pt = readonly [number, number];

export type River = {
  readonly key: string;
  readonly basin: FamilyKey;
  readonly prov: ProvinceKey;
  name: string;
  readonly aud: string | null;
  readonly genre: string | null;
  /** The graph group it draws (`<audience>/<genre>`). */
  readonly group: string | null;
  readonly chan: (CanvasChannel["channel"] & { readonly episodes: readonly Episode[]; port: Port | null; shipRows: number }) | null;
  readonly night: boolean;
  readonly dry: boolean;
  readonly genres: string[];
  readonly synthetic: boolean;
  readonly items: Item[];
  towns: Town[];
  paused: boolean;
  src: number;
  live: number;
  dead: number;
  open: number;
  pending: number;
  failed: number;
  kept: number;
  rejected: number;
  recent: number;
  blocks: BlockCounts;
  /** The furthest stage a live item reached (-1: none); `extent`: the furthest stage anything reached. */
  reach: number;
  extent: number;
  decided: number;
  /** Kept share of decided work: the honest signal of a river worth following. */
  rate: number;
  score: number;
  /** 1-5 for the five rivers worth following, else 0. */
  rank: number;
  province: Province | null;
  y0: number;
  h: number;
  cy: number;
  amp: number;
  ph: number;
  pts: RiverPt[];
  endX: number;
  /** The dry stretch (only rejected or failed work went there) and a channel's untravelled canal to its port. */
  dryPts: Pt[] | null;
  canal: { readonly from: Pt; readonly c1: Pt; readonly c2: Pt; readonly to: Pt } | null;
  stationPts: StationPt[];
};

export type ProvinceKey = "songs" | "chan" | "adult" | "family" | "kids" | "early" | "archive";

export type Province = {
  readonly key: ProvinceKey;
  readonly basin: Basin;
  readonly name: string;
  readonly rivers: River[];
  y0: number;
  y1: number;
  /** The headwaters: genres whose live work never got past the derived seeds. */
  bundle: Bundle | null;
  blocks: BlockCounts;
};

export type Bundle = { readonly prov: Province; readonly rivers: River[]; readonly y0: number; readonly y1: number; readonly x: number };

export type Basin = {
  readonly key: FamilyKey;
  readonly name: string;
  readonly fam: Family;
  readonly provs: Province[];
  rivers: River[];
  blocks: BlockCounts;
  live: number;
  open: number;
  failed: number;
  pending: number;
  kept: number;
  outputs: number;
  y0: number;
  y1: number;
};

export type Ship = { readonly ep: Episode; readonly chan: NonNullable<River["chan"]>; readonly it: Item | null; readonly x: number; readonly y: number; readonly label: string };

export type Port = {
  readonly chan: NonNullable<River["chan"]> | null;
  readonly song: boolean;
  readonly x: number;
  readonly y: number;
  readonly river: River;
  readonly ships: Ship[];
};

export type StationPt = { readonly s: Station; readonly x: number; readonly y: number; readonly fam: FamilyKey };
export type Post = { readonly s: Station; readonly b: Basin; readonly x: number; readonly y: number; readonly fam: FamilyKey };

/** A place on the map: what a click, a crumb, a search hit, a weir or a note anchors to. */
export type Scope =
  | { readonly type: "all" }
  | { readonly type: "basin"; readonly ref: Basin }
  | { readonly type: "prov"; readonly ref: Province }
  | { readonly type: "bundle"; readonly ref: Bundle }
  | { readonly type: "river"; readonly ref: River }
  | { readonly type: "town"; readonly ref: Town }
  | { readonly type: "port"; readonly ref: Port }
  | { readonly type: "item"; readonly ref: Item }
  | { readonly type: "ship"; readonly ref: Ship };

/** What the pointer is over: a place, a weir (a blocking point under a place), a station, or a note's flag. */
export type Hit =
  | Exclude<Scope, { type: "all" }>
  | { readonly type: "block"; readonly kind: BlockKind; readonly scope: Scope }
  | { readonly type: "station"; readonly ref: StationPt | Post }
  | { readonly type: "note"; readonly ref: string };

export type World = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

/** The land as polylines (the renderer makes its Path2D once). */
export type Land = { readonly outline: Pt[]; readonly contours: Pt[][]; readonly isolines: Pt[][] };

export type Scene = {
  readonly items: Item[];
  readonly itemBy: ReadonlyMap<string, Item>;
  readonly rivers: River[];
  readonly riverBy: ReadonlyMap<string, River>;
  readonly basins: Basin[];
  readonly channels: NonNullable<River["chan"]>[];
  readonly chanById: ReadonlyMap<string, NonNullable<River["chan"]>>;
  readonly ports: Port[];
  readonly posts: Post[];
  readonly reels: Item[];
  readonly songRiver: River;
  /** Graph adjacency: what grew from what. */
  readonly up: ReadonlyMap<string, readonly string[]>;
  readonly down: ReadonlyMap<string, readonly string[]>;
  readonly edges: readonly (readonly [Item, Item])[];
  /** The newest night (the open night packet's, else the latest `at`). */
  readonly latest: string;
  readonly world: World;
  readonly land: Land;
  /** Studio-wide blocking counts. */
  total: BlockCounts;
};
