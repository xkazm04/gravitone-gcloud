// THE STYLE PORT AS THE ATELIER HOLDS IT - client-safe (types only): the Server Actions the
// atelier calls. The view and the op shapes are the domain contract's (@gt/domain/styleView,
// L48); this file only says which verbs exist and what each answers.
//
//   loadStyle    the view a route draws (an unknown id is a 404 at the page, not here).
//   opStyle      one edit at the rev it was made against: applied (with the id of a duplicate
//                it created), `conflict` with the view as it is now, or `refused` with the
//                ratchet's own sentence (a lock one-way, a frozen block, a gate not met) - in each
//                of the last two nothing was written.
//   actReceipt   the price of an act that calls out (adopt, generate-proofs) before anything
//                runs (Phase 4 COMMON decision 3). A live read on a dry-only side is refused.
//   act          the receipt's confirm with its token: launched (the job id and the view after
//                its landing), or stale with the fresh receipt and nothing launched.
//
// Every verb answers the action core's envelope (app/_server/actionCore.ts), never a throw.
import type { Receipt, ReceiptMode, StaleReceipt } from "@gt/domain/produce";
import type { StyleAct, StyleOpOutcome, StyleOpRequest, StyleView } from "@gt/domain/styleView";

import type { ActionResult } from "../../../../_server/actionCore.ts";

type R<T> = Promise<ActionResult<T>>;

/** A confirmed act. (Asked of L48: a `StyleActOutcome` beside `StyleAct` in @gt/domain/styleView retires this.) */
export type StyleActOutcome = { readonly kind: "launched"; readonly jobId: string; readonly view: StyleView } | StaleReceipt;

export type StylePort = {
  readonly loadStyle: (i: { readonly id: string }) => R<StyleView>;
  readonly opStyle: (i: StyleOpRequest) => R<StyleOpOutcome>;
  readonly actReceipt: (i: { readonly act: StyleAct; readonly mode: ReceiptMode }) => R<Receipt>;
  readonly act: (i: { readonly act: StyleAct; readonly mode: ReceiptMode; readonly token: string }) => R<StyleActOutcome>;
};
