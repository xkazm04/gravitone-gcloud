"use client";

// THE EAR'S PLAY MARK (2026-10-28): EarButton in its three states, over literal data. Nothing a
// control does here leaves the specimen: a play mark only moves through its states. (The sentence
// and its echo, the ear strip, the shape painter, the duel and the track drop retired with /audio's
// compose UI, spark audio-agent-studio stage S2: the studio's agent turns words into a track now.)
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";

import { inert } from "./ContractHooks.tsx";
import { Row, Section, Spec } from "./Spec.tsx";

export function EarSection() {
  return (
    <Section id="ear">
      <Spec names={["EarButton"]} source="audio/EarButton.tsx · AudioPreview PlayMark">
        <Row label="idle">
          <EarButton state="idle" name="rhodes" onPress={inert} />
        </Row>
        <Row label="loading">
          <EarButton state="loading" name="rhodes" onPress={inert} />
        </Row>
        <Row label="playing">
          <EarButton state="playing" name="rhodes" onPress={inert} big />
        </Row>
      </Spec>
    </Section>
  );
}
