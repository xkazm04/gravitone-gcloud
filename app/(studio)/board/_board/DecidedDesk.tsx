// A packet already decided (prototype index.html `DecidedDesk`): its state, what the commit
// kept and dropped, where its v1 apply stands (pending, applied, or stuck with v1's sentence
// verbatim - decision 2), its history in the Ledger, and the way to the next open pile.
import type { PacketSummary } from "@gt/domain/board";
import type { BoardPacket } from "@gt/ui/board/port";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { DeskFrame } from "@gt/ui/components/desk/Desk.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { LedgerLink } from "@gt/ui/components/ledgerlink/LedgerLink.tsx";
import { StatusPill } from "@gt/ui/components/status/StatusPill.tsx";

import { ledgerFor } from "../../_shell/links.ts";
import s from "./board.module.css";

export type DecidedDeskProps = {
  readonly packet: BoardPacket;
  readonly next: PacketSummary | undefined;
  readonly onNext: (id: string) => void;
  /** A stuck apply's redrive (dead-letter-design): pending again, a fresh attempt budget. */
  readonly onRedrive?: () => void;
};

export function DecidedDesk({ packet, next, onNext, onRedrive }: DecidedDeskProps) {
  const v = packet.view;
  const kept = v.decisions.filter((d) => d.verdict === "keep").length;
  const rejected = v.decisions.filter((d) => d.verdict === "reject").length;
  return (
    <DeskFrame
      title={v.title ?? v.id}
      {...(packet.present.load !== undefined ? { load: packet.present.load } : {})}
      marks={
        <>
          <StatusPill machine="packet" state={v.state} />
          <LedgerLink href={ledgerFor(v.id)} subject={v.title ?? v.id} />
        </>
      }
      foot={next === undefined ? <Chip label="weir clear" tone="emerald" dot /> : <Button label={`Next · ${next.title ?? next.id}`} tone="amber" shortcut={{ mode: "board", verb: "open-next" }} onPress={() => onNext(next.id)} />}
    >
      <div className={s.decided}>
        <div className={s.kv}>
          <Chip label="kept" value={kept} tone="emerald" />
          <Chip label="rejected" value={rejected} tone="rose" />
          {v.apply !== undefined && <Chip label={`v1 apply · ${v.apply.state}`} tone={v.apply.state === "applied" ? "emerald" : v.apply.state === "stuck" ? "rose" : "amber"} dot />}
          {v.returned !== undefined && <Chip label="edit plan" value={v.returned.length} tone="amber" />}
        </div>
        {v.apply?.lastError !== undefined && <ErrorLine message={v.apply.lastError} />}
        {v.apply?.state === "stuck" && onRedrive !== undefined && (
          <div className={s.kv}>
            <Button label="Redrive v1 apply" tone="amber" onPress={onRedrive} />
          </div>
        )}
      </div>
    </DeskFrame>
  );
}
