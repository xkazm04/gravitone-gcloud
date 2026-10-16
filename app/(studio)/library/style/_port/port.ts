import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { err, type Result } from "@gt/domain/errors";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import type { StyleAct, StyleActOutcome, StyleOpOutcome, StyleOpRequest, StyleView } from "@gt/domain/styleView";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { blobStore } from "@gt/kernel/blob";

import { kernel } from "../../../../../lib/kernelStore.ts";
import { blobRootOf } from "../../../../../lib/parts/gates.ts";
import { loadStyle, opStyle, type Media } from "./fixture.ts";
import { actReceipt, confirmAct } from "./fixtureActs.ts";
import { makeRealStyle } from "./real.ts";

// THE SEAM: which style side the atelier answers from. ONE switch, `SIDE`, the produce port's
// (../../../projects/_port/port.ts): GRAVITONE_PRODUCE_SIDE=fixture selects the fixture universe
// (./fixture.ts, ./fixtureActs.ts - the fixture lane and the kit's screens), anything else the
// real side (./real.ts: the kernel's `styles` module and the style producer, wave B L54). The page
// and the actions reach a side through `serverStyle()` and nothing else.

export type ServerStyle = {
  readonly loadStyle: (i: { readonly id: string }) => Promise<Result<StyleView>>;
  readonly opStyle: (i: StyleOpRequest, by: string) => Promise<Result<StyleOpOutcome>>;
  readonly actReceipt: (i: { readonly act: StyleAct; readonly mode: ReceiptMode }) => Promise<Result<Receipt>>;
  readonly act: (i: { readonly act: StyleAct; readonly mode: ReceiptMode; readonly token: string }, by: string) => Promise<Result<StyleActOutcome>>;
};

export const SIDE: "fixture" | "real" = process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? "fixture" : "real";

/** The clock a page reads once, outside render, for the times it draws. */
export const styleNow = (): number => Date.now();

const PUBLIC = path.join(process.cwd(), "public");

/** A committed public picture as a kernel blob (content-addressed, so putting it twice is free). */
const media: Media = async (file) => {
  const k = kernel();
  if (!k.ok) return k;
  const abs = path.join(PUBLIC, file);
  if (!abs.startsWith(PUBLIC + path.sep)) return err("invalid", `fixture media ${file} is outside public/`);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(abs);
  } catch (e) {
    return err("not-found", `fixture media ${file} is not on this machine`, { cause: e });
  }
  const r: Result<BlobRef> = await blobStore(blobRootOf(k.value.store)).put(bytes, file.endsWith(".png") ? "image/png" : "image/jpeg");
  return r;
};

const fixture: ServerStyle = {
  loadStyle: ({ id }) => loadStyle(id, media),
  opStyle: (i, by) => opStyle(i, { at: new Date(styleNow()).toISOString(), by }, media),
  actReceipt: ({ act, mode }) => actReceipt(act, mode, styleNow(), media),
  act: ({ act, mode, token }) => confirmAct(act, mode, token, styleNow(), media),
};

const real: ServerStyle = makeRealStyle({
  store: () => {
    const k = kernel();
    return k.ok ? { ok: true, value: k.value.store } : k;
  },
  now: styleNow,
  dryOnly: () => dryOnlyFrom(process.env),
});

export function serverStyle(): ServerStyle {
  return SIDE === "fixture" ? fixture : real;
}
