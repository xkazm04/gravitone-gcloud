"use client";

// THE STUDIO'S HOST ISLAND (spark audio-agent-studio): the conversation picker and "new song", the
// banner, the live feed, and the room that drives the conversation (./rooms.tsx: live through the
// ledger relay, or the scripted sessions under `&source=fixture`). The view in the middle draws the
// main frame and the side panels from VariantProps (./types.ts) and presses through `dispatch`;
// nothing it renders runs anything.
//
// LIVE: the page rendered at ledger seq `head`; the app's feed (../../../_shell/liveFeed.ts) hears
// any newer event and re-reads the server (router.refresh), so the agent's `audio.turn` appears with
// no reload. A slow backstop also re-reads - quicker while a message waits for its answer - because
// presence (a token's lastUsedAt) moves without a ledger event.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Select } from "@gt/ui/components/field/Field.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { usePollBackstop } from "@gt/ui/freshness/useFreshness";

import type { StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";

import { BACKSTOP_MS, COALESCE_MS, openFeed } from "../../../_shell/liveFeed.ts";
import { studioHref, type StudioUrl } from "../url.ts";
import { FixtureRoom, LiveRoom, type HostSessionData, type StudioActs } from "./rooms.tsx";
import { refusedLines } from "./live.ts";
import s from "./studio.module.css";

export type { HostSessionData, StudioActs };

export type StudioHostProps = {
  readonly url: StudioUrl;
  readonly sessions: readonly HostSessionData[];
  readonly renders: "ready" | "missing";
  readonly note: string | null;
  /** Live: the ledger seq the page rendered at (the feed continues from it). */
  readonly head: number;
  /** Live: is the outside agent listening (read server-side from its token's last use). */
  readonly presence: "listening" | "nobody";
  readonly acts: StudioActs;
  /** Spark suno-advisor: facts of every uploaded take, and the confirmed taste profile. */
  readonly takes: Readonly<Record<string, StudioTakeFacts>>;
  readonly taste: readonly StudioTasteLine[];
};

const NEW_TITLE = "A new song";

export function StudioHost({ url, sessions, renders, note, head, presence, acts, takes, taste }: StudioHostProps) {
  const router = useRouter();
  const live = url.source === "live";
  const [made, setMade] = useState<string | null>(null);
  const go = (u: StudioUrl): void => router.replace(studioHref(u), { scroll: false });

  // Live: the named conversation, else the newest; a named one the ledger has not heard of yet is a
  // new song (its first message files it). With no conversation at all, the dock starts one.
  const named = sessions.find((x) => x.id === url.session);
  const session: HostSessionData | undefined =
    named ?? (live && url.session !== null ? { id: url.session, title: NEW_TITLE, turns: [] } : (sessions[0] ?? (live ? { id: "", title: NEW_TITLE, turns: [] } : undefined)));
  const waiting = live && session?.lastFrom === "user";

  const firstHead = useRef(head);
  useEffect(() => (live ? openFeed({ head: firstHead.current, refresh: () => router.refresh(), fail: () => undefined }) : undefined), [live, router]);
  usePollBackstop(() => router.refresh(), waiting ? COALESCE_MS : BACKSTOP_MS, live);

  const options = [...sessions.map((x) => ({ value: x.id, label: x.title })), ...(session !== undefined && session.id !== "" && named === undefined ? [{ value: session.id, label: session.title }] : [])];
  const newSong = async (): Promise<void> => {
    const r = await acts.newSession();
    if (r.ok) go({ ...url, session: r.value.session });
    else setMade(`A new song could not be started: ${r.error.error}`);
  };
  const refused = refusedLines(session?.refused ?? []);
  return (
    <div className={s.studio}>
      <div className={s.bar}>
        {options.length > 0 && session !== undefined && <Select label={live ? "conversation" : "scripted session"} options={options} value={session.id} onChange={(id) => go({ ...url, session: id })} />}
        {live && <Button label="new song" size="sm" onPress={() => void newSong()} />}
        {live ? <SourceTag kind="session" value="live" /> : <SourceTag kind="fixture" value="scripted" />}
        <span className={s.grow} />
        <Toggle label="preview offline" on={url.offline} onToggle={() => go({ ...url, offline: !url.offline })} />
      </div>
      {(note !== null || made !== null || refused !== null) && (
        <div className={s.banner} role="status">
          {note !== null && <ErrorLine message={renders === "missing" ? `Some sounds are missing: ${note}` : note} />}
          {made !== null && <ErrorLine message={made} />}
          {refused !== null && <ErrorLine message={refused} />}
        </div>
      )}
      {session === undefined ? (
        <p className={s.empty}>No scripted session to show.</p>
      ) : live ? (
        <LiveRoom key={`${session.id}|${url.offline}`} session={session} offline={url.offline} presence={presence} renders={renders} takes={takes} taste={taste} view={url.view ?? "thread"} acts={acts} onSession={(id) => go({ ...url, session: id })} />
      ) : (
        <FixtureRoom key={`${session.id}|${url.offline}`} session={session} offline={url.offline} presence="listening" renders={renders} takes={takes} taste={taste} view={url.view ?? "thread"} />
      )}
    </div>
  );
}
