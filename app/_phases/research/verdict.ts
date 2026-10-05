// RESEARCH'S VERDICT — pure, over the records the step's three surfaces write.
// The rules are the mounted reporters' (ResearchStep.tsx, MusicVideoResearch.tsx),
// lifted, with one change the contract makes: a reached checkpoint (a confirmed
// scope, a confirmed spine, a decoded track) says `review`, not `done` — the
// lock is `signOff`'s. See ../_shared/stepContract.ts.
//
// Not derivable from records, by construction: the music-video attach's
// `decoding` status lives only in the session that is decoding.

import type {
  BeatPicksStepData,
  MusicVideoSourceStepData,
  ResearchStepData,
  ScopeStepData,
} from "../_shared/stepStore";
import type { ResolvedInput, StepModule, StepVerdict } from "../_shared/stepContract";
import { fixtureSource } from "../_shared/notebook/source";

import { buildCards, optInIds, scopeDiffs, type Card } from "./scope";

/** The board the scope was confirmed against — the fixture, which is what
 *  useScope deals for every caller today. Dealt once, on first use. */
let dealt: { cards: Card[]; optIn: ReadonlySet<string> } | null = null;
function board() {
  if (!dealt) {
    const source = fixtureSource();
    dealt = { cards: buildCards(source), optIn: optInIds(source) };
  }
  return dealt;
}

const nothing = (basis: string): StepVerdict => ({ state: null, reasons: [], basis });

/** Educational, and free in facts mode: the notebook, then the scope checkpoint. */
function factsVerdict(research: ResearchStepData | undefined, scope: ScopeStepData | undefined): StepVerdict {
  if (!research?.researched) return nothing("research:facts:unrun");
  if (scope?.confirmed) {
    const { cards, optIn } = board();
    const moved = scopeDiffs(cards, scope.scope ?? {}, scope.confirmed, optIn);
    if (moved.length > 0)
      return {
        state: "review",
        reasons: [
          {
            code: "scope-diverged",
            text: `${moved.length} ${moved.length === 1 ? "card" : "cards"} moved since the scope was confirmed`,
            ref: moved[0],
          },
        ],
        basis: `research:facts:confirmed:moved=${moved.join(",")}`,
      };
    return {
      state: "review",
      reasons: [{ code: "scope-confirmed", text: "scope confirmed" }],
      basis: "research:facts:confirmed",
    };
  }
  return {
    state: "working",
    reasons: [{ code: "notebook-ready", text: "notebook ready, scope not confirmed" }],
    basis: "research:facts:researched",
  };
}

/** Trailer, and free in beats mode: picks, then the confirmed spine. */
function beatsVerdict(beats: BeatPicksStepData | undefined): StepVerdict {
  if (beats?.mode !== "beats") return nothing("research:beats:none");
  if (beats.confirmed)
    return {
      state: "review",
      reasons: [{ code: "spine-confirmed", text: "spine confirmed" }],
      basis: `research:beats:spine=${spineKey(beats.confirmed)}`,
    };
  const picked = Object.values(beats.picks ?? {}).filter(Boolean).length;
  if (picked === 0) return nothing("research:beats:unpicked");
  return {
    state: "working",
    reasons: [{ code: "beats-picked", text: `${picked} ${picked === 1 ? "beat" : "beats"} picked` }],
    basis: `research:beats:picked=${picked}`,
  };
}

function musicVideoVerdict(source: MusicVideoSourceStepData | undefined): StepVerdict {
  if (!source?.envelope) return nothing("research:mv:none");
  return {
    state: "review",
    reasons: [{ code: "track-decoded", text: "track decoded" }],
    basis: `research:mv:${source.sourceAssetId ?? "?"}`,
  };
}

/** A spine as a stable string — slot order sorted, so equal spines match. */
export const spineKey = (spine: Record<string, string>): string =>
  Object.keys(spine)
    .sort()
    .map((k) => `${k}=${spine[k]}`)
    .join(",");

function verdict({ discipline, records }: ResolvedInput): StepVerdict {
  const research = records["research"] as ResearchStepData | undefined;
  const scope = records["research-scope"] as ScopeStepData | undefined;
  const beats = records["research-beats"] as BeatPicksStepData | undefined;
  if (discipline === "music-video") return musicVideoVerdict(records["music-video-source"] as MusicVideoSourceStepData | undefined);
  if (discipline === "educational") return factsVerdict(research, scope);
  if (discipline === "trailer") return beatsVerdict(beats);
  // free: whichever board the stored mode names; no mode is no board.
  if (beats?.mode === "facts") return factsVerdict(research, scope);
  return beatsVerdict(beats);
}

export const RESEARCH_STEP: StepModule = {
  key: "research",
  reads: [],
  records: ["research", "research-scope", "research-beats", "music-video-source"],
  appliesTo: () => true,
  verdict,
};
