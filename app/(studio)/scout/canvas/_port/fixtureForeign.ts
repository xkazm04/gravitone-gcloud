import "server-only";

// ANOTHER DEVICE'S PRODUCTION, ON THE FIXTURE SIDE (spark device-metadata-sync KS3). The fixture's Unlatched production
// as a second machine ("studio-pc") would export it - the same text, its own verdicts (./fixtureForeign.json), every
// node's media a reference this device cannot resolve - turned into a read-only state by the know-how import's own
// `foreignState` in memory. Nothing is written: the real production-fixture state and the repo's knowhow/ are never
// touched, and a foreign state the import did write (PRODUCTION_FIXTURE_DIR) takes its place by id.
//
// The JSON's characters are what studio-pc holds pictures of: a fixture core among them reads as held by two devices.

import { createHash } from "node:crypto";

import type { KnowhowCharacter, KnowhowProduction, MediaRef } from "@gt/domain/knowhow";

import { foreignState } from "../../../../../lib/knowhow/import.ts";
import { localFileOf } from "../../../../../lib/knowhow/media.ts";
import { fileOfUrl, fixtureSeed, type ProductionState } from "../../../../../lib/production/state.ts";
import overlay from "./fixtureForeign.json" with { type: "json" };

type Verdict = NonNullable<KnowhowProduction["nodes"][number]["verdict"]>;
const VERDICTS = overlay.verdicts as Readonly<Record<string, Verdict>>;

/** A file of the fixture as the other device names it: under its own run folder, so it never resolves here. */
function refOf(src: string, kind: MediaRef["kind"]): MediaRef | undefined {
  const q = src.indexOf("?");
  const params = new URLSearchParams(q < 0 ? "" : src.slice(q + 1));
  const rel = params.get("path");
  if (fileOfUrl(src) === null || rel === null) return undefined;
  const at = `production-fixture/${overlay.id}/${params.get("run") ?? ""}/${rel}`;
  return { kind, hash: createHash("sha256").update(at).digest("hex"), at };
}

let held: ProductionState | null | undefined;

/** The foreign production's state, built once; null when the fixture cannot be read. */
export function fixtureForeign(): ProductionState | null {
  if (held !== undefined) return held;
  const seed = fixtureSeed();
  if (!seed.ok) return (held = null);
  const p = seed.value.production;
  const record: KnowhowProduction = {
    v: 1,
    id: overlay.id,
    owner: overlay.owner,
    ownerName: overlay.ownerName,
    at: overlay.at,
    title: p.title,
    look: p.look,
    cast: p.cast.id,
    nodes: p.nodes.map((n) => {
      const media = n.media === undefined ? undefined : refOf(n.media.src, n.media.kind);
      const verdict = VERDICTS[n.id];
      return {
        id: n.id,
        station: n.station,
        label: n.label,
        state: n.state,
        madeFrom: n.madeFrom,
        ...(n.prompt === undefined ? {} : { prompt: n.prompt }),
        ...(verdict === undefined ? {} : { verdict }),
        ...(n.drift === undefined ? {} : { drift: n.drift }),
        ...(n.at === undefined ? {} : { at: n.at }),
        ...(n.dur === undefined ? {} : { dur: n.dur }),
        ...(media === undefined ? {} : { media }),
      };
    }),
  };
  const st = foreignState(record, { self: { id: "dev:fixture-self", name: "fixture" }, localFileOf });
  held = typeof st === "string" ? null : st;
  return held;
}

/** The characters the other device holds pictures of, by id. */
export const fixtureForeignCharacters = (): Readonly<Record<string, KnowhowCharacter>> => Object.fromEntries((overlay.characters as unknown as readonly KnowhowCharacter[]).map((c) => [c.id, c]));
