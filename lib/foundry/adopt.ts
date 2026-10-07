// THE ADOPTION DRAFT — a human-proven Foundry style, as the four slots of a
// Library theme.
//
// The catalogue holds no palette and a StyleBlock needs three coloured roles,
// so the palette is READ off one plate a human kept (the style's first kept
// ledger row, which is the row the card shows: proven styles have no exemplars,
// so heroOf takes kept[0]). One plate, never a merge: three plates' palettes
// averaged is a colour nobody saw.
//
// NO PALETTE, NO THEME. A recognizer that throws, a plate that is not on this
// machine, a reply that is not exactly one entry per role — each is a draft
// with `paletteMissing` and the reason, never a guessed colour (an empty
// palette compiles to "Strict three-colour palette: ." in stylePrompt.ts).
//
// This file imports no browser module: app/foundry/styleArt.ts pulls in the
// fetch client, so the plate path is computed here (and held equal to keptPath
// by foundry-adopt.probe).

import type { ImageRef } from "@/lib/imaging/types";
import type { ColorRole, PaletteColor, Proof, StyleBlock } from "@/lib/themes";

import { FoundryError } from "./runStore";
import type { LedgerRow, StyleDef } from "./types";

export interface AdoptionDraft {
  styleId: string;
  name: string;
  block: StyleBlock;
  /** Set when no palette could be read; `reason` says why, in the vendor's or
   *  the filesystem's own words. `block.palette` is then empty. */
  paletteMissing?: true;
  reason?: string;
  /** The style's kept text-lane forge plates, as pending proofs. Empty when no
   *  theme is made (`paletteMissing`) or no plate qualifies. */
  proofs: Proof[];
  /** Eligible plates the caps kept out, with the reason; absent when none. */
  proofsLeftOut?: { count: number; reason: string };
}

/** What the draft needs from the world — injected, so a probe never touches a
 *  disk or a vendor. */
export interface AdoptIO {
  /** The plate at a run-relative path, or null when the file is not here. */
  readPlate(run: string, rel: string): Promise<ImageRef | null>;
  /** The parsed .json sidecar beside a candidate, or null when absent or unreadable. */
  readSidecar(run: string, rel: string): Promise<unknown | null>;
  recognize(image: ImageRef, instruction: string, schema: Record<string, unknown>): Promise<unknown>;
}

const ROLES: ColorRole[] = ["ground", "objects", "accent"];

/** The path a kept candidate sits at inside its run — the same shape as
 *  app/foundry/styleArt.ts keptPath. */
export function plateRel(r: LedgerRow): string {
  return `scenes/${r.scene}/candidates/${r.style}--${r.mechanism}--s${r.seed}.png`;
}

/** Most plates one adoption seeds, and the most decoded image bytes across them. */
export const SEED_CAP = 4;
export const SEED_BYTE_CAP = 8_000_000;

const decodedBytes = (b64: string): number =>
  Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

/** The model a text-lane sidecar names, or null when it is not a text-lane
 *  plate. Strict: `mechanism.reference` must be exactly false and `unet_name`
 *  a non-empty string. Anything else fails closed. */
function textLaneModel(sidecar: unknown): string | null {
  const sc = sidecar as { mechanism?: { reference?: unknown }; workflow?: Record<string, { inputs?: { unet_name?: unknown } }> } | null;
  if (sc?.mechanism?.reference !== false) return null;
  const unet = sc.workflow?.["1"]?.inputs?.unet_name;
  return typeof unet === "string" && unet ? unet : null;
}

const sidecarRel = (r: LedgerRow): string => plateRel(r).replace(/\.png$/, ".json");

/** The style's kept text-lane forge plates as pending proofs, ledger order,
 *  capped. Ref-early plates were conditioned on a franchise frame and approved
 *  proofs become pinned references, so they are never seeded. A plate whose
 *  PNG or sidecar does not read is skipped, never guessed. */
export async function seedProofs(
  ledger: LedgerRow[],
  styleId: string,
  io: AdoptIO,
  now: number,
): Promise<{ proofs: Proof[]; leftOut?: { count: number; reason: string } }> {
  const seen = new Set<string>();
  const eligible: Proof[] = [];
  for (const r of ledger) {
    if (r.style !== styleId || r.verdict !== "keep") continue;
    const rel = plateRel(r);
    const id = `forge:${r.run}/${rel}`;
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const model = textLaneModel(await io.readSidecar(r.run, sidecarRel(r)));
      if (!model) continue;
      const plate = await io.readPlate(r.run, rel);
      if (!plate) continue;
      eligible.push({
        id,
        label: `${r.scene} · seed ${r.seed} · ${model}`,
        base64: plate.base64,
        mime: plate.mime,
        state: "pending",
        note: "A forge plate, not a render by the production model.",
        model,
        createdAt: now,
      });
    } catch {
      continue;
    }
  }
  const proofs: Proof[] = [];
  let bytes = 0;
  let byteHit = false;
  for (const p of eligible) {
    const size = decodedBytes(p.base64);
    if (proofs.length >= SEED_CAP || bytes + size > SEED_BYTE_CAP) {
      byteHit = proofs.length < SEED_CAP;
      break;
    }
    proofs.push(p);
    bytes += size;
  }
  const count = eligible.length - proofs.length;
  if (!count) return { proofs };
  const reason = byteHit
    ? `the next plate would pass the ${SEED_BYTE_CAP.toLocaleString("en-US")}-byte image cap`
    : `at most ${SEED_CAP} plates are seeded`;
  return { proofs, leftOut: { count, reason } };
}

/** The one plate the palette is read from: the first kept row, ledger order. */
export function palettePlate(ledger: LedgerRow[], styleId: string): LedgerRow | undefined {
  return ledger.find((r) => r.style === styleId && r.verdict === "keep");
}

/** A palette sentence names the palette or a colour: the word palette, colour /
 *  color, hue, duotone, or a hex value. Such sentences are dropped from
 *  `finish`, so the theme never carries two palettes that can disagree. */
const PALETTE_SENTENCE = /\b(palettes?|colou?rs?|colou?red|hues?|duotone)\b|#[0-9a-f]{3,8}\b/i;

export const isPaletteSentence = (s: string): boolean => PALETTE_SENTENCE.test(s);

const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** The recipe as slots. `technique` is its first sentence; `finish` is what
 *  follows, minus the palette sentences. `subject` is the human's to write. */
export function recipeSlots(recipe: string): { technique: string; finish: string } {
  const [first = "", ...rest] = sentences(recipe);
  return { technique: first, finish: rest.filter((s) => !isPaletteSentence(s)).join(" ") };
}

export const PALETTE_INSTRUCTION =
  "Read the colours of this picture as exactly three entries, one per role. " +
  "ground: the colour of the ground the picture sits on. objects: the colour of the main forms. " +
  "accent: the one colour that stands out. Give each a plain name and a hex value (#rrggbb).";

export const PALETTE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    palette: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          hex: { type: "string" },
          role: { type: "string", enum: ROLES },
        },
        required: ["name", "hex", "role"],
      },
    },
  },
  required: ["palette"],
};

/** The reply as a palette, or the reason it is not one. Exactly one entry per
 *  role, each with a name and a #rrggbb hex; nothing is padded or repaired. */
export function readPalette(reply: unknown): { palette: PaletteColor[] } | { reason: string } {
  const list = (reply as { palette?: unknown } | null)?.palette;
  if (!Array.isArray(list)) return { reason: "The recognizer's reply held no palette." };
  const out: PaletteColor[] = [];
  for (const role of ROLES) {
    const hits = list.filter((e) => (e as { role?: unknown } | null)?.role === role);
    if (hits.length !== 1) return { reason: `The recognizer's reply did not hold exactly one ${role} colour.` };
    const { name, hex } = hits[0] as { name?: unknown; hex?: unknown };
    if (typeof name !== "string" || !name.trim() || typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex.trim()))
      return { reason: `The recognizer's ${role} colour had no usable name and #rrggbb hex.` };
    out.push({ name: name.trim(), hex: hex.trim().toLowerCase(), role });
  }
  if (list.length !== ROLES.length) return { reason: "The recognizer's reply held more than three colours." };
  return { palette: out };
}

export async function adoptionDraft(style: StyleDef, ledger: LedgerRow[], io: AdoptIO): Promise<AdoptionDraft> {
  if (style.status !== "proven")
    throw new FoundryError(`${style.name} is a candidate; only a proven style is adopted into the Library.`, 409);

  const { technique, finish } = recipeSlots(style.recipe);
  const missing = (reason: string): AdoptionDraft => ({
    styleId: style.id,
    name: style.name,
    block: { technique, subject: "", palette: [], finish },
    paletteMissing: true,
    reason,
    proofs: [],
  });

  const row = palettePlate(ledger, style.id);
  if (!row) return missing(`${style.name} has no kept plate to read a palette from.`);

  let plate: ImageRef | null;
  try {
    plate = await io.readPlate(row.run, plateRel(row));
  } catch (e) {
    return missing(e instanceof Error ? e.message : "The kept plate could not be read.");
  }
  if (!plate) return missing(`The kept plate of ${style.name} is not on this machine.`);

  let reply: unknown;
  try {
    reply = await io.recognize(plate, PALETTE_INSTRUCTION, PALETTE_SCHEMA);
  } catch (e) {
    return missing(e instanceof Error ? e.message : "The recognizer failed.");
  }
  const read = readPalette(reply);
  if ("reason" in read) return missing(read.reason);
  const seeded = await seedProofs(ledger, style.id, io, Date.now());
  return {
    styleId: style.id,
    name: style.name,
    block: { technique, subject: "", palette: read.palette, finish },
    proofs: seeded.proofs,
    ...(seeded.leftOut ? { proofsLeftOut: seeded.leftOut } : {}),
  };
}
