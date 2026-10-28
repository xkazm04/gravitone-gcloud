"use client";

// THE STUDIO'S HOST ISLAND (spark audio-agent-studio, stage S1): the switcher (variant, session),
// the renders-missing banner, the conversation driver, the page's one transport and the bottom
// dock. The variant in the middle draws the main frame and the side panels from VariantProps
// (./types.ts) and presses through `dispatch`; nothing it renders runs anything.
//
// Dispatch routes by the vocabulary's own table (STUDIO_ACTION_GOES): `local` kinds go to the
// transport (play a piece or a stem, hear a candidate alone or in the mix, mute, solo, level, pan),
// `agent` kinds go to the conversation as the user's next message.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Dock } from "@gt/ui/components/dock/Dock.tsx";
import { Select } from "@gt/ui/components/field/Field.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { useMix } from "@gt/ui/components/audio/useMix.ts";

import { studioHref, VARIANTS, type StudioUrl } from "../url.ts";
import { answers, NO_ANSWER, OFFLINE_LINE, openingCursor, replyCursor, THINK_MS, visibleTurn, type Ask } from "./conversation.ts";
import { soundOf } from "./press.ts";
import type { Dispatch, ParsedTurn, VariantProps } from "./types.ts";
import { VARIANT_VIEWS } from "./variants.ts";
import s from "./studio.module.css";

export type HostSessionData = { readonly id: string; readonly title: string; readonly turns: readonly ParsedTurn[] };
export type StudioHostProps = { readonly url: StudioUrl; readonly sessions: readonly HostSessionData[]; readonly renders: "ready" | "missing"; readonly note: string | null };

export function StudioHost({ url, sessions, renders, note }: StudioHostProps) {
  const router = useRouter();
  const session = sessions.find((x) => x.id === url.session) ?? sessions[0];
  const go = (u: StudioUrl): void => router.replace(studioHref(u), { scroll: false });
  return (
    <div className={s.studio}>
      <div className={s.bar}>
        <Seg label="studio layout" options={VARIANTS.map((v) => ({ value: v.id, label: v.label }))} value={url.variant} onChange={(variant) => go({ ...url, variant })} />
        {session !== undefined && <Select label="scripted session" options={sessions.map((x) => ({ value: x.id, label: x.title }))} value={session.id} onChange={(id) => go({ ...url, session: id })} />}
        <SourceTag kind="fixture" value="scripted" />
        <span className={s.grow} />
        <Toggle label="preview offline" on={url.offline} onToggle={() => go({ ...url, offline: !url.offline })} />
      </div>
      {note !== null && (
        <div className={s.banner} role="status">
          <ErrorLine message={renders === "missing" ? `Some sounds are missing: ${note}` : note} />
        </div>
      )}
      {session === undefined ? (
        <p className={s.empty}>No scripted session to show.</p>
      ) : (
        <Room key={`${session.id}|${url.offline}`} session={session} variant={url.variant} offline={url.offline} renders={renders} />
      )}
    </div>
  );
}

function Room({ session, variant, offline, renders }: { readonly session: HostSessionData; readonly variant: StudioUrl["variant"]; readonly offline: boolean; readonly renders: "ready" | "missing" }) {
  const all = session.turns;
  const [cursor, setCursor] = useState(() => openingCursor(all));
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transport = useMix();

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const shown = useMemo(() => all.slice(0, cursor), [all, cursor]);
  const visible = visibleTurn(all, cursor);

  const send = useCallback(
    (ask: Ask): boolean => {
      if (offline) {
        setNotice(OFFLINE_LINE);
        return false;
      }
      if (thinking) return false;
      if (!answers(all, cursor, ask)) {
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
    [all, cursor, offline, thinking],
  );

  const { toggle, setMix } = transport;
  const dispatch = useCallback<Dispatch>(
    (a, turnId) => {
      if (STUDIO_ACTION_GOES[a.kind] === "agent") {
        send({ action: a.id });
        return;
      }
      if (a.kind === "play" || a.kind === "hear") {
        const turn = turnId === undefined ? visible?.turn : shown.find((t) => t.turn.id === turnId)?.turn;
        const sound = turn === undefined ? null : soundOf(turn, a);
        if (sound === null) setNotice("That piece has no sound to play yet.");
        else toggle(sound.key, sound.layers, { spans: sound.spans, name: sound.name });
      } else if (a.kind === "mute") setMix(a.stem, { muted: a.on });
      else if (a.kind === "solo") setMix(a.stem, { solo: a.on });
      else if (a.kind === "level") setMix(a.stem, { levelDb: a.db });
      else if (a.kind === "pan") setMix(a.stem, { pan: a.pan });
    },
    [send, shown, visible, toggle, setMix],
  );

  const View = VARIANT_VIEWS[variant];
  const props: VariantProps = {
    session: { id: session.id, title: session.title, turns: shown, cursor, visible },
    dock: { state: offline ? "offline" : thinking ? "thinking" : "listening", reply: visible?.turn.text ?? null, notice },
    dispatch,
    transport,
    dropped: visible?.dropped ?? [],
    renders,
  };
  return (
    <>
      <div className={s.frame}>
        <View {...props} />
      </div>
      <Dock
        state={props.dock.state}
        reply={props.dock.reply}
        notice={notice}
        draft={draft}
        onDraft={setDraft}
        onSend={() => {
          if (send({ text: draft })) setDraft("");
        }}
        dropped={props.dropped}
      />
    </>
  );
}
