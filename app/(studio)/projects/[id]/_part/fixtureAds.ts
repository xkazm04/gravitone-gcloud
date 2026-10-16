import "server-only";

import { AD_RUNTIME_RANGE, EMPTY_BRIEF, type AdBrief, type AdIdea, type AdScenario, type AdTemplateId } from "@/lib/ads/types";
import { assignAngles, parseIdeas, parseScenarios } from "@/lib/ads/validate";
import { err, ok, type Result } from "@gt/domain/errors";

// THE ADS CONCEPT ROUNDS' DRY STAND-INS. A dry job runs end to end on a stand-in for every paid
// call (COMMON decision 4); for the two concept turns (v1 app/api/ads/{ideas,scenarios}, turns
// `ad-ideas` / `ad-scenarios`) the stand-in is a model ANSWER, and it goes through the same
// validator a live answer does (lib/ads/validate.ts parseIdeas / parseScenarios) - so the
// fixture's ideas obey the six-angle, reasoned-gate and timed-shot rules or the act fails with
// the validator's own findings, exactly as a live round would. The shapes are those of the
// validator's regression (pipeline/ads-prompts-regression.mts), written around THIS brief.

/** The seeded ad project's brief: v1 BriefCard's placeholders, as a filled brief. */
export const RAINSHELL: AdBrief = {
  product: "Rainshell — a packable rain jacket",
  audience: "city cyclists who commute all year",
  proposition: "This jacket keeps you dry in a downpour.",
  tone: "deadpan",
  mustInclude: ["logo on the end card"],
  cta: "Pack one today",
  platform: "vertical feed",
};

export const emptyBrief = (): AdBrief => ({ ...EMPTY_BRIEF, mustInclude: [] });

const why = (s: string): string => `yes — ${s}`;

const IDEA_SEEDS: Readonly<Record<string, { title: string; hook: string; twist: string; risk: string }>> = {
  analogy: { title: "A private cloud that rains on everyone else", hook: "a rider under a small grey cloud of their own", twist: "the weather loses, and looks embarrassed", risk: "reads as fantasy if the jacket is not in the first shot" },
  twist: { title: "The puddle splash that never lands", hook: "a bus aims for the kerb", twist: "the wave meets the shell and simply leaves", risk: "the gag can upstage the product in a feed scroll" },
  exaggeration: { title: "Monsoon commute, dry collar", hook: "a street under a waterfall of rain", twist: "the rider arrives with a dry collar and a bored face", risk: "too much water on screen hides the jacket's shape" },
  demo: { title: "Fold it into its own pocket, then the storm", hook: "a jacket folding into a fist-sized pouch", twist: "the same pouch survives a cloudburst on the next shot", risk: "a demo that runs long loses the deadpan" },
  emotional: { title: "The ride you stopped skipping", hook: "a rider looking at a rainy window, then at the bike", twist: "the reason to stay in is gone", risk: "sentiment can drift from the deadpan register" },
  absurd: { title: "Rain files a complaint", hook: "a raincloud at a service counter, holding a form", twist: "the complaint is about a jacket", risk: "the joke needs one beat too many for fifteen seconds" },
};

/** The ideas round's stand-in answer, validated. */
export function ideasStandIn(brief: AdBrief, template: AdTemplateId): Result<AdIdea[]> {
  const { slots } = assignAngles();
  const raw = {
    proposition: brief.proposition,
    truth: `${brief.product} packs into its own chest pocket and still sheds a cloudburst`,
    ask: null,
    exclusion: null,
    longlist: Array.from({ length: 14 }, (_, i) => `${brief.product.split(" ")[0]} title ${i + 1}`),
    ideas: slots.map((angle, i) => {
      const s = IDEA_SEEDS[angle] ?? { title: `Idea ${i + 1}`, hook: "a rider in the rain", twist: "the rain gives up", risk: `risk ${i + 1}` };
      return {
        slot: i + 1,
        angle,
        classifiedAs: angle,
        title: s.title,
        hook: s.hook,
        twist: s.twist,
        whyItWorks: `the truth is shown to ${brief.audience}, not stated`,
        gates: {
          swap: why("a rival's jacket does not fold into a pocket that small"),
          singleMinded: why("you stay dry in a downpour"),
          oneLine: why(s.hook),
          ownable: why("nobody in the category shows the rain losing"),
          filmable: why("stills and one motion each, no dialogue"),
        },
        pictureClaim: angle === "demo" ? "water beads off the shell — the brief's own waterproof claim" : null,
        needsTurn: template === "ad-spot-30" ? false : null,
        risk: s.risk,
      };
    }),
  };
  return validated(() => parseIdeas(raw, { brief, template }, { mint: counter("idea") }));
}

type RawShot = { parts: string[]; link: string | null; brandCue: boolean; durationS: number; image: string; motion: string; super: string | null };

/** The scenarios round's stand-in answer for one idea, validated. */
export function scenariosStandIn(brief: AdBrief, template: AdTemplateId, idea: AdIdea): Result<AdScenario[]> {
  const [lo, hi] = AD_RUNTIME_RANGE[template];
  // Shots fill the template's band less the end card's hold, in the validator's own arithmetic.
  const body = Math.max(lo, Math.min(hi, template === "ad-social-15" ? 15 : 30)) - 2;
  const shot = (over: Partial<RawShot>): RawShot => ({
    parts: ["truth"],
    link: "therefore",
    brandCue: false,
    durationS: 4,
    image: `${idea.hook}, rain hammering, the jacket's hood up`,
    motion: "slow push in; the rider glances up steadily; glossy studio product film",
    super: null,
    ...over,
  });
  const take = (title: string, logline: string, split: readonly [number, number, number]) => ({
    title,
    logline,
    medium: "glossy studio product film",
    shots: [
      shot({ parts: ["hook"], link: null, brandCue: true, durationS: split[0] }),
      shot({ parts: ["truth"], durationS: split[1], link: "but" }),
      shot({ parts: ["payoff"], durationS: split[2], super: "Dry. Every ride." }),
    ],
    musicMood: "a dry snare bed that resolves on the card",
    endCard: { cta: brief.cta, line: "Dry in a downpour." },
  });
  const r = (x: number): number => Math.round(x * 10) / 10;
  const raw = {
    scenarios: [
      take(idea.title, "A rider stays dry while the street drowns.", [r(body * 0.2), r(body * 0.42), r(body * 0.38)]),
      take(`${idea.title} — the long look`, "One held shot of the storm losing.", [r(body * 0.3), r(body * 0.4), r(body * 0.3)]),
      take(`${idea.title} — the quick cut`, "Three beats, the rain gives up by the second.", [r(body * 0.25), r(body * 0.35), r(body * 0.4)]),
    ],
  };
  return validated(() => parseScenarios(raw, { brief, template, idea }, { mint: counter("sc") }));
}

function counter(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** The validator refuses by throwing every finding at once; that sentence is the act's error. */
function validated<T>(run: () => T): Result<T> {
  try {
    return ok(run());
  } catch (e) {
    return err("invalid", e instanceof Error ? e.message : "the stand-in answer was refused");
  }
}
