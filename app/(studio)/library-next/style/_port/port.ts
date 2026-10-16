import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { err, type Result } from "@gt/domain/errors";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import type { StyleAct, StyleOpOutcome, StyleOpRequest, StyleView } from "@gt/domain/styleView";
import { blobStore } from "@gt/kernel/blob";

import { kernel } from "../../../../../lib/kernelStore.ts";
import { blobRootOf } from "../../../../../lib/parts/gates.ts";
import type { StyleActOutcome } from "./contract.ts";
import { loadStyle, opStyle, type Media } from "./fixture.ts";
import { actReceipt, confirmAct } from "./fixtureActs.ts";

// THE SEAM: which style side the atelier answers from. ONE switch, `SIDE`, the part port's shape
// (../../../projects/[id]/_part/port.ts). Wave A builds the atelier against the fixture
// (./fixture.ts, ./fixtureActs.ts); wave B writes the real side over the kernel's `styles` module
// (L48) and the imaging router, and replaces only the object `SIDE` selects. The page and the
// actions reach the port through `serverStyle()` and nothing else.
//
// Until that real side exists there is nothing to switch TO, so SIDE names only the fixture; the
// seam is kept (rather than collapsed) because wave B's substitution is the reason it exists.

export type ServerStyle = {
  readonly loadStyle: (i: { readonly id: string }) => Promise<Result<StyleView>>;
  readonly opStyle: (i: StyleOpRequest, by: string) => Promise<Result<StyleOpOutcome>>;
  readonly actReceipt: (i: { readonly act: StyleAct; readonly mode: ReceiptMode }) => Promise<Result<Receipt>>;
  readonly act: (i: { readonly act: StyleAct; readonly mode: ReceiptMode; readonly token: string }) => Promise<Result<StyleActOutcome>>;
};

export const SIDE = "fixture" as const;

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

export function serverStyle(): ServerStyle {
  return fixture;
}
