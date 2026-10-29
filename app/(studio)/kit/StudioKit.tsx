"use client";

// THE AUDIO STUDIO'S HOST PARTS (spark audio-agent-studio, WP1): the bottom dock in its three
// states (one with a dropped-piece disclosure), the transport row idle, playing and failed, and the
// fader as a level and as a pan. Literal data; nothing here sends, fetches or plays.
import { useState } from "react";

import type { StudioDropped } from "@gt/domain/audio.studio";
import { TransportRow } from "@gt/ui/components/audio/TransportRow.tsx";
import { Dock } from "@gt/ui/components/dock/Dock.tsx";
import { Fader } from "@gt/ui/components/fader/Fader.tsx";

import { inert } from "./ContractHooks.tsx";
import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const DROPPED: readonly StudioDropped[] = [
  { at: "show[4]", kind: "waterfall3d", reason: 'unknown kind "waterfall3d"' },
  { at: "actions[4]", kind: "pick", reason: 'names piece "no-such-duel", which is not on screen' },
];
const SUNO_REPLY = "Here is a Suno prompt for a late-night drive, and a free local sketch of the same idea. Paste it into Suno and tell me which take works.";
const REPLY = "Here is a head-nod beat at 84 bpm in A minor with lo-fi keys. You asked for piano, so I can swap the keys for a felt piano. Have a listen.";

function DockSpecimen() {
  const [draft, setDraft] = useState("use the felt piano");
  return (
    <Spec names={["Dock"]} source="dock/Dock.tsx · dock.ts" wide>
      <Row label="listening">
        <div className={k.grow}>
          <Dock state="listening" reply={REPLY} draft={draft} onDraft={setDraft} onSend={inert} dropped={DROPPED} />
        </div>
      </Row>
      <Row label="thinking">
        <div className={k.grow}>
          <Dock state="thinking" reply={REPLY} notice="This scripted session has no answer to that yet (stage S1)." draft="" onDraft={inert} onSend={inert} dropped={[]} />
        </div>
      </Row>
      <Row label="offline">
        <div className={k.grow}>
          <Dock state="offline" reply={null} draft="" onDraft={inert} onSend={inert} dropped={[]} />
        </div>
      </Row>
      <Row label="verdict row">
        <div className={k.grow}>
          <Dock state="listening" reply={SUNO_REPLY} draft="" onDraft={inert} onSend={inert} dropped={[]} verdict={{ promptId: "p1", onSend: async () => null }} />
        </div>
      </Row>
    </Spec>
  );
}

function TransportSpecimen() {
  const [at, setAt] = useState(9);
  const [db, setDb] = useState(-6);
  const [pan, setPan] = useState(0.4);
  return (
    <Spec names={["TransportRow", "Fader"]} source="audio/TransportRow.tsx · audio/useMix.ts · audio/mix.ts · fader/Fader.tsx" wide>
      <Row label="idle">
        <TransportRow name="the bed" state="idle" clock={0} duration={null} onToggle={inert} onSeek={inert} onStop={inert} />
      </Row>
      <Row label="playing">
        <TransportRow name="every part of Quiet Horizon Bed" state="playing" clock={at} duration={22} onToggle={inert} onSeek={setAt} onStop={inert} />
      </Row>
      <Row label="failed">
        <TransportRow name="smooth bass alone" state="idle" clock={0} duration={null} failed="the server answered 404 · /api/sound/takes/audition/file" onToggle={inert} onSeek={inert} onStop={inert} />
      </Row>
      <Row label="level">
        <Fader label="bass level" value={db} min={-60} max={12} step={1} onChange={setDb} valueText={`${db} dB`} />
      </Row>
      <Row label="pan">
        <Fader label="echo tune pan" value={pan} min={-1} max={1} step={0.1} onChange={(v) => setPan(Math.round(v * 10) / 10)} valueText={pan === 0 ? "centre" : `${Math.abs(pan * 100).toFixed(0)}% ${pan < 0 ? "left" : "right"}`} centred />
      </Row>
    </Spec>
  );
}

export function StudioSection() {
  return (
    <Section id="studio">
      <DockSpecimen />
      <TransportSpecimen />
    </Section>
  );
}
