"use client";

// THE SONG LAB'S PIECES (spark yue2-song-lab S2, the contest winner "Knockout"): the bracket (with a hold,
// an upset, a neither, a bye, the glowing match; and with its champion), the blind match (blind, its
// window still cutting, revealed with its upset named, revealed as neither), the director's band
// (listening with proposals and its RAN detail open; nobody listening with directions waiting), the
// draw tabs with the cut open, the queue under the booth (a batch rendering; nothing booked), and the
// field sheet (rows; an empty lab). Literal data (./songLabKitData.ts); every press resolves at once.
import type { ReactNode } from "react";

import { BlindMatch } from "@gt/ui/components/songlab/BlindMatch.tsx";
import { Bracket } from "@gt/ui/components/songlab/Bracket.tsx";
import { DirectorBand } from "@gt/ui/components/songlab/DirectorBand.tsx";
import { DrawTabs } from "@gt/ui/components/songlab/DrawTabs.tsx";
import { FieldSheet } from "@gt/ui/components/songlab/FieldSheet.tsx";
import { Queue } from "@gt/ui/components/songlab/Queue.tsx";

import { Section, Spec } from "./Spec.tsx";
import { KIT_AWAY, KIT_BRACKET, KIT_CHAMPION, KIT_CUTTING, KIT_DIRECTOR, KIT_FIELD, KIT_JOBS, KIT_MATCH, KIT_NEITHER, KIT_NEXT, KIT_REVEAL } from "./songLabKitData.ts";
import k from "./kit.module.css";

const went = async (): Promise<string | null> => null;
const DEFECTS = ["vocal-garble", "loop-seam", "broken-ending", "off-brief"];

function At({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className={k.col}>
      <span className={k.lab}>{label}</span>
      {children}
    </div>
  );
}

export function SongLabSection() {
  return (
    <Section id="songlab">
      <Spec names={["Bracket"]} source="songlab/Bracket.tsx" wide>
        <At label="hold · upset · neither · bye · the match waiting">
          <Bracket bracket={KIT_BRACKET} glow="SF-1" />
        </At>
        <At label="a champion">
          <Bracket bracket={KIT_CHAMPION} selected="QF-2" />
        </At>
      </Spec>
      <Spec names={["BlindMatch"]} source="songlab/BlindMatch.tsx · useArms.ts · keys.ts" wide>
        <At label="blind · neither needs a defect">
          <BlindMatch match={KIT_MATCH} defects={DEFECTS} onVote={went} seed={{ lyrics: "a", vocal: "neither" }} />
        </At>
        <At label="window cutting">
          <BlindMatch match={KIT_CUTTING} defects={DEFECTS} onVote={went} />
        </At>
        <At label="revealed · upset">
          <BlindMatch reveal={KIT_REVEAL} defects={DEFECTS} onVote={went} onNext={() => undefined} />
        </At>
        <At label="revealed · neither">
          <BlindMatch reveal={KIT_NEITHER} defects={DEFECTS} onVote={went} />
        </At>
      </Spec>
      <Spec names={["DirectorBand"]} source="songlab/DirectorBand.tsx" wide>
        <At label="nobody listening yet">
          <DirectorBand view={KIT_AWAY} onSay={went} onKeep={went} onDrop={went} />
        </At>
        <At label="listening · ran open">
          <DirectorBand view={KIT_DIRECTOR} scripted onSay={went} onKeep={went} onDrop={went} seedPop="ran" seedPress={{ p3: { kind: "refused", reason: "yue2: no take fx-raw-s3 in the sound store" } }} />
        </At>
      </Spec>
      <Spec names={["DrawTabs", "Queue"]} source="songlab/DrawTabs.tsx · Queue.tsx" wide>
        <At label="draws · cut open">
          <DrawTabs
            tabs={[
              { drawId: "000000000001", name: "main draw", open: 8, decided: 3, total: 15 },
              { drawId: "000000000002", name: "post · s1", open: 0, decided: 6, total: 6 },
            ]}
            current="000000000001"
            hrefOf={(d) => `/kit?d=${d}#songlab`}
            head={{ rules: ["wer ≤ 10% · SongEval seeds"], cut: [{ label: "off 1.5 r8 s3", why: "cut in v1", rights: { short: "NC", licence: "CC BY-NC 4.0" } }] }}
            decided={3}
            total={15}
            upsets={1}
            fieldHref="/kit#songlab"
            seedCut
          />
        </At>
        <At label="booked next · a batch rendering">
          <Queue next={KIT_NEXT} jobs={KIT_JOBS} />
        </At>
        <At label="nothing booked">
          <Queue next={[]} jobs={[]} />
        </At>
      </Spec>
      <Spec names={["FieldSheet"]} source="songlab/FieldSheet.tsx · sheet/LevelSheet.tsx" wide>
        <At label="pass · cut · gate failed · not scored yet">
          <FieldSheet takes={KIT_FIELD} references={["my-reference.wav"]} onClose={() => undefined} onUpload={went} specimen />
        </At>
        <At label="an empty lab">
          <FieldSheet takes={[]} references={[]} onClose={() => undefined} onUpload={went} specimen />
        </At>
      </Spec>
    </Section>
  );
}
