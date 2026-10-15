"use client";

// THE BOARD - one packet's desk on a level sheet, with the rail of every packet beside it. The
// same island serves the sheet over the Floor (@sheet/(.)board/[packet]) and the full page
// (board/[packet], a reload or a pasted link); only the sheet's way out differs: the sheet goes
// back to where it rose from, the page goes to the Floor.
//
// Every verdict, pick, undo and commit goes through the BoardPort's Server Actions
// (../_port/actions.ts, passed in as `port`) behind the gate kernel (@gt/ui/board), so this file holds no decision
// state of its own beyond the commit flow's step: the gate holds the optimistic map, the server
// holds the history.
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PacketSummary } from "@gt/domain/board";
import { createBoardGate, verdictsOfView, type BoardVerdict } from "@gt/ui/board/boardGate";
import type { BoardPacket, BoardPort, PortResult, VerdictChange } from "@gt/ui/board/port";
import { useGate } from "@gt/ui/board/useGate";
import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";
import { MatrixCull } from "@gt/ui/components/cull/MatrixCull.tsx";
import { CutReview } from "@gt/ui/components/cut/CutReview.tsx";
import { BoardDesk } from "@gt/ui/components/desk/Desk.tsx";
import { PacketRail } from "@gt/ui/components/desk/PacketRail.tsx";
import { BlindPair } from "@gt/ui/components/pair/BlindPair.tsx";
import { PacketReview } from "@gt/ui/components/review/PacketReview.tsx";
import { LevelSheet } from "@gt/ui/components/sheet/LevelSheet.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { boardFor } from "../../_shell/links.ts";
import { useShell } from "../../_shell/Providers.tsx";
import { CommitLayer, useCommitFlow } from "./commitFlow.tsx";
import { DecidedDesk } from "./DecidedDesk.tsx";
import { Losses } from "./Losses.tsx";

/** pagehide: what is still queued leaves with the page (the keepalive route, ../[packet]/keepalive). */
function beacon(id: string, rev: number, changes: readonly VerdictChange[]): void {
  navigator.sendBeacon(`${boardFor(id)}/keepalive`, new Blob([JSON.stringify({ rev, changes })], { type: "application/json" }));
}

/** The keymap mode a packet's desk binds; a decided packet has no desk, only the board's keys. */
export function deskMode(p: BoardPacket): string {
  if (p.view.state !== "open") return "board";
  if (p.view.mode === "matrix-cull") return "board.cull";
  if (p.view.mode === "blind-pair") return "board.pair";
  return p.present.cut !== undefined ? "board.cut" : "board.review";
}

export type BoardProps = {
  readonly id: string;
  readonly initial: BoardPacket;
  readonly rail: readonly PacketSummary[];
  readonly kind: "sheet" | "full";
  /** The Server Actions (../_port/actions.ts), handed down by the server page: a client module
   *  that imported them would walk the bundler into the port's zod doors. */
  readonly port: BoardPort;
  /** The decided desk's way back from a stuck v1 apply (../_port/actions.ts `redrive`). */
  readonly redrive?: (input: { readonly id: string }) => Promise<PortResult<{ readonly id: string }>>;
};

/**
 * The sheet draws only while the address is a packet's. A soft navigation elsewhere (a header
 * link, the lane crumb) leaves the `sheet` slot holding its last page - Next keeps a slot's
 * active state - so the sheet steps aside by the pathname. (Next's guide closes it with a
 * `[...catchAll]` slot page returning null; that page reads to @next/next/no-html-link-for-pages
 * as a page at every path, and failed three files outside the Board.)
 */
export function Board(props: BoardProps) {
  const path = usePathname();
  if (props.kind === "sheet" && !path.startsWith("/board/")) return null;
  return <BoardIsland {...props} />;
}

function BoardIsland({ id, initial, rail, kind, port, redrive }: BoardProps) {
  const router = useRouter();
  const { toast } = useShell();
  const [said, setSaid] = useState("");
  const [board] = useState(() => createBoardGate(port, beacon));
  const { gate, detail, verdicts: live, save, writeError, loadError } = useGate(board.gatePort);

  useEffect(() => {
    void gate.select(id);
  }, [gate, id]);

  // Until the gate's first load lands, draw what the server rendered with.
  const mine = gate.getSnapshot().id === id && detail !== null;
  const packet = mine ? detail : initial;
  const verdicts: Readonly<Record<string, BoardVerdict>> = mine ? live : verdictsOfView(initial);
  const announce = useCallback((m: string) => setSaid(m), []);

  useEffect(() => {
    if (writeError !== null) toast(writeError);
  }, [writeError, toast]);

  const refresh = useCallback(() => {
    void gate.load(id, false);
    router.refresh();
  }, [gate, id, router]);
  const flow = useCommitFlow(gate, { onDone: refresh, toast, announce });

  const open = useMemo(() => rail.filter((p) => p.state === "open"), [rail]);
  // On the sheet, another packet is a soft replace (intercepted again, the Floor stays under
  // it). On the full page a soft navigation would be intercepted too and stack a sheet over the
  // page, so the page loads the next packet as a page.
  const go = useCallback(
    (to: string) => {
      if (kind === "sheet") router.replace(boardFor(to), { scroll: false });
      else window.location.assign(boardFor(to));
    },
    [kind, router],
  );
  const step = (dir: 1 | -1) => {
    const list = open.length > 0 ? open : rail;
    const i = list.findIndex((p) => p.id === id);
    const to = list[(i + dir + list.length) % list.length];
    if (to !== undefined && to.id !== id) go(to.id);
  };
  const nextOpen = open.find((p) => p.id !== id);
  useKeys(
    "board",
    {
      packet: ({ cap }) => step(cap === "[" ? -1 : 1),
      "open-next": () => {
        if (nextOpen === undefined) return false;
        go(nextOpen.id);
      },
    },
    { facts: packet.view.state === "open" ? ["desk"] : [] },
  );

  const decide = useCallback((ids: readonly string[], v: BoardVerdict | null, label: string) => void gate.decide(ids, v, label), [gate]);
  const onPick = useCallback(
    (pair: string, outcome: Parameters<typeof board.pick>[2]) => {
      void gate
        .flush()
        .then(() => board.pick(id, pair, outcome))
        .then(
          () => gate.load(id, false),
          (e: unknown) => toast(e instanceof Error ? e.message : "the pick did not land"),
        );
    },
    [board, gate, id, toast],
  );
  const onSendPlan = useCallback(
    (plan: Parameters<typeof board.returnPacket>[1]) => {
      void gate
        .flush()
        .then(() => board.returnPacket(id, plan))
        .then(
          () => {
            toast(`edit plan sent · ${plan.length} note${plan.length === 1 ? "" : "s"}`);
            refresh();
          },
          (e: unknown) => toast(e instanceof Error ? e.message : "the edit plan did not go back"),
        );
    },
    [board, gate, id, refresh, toast],
  );

  const busy = save === "saving" || flow.busy;
  const common = { packet, onCommit: flow.start, busy, announce };
  useEffect(() => {
    if (loadError !== null) toast(loadError);
  }, [loadError, toast]);
  const desk =
    packet.view.state !== "open" ? (
      <DecidedDesk
        packet={packet}
        next={nextOpen}
        onNext={go}
        {...(redrive === undefined
          ? {}
          : {
              onRedrive: () =>
                void redrive({ id }).then((r) => {
                  toast(r.ok ? "v1 apply · redriven" : r.error.error);
                  refresh();
                }),
            })}
      />
    ) : packet.view.mode === "matrix-cull" ? (
      <MatrixCull key={id} {...common} verdicts={verdicts} decide={decide} undo={() => void gate.undo()} />
    ) : packet.view.mode === "blind-pair" ? (
      <BlindPair key={id} {...common} onPick={onPick} undo={() => void gate.undo()} />
    ) : packet.present.cut !== undefined ? (
      <CutReview key={id} {...common} decide={decide} />
    ) : (
      <PacketReview key={id} {...common} verdicts={verdicts} decide={decide} onSendPlan={onSendPlan} />
    );

  const lane = packet.view.lane;
  const close = () => (kind === "sheet" ? router.back() : router.push("/floor"));
  return (
    <LevelSheet
      trail={[
        { label: "Floor", onPress: close },
        { label: "Board", onPress: () => go(nextOpen?.id ?? id) },
        { label: `${lane.slice(0, 1).toUpperCase()}${lane.slice(1)}`, onPress: () => router.push(`/floor?lane=${lane}`) },
      ]}
      here={packet.view.title ?? packet.view.id}
      mode={deskMode(packet)}
      back="Floor"
      onClose={close}
      full={kind === "full"}
    >
      <BoardDesk rail={<PacketRail packets={rail} current={id} hrefOf={boardFor} onOpen={go} />}>
        {packet.view.state === "open" && packet.present.losses !== undefined && <Losses losses={packet.present.losses} />}
        {desk}
        {flow.open && <CommitLayer flow={flow} />}
      </BoardDesk>
      <div aria-live="polite">
        <SrOnly text={said} />
      </div>
    </LevelSheet>
  );
}
