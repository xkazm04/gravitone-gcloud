import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import { styleView, type StyleAct, type StyleActOutcome, type StyleOpOutcome, type StyleOpRequest, type StyleView } from "@gt/domain/styleView";
import type { Store } from "@gt/kernel/store";
import { applyStyleOp, readStyle } from "@gt/kernel/styles/driver";

import { ensureStyles, exportStyles } from "../../../../../lib/foundry/catalogue.ts";
import { FoundryError, foundryFile } from "../../../../../lib/foundry/runStore.ts";
import { foundryFs } from "../../../../../lib/foundry/fsPort.ts";
import { palettePlate } from "../../../../../lib/foundry/adopt.ts";
import type { LedgerRow } from "../../../../../lib/foundry/types.ts";
import { driveStyleJob, type StyleEngines } from "../../../../../lib/producers/style.ts";
import { launchStyleAct, styleActReceipt } from "../../../../../lib/producers/styleLaunch.ts";
import type { ServerStyle } from "./port.ts";

// THE REAL STYLE SIDE (Phase 5 wave B, L54) - the atelier's four verbs over the kernel's
// `styles` module (L48) and the style producer (lib/producers/style.ts):
//   loadStyle   the record through `styleView` (@gt/domain/styleView: the ONE projection, so the
//               view the atelier draws and the one the kernel answers an op with cannot differ);
//   opStyle     `applyStyleOp` at the op's base rev - `conflict` (the truth to redraw from) and
//               `refused` (the ratchet's or the gate's sentence) write nothing; an applied op
//               re-exports pipeline/foundry/styles.json for the Python readers;
//   actReceipt  the act priced (lib/producers/styleLaunch.ts); adopt is refused here, before any
//               price, when the ledger holds no kept plate to read a palette from (v1 adopt.ts);
//   act         the confirm: one job per token, then DRIVEN on this process - awaited when dry
//               (it lands in the time of a request), started and left to finish when live (a
//               render takes its own minutes; the job's record and the Ledger carry it, and the
//               atelier reads the plates on its next load). A job that ended failed answers its
//               own sentence, so "launched" is never said of an act that wrote nothing.

export type RealStyleDeps = {
  readonly store: () => Result<Store>;
  readonly now: () => number;
  readonly dryOnly: () => boolean;
  /** The vendors; a test hands fakes. Absent: the imaging router (never reached dry). */
  readonly engines?: StyleEngines;
  /** The job's drive on this process; a test hands one that fails. Absent: the style producer's. */
  readonly drive?: typeof driveStyleJob;
};

/** A thrown v1 FoundryError (the export, the catalogue read) as the action's Result. */
async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : e.status === 409 ? "conflict" : "unavailable", e.message);
    throw e;
  }
}

async function ready(deps: RealStyleDeps): Promise<Result<Store>> {
  const s = deps.store();
  if (!s.ok) return s;
  // A store that never held a style takes the catalogue the repo carries (lib/foundry/catalogue).
  await ensureStyles(s.value);
  return s;
}

function viewOf(store: Store, id: string): Result<StyleView> {
  const r = readStyle(store, id);
  return r.ok ? ok(styleView(r.value.style, r.value.rev, r.value.updatedAt)) : r;
}

/** Whether the forge ledger holds a kept plate of this style (the plate adopt reads its palette off). */
async function keptPlateOf(styleId: string): Promise<boolean> {
  const ledger = await foundryFs().readJson<{ rows: LedgerRow[] }>(foundryFile("ledger.json"), { rows: [] });
  return palettePlate(ledger.rows, styleId) !== undefined;
}

const styleIdOf = (act: StyleAct): string => (act.kind === "adopt" ? act.fromStyleId : act.styleId);

export function makeRealStyle(deps: RealStyleDeps): ServerStyle {
  const operator = (by: string): Actor => ({ kind: "operator", id: by });
  return {
    loadStyle: ({ id }) =>
      guarded(async () => {
        const s = await ready(deps);
        return s.ok ? viewOf(s.value, id) : s;
      }),
    opStyle: (req: StyleOpRequest, by: string) =>
      guarded(async (): Promise<Result<StyleOpOutcome>> => {
        const s = await ready(deps);
        if (!s.ok) return s;
        const out = applyStyleOp(s.value, req, operator(by));
        if (out.ok && out.value.kind === "applied") exportStyles(s.value);
        return out;
      }),
    actReceipt: ({ act, mode }: { readonly act: StyleAct; readonly mode: ReceiptMode }) =>
      guarded(async (): Promise<Result<Receipt>> => {
        // ./contract.ts and the produce port's real side: no live price is drawn where nothing live may run.
        if (mode === "live" && deps.dryOnly()) return err("refused", "this process runs dry only (GRAVITONE_DRY_ONLY=1); a live receipt cannot be read here");
        const s = await ready(deps);
        if (!s.ok) return s;
        const kept = act.kind === "adopt" ? await keptPlateOf(act.fromStyleId) : true;
        return styleActReceipt(s.value, act, { mode, now: deps.now(), kept });
      }),
    act: ({ act, mode, token }, by) =>
      guarded(async (): Promise<Result<StyleActOutcome>> => {
        const s = await ready(deps);
        if (!s.ok) return s;
        const kept = act.kind === "adopt" ? await keptPlateOf(act.fromStyleId) : true;
        // The operator who confirmed is the job's actor and the landing's (the action core resolved them).
        const launched = launchStyleAct(s.value, act, token, { mode, now: deps.now(), kept, actor: operator(by), dryOnly: deps.dryOnly() });
        if (!launched.ok) return launched;
        if (launched.value.kind === "stale") return ok({ kind: "stale", fresh: launched.value.fresh });
        const { jobId, again } = launched.value;
        if (!again) {
          const drive = (deps.drive ?? driveStyleJob)(s.value, jobId, { dryOnly: deps.dryOnly(), ...(deps.engines === undefined ? {} : { engines: deps.engines }) });
          if (mode === "dry") {
            const r = await drive;
            if (!r.ok) return r;
            if (r.value.outcome === "failed") return err("refused", r.value.job?.error?.message ?? r.value.reason ?? `job ${jobId} failed`);
          } else {
            // A live drive outlives the request: its ending is the job's record, read on the Ledger.
            void drive.then(
              (r) => {
                if (!r.ok) console.error(`style job ${jobId}: ${r.error.message}`);
              },
              (e: unknown) => console.error(`style job ${jobId}: ${e instanceof Error ? e.message : String(e)}`),
            );
          }
        }
        const v = viewOf(s.value, styleIdOf(act));
        return v.ok ? ok({ kind: "launched", jobId, view: v.value }) : v;
      }),
  };
}
