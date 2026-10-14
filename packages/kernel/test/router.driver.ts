import { z } from "zod";
import type { Actor } from "@gt/domain/event";
import { canonical, sha256Hex } from "../src/canonical.ts";
import { paid, type RunMode } from "../src/dryrun.ts";
import type { Effects } from "../src/effects.ts";
import { quote } from "../src/pricing/quote.ts";
import { claimReceipt, releaseReceipt, settleReceipt } from "../src/pricing/receipts.ts";
import { routeAndReserve, type SpendClasses } from "../src/router/reserve.ts";
import { settle } from "../src/spend/ledger.ts";
import { refusalError } from "../src/router/route.ts";
import type { Posture } from "../src/router/types.ts";
import type { Tx } from "../src/store.ts";
import { unwrap } from "../src/events.ts";

// A small real driver over the L6 kernel, shared by the dry-run and crash
// tests: route and hold and claim in one transaction, make the paid call
// through the port, settle the receipt (and let the hold go) in a second.
// Spend is kernel/spend's ledger itself (Lot 5): reserve inside the deciding
// transaction, settle with the receipt.

export const ACTOR: Actor = { kind: "machine", id: "box.render" };

export const POSTURE_PROD: Posture = { plan: { image: "prod", text: "cloud", audio: "hosted", video: "hosted" }, local: "managed-platform", retrieval: false };

/** Lot 5's ledger, with ceilings a test can choose. */
export function classes(imagingCeiling = 5): SpendClasses {
  const hour = 3_600_000;
  return {
    "imaging-usd": { id: "imaging-usd", unit: "usd", windowMs: hour, ceiling: imagingCeiling },
    "video-usd": { id: "video-usd", unit: "usd", windowMs: hour, ceiling: 15 },
    "music-audio-s": { id: "music-audio-s", unit: "audio-s", windowMs: hour, ceiling: 600 },
  };
}

const stillSchema = z.object({ media: z.string(), provider: z.string() });

export type StillWorld = { calls: number };

export type StillOptions = {
  readonly mode: RunMode;
  readonly spend: SpendClasses;
  readonly key: string;
  readonly vendorUsd?: number;
  /** The defect the crash test's negative control plants: decision and claim in two transactions. */
  readonly split?: boolean;
};

export async function renderStill(fx: Effects, w: StillWorld, o: StillOptions): Promise<{ media: string; replayed: boolean }> {
  const payload = { prompt: "a lighthouse at dusk", aspect: "16:9", size: "1K" };
  const key = { scope: "still", key: o.key, mode: o.mode.kind } as const;
  const subject = { kind: "still", id: o.key };
  const bodyHash = sha256Hex(canonical(payload));
  const decide = (t: Tx) => {
    const r = routeAndReserve(
      t,
      { req: { medium: "image", capability: "generate", units: 1, size: "1K" }, posture: POSTURE_PROD, facts: { availability: { google: { ok: true } }, now: t.at }, mode: o.mode, actor: ACTOR, subject, reservationId: `still/${o.key}` },
      o.spend,
    );
    if (r.kind === "refused") throw refusalError(r.refused);
    return r;
  };
  type First = { kind: "replay"; media: string } | { kind: "fresh"; r: ReturnType<typeof decide> };
  let first: First;
  if (o.split === true) {
    const r = unwrap(fx.tx("route", decide));
    unwrap(fx.tx("claim", (t) => void claimReceipt(t, key, bodyHash, stillSchema, ACTOR)));
    first = { kind: "fresh", r };
  } else {
    first = unwrap(
      fx.tx("route+claim", (t): First => {
        const claim = claimReceipt(t, key, bodyHash, stillSchema, ACTOR);
        if (claim.kind === "replay") return { kind: "replay", media: claim.value.media };
        const r = decide(t);
        // Over budget: the refusal commits, the claim does not stay (a failure is never retained).
        if (r.kind === "over-budget") releaseReceipt(t, key, ACTOR, r.error.message);
        return { kind: "fresh", r };
      }),
    );
  }
  if (first.kind === "replay") return { media: first.media, replayed: true };
  const { r } = first;
  if (r.kind === "over-budget") throw r.error;
  const c = r.routed.choice;
  const call = paid<{ media: string; vendorUsd: number | undefined }>(
    { provider: c.provider, model: c.model, usage: { image: 1 }, quote: c.quote, payload, subject, stand: () => ({ media: "dry:stand-in", vendorUsd: undefined }) },
    async () => {
      w.calls++;
      return { media: "sha256:pixels", vendorUsd: o.vendorUsd };
    },
  );
  const out = await fx.call("provider", call);
  unwrap(
    fx.tx("settle", (t) => {
      const q = quote({ provider: c.provider, model: c.model, usage: { image: 1 }, on: t.at, size: "1K", ...(out.vendorUsd === undefined ? {} : { vendorUsd: out.vendorUsd }) });
      settleReceipt(t, key, { media: out.media, provider: c.provider }, q, ACTOR);
      if (r.hold !== null) {
        const booked = settle(t, o.spend["imaging-usd"], { id: r.hold.id, entries: [{ amount: q.usd ?? undefined, outcome: "served", basis: q.basis === "vendor-reported" ? "vendor" : "estimate", axes: { cap: "generate", provider: c.provider, model: c.model } }] });
        if (!booked.ok) throw booked.error;
      }
    }),
  );
  return { media: out.media, replayed: false };
}
