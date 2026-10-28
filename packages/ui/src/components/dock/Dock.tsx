"use client";

// THE STUDIO'S BOTTOM DOCK (spark audio-agent-studio, owner's layout): where the person talks to the
// agent that drives the studio. One line in, the agent's last reply out, a pill saying whether
// anyone is listening, and - when the door had to drop part of the visible turn - a disclosure that
// says how much and why (registry schema-driven-ui: honest repair, never silent). The dock sends
// nothing itself: `onSend` is the page's, and an offline or thinking dock refuses the press.
//
// It marks itself `data-dock`, and the shell's toast rises above `--h-dock` on any page that holds
// one (toast/Toast.module.css), so a receipt never covers the conversation.
import type { StudioDropped } from "@gt/domain/audio.studio";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { Field } from "../field/Field.tsx";
import { droppedWords, type DockState } from "./dock.ts";
import s from "./Dock.module.css";

export type DockProps = {
  readonly state: DockState;
  /** The agent's last reply; null before the first one. */
  readonly reply: string | null;
  /** One plain line from the page, under the reply ("the scripted session has no answer to that"). */
  readonly notice?: string | null;
  readonly draft: string;
  readonly onDraft: (v: string) => void;
  readonly onSend: () => void;
  /** What the door dropped from the visible turn. */
  readonly dropped: readonly StudioDropped[];
};

const PILL = {
  listening: { label: "listening", tone: "emerald" },
  thinking: { label: "thinking", tone: "amber" },
  offline: { label: "offline", tone: "neutral" },
} as const;

export function Dock({ state, reply, notice = null, draft, onDraft, onSend, dropped }: DockProps) {
  const canSend = state === "listening" && draft.trim() !== "";
  const pill = PILL[state];
  const words = droppedWords(dropped);
  return (
    <section className={s.dock} data-dock={state} aria-label="talk to the studio">
      <div className={s.said} aria-live="polite">
        <Chip label={pill.label} tone={pill.tone} dot={state !== "offline"} ghost={state === "offline"} casing="lower" />
        <p className={s.reply}>{state === "offline" ? "No agent is listening right now, so sending is off." : (reply ?? "Say what you would like to hear.")}</p>
      </div>
      {notice !== null && <p className={s.notice}>{notice}</p>}
      {words !== null && (
        <details className={s.dropped}>
          <summary>{words.summary}</summary>
          <ul>
            {words.rows.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
      <form
        className={s.send}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
      >
        <div className={s.field}>
          <Field label="your message to the studio" value={draft} onChange={onDraft} placeholder={state === "offline" ? "nobody is listening" : "make the bass softer"} maxLength={400} disabled={state !== "listening"} />
        </div>
        <Button label="Send" tone="cyan" submit disabled={!canSend} />
      </form>
    </section>
  );
}
