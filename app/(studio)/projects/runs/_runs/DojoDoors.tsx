"use client";

// THE START-CYCLE DOOR (L45): each Dojo cycle the skill left `planning` with a gen-spec, and its
// one act - start it, through its receipt (../../_plan/receipt.tsx, the flow every launch takes).
// A spec its runner refuses (no stack declared, a google video) shows the refusal instead of a
// door. Before this a cycle started only from `launch.mts dojo <cycle>` or the skill.

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import type { StartableCycle } from "../../../../../lib/producers/dojo.ts";
import { outcomeOf, type ReceiptSpec } from "../../_plan/receipt.tsx";
import type { dojoReceipt, startDojo } from "./dojo.ts";
import s from "./Runs.module.css";

/** The door's two Server Actions (./dojo.ts), handed down by the page as the produce port is: a
 *  client module never imports a server module's value graph. */
export type DojoPort = { readonly receipt: typeof dojoReceipt; readonly start: typeof startDojo };

/** The receipt spec of one cycle's start: read in the asked mode, confirmed with its token. */
export function dojoSpec(port: DojoPort, id: string, done: ReceiptSpec["done"], failed: ReceiptSpec["failed"]): ReceiptSpec {
  return {
    trail: [{ label: "Runs", href: "/projects/runs" }],
    here: `dojo ${id} · start`,
    armable: true,
    read: (mode) => port.receipt({ cycle: id, mode }),
    confirm: async (token, ceilingUsd, mode) =>
      outcomeOf(await port.start({ cycle: id, mode, token, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }), (v) =>
        v.kind === "stale" ? { kind: "stale", fresh: v.fresh } : { kind: "done", note: v.note, ledger: { href: `/ledger?q=${encodeURIComponent(v.jobId)}`, subject: v.jobId } },
      ),
    done,
    failed,
  };
}

export function DojoDoors({ cycles, busy, onStart }: { readonly cycles: readonly StartableCycle[]; readonly busy: boolean; readonly onStart: (id: string) => void }) {
  if (cycles.length === 0) return null;
  return (
    <section className={s.sect} data-component="DojoDoors" aria-label="dojo cycles">
      <CapsHeading text="dojo · planning" tally={{ value: cycles.length }} />
      {cycles.map((c) => (
        <div key={c.id} className={s.row} data-cycle={c.id}>
          <span>{c.id}</span>
          {"runner" in c ? (
            <>
              <Chip label={`${c.pairs} pair${c.pairs === 1 ? "" : "s"}`} casing="lower" />
              <Chip label={`${c.runner.stack}/${c.runner.media} · ${c.runner.lane}`} casing="lower" />
              <Button size="sm" tone="cyan" label="start cycle" onPress={() => onStart(c.id)} disabled={busy} />
            </>
          ) : (
            <ErrorLine message={c.refused} />
          )}
        </div>
      ))}
    </section>
  );
}
