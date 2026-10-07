// LANE — A PROVEN FOUNDRY STYLE BECOMES A DRAFT LIBRARY THEME (dynamic).
//
// foundry-forge-B stage 1. The catalogue holds no palette and a theme needs
// three coloured roles, so the draft READS one off the first kept plate through
// an injected recognizer. This file holds the rules that keep that honest:
//   · only a proven style is adopted, and a candidate costs no recognizer call;
//   · the plate read is the kept ledger row's path and no other file;
//   · no palette, no theme — a recognizer failure, a missing plate or a reply
//     that is not exactly one entry per role is `paletteMissing`, never a guess;
//   · the recipe's palette sentences do not reach `finish`; `subject` is empty.
// A stub port stands in for the disk and the vendor: nothing here is paid.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { keptPath, keptRows } from "@/app/foundry/styleArt";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import * as adoptRoute from "@/app/api/foundry/styles/[id]/adopt/route";
import { SEED_BYTE_CAP, SEED_CAP, adoptionDraft, isPaletteSentence, plateRel, recipeSlots, type AdoptIO } from "@/lib/foundry/adopt";
import { FoundryError } from "@/lib/foundry/store";
import type { Catalogue, LedgerRow, StyleDef } from "@/lib/foundry/types";
import { ORIGIN_WORD, getTheme, listThemes, newTheme, putTheme, statusOf, styleFits } from "@/lib/themes";

import { keepEnv, stripComments } from "./_helpers";

keepEnv([ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH"]);

const RECIPE =
  "High-end pre-rendered cinematic 3D, physically convincing materials. " +
  "A desaturated icy blue and dark steel duotone, dense cold mist hanging in the air. " +
  "Directional specular highlights, deep neutral blacks that still hold detail. " +
  "Crisp edges, shallow cinematic focus.";

const style = (over: Partial<StyleDef> = {}): StyleDef => ({
  id: "cold-photoreal-cg",
  name: "Cold photoreal CG",
  family: "3d",
  status: "proven",
  origin: { kind: "authored" },
  observables: {},
  recipe: RECIPE,
  negative: "",
  evidence: [],
  ...over,
});

const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  run: "run-a",
  scene: "rooftop",
  style: "cold-photoreal-cg",
  mechanism: "text",
  seed: 7,
  verdict: "keep",
  craft: null,
  style_score: null,
  has_text: null,
  at: "2026-10-01T00:00:00Z",
  ...over,
});

const LEDGER: LedgerRow[] = [
  row({ run: "run-a", scene: "alley", verdict: "reject", seed: 1 }),
  row({ run: "run-b", scene: "rooftop", seed: 2 }),
  row({ run: "run-c", scene: "harbour", seed: 3 }),
  row({ style: "other-style", scene: "zzz", seed: 4 }),
];

const GOOD = {
  palette: [
    { name: "steel", hex: "#2B3440", role: "ground" },
    { name: "frost", hex: "#A9C8E0", role: "objects" },
    { name: "emissive blue", hex: "#3FA9FF", role: "accent" },
  ],
};

const MODEL = "flux2_dev_fp8mixed.safetensors";
const sidecar = (reference: unknown = false, unet: unknown = MODEL) => ({
  id: "x",
  mechanism: { reference },
  workflow: { "1": { inputs: { unet_name: unet } } },
});

/** `sidecars` answers by plate path; absent entries fall back to a text-lane sidecar. */
function port(reply: unknown, plate: boolean | Error = true, sidecars: (rel: string) => unknown = () => sidecar(), b64 = "AAAA") {
  const seen = { plates: [] as { run: string; rel: string }[], calls: 0 };
  const io: AdoptIO = {
    async readPlate(run, rel) {
      seen.plates.push({ run, rel });
      if (plate instanceof Error) throw plate;
      return plate ? { base64: b64, mime: "image/png" } : null;
    },
    async readSidecar(_run, rel) {
      return sidecars(rel.replace(/\.json$/, ".png"));
    },
    async recognize() {
      seen.calls++;
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { io, seen };
}

test("1 · a proven style gives three roles, its first sentence as technique, and no subject", async () => {
  const d = await adoptionDraft(style(), LEDGER, port(GOOD).io);
  expect(d.paletteMissing).toBeUndefined();
  expect(d.block.palette.map((c) => c.role)).toEqual(["ground", "objects", "accent"]);
  expect(d.block.technique).toBe("High-end pre-rendered cinematic 3D, physically convincing materials.");
  expect(d.block.subject).toBe("");
  expect(d.name).toBe("Cold photoreal CG");
});

test("2 · a candidate is refused 409 with no plate read and no recognizer call", async () => {
  const { io, seen } = port(GOOD);
  const err = await adoptionDraft(style({ status: "candidate" }), LEDGER, io).catch((e) => e);
  expect(err).toBeInstanceOf(FoundryError);
  expect((err as FoundryError).status).toBe(409);
  expect(seen.calls).toBe(0);
  expect(seen.plates).toEqual([]);
});

test("3 · the plate read is a kept row's candidate path — never a rejected row, a source or an exemplar", async () => {
  const { io, seen } = port(GOOD);
  await adoptionDraft(style({ exemplars: [{ run: "x", file: "extract/source.png", role: "source" } as never] }), LEDGER, io);
  // Seeding reads the style's other kept plates too, never a rejected row (s1).
  expect(seen.plates.map((p) => p.rel)).toEqual([
    "scenes/rooftop/candidates/cold-photoreal-cg--text--s2.png",
    "scenes/rooftop/candidates/cold-photoreal-cg--text--s2.png",
    "scenes/harbour/candidates/cold-photoreal-cg--text--s3.png",
  ]);
  expect(seen.plates[0]).toEqual({ run: "run-b", rel: "scenes/rooftop/candidates/cold-photoreal-cg--text--s2.png" });
  for (const p of seen.plates) expect(p.rel).toMatch(/^scenes\/[^/]+\/candidates\/[^/]+\.png$/);
});

test("4 · a throwing recognizer, a throwing reader or an absent plate is paletteMissing with a reason", async () => {
  const vendor = await adoptionDraft(style(), LEDGER, port(new Error("Google refused: SAFETY")).io);
  expect(vendor.paletteMissing).toBe(true);
  expect(vendor.reason).toBe("Google refused: SAFETY");
  expect(vendor.block.palette).toEqual([]);

  const absent = port(GOOD, false);
  const gone = await adoptionDraft(style(), LEDGER, absent.io);
  expect(gone.paletteMissing).toBe(true);
  expect(gone.reason).toMatch(/not on this machine/);
  expect(absent.seen.calls, "a missing plate must not reach the recognizer").toBe(0);

  const dir = await adoptionDraft(style(), LEDGER, port(GOOD, new Error("ENOENT: foundry-out")).io);
  expect(dir.paletteMissing).toBe(true);

  const none = port(GOOD);
  const noKept = await adoptionDraft(style(), [LEDGER[0]], none.io);
  expect(noKept.paletteMissing).toBe(true);
  expect(none.seen.calls).toBe(0);
});

test("5 · a foundry theme round-trips with the seeded text-lane proofs pending, model set, status proofing", async () => {
  const d = await adoptionDraft(style(), LEDGER, port(GOOD).io);
  const made = await putTheme({
    ...newTheme("uid-1", { name: d.name, origin: "foundry", foundryStyleId: d.styleId, block: d.block, elements: [] }),
    proofs: d.proofs,
  });
  const back = await getTheme(made.id);
  expect((await listThemes("uid-1")).map((t) => t.id)).toContain(made.id);
  expect(back?.origin).toBe("foundry");
  expect(back?.foundryStyleId).toBe("cold-photoreal-cg");
  expect(back?.proofs.map((p) => p.state)).toEqual(["pending", "pending"]);
  expect(back?.proofs.map((p) => p.model)).toEqual([MODEL, MODEL]);
  expect(back?.proofs.map((p) => p.label)).toEqual([`rooftop · seed 2 · ${MODEL}`, `harbour · seed 3 · ${MODEL}`]);
  expect(back?.proofs.every((p) => p.provider === undefined && p.costUsd === undefined)).toBe(true);
  expect(back && statusOf(back)).toBe("proofing");
  expect(back?.discipline).toBeUndefined();
  expect(back?.block.palette).toHaveLength(3);
  expect(styleFits(back!, "educational")).toBe(true);
  expect(ORIGIN_WORD.foundry).toBe("from the Foundry");
});

test("5b · a style with no text-lane plate round-trips with proofs [] and status draft", async () => {
  const d = await adoptionDraft(style(), LEDGER, port(GOOD, true, () => sidecar(true)).io);
  expect(d.proofs).toEqual([]);
  const made = await putTheme({ ...newTheme("uid-1", { name: d.name, origin: "foundry", foundryStyleId: d.styleId, block: d.block, elements: [] }), proofs: d.proofs });
  const back = await getTheme(made.id);
  expect(back?.proofs).toEqual([]);
  expect(back && statusOf(back)).toBe("draft");
});

test("5c · a kept ref-early plate (reference true) is never seeded; a text-lane one beside it is", async () => {
  const d = await adoptionDraft(style(), LEDGER, port(GOOD, true, (rel) => sidecar(rel.includes("--s2.") ? true : false)).io);
  expect(d.proofs.map((p) => p.label)).toEqual([`harbour · seed 3 · ${MODEL}`]);
});

test("5d · fail closed: absent, unparseable, reference missing/true/non-false, no unet_name, absent PNG", async () => {
  const bad: unknown[] = [
    null,
    "not json",
    {},
    { workflow: { "1": { inputs: { unet_name: MODEL } } } },
    sidecar(true),
    sidecar("false"),
    sidecar(0),
    sidecar(null),
    { mechanism: { reference: false }, workflow: { "1": { inputs: {} } } },
    sidecar(false, null),
    sidecar(false, 7),
    sidecar(false, ""),
    { mechanism: { reference: false } },
  ];
  for (const b of bad) {
    const d = await adoptionDraft(style(), LEDGER, port(GOOD, true, () => b).io);
    expect(d.proofs, JSON.stringify(b)).toEqual([]);
    expect(d.paletteMissing).toBeUndefined();
  }
  const throwing = port(GOOD, true, () => {
    throw new Error("boom");
  });
  expect((await adoptionDraft(style(), LEDGER, throwing.io)).proofs).toEqual([]);

  // PNG absent for the seed candidates only: the palette plate (first kept) is still read.
  const io = port(GOOD).io;
  const first = io.readPlate;
  let n = 0;
  io.readPlate = async (run, rel) => (n++ === 0 ? first(run, rel) : null);
  expect((await adoptionDraft(style(), LEDGER, io)).proofs).toEqual([]);
});

test("5e · a rejected row, another style's row, is never seeded", async () => {
  const { io, seen } = port(GOOD);
  const d = await adoptionDraft(style(), LEDGER, io);
  const ids = d.proofs.map((p) => p.id);
  expect(ids).toEqual(["forge:run-b/" + plateRel(LEDGER[1]), "forge:run-c/" + plateRel(LEDGER[2])]);
  expect(seen.plates.some((p) => p.rel.includes("--s1.") || p.rel.includes("other-style"))).toBe(false);
});

test("5f · past SEED_CAP plates or the byte cap, the capped set is seeded in ledger order and the draft says how many were left out", async () => {
  const many = Array.from({ length: SEED_CAP + 2 }, (_, i) => row({ run: `run-${i}`, seed: 10 + i }));
  const d = await adoptionDraft(style(), many, port(GOOD).io);
  expect(d.proofs).toHaveLength(SEED_CAP);
  expect(d.proofs.map((p) => p.id)).toEqual(many.slice(0, SEED_CAP).map((r) => `forge:${r.run}/${plateRel(r)}`));
  expect(d.proofsLeftOut?.count).toBe(2);
  expect(d.proofsLeftOut?.reason).toMatch(/at most 4/);

  // ~3.3 MB each decoded: two fit under 8,000,000, the third does not.
  const big = "A".repeat(4_400_000);
  const three = many.slice(0, 3);
  const e = await adoptionDraft(style(), three, port(GOOD, true, () => sidecar(), big).io);
  expect(e.proofs).toHaveLength(2);
  expect(e.proofs.map((p) => p.id)).toEqual(three.slice(0, 2).map((r) => `forge:${r.run}/${plateRel(r)}`));
  expect(e.proofsLeftOut?.count).toBe(1);
  expect(e.proofsLeftOut?.reason).toMatch(new RegExp(SEED_BYTE_CAP.toLocaleString("en-US")));
  expect((await adoptionDraft(style(), LEDGER, port(GOOD).io)).proofsLeftOut).toBeUndefined();
});

test("5g · a paletteMissing draft carries proofs []", async () => {
  const d = await adoptionDraft(style(), LEDGER, port(new Error("nope")).io);
  expect(d.paletteMissing).toBe(true);
  expect(d.proofs).toEqual([]);
});

/* ── The route, called as a function ───────────────────────────────────────── */

const post = (id: string, auth = true) =>
  new Request(`http://studio.local/api/foundry/styles/${id}/adopt`, {
    method: "POST",
    headers: {
      ...(auth ? { authorization: "Bearer right-secret" } : {}),
      "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

test("6 · the route: 401 without the secret, 404 unknown, 409 candidate, no GET export", async () => {
  process.env[ACCESS_SECRET_VAR] = "right-secret";
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  __resetRateLimit();
  expect((await adoptRoute.POST(post("cold-photoreal-cg", false), ctx("cold-photoreal-cg"))).status).toBe(401);
  expect((await adoptRoute.POST(post("no-such-style"), ctx("no-such-style"))).status).toBe(404);
  // oil-concept-art is a candidate in the shipped catalogue; the refusal comes
  // before any recognizer call, so nothing is spent.
  const res = await adoptRoute.POST(post("oil-concept-art"), ctx("oil-concept-art"));
  expect(res.status).toBe(409);
  expect("GET" in adoptRoute, "no GET export — Next answers 405").toBe(false);
});

test("7 · the adopt action renders only for a proven style", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "app/foundry/StylesShelf.tsx"), "utf8"));
  const at = src.indexOf("adopt into Library");
  expect(at).toBeGreaterThan(0);
  const guard = src.lastIndexOf('style?.status === "proven" &&', at);
  expect(guard, "the adopt button must sit inside a proven-only guard").toBeGreaterThan(0);
  expect(at - guard, "the guard must open the button, not an earlier block").toBeLessThan(700);
});

/* ── Beyond the spec: the one plate, the finish, the reply shape ──────────── */

test("8 · the plate adopt chooses is keptPath(keptRows(cat, style)[0])", async () => {
  const s = style();
  const cat = { styles: [s], ledger: LEDGER } as unknown as Catalogue;
  const want = keptRows(cat, s)[0];
  expect(plateRel(want)).toBe(keptPath(want));
  const { io, seen } = port(GOOD);
  await adoptionDraft(s, LEDGER, io);
  expect(seen.plates[0]).toEqual({ run: want.run, rel: keptPath(want) });
});

test("9 · finish holds no hex and no palette sentence, and subject is empty", async () => {
  const slots = recipeSlots(RECIPE);
  expect(slots.finish).toBe("Directional specular highlights, deep neutral blacks that still hold detail. Crisp edges, shallow cinematic focus.");
  expect(slots.finish).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  for (const sentence of ["Saturated, vivid colours.", "A palette of two blues.", "A desaturated duotone.", "Hue shifted to #3FA9FF."])
    expect(isPaletteSentence(sentence), sentence).toBe(true);
  for (const sentence of ["Crisp edges.", "Deep neutral blacks that still hold detail."]) expect(isPaletteSentence(sentence), sentence).toBe(false);
  const d = await adoptionDraft(style(), LEDGER, port(GOOD).io);
  expect(d.block.finish).toBe(slots.finish);
  expect(d.block.subject).toBe("");
});

test("10 · a reply that is not exactly one entry per role is paletteMissing, with no palette", async () => {
  const [g, o, a] = GOOD.palette;
  const replies: unknown[] = [
    { palette: [g, o] },
    { palette: [g, g, o] },
    { palette: [g, o, { ...o, name: "second objects" }] },
    { palette: [g, o, a, a] },
    { palette: [g, o, { ...a, hex: "blue" }] },
    { palette: [g, o, { ...a, name: " " }] },
    { colors: GOOD.palette },
    null,
  ];
  for (const reply of replies) {
    const d = await adoptionDraft(style(), LEDGER, port(reply).io);
    expect(d.paletteMissing, JSON.stringify(reply)).toBe(true);
    expect(d.block.palette).toEqual([]);
  }
});

test("11 · the shelf saves the theme it makes with draft.proofs", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "app/foundry/StylesShelf.tsx"), "utf8"));
  const at = src.indexOf("putTheme(");
  expect(at).toBeGreaterThan(0);
  const call = src.slice(at, src.indexOf("router.push", at));
  expect(call).toMatch(/newTheme\(/);
  expect(call).toMatch(/proofs:\s*draft\.proofs/);
});
