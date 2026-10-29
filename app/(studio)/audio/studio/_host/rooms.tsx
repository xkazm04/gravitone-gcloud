"use client";

// THE CONVERSATION DRIVERS (spark audio-agent-studio). Two rooms, one stage:
//   LiveRoom     stage S2, the default. A send composes a user turn (./turns.ts) and files it with
//                the `say` Server Action as an `audio.say` event; the outside agent answers with an
//                `audio.turn` event, and the page's live feed (./StudioHost.tsx) re-reads the
//                server so the answer appears with no reload. "Thinking" = the conversation's
//                newest event is the person's (or a send is on its way).
//   FixtureRoom  `&source=fixture` and the tests: the scripted session up to a cursor; a send is
//                answered only when the script's next user turn says it (./conversation.ts).
// Both hand the same Stage the shown turns, and Stage owns the one transport, the dispatch
// (`local` kinds to the transport, `agent` kinds to the room's send) and the dock.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import { Dock } from "@gt/ui/components/dock/Dock.tsx";
import { useMix } from "@gt/ui/components/audio/useMix.ts";

import { answers, NO_ANSWER, OFFLINE_LINE, openingCursor, replyCursor, THINK_MS, visibleTurn } from "./conversation.ts";
import { dockStateOf, NOBODY_LINE, WAITING_LINE } from "./live.ts";
import { soundOf } from "./press.ts";
import { askOf, keptMix, mixChanges, mixText, newestStems, newTurnId, userTurn, type UserAsk } from "./turns.ts";
import type { Dispatch, ParsedTurn, RefusedTurn, StudioSource, VariantProps } from "./types.ts";
import { STUDIO_VIEW } from "./variants.ts";
import s from "./studio.module.css";

export type HostSessionData = {
  readonly id: string;
  readonly title: string;
  readonly turns: readonly ParsedTurn[];
  readonly refused?: readonly RefusedTurn[];
  readonly lastFrom?: "user" | "agent";
};

type Filed = { readonly ok: true; readonly value: { readonly session: string } } | { readonly ok: false; readonly error: { readonly error: string } };
/** The two Server Actions the live room calls (../_live/acts.ts), injected so the room stays testable. */
export type StudioActs = {
  readonly say: (input: { readonly session: string; readonly turn: unknown }) => Promise<Filed>;
  readonly newSession: () => Promise<Filed>;
};

type Talk = {
  readonly turns: readonly ParsedTurn[];
  readonly cursor: number;
  readonly thinking: boolean;
  readonly notice: string | null;
  readonly setNotice: (n: string | null) => void;
  /** Send the person's ask; resolves true when it went (the dock then clears its draft). */
  readonly send: (ask: UserAsk) => Promise<boolean>;
};

type RoomProps = { readonly session: HostSessionData; readonly offline: boolean; readonly presence: "listening" | "nobody"; readonly renders: "ready" | "missing" };

export function LiveRoom({ acts, onSession, ...room }: RoomProps & { readonly acts: StudioActs; readonly onSession: (id: string) => void }) {
  const router = useRouter();
  const { session, offline } = room;
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const turns = session.turns;
  // A send is on its way until the page's read holds it; then the conversation's own newest event says.
  const thinking = busy || (sent !== null && !turns.some((t) => t.turn.id === sent)) || session.lastFrom === "user";
  const send = useCallback(
    async (ask: UserAsk): Promise<boolean> => {
      if (offline) {
        setNotice(OFFLINE_LINE);
        return false;
      }
      if (busy || ask.text.trim() === "") return false;
      setBusy(true);
      setNotice(null);
      try {
        let id = session.id;
        if (id === "") {
          const made = await acts.newSession();
          if (!made.ok) {
            setNotice(`That was not sent: ${made.error.error}`);
            return false;
          }
          id = made.value.session;
        }
        const now = Date.now();
        const turnId = newTurnId(now);
        const r = await acts.say({ session: id, turn: userTurn(ask, turnId, turns.length, new Date(now).toISOString()) });
        if (!r.ok) {
          setNotice(`That was not sent: ${r.error.error}`);
          return false;
        }
        setSent(turnId);
        if (id !== session.id) onSession(id);
        else router.refresh();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [acts, busy, offline, onSession, router, session.id, turns.length],
  );
  const talk: Talk = { turns, cursor: turns.length, thinking, notice, setNotice, send };
  return <Stage {...room} source="live" talk={talk} />;
}

export function FixtureRoom(room: RoomProps) {
  const all = room.session.turns;
  const [cursor, setCursor] = useState(() => openingCursor(all));
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const send = useCallback(
    async (ask: UserAsk): Promise<boolean> => {
      if (room.offline) {
        setNotice(OFFLINE_LINE);
        return false;
      }
      if (thinking) return false;
      if (ask.mix !== undefined || !answers(all, cursor, ask.action !== undefined ? { action: ask.action } : { text: ask.text })) {
        setNotice(NO_ANSWER);
        return false;
      }
      const asked = cursor + 1;
      setCursor(asked);
      setNotice(null);
      setThinking(true);
      timer.current = setTimeout(() => {
        setCursor(replyCursor(all, asked));
        setThinking(false);
      }, THINK_MS);
      return true;
    },
    [all, cursor, room.offline, thinking],
  );
  const turns = useMemo(() => all.slice(0, cursor), [all, cursor]);
  return <Stage {...room} source="fixture" talk={{ turns, cursor, thinking, notice, setNotice, send }} />;
}

function Stage({ session, offline, presence, renders, source, talk }: RoomProps & { readonly source: StudioSource; readonly talk: Talk }) {
  const [draft, setDraft] = useState("");
  const transport = useMix();
  const { turns, send, setNotice } = talk;
  const visible = visibleTurn(turns, turns.length);

  const { toggle, setMix, mixOf } = transport;
  const dispatch = useCallback<Dispatch>(
    (a, turnId) => {
      if (STUDIO_ACTION_GOES[a.kind] === "agent") {
        void send(askOf(a));
        return;
      }
      if (a.kind === "play" || a.kind === "hear") {
        const turn = turnId === undefined ? visible?.turn : turns.find((t) => t.turn.id === turnId)?.turn;
        const sound = turn === undefined ? null : soundOf(turn, a);
        if (sound === null) setNotice("That piece has no sound to play yet.");
        else toggle(sound.key, sound.layers, { spans: sound.spans, name: sound.name });
      } else if (a.kind === "mute") setMix(a.stem, { muted: a.on });
      else if (a.kind === "solo") setMix(a.stem, { solo: a.on });
      else if (a.kind === "level") setMix(a.stem, { levelDb: a.db });
      else if (a.kind === "pan") setMix(a.stem, { pan: a.pan });
    },
    [send, setNotice, turns, visible, toggle, setMix],
  );

  const stems = useMemo(() => newestStems(turns), [turns]);
  const kept = useMemo(() => (stems === null ? null : keptMix(stems.node, mixOf)), [stems, mixOf]);
  const changes = useMemo(() => (stems === null || kept === null ? [] : mixChanges(stems.node, kept)), [stems, kept]);
  const keepMix = useCallback(() => {
    if (kept === null) setNotice("There is no mix to keep yet.");
    else void send({ text: mixText(changes), mix: kept });
  }, [kept, changes, send, setNotice]);

  const state = dockStateOf(offline, talk.thinking, source === "fixture" ? "listening" : presence);
  const waiting = source === "live" && !offline && presence === "nobody";
  const notice = talk.notice ?? (waiting ? (talk.thinking ? WAITING_LINE : NOBODY_LINE) : null);
  const View = STUDIO_VIEW;
  const props: VariantProps = {
    session: { id: session.id, title: session.title, turns, cursor: talk.cursor, visible, source, refused: session.refused ?? [] },
    dock: { state, reply: visible?.turn.text ?? null, notice, presence: source === "fixture" ? "listening" : presence },
    dispatch,
    transport,
    dropped: visible?.dropped ?? [],
    renders,
    keepMix,
    mixChanges: changes,
  };
  return (
    <>
      <div className={s.frame}>
        <View {...props} />
      </div>
      <Dock
        state={state}
        reply={props.dock.reply}
        notice={notice}
        draft={draft}
        onDraft={setDraft}
        onSend={() => {
          void send({ text: draft }).then((went) => {
            if (went) setDraft("");
          });
        }}
        dropped={props.dropped}
      />
    </>
  );
}
