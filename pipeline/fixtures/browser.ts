// THE BROWSER HALF OF THE FIXTURE UNIVERSE — writes fixtures-out/browser.json,
// a BrowserBundle (lib/fixtures/browserBundle.ts) that lib/fixtures/seedBrowser.ts
// pours into IndexedDB. It feeds:
//
//   Library › Styles     nine themes across draft / proofing / locked, every origin
//   Library › Assets     promoted proofs, uploaded references, the trial grid
//   Board › Proofs       the proofs of every theme that is not locked
//   Board › Adoption     explainer projects that carry research, one adoption each
//   Board › Alternatives scenes holding 2-4 kept plates with an active one
//   Board › Triage       research-scope records of mixed verdicts
//
// WHAT IT IMPORTS FROM THE APP is pure data and pure derivation only: the
// shipped renders (so frames carry the real beats), the unit derivation (so the
// frames record is the v2 shape the step itself would write), and the asset id
// helpers (so a promoted proof's id and pointer are the ones hydrateProofSrcs
// resolves). Nothing here opens a database.
//
// NOT SEEDED: audio-kind assets. The Library's Audio tab reads the server
// sound store now (pipeline/fixtures/sound.ts owns that), so a shelf row of
// kind `audio` here would be a take the tab never lists.
//
// THE LOCKED STYLES THE DEMO PROJECTS SHOULD NAME, since projectSeed rows carry
// no `themeId`: seed-glass-harbor and seed-why-bitcoin → th-fx-signal-ledger;
// seed-the-quiet-tariff and seed-two-hundred-days → th-fx-newsprint-cutout;
// seed-glass-harbor-trailer → th-fx-harbor-noir.

import { readFileSync } from "node:fs";
import path from "node:path";

import { explainerRender } from "@/app/_phases/frames/frames";
import { framesFromUnits, unitsFromRender } from "@/app/_phases/frames/picture/unit";
import { RENDER_BY_ID } from "@/app/_phases/script/renders";
import { assetFromProof, uploadPointer, type Asset } from "@/lib/assets";
import type { Proof, ProofState, Theme } from "@/lib/themes";

import { UID_TOKEN, type BrowserBundle, type BundleStep, type BundleUpload } from "../../lib/fixtures/browserBundle";
import { DAY, HOUR, ago, hash, outFile, plate, rng, toDataUri, writeJson } from "./kit";

/* ── Styles ───────────────────────────────────────────────────────────────── */

type Palette = Theme["block"]["palette"];

interface ThemeSpec {
  id: string;
  name: string;
  origin: Theme["origin"];
  presetId?: string;
  discipline?: Theme["discipline"];
  block: Theme["block"];
  elements: string[];
  /** One entry per proof: its state, and (optionally) who made it. */
  proofs: { label: string; state: ProofState; note?: string; engine?: number }[];
  locked: boolean;
  ageDays: number;
}

const ENGINES = [
  { model: "gemini-3.1-flash-image", provider: "google", costUsd: 0.039 },
  { model: "gpt-image-2.5", provider: "openai", costUsd: 0.067 },
  { model: "phoenix-1.0", provider: "leonardo", costUsd: 0.012 },
] as const;

const pal = (ground: [string, string], objects: [string, string], accent: [string, string]): Palette => [
  { name: ground[0], hex: ground[1], role: "ground" },
  { name: objects[0], hex: objects[1], role: "objects" },
  { name: accent[0], hex: accent[1], role: "accent" },
];

const THEMES: ThemeSpec[] = [
  {
    id: "th-fx-signal-ledger",
    name: "Signal Ledger",
    origin: "preset",
    presetId: "signal-ledger",
    discipline: "educational",
    block: {
      technique: "flat vector editorial illustration, hairline strokes of even weight",
      subject: "objects drawn as diagrams — the thing and its mechanism share one frame",
      palette: pal(["ink navy", "#0B1B2B"], ["paper cream", "#F5EFE0"], ["harbor cyan", "#67E8F9"]),
      finish: "matte, no gradients, generous margins",
    },
    elements: ["charts", "maps", "timelines", "captions"],
    proofs: [
      { label: "the fall", state: "approved", engine: 0 },
      { label: "the wish list", state: "approved", engine: 0 },
      { label: "the booking", state: "approved", engine: 1 },
      { label: "the flywheel", state: "approved", engine: 0 },
      { label: "the exit", state: "rejected", note: "the arrow reads as a stock chart, not a flow", engine: 2 },
      { label: "the reserve", state: "approved", engine: 1 },
    ],
    locked: true,
    ageDays: 30,
  },
  {
    id: "th-fx-newsprint-cutout",
    name: "Newsprint Cutout",
    origin: "preset",
    presetId: "newsprint-cutout",
    discipline: "educational",
    block: {
      technique: "paper collage — grayscale photographic cutouts on flat colour fields",
      subject: "subjects cut out with visible torn edges, arranged against flat blocks",
      palette: pal(["deep navy", "#1F2A44"], ["bone cream", "#F2EAD9"], ["signal coral", "#FF6F61"]),
      finish: "paper grain, hard offset shadows, halftone at 30%",
    },
    elements: ["icons", "captions", "charts"],
    proofs: [
      { label: "the crowd", state: "approved", engine: 1 },
      { label: "the ledger clerk", state: "approved", engine: 0 },
      { label: "the dock", state: "rejected", note: "cutout edges too clean to read as torn", engine: 2 },
      { label: "the tariff wall", state: "approved", engine: 0 },
    ],
    locked: true,
    ageDays: 22,
  },
  {
    id: "th-fx-harbor-noir",
    name: "Harbor Noir",
    origin: "screenshot",
    discipline: "trailer",
    block: {
      technique: "high-contrast cinematic frame, practical light and long shadow",
      subject: "one lit doorway in a wet, empty street",
      palette: pal(["wet asphalt", "#10151C"], ["sodium haze", "#C98A3B"], ["door glow", "#F4E3B2"]),
      finish: "35mm grain, crushed blacks, halation on the highlights",
    },
    elements: ["captions", "icons"],
    proofs: [
      { label: "the open door", state: "approved", engine: 1 },
      { label: "the crew at dusk", state: "approved", engine: 1 },
      { label: "the city asleep", state: "approved", engine: 0 },
    ],
    locked: true,
    ageDays: 12,
  },
  {
    id: "th-fx-blueprint",
    name: "Blueprint",
    origin: "preset",
    presetId: "blueprint",
    discipline: "educational",
    block: {
      technique: "technical drawing on blue-line stock, dimension lines and callouts",
      subject: "mechanisms as exploded diagrams with labelled parts",
      palette: pal(["cyanotype blue", "#12406B"], ["chalk white", "#EAF2F8"], ["survey yellow", "#F2C94C"]),
      finish: "faint grid, no shading, ruled borders",
    },
    elements: ["charts", "timelines", "captions"],
    proofs: [
      { label: "the booking", state: "approved", engine: 0 },
      { label: "the flywheel", state: "pending", engine: 0 },
      { label: "the exit", state: "pending", engine: 1 },
      { label: "the fall", state: "rejected", note: "grid swallows the thin strokes", engine: 2 },
      { label: "the reserve", state: "approved", engine: 0 },
    ],
    locked: false,
    ageDays: 6,
  },
  {
    id: "th-fx-chalk-argument",
    name: "Chalk Argument",
    origin: "preset",
    presetId: "chalk-argument",
    discipline: "educational",
    block: {
      technique: "chalk on slate, hand-drawn strokes with visible smudge",
      subject: "an argument laid out as a board — claim, counter-claim, arrow between",
      palette: pal(["slate", "#26302E"], ["chalk", "#E8E6DC"], ["tangerine chalk", "#F28C3C"]),
      finish: "dusty edges, uneven pressure",
    },
    elements: ["captions", "timelines"],
    proofs: [
      { label: "the fall", state: "pending", engine: 1 },
      { label: "the wish list", state: "pending", engine: 1 },
      { label: "the booking", state: "pending", engine: 0 },
    ],
    locked: false,
    ageDays: 2,
  },
  {
    id: "th-fx-data-neon",
    name: "Data Neon Promo",
    origin: "scratch",
    discipline: "ads",
    block: {
      technique: "neon line work on a deep ground, glow bleed",
      subject: "a single product silhouette with one number beside it",
      palette: pal(["night violet", "#120A24"], ["pale lilac", "#CDBDF0"], ["electric lime", "#B8FF3D"]),
      finish: "soft bloom, crisp core line, no texture",
    },
    elements: ["icons", "charts", "captions"],
    proofs: [
      { label: "hero shot", state: "approved", engine: 1 },
      { label: "the price card", state: "rejected", note: "number lost in the bloom", engine: 0 },
      { label: "the end card", state: "pending", engine: 1 },
      { label: "the offer", state: "pending", engine: 0 },
    ],
    locked: false,
    ageDays: 4,
  },
  {
    id: "th-fx-plate-fork",
    name: "Signal Ledger — warm fork",
    origin: "plate",
    block: {
      technique: "flat vector editorial illustration, hairline strokes of even weight",
      subject: "objects drawn as diagrams, the thing and its mechanism in one frame",
      palette: pal(["umber", "#2B1D14"], ["parchment", "#EFE2C8"], ["brick", "#C4553A"]),
      finish: "matte, warm paper tone, generous margins",
    },
    elements: ["charts", "captions"],
    proofs: [
      { label: "the fall", state: "rejected", note: "warmth turns the cyan story into a sepia one", engine: 0 },
      { label: "the wish list", state: "rejected", note: "accent brick disappears against umber", engine: 0 },
    ],
    locked: false,
    ageDays: 3,
  },
  {
    id: "th-fx-paper-relief",
    name: "Paper Relief",
    origin: "preset",
    presetId: "paper-relief",
    discipline: "educational",
    block: {
      technique: "layered cut-paper relief lit from one side",
      subject: "stacked paper shapes forming a landscape of the argument",
      palette: pal(["kraft", "#B79A72"], ["white card", "#F7F4EE"], ["vermilion", "#D9432B"]),
      finish: "soft contact shadows, visible paper fibre",
    },
    elements: ["icons", "maps", "captions"],
    proofs: [],
    locked: false,
    ageDays: 1,
  },
  {
    id: "th-fx-mono-sleeve",
    name: "Mono Sleeve",
    origin: "scratch",
    discipline: "music-video",
    block: {
      technique: "grainy monochrome still, record-sleeve composition",
      subject: "a lone performer half out of frame, a lot of empty ground",
      palette: pal(["graphite", "#1B1B1D"], ["fog", "#B9BCC1"], ["red tape", "#D8262F"]),
      finish: "heavy grain, offset print misregistration",
    },
    elements: ["captions"],
    proofs: [],
    locked: false,
    ageDays: 0.5,
  },
];

const hexesOf = (p: Palette) => p.map((c) => c.hex);

function buildThemes(): Theme[] {
  return THEMES.map((s) => {
    const created = ago(s.ageDays * DAY);
    const proofs: Proof[] = s.proofs.map((p, i) => {
      const eng = ENGINES[p.engine ?? 0];
      return {
        id: `pf-${s.id.replace("th-fx-", "")}-${i + 1}`,
        label: p.label,
        base64: plate(`${s.id}:${i}`, hexesOf(s.block.palette)).toString("base64"),
        mime: "image/png",
        state: p.state,
        ...(p.note ? { note: p.note } : {}),
        model: eng.model,
        provider: eng.provider,
        costUsd: eng.costUsd,
        createdAt: created + (i + 1) * 20 * 60_000,
      };
    });
    const lockedAt = s.locked ? created + (proofs.length + 1) * 20 * 60_000 + HOUR : undefined;
    return {
      id: s.id,
      uid: UID_TOKEN,
      name: s.name,
      origin: s.origin,
      ...(s.presetId ? { presetId: s.presetId } : {}),
      ...(s.discipline ? { discipline: s.discipline } : {}),
      block: s.block,
      elements: s.elements,
      proofs,
      createdAt: created,
      updatedAt: lockedAt ?? proofs.at(-1)?.createdAt ?? created,
      ...(lockedAt ? { lockedAt } : {}),
    };
  });
}

/* ── Assets ───────────────────────────────────────────────────────────────── */

interface TrialEntry {
  styleId: string;
  styleName: string;
  trialId: string;
  trialLabel: string;
  problem: string;
  beat: string;
  file: string;
  provider?: string;
  model?: string;
  grade?: unknown;
}

const PRESET_DISCIPLINE: Record<string, string> = {
  "signal-ledger": "educational",
  "newsprint-cutout": "educational",
  blueprint: "educational",
  "chalk-argument": "educational",
  "paper-relief": "educational",
  "data-neon": "educational",
};

function buildAssets(themes: Theme[]): { assets: Asset[]; uploads: BundleUpload[] } {
  const assets: Asset[] = [];

  // Promoted proofs: every approved proof of a locked style, and the approved
  // ones of one style still in proofing — a locked sheet's plates are the most
  // promotable, an open sheet's approved ones are legal to promote too.
  for (const t of themes) {
    const promotable = t.lockedAt || t.id === "th-fx-blueprint";
    if (!promotable) continue;
    for (const p of t.proofs.filter((x) => x.state === "approved")) {
      const a = assetFromProof(UID_TOKEN, t, p);
      a.createdAt = p.createdAt + HOUR / 2;
      (a.meta as { promotedAt: number }).promotedAt = p.createdAt + HOUR / 2;
      assets.push(a);
    }
  }

  // Uploaded references: bytes in `uploads`, a pointer on the row.
  const refs = [
    { id: "up-fx-harbor-ref", name: "harbor ref — dusk", path: ["trailer", "references"], pal: ["#10151C", "#C98A3B", "#F4E3B2"], file: "harbor-ref-dusk.png" },
    { id: "up-fx-ledger-ref", name: "ledger page scan", path: ["educational", "references"], pal: ["#F5EFE0", "#0B1B2B", "#67E8F9"], file: "ledger-page-scan.png" },
    { id: "up-fx-tariff-ref", name: "tariff schedule crop", path: ["educational", "references"], pal: ["#1F2A44", "#F2EAD9", "#FF6F61"], file: "tariff-schedule-crop.png" },
    { id: "up-fx-sleeve-ref", name: "sleeve study", path: ["music-video", "references"], pal: ["#1B1B1D", "#B9BCC1", "#D8262F"], file: "sleeve-study.png" },
  ];
  const uploads: BundleUpload[] = refs.map((r) => ({
    id: r.id,
    mime: "image/png",
    base64: plate(r.id, r.pal).toString("base64"),
  }));
  refs.forEach((r, i) => {
    const up = uploads[i];
    assets.push({
      id: `as-${r.id}`,
      uid: UID_TOKEN,
      path: r.path,
      name: r.name,
      src: uploadPointer(r.id),
      kind: "image",
      meta: { upload: true, uploadId: r.id, mime: "image/png", bytes: Math.floor((up.base64.length * 3) / 4), fileName: r.file },
      createdAt: ago((9 - i) * DAY),
    });
  });

  // The trial grid, as the app's own seed writes it (same content-addressed ids,
  // so an empty-shelf seed running beside this one overwrites rather than doubles).
  const trials = JSON.parse(readFileSync(path.join(process.cwd(), "public", "trials", "index.json"), "utf8")) as { entries: TrialEntry[] };
  trials.entries
    .filter((e) => (e.provider ?? "leonardo") === "google")
    .forEach((e, i) => {
      assets.push({
        id: `as-${e.provider ?? "leonardo"}-${e.styleId}-${e.trialId}`,
        uid: UID_TOKEN,
        path: [PRESET_DISCIPLINE[e.styleId] ?? "shared", "styles", "presets", e.styleId],
        name: e.trialLabel || e.trialId,
        src: e.file,
        kind: "image",
        meta: { styleName: e.styleName, trialId: e.trialId, problem: e.problem, beat: e.beat, provider: e.provider, model: e.model, grade: e.grade },
        createdAt: ago(40 * DAY) + i,
      });
    });

  // The preset thumbnails, a plain-URL shelf of their own.
  Object.keys(PRESET_DISCIPLINE).forEach((id, i) => {
    assets.push({
      id: `as-fx-thumb-${id}`,
      uid: UID_TOKEN,
      path: ["shared", "presets", "thumbnails"],
      name: id.replace(/-/g, " "),
      src: `/presets/${id}.jpg`,
      kind: "image",
      meta: { styleName: id },
      createdAt: ago(35 * DAY) + i,
    });
  });

  return { assets, uploads };
}

/* ── Step records ─────────────────────────────────────────────────────────── */

interface Card {
  descoped: boolean;
  liked: boolean;
  deepen: boolean;
}
const card = (c: Partial<Card> = {}): Card => ({ descoped: false, liked: false, deepen: false, ...c });

/** Per explainer project: the topic (the seeded one), the adopted render, and
 *  the triage state. `adopted` of undefined writes no record at all. */
const EXPLAINERS: {
  projectId: string;
  topic: string;
  renderId: string;
  adopted: string | "" | undefined;
  scope: Record<string, Card>;
  confirmed: boolean;
  /** Indices of the scenes that keep alternatives, and how many each. */
  alts: Record<number, number>;
}[] = [
  {
    projectId: "seed-glass-harbor",
    topic: "How a city's unlocked doors get chosen",
    renderId: "derived-short",
    adopted: "derived-short",
    scope: {
      "f-sbr": card({ liked: true }),
      "f-genius": card({ descoped: true }),
      "m-etf-plumbing": card({ deepen: true }),
      "r3": card({ descoped: true }),
      "counter-2": card({ liked: true }),
    },
    confirmed: false,
    alts: { 0: 3, 1: 2, 3: 4 },
  },
  {
    projectId: "seed-why-bitcoin",
    topic: "Why Bitcoin price does not rise",
    renderId: "reversal-chain",
    adopted: "reversal-chain",
    scope: {
      "f-ath": card({ liked: true }),
      "f-lth-distribution": card({ deepen: true }),
      "f-mstr-sold": card({ liked: true }),
      "f-whale-absorb": card({ descoped: true }),
      "f-midtier-distribute": card({ descoped: true }),
      "c-one-time-rerating": card({ descoped: true }),
      "counter-1": card({ descoped: true }),
      "r1": card({ liked: true }),
    },
    confirmed: true,
    alts: { 0: 2, 2: 3, 4: 2, 5: 4, 7: 3 },
  },
  {
    projectId: "seed-the-quiet-tariff",
    topic: "Who actually pays an import tariff",
    renderId: "adjudication",
    adopted: "",
    scope: {},
    confirmed: false,
    alts: { 1: 2, 2: 2 },
  },
  {
    projectId: "seed-two-hundred-days",
    topic: "How a city budgets for weather it cannot predict",
    renderId: "adjudication",
    adopted: undefined,
    scope: {
      "f-sbr-unbuilt": card({ descoped: true }),
      "f-correlation": card({ liked: true }),
      "m-treasury-flywheel": card({ liked: true, deepen: true }),
      "c-borrowed-prosperity": card({ descoped: true }),
    },
    confirmed: true,
    alts: {},
  },
];

/** How many leading scenes of a cut carry a ready plate. */
const READY_SCENES = 8;

function buildSteps(themes: Theme[]): BundleStep[] {
  const steps: BundleStep[] = [];
  const themeFor: Record<string, Theme> = {
    "seed-glass-harbor": themes.find((t) => t.id === "th-fx-signal-ledger")!,
    "seed-why-bitcoin": themes.find((t) => t.id === "th-fx-signal-ledger")!,
    "seed-the-quiet-tariff": themes.find((t) => t.id === "th-fx-newsprint-cutout")!,
    "seed-two-hundred-days": themes.find((t) => t.id === "th-fx-newsprint-cutout")!,
  };

  for (const e of EXPLAINERS) {
    steps.push({ projectId: e.projectId, phase: "research", data: { topic: e.topic, researched: true } });

    if (e.adopted !== undefined) steps.push({ projectId: e.projectId, phase: "script-adopted", data: { renderId: e.adopted } });

    // The triage board: a scope of explicit decisions, frozen when confirmed.
    if (Object.keys(e.scope).length || e.confirmed)
      steps.push({
        projectId: e.projectId,
        phase: "research-scope",
        data: { scope: e.scope, confirmed: e.confirmed ? e.scope : null },
      });

    // The cut: the shipped render's own beats, as the step derives them, with
    // plates on the leading scenes.
    const render = RENDER_BY_ID[e.renderId];
    const units = unitsFromRender(explainerRender(render), render);
    const r = rng(`browser:${e.projectId}`);
    const palette = hexesOf(themeFor[e.projectId].block.palette);
    const altsByFrame: Record<string, { activeId: string | null; alts: { id: string; plate: object; createdAt: number; seeded?: boolean }[] }> = {};

    units.forEach((u, i) => {
      if (i >= READY_SCENES) return;
      const kept = e.alts[i] ?? 0;
      const make = (n: number) => {
        const eng = ENGINES[(i + n) % 2];
        return {
          state: "ready" as const,
          src: toDataUri(plate(`${e.projectId}:${u.id}:${n}`, palette), "image/png"),
          model: eng.model,
          costUsd: eng.costUsd,
          subject: u.title,
          ...(n % 3 === 2 ? { note: "a second pass for composition" } : {}),
        };
      };
      if (kept > 1) {
        const alts = Array.from({ length: kept }, (_, n) => ({
          id: `alt-${u.id}-${n + 1}`,
          plate: make(n),
          createdAt: ago((3 - n * 0.4) * HOUR),
          ...(n === 0 ? { seeded: true } : {}),
        }));
        const active = alts[r.int(0, kept - 1)];
        altsByFrame[u.id] = { activeId: active.id, alts };
        u.plate = { ...active.plate } as typeof u.plate;
      } else {
        u.plate = make(0) as typeof u.plate;
      }
    });

    steps.push({
      projectId: e.projectId,
      phase: "frames",
      v: 2,
      data: { units, frames: framesFromUnits(units), renderId: e.renderId },
    });
    if (Object.keys(altsByFrame).length) steps.push({ projectId: e.projectId, phase: "frames-alts", data: { byFrame: altsByFrame } });
  }
  return steps;
}

/* ── Entry ────────────────────────────────────────────────────────────────── */

export function generate(): string {
  const themes = buildThemes();
  const { assets, uploads } = buildAssets(themes);
  const steps = buildSteps(themes);

  const rest = { version: 1 as const, themes, assets, uploads, steps };
  const bundle: BrowserBundle = { ...rest, seedId: hash(JSON.stringify(rest)) };
  writeJson(outFile("browser.json"), bundle);

  const status = (t: Theme) => (t.lockedAt ? "locked" : t.proofs.length ? "proofing" : "draft");
  const by = (k: string) => themes.filter((t) => status(t) === k).length;
  const proofs = themes.reduce((n, t) => n + t.proofs.length, 0);
  const kb = Math.round(Buffer.byteLength(JSON.stringify(bundle)) / 1024);
  return `${themes.length} styles (${by("draft")} draft · ${by("proofing")} proofing · ${by("locked")} locked), ${proofs} proofs, ${assets.length} assets, ${uploads.length} uploads, ${steps.length} step records, ${kb} KB`;
}
