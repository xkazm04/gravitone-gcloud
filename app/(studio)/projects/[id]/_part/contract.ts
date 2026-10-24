// THE PART PORT AS THE EDITORS HOLD IT - client-safe (types only): the Server Actions a part
// editor calls. The shapes are the domain contract's (@gt/domain/partView, written first and kept
// stable for L36's server side); this file only says which verbs exist and what each answers.
//
//   loadPart     the view a route draws (a part with no editor is a 404 at the page, not here).
//   opPart       one edit at the rev it was made against: applied, or `conflict` with the view
//                as it is now - the editor redraws from the truth and nothing was written.
//   undoPart     revert the last op still in effect, at a rev; same conflict rule.
//   actReceipt   the price of a generating act before anything runs (COMMON decision 3).
//   act          the receipt's confirm with its token: launched (the job id and the view once
//                the job landed, or with it `running` when it outlasts the confirm's wait), or
//                stale with the fresh receipt and nothing launched.
//
// Every verb answers the action core's envelope (app/_server/actionCore.ts), never a throw.

import type { EditorKind, PartAct, PartActResult, PartOp, PartOpResult, PartReceipt, PartView } from "@gt/domain/partView";

import type { ActionResult } from "../../../../_server/actionCore.ts";

type R<T> = Promise<ActionResult<T>>;
export type PartAddress = { readonly projectId: string; readonly key: string };

export type PartPort = {
  readonly loadPart: (i: PartAddress) => R<PartView>;
  readonly opPart: (i: PartAddress & { readonly baseRev: number; readonly op: PartOp<EditorKind> }) => R<PartOpResult>;
  readonly undoPart: (i: PartAddress & { readonly baseRev: number }) => R<PartOpResult>;
  readonly actReceipt: (i: PartAddress & PartAct) => R<PartReceipt>;
  readonly act: (i: PartAddress & PartAct & { readonly token: string }) => R<PartActResult>;
};
