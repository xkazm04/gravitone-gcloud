// THE ADS CONCEPT VALIDATOR — what a model's answer must be before an idea or a
// scenario is kept.
//
// SERVER-SAFE AND PURE: no Node, no IndexedDB, no fetch. The two concept routes
// (app/api/ads/{ideas,scenarios}) call it on every answer, the regression
// (pipeline/ads-prompts-regression.mts) drives it with hand-written cases, and a
// client may import its constants. It never trusts the model's ids, its echo of
// the brief, or its arithmetic.
//
// VALIDATED, NEVER TRUSTED — and on both rungs, for /api/research's reason: a
// validator that only ran where the vendor could not enforce a schema is a
// validator nobody tests. A JSON schema can say "an array of six objects"; it
// cannot say "six DIFFERENT angles", "the hold of this super fits its shot", or
// "the shots plus the end card land inside the template's band". Those are the
// rules the round exists for, so they are checked here.
//
// REPAIR OR REFUSE, decided per finding and stated beside each check:
//
//   · REPAIR only what carries no judgement — identity (ids are always minted
//     here), the request's own fixed fields (the idea a scenario executes, the
//     brief's CTA, the round's truth), whitespace, and "" where null was meant.
//     A repair can never change what an idea SAYS.
//   · REFUSE everything else, with every finding at once. A refused round costs
//     one turn; a repaired claim, a truncated title or a squeezed super hold is
//     an editorial decision filed as tidying (timed-shot-list: "a mismatch is
//     never absorbed silently"). And the gates are never relaxed to fill a set:
//     "generate again into the empty angles rather than relaxing a gate"
//     (idea-screening-gates, procedure 4).

import {
  AD_ANGLES,
  AD_END_CARD_HOLD_S,
  AD_IDEA_COUNT,
  AD_RUNTIME_RANGE,
  AD_SCENARIO_COUNT,
  AD_SHOT_SECONDS,
  AD_SHOTS,
  type AdAngle,
  type AdIdea,
  type AdIdeasRequest,
  type AdScenario,
  type AdScenariosRequest,
  type AdShotSpec,
  type AdTemplateId,
} from "./types";

/* ── the brief's budgets ─────────────────────────────────────────────────── */

/** Per-field budgets for the brief. A brief is a form, not a document: a field
 *  past these is a paste accident or a prompt-injection surface, and both are
 *  cheaper to refuse at the route than to discover at a model's prices. One
 *  declaration: the route refuses past them (lib/ads/concepts.ts) and the brief
 *  card caps its inputs with them (app/_phases/research/ads/BriefCard.tsx). */
export const BRIEF_CAPS = {
  product: 200,
  audience: 300,
  proposition: 300,
  tone: 120,
  cta: 120,
  platform: 120,
  mustIncludeItems: 8,
  mustIncludeChars: 120,
} as const;

/* ── errors ───────────────────────────────────────────────────────────────── */

/** The answer is not a round this studio can keep. `findings` is the whole
 *  diagnosis — every rule that failed, not the first — because the fix is a
 *  prompt edit and one finding per run is a prompt edited five times. */
export class AdConceptError extends Error {
  constructor(
    message: string,
    readonly findings: string[],
  ) {
    super(message);
    this.name = "AdConceptError";
  }
}

/** The model could not write a proposition-and-truth from this brief and ASKED
 *  instead of inventing one (proposition-before-idea, procedure 2). Not a
 *  failure of the engine: the question goes back to the creator verbatim. */
export class AdBriefQuestion extends Error {
  constructor(readonly question: string) {
    super(question);
    this.name = "AdBriefQuestion";
  }
}

/* ── the angle assignment ─────────────────────────────────────────────────── */

/** The angle the set holds in reserve. `problem-solution` is "the category
 *  default in most markets, and the most common source of the banal execution"
 *  (angle-template-seeding) — so it is never assigned up front, and enters only
 *  when the brief's tone visibly excludes one of the six. */
export const RESERVE_ANGLE: AdAngle = "problem-solution";

/**
 * Each slot's angle, assigned BEFORE generation (angle-template-seeding, rule 1).
 * Deterministic on purpose: the route prints it into the prompt and this file
 * re-derives it to check the answer, and the two cannot disagree. Analogy and
 * exaggeration (the consequences template) lead — "always include the analogy
 * and consequences angles when they fit".
 */
export function assignAngles(): { slots: AdAngle[]; reserve: AdAngle } {
  const slots = AD_ANGLES.filter((a) => a !== RESERVE_ANGLE).slice(0, AD_IDEA_COUNT);
  return { slots, reserve: RESERVE_ANGLE };
}

/* ── the JSON the model is asked for ──────────────────────────────────────── */

// Every property is `required`, and null is spelled with `nullable` (the
// vendor's own keyword), so the native rung enforces the whole shape and the
// prompted rung is handed the same document. Field ORDER is the stage order the
// prompt asks for: proposition and truth before any idea, the long list of
// titles before the expanded survivors.

const GATES = ["swap", "singleMinded", "oneLine", "ownable", "filmable"] as const;
type GateKey = (typeof GATES)[number];

/** How each gate's verdict is labelled when it is shown to the creator. */
const GATE_WORDS: Record<GateKey, string> = {
  swap: "swap test",
  singleMinded: "one claim",
  oneLine: "one line",
  ownable: "not the category default",
  filmable: "filmable",
};

export const IDEAS_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["proposition", "truth", "ask", "exclusion", "longlist", "ideas"],
  properties: {
    proposition: { type: "string" },
    truth: { type: "string" },
    ask: { type: "string", nullable: true },
    exclusion: {
      type: "object",
      nullable: true,
      required: ["angle", "reason"],
      properties: { angle: { type: "string", enum: [...AD_ANGLES] }, reason: { type: "string" } },
    },
    longlist: { type: "array", items: { type: "string" } },
    ideas: {
      type: "array",
      items: {
        type: "object",
        required: [
          "slot",
          "angle",
          "classifiedAs",
          "title",
          "hook",
          "twist",
          "whyItWorks",
          "gates",
          "pictureClaim",
          "needsTurn",
          "risk",
        ],
        properties: {
          slot: { type: "integer" },
          angle: { type: "string", enum: [...AD_ANGLES] },
          classifiedAs: { type: "string", enum: [...AD_ANGLES] },
          title: { type: "string" },
          hook: { type: "string" },
          twist: { type: "string" },
          whyItWorks: { type: "string" },
          gates: {
            type: "object",
            required: [...GATES],
            properties: Object.fromEntries(GATES.map((g) => [g, { type: "string" }])),
          },
          pictureClaim: { type: "string", nullable: true },
          needsTurn: { type: "boolean", nullable: true },
          risk: { type: "string" },
        },
      },
    },
  },
};

const PARTS = ["hook", "set-up", "truth", "turn", "payoff"] as const;
type Part = (typeof PARTS)[number];

export const SCENARIOS_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["scenarios"],
  properties: {
    scenarios: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "logline", "medium", "shots", "musicMood", "endCard"],
        properties: {
          title: { type: "string" },
          logline: { type: "string" },
          medium: { type: "string" },
          shots: {
            type: "array",
            items: {
              type: "object",
              required: ["parts", "link", "brandCue", "durationS", "image", "motion", "super"],
              properties: {
                parts: { type: "array", items: { type: "string", enum: [...PARTS] } },
                link: { type: "string", nullable: true, enum: ["but", "therefore"] },
                brandCue: { type: "boolean" },
                durationS: { type: "number" },
                image: { type: "string" },
                motion: { type: "string" },
                super: { type: "string", nullable: true },
              },
            },
          },
          musicMood: { type: "string" },
          endCard: {
            type: "object",
            required: ["cta", "line"],
            properties: { cta: { type: "string" }, line: { type: "string", nullable: true } },
          },
        },
      },
    },
  },
};

/* ── shared helpers ───────────────────────────────────────────────────────── */

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
/** "", "none", "null", "n/a" are a model saying "no value" — REPAIRED to null. */
const textOrNull = (x: unknown): string | null => {
  const t = text(x);
  return t === "" || /^(none|null|n\/a)$/i.test(t) ? null : t;
};
export const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/** The answer as an object, whether the engine handed back parsed JSON or the
 *  text of it (a fenced block included). */
function asObject(raw: unknown, what: string): Obj {
  if (isObj(raw)) return raw;
  if (typeof raw === "string") {
    const body = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed: unknown = JSON.parse(body.slice(start, end + 1));
        if (isObj(parsed)) return parsed;
      } catch {
        /* fall through to the refusal */
      }
    }
  }
  throw new AdConceptError(`The engine's answer is not the ${what} object.`, [`the answer is not a JSON object`]);
}

/** `base`, or `base-2`, `base-3`… — whichever is not taken. Never loops on a
 *  mint that keeps returning the same value. */
function uniqueIn(taken: Set<string>, base: string): string {
  if (!taken.has(base)) return base;
  let k = 2;
  while (taken.has(`${base}-${k}`)) k++;
  return `${base}-${k}`;
}

const defaultMint = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
    .replace(/-/g, "")
    .slice(0, 10);

/* ── round 1: ideas ───────────────────────────────────────────────────────── */

export const IDEA_TITLE_MAX = 90;

/** A verdict counts as a pass only when it SAYS yes and gives its reason. "no",
 *  "unclear" or a bare "yes" is refused: a failed gate means the idea should not
 *  have been shown, and a reasonless pass is a gate nobody applied. */
const GATE_PASS = /^yes\b[\s,.:;—–-]+\S/i;

export function parseIdeas(
  raw: unknown,
  req: Pick<AdIdeasRequest, "brief" | "template">,
  opts: { mint?: () => string } = {},
): AdIdea[] {
  const mint = opts.mint ?? defaultMint;
  const root = asObject(raw, "ideas");

  // The model ASKED rather than invent a proposition or a truth. That is the
  // rule working (proposition-before-idea, procedure 2) — the question goes to
  // the creator, and no idea is kept from a brief the model could not ground.
  const ask = textOrNull(root.ask);
  if (ask) throw new AdBriefQuestion(ask);

  const findings: string[] = [];
  // REFUSE: a round with no truth has nothing for an idea to grip ("a
  // proposition alone is a slogan").
  const truth = text(root.truth);
  if (!truth) findings.push("no product truth was written before the ideas");

  // REFUSE: staged generation is the lever that measurably widens a model's
  // set (divergence-before-selection). A long list shorter than twice the set
  // means the stage was skipped.
  const longlist = Array.isArray(root.longlist) ? root.longlist.filter((t) => text(t)) : [];
  if (longlist.length < AD_IDEA_COUNT * 2)
    findings.push(`the long list of titles has ${longlist.length} entries; at least ${AD_IDEA_COUNT * 2} come before any idea is expanded`);

  // Which angles this round may hold: the six assigned, or — when the tone
  // visibly excluded one — the six minus it plus the reserve.
  const { slots, reserve } = assignAngles();
  let allowed = new Set<AdAngle>(slots);
  let exclusionNote: { angle: AdAngle; reason: string } | null = null;
  if (isObj(root.exclusion)) {
    const angle = text(root.exclusion.angle) as AdAngle;
    const reason = text(root.exclusion.reason);
    // REFUSE: an exclusion must name an assigned angle and say why, visibly
    // (angle-template-seeding: "remove it from the vocabulary for this brief,
    // visibly").
    if (!slots.includes(angle)) findings.push(`the excluded angle "${angle}" is not one of the assigned slots`);
    else if (!reason) findings.push(`angle "${angle}" was excluded without a reason`);
    else {
      exclusionNote = { angle, reason };
      allowed = new Set<AdAngle>([...slots.filter((a) => a !== angle), reserve]);
    }
  }

  const list = Array.isArray(root.ideas) ? root.ideas : [];
  // REFUSE: the count is the contract the deck is dealt from.
  if (list.length !== AD_IDEA_COUNT) findings.push(`expected ${AD_IDEA_COUNT} ideas, got ${list.length}`);

  const seenAngles = new Set<string>();
  const seenRisks = new Map<string, number>();
  const ideas: AdIdea[] = [];

  list.forEach((item, i) => {
    const n = i + 1;
    if (!isObj(item)) {
      findings.push(`idea ${n} is not an object`);
      return;
    }
    const angle = text(item.angle) as AdAngle;
    const at = `idea ${n} (${angle || "no angle"})`;

    // REFUSE: an angle outside the vocabulary, one used twice, or one this
    // round was not assigned — "two ideas from one angle are one idea seen
    // twice", and a free choice of angle is the spread left to luck.
    if (!(AD_ANGLES as readonly string[]).includes(angle)) findings.push(`${at}: "${angle}" is not an angle`);
    else if (seenAngles.has(angle)) findings.push(`${at}: angle used twice`);
    else if (!allowed.has(angle)) findings.push(`${at}: angle was not assigned to this round`);
    seenAngles.add(angle);

    // REFUSE: the model classified its own idea's mechanism as a different
    // angle — the drift angle-template-seeding rule 4 rejects.
    const classified = text(item.classifiedAs);
    if (classified && classified !== angle)
      findings.push(`${at}: its mechanism was classified as "${classified}" — it drifted out of its slot`);
    else if (!classified) findings.push(`${at}: no classification of its actual mechanism`);

    // REFUSE: a title over the limit is not cut — a truncated headline is a
    // different idea.
    const title = text(item.title);
    if (!title) findings.push(`${at}: no title`);
    else if (title.length > IDEA_TITLE_MAX) findings.push(`${at}: title is ${title.length} characters (max ${IDEA_TITLE_MAX})`);

    const hook = text(item.hook);
    const twist = text(item.twist);
    const whyItWorks = text(item.whyItWorks);
    if (!hook) findings.push(`${at}: no hook`);
    if (!twist) findings.push(`${at}: no twist`);
    if (!whyItWorks) findings.push(`${at}: no whyItWorks`);

    // REFUSE: every idea carries one specific risk at equal prominence, and a
    // risk shared with another idea "is not about any of them"
    // (honest-risk-statement).
    const risk = text(item.risk);
    if (!risk) findings.push(`${at}: no risk`);
    else {
      const key = risk.toLowerCase().replace(/\W+/g, " ").trim();
      const twin = seenRisks.get(key);
      if (twin !== undefined) findings.push(`${at}: the same risk as idea ${twin}`);
      else seenRisks.set(key, n);
    }

    // REFUSE: every gate is a yes with its reason, in words — never a score,
    // and never a failed gate shown anyway (idea-screening-gates).
    const gates = isObj(item.gates) ? item.gates : {};
    const gateNotes: string[] = [];
    for (const g of GATES) {
      const verdict = text(gates[g]);
      if (!verdict) findings.push(`${at}: no verdict for the ${GATE_WORDS[g]} gate`);
      else if (!GATE_PASS.test(verdict)) findings.push(`${at}: the ${GATE_WORDS[g]} gate does not read as a reasoned yes: "${verdict.slice(0, 80)}"`);
      else gateNotes.push(`${GATE_WORDS[g]}: ${verdict}`);
    }

    // REFUSE: a demonstration makes a factual claim with its picture; it is
    // blocking until the claim is stated and is either substantiated by the
    // brief or plainly non-literal (idea-screening-gates, the sixth question).
    const pictureClaim = textOrNull(item.pictureClaim);
    if (angle === "demo" && !pictureClaim)
      findings.push(`${at}: a demonstration idea must say what the picture claims about the product`);

    // REPAIR: whether the idea needs its turn is only asked at 30s; on the 15s
    // template it is null whatever the model said.
    const needsTurn = req.template === "ad-spot-30" && typeof item.needsTurn === "boolean" ? item.needsTurn : null;
    if (req.template === "ad-spot-30" && typeof item.needsTurn !== "boolean")
      findings.push(`${at}: needsTurn must say whether the idea can be told without its turn`);

    if (exclusionNote && angle === reserve)
      gateNotes.unshift(`replaces ${exclusionNote.angle} — ${exclusionNote.reason}`);

    ideas.push({
      // REPAIR: identity is never the model's. Its ids collide across runs
      // ("1"…"6" every time), and a scenario round's staleness is keyed on the
      // picked idea's id — a reused id would hide a changed idea.
      id: `idea-${mint()}`,
      angle,
      title,
      hook,
      twist,
      whyItWorks,
      risk,
      // REPAIR: the round's one truth, stamped on each idea so the scenario
      // round receives it as a fixed field.
      truth,
      gateNotes,
      pictureClaim,
      needsTurn,
    });
  });

  if (findings.length)
    throw new AdConceptError(
      `The ideas round does not satisfy ADS-IDEAS-PROMPT (${findings.length} finding${findings.length > 1 ? "s" : ""}).`,
      findings,
    );

  // REPAIR: ids unique within the set, whatever `mint` produced.
  const ids = new Set<string>();
  for (const idea of ideas) {
    idea.id = uniqueIn(ids, idea.id);
    ids.add(idea.id);
  }
  return ideas;
}

/* ── round 2: scenarios ───────────────────────────────────────────────────── */

export const SUPER_MAX_WORDS = 7;
export const MOTION_MAX_WORDS = 25;

/** The super's hold: 0.2s a word plus 2s, for nine words or fewer
 *  (ad-finishing/drawn-supers). Never shortened — words move or go instead. */
export const superHoldS = (words: number): number => Math.round((0.2 * words + 2) * 10) / 10;

/** Duration in the motion prose — a second clock over a typed channel
 *  (timed-shot-list; law typed-input-owns-its-channel). "3s", "2.5 s",
 *  "five seconds", "a second". */
const DURATION_WORDS = /\b\d+(?:\.\d+)?\s*s\b|\bsec(?:ond)?s?\b/i;
/** Negation in the motion line — "state stillness positively"
 *  (motion-line-composition). */
const NEGATION = /\b(?:no|not|never|without|nothing|don't|doesn't|won't)\b|n't\b/i;
/** Mood words in place of motion — "nobody can render an adjective". */
const MOOD_WORDS = /\b(?:cinematic|dynamic|epic)\b/i;

/** The rung's parts (short-ad-structure/length-rungs). The 15s rung drops the
 *  set-up (merged into the hook) and the turn; the 30s rung holds all five. */
const RUNG_PARTS: Record<AdTemplateId, Part[]> = {
  "ad-social-15": ["hook", "truth", "payoff"],
  "ad-spot-30": ["hook", "set-up", "truth", "turn", "payoff"],
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function parseScenarios(
  raw: unknown,
  req: Pick<AdScenariosRequest, "brief" | "template" | "idea">,
  opts: { mint?: () => string } = {},
): AdScenario[] {
  const mint = opts.mint ?? defaultMint;
  const root = asObject(raw, "scenarios");
  const [minS, maxS] = AD_RUNTIME_RANGE[req.template];
  const findings: string[] = [];

  const list = Array.isArray(root.scenarios) ? root.scenarios : [];
  // REFUSE: the count is the contract the deck is dealt from.
  if (list.length !== AD_SCENARIO_COUNT) findings.push(`expected ${AD_SCENARIO_COUNT} scenarios, got ${list.length}`);

  const scenarios: AdScenario[] = [];
  const scenarioIds = new Set<string>();
  list.forEach((item, i) => {
    const at = `scenario ${i + 1}`;
    if (!isObj(item)) {
      findings.push(`${at} is not an object`);
      return;
    }
    const title = text(item.title);
    const logline = text(item.logline);
    const musicMood = text(item.musicMood);
    if (!title) findings.push(`${at}: no title`);
    if (!logline) findings.push(`${at}: no logline`);
    // REFUSE: one bed whose resolution lands on the card (single-bed-loudness).
    if (!musicMood) findings.push(`${at}: no musicMood`);

    // REFUSE: the medium phrase is the one part of the motion line shared
    // verbatim across shots (motion-line-composition, decision rules).
    const medium = text(item.medium);
    const mediumWords = wordCount(medium);
    if (mediumWords < 3 || mediumWords > 8) findings.push(`${at}: the medium phrase is ${mediumWords} words (3–8)`);

    const shotsRaw = Array.isArray(item.shots) ? item.shots : [];
    // REFUSE: 1–6 shots — the pipeline's cap, not a style.
    if (shotsRaw.length < AD_SHOTS.min || shotsRaw.length > AD_SHOTS.max)
      findings.push(`${at}: ${shotsRaw.length} shots (${AD_SHOTS.min}–${AD_SHOTS.max})`);

    // REPAIR: identity is minted here, unique within the round.
    const scenarioId = uniqueIn(scenarioIds, `scn-${mint()}`);
    scenarioIds.add(scenarioId);
    const shots: AdShotSpec[] = [];
    const partsByShot: Part[][] = [];
    let anyEarlyBrand = false;

    shotsRaw.forEach((s, j) => {
      const sat = `${at} shot ${j + 1}`;
      if (!isObj(s)) {
        findings.push(`${sat} is not an object`);
        return;
      }

      // REFUSE: every shot ≤ one clip, ≥ the floor for a new image.
      const d = typeof s.durationS === "number" && Number.isFinite(s.durationS) ? round1(s.durationS) : NaN;
      if (Number.isNaN(d)) findings.push(`${sat}: no duration`);
      else if (d < AD_SHOT_SECONDS.min) findings.push(`${sat}: ${d}s is under the ${AD_SHOT_SECONDS.min}s floor for a new image`);
      else if (d > AD_SHOT_SECONDS.max) findings.push(`${sat}: ${d}s is longer than one clip (${AD_SHOT_SECONDS.max}s)`);

      const image = text(s.image);
      if (!image) findings.push(`${sat}: no image`);

      // REFUSE: the motion line's shape — short, no clock, no negation, no
      // mood adjective, and the scenario's medium phrase verbatim.
      const motion = text(s.motion);
      if (!motion) findings.push(`${sat}: no motion`);
      else {
        const w = wordCount(motion);
        if (w > MOTION_MAX_WORDS) findings.push(`${sat}: motion is ${w} words (max ${MOTION_MAX_WORDS})`);
        if (DURATION_WORDS.test(motion)) findings.push(`${sat}: motion states a duration ("${motion.match(DURATION_WORDS)![0]}")`);
        if (NEGATION.test(motion)) findings.push(`${sat}: motion uses a negation ("${motion.match(NEGATION)![0]}") — state stillness positively`);
        if (MOOD_WORDS.test(motion)) findings.push(`${sat}: motion uses a mood word ("${motion.match(MOOD_WORDS)![0]}")`);
        if (medium && !motion.toLowerCase().includes(medium.toLowerCase()))
          findings.push(`${sat}: motion does not carry the medium phrase "${medium}"`);
      }

      // REPAIR "" → null. REFUSE a super over the word cap, or one whose hold
      // does not fit its shot — "never shorten the hold; move or cut words".
      const sup = textOrNull(s.super);
      if (sup) {
        const w = wordCount(sup);
        if (w > SUPER_MAX_WORDS) findings.push(`${sat}: super is ${w} words (max ${SUPER_MAX_WORDS})`);
        else if (!Number.isNaN(d) && superHoldS(w) > d)
          findings.push(`${sat}: the super needs ${superHoldS(w)}s on screen and the shot is ${d}s`);
      }

      // REFUSE: shots link by "but" or "therefore", never "and then"
      // (timed-shot-list; law causality-over-sequence). Shot 1 has no link.
      const link = textOrNull(s.link);
      if (j > 0 && link !== "but" && link !== "therefore")
        findings.push(`${sat}: links to the shot before by "${link ?? "nothing"}", not "but" or "therefore"`);

      const parts = (Array.isArray(s.parts) ? s.parts : []).map(text).filter((p): p is Part => (PARTS as readonly string[]).includes(p));
      partsByShot.push(parts);
      if (s.brandCue === true && j < 2) anyEarlyBrand = true;

      shots.push({
        // REPAIR: shot ids are scoped to their scenario, minted here.
        id: `${scenarioId}-s${j + 1}`,
        durationS: d,
        image,
        motion,
        super: sup,
      });
    });

    if (shots.length) {
      // REFUSE: the rung's structure (length-rungs, product-tied-hook,
      // payoff-before-ask). Shot 1 is the hook; the payoff is the last picture
      // before the ask; every part of the rung is somewhere.
      if (!partsByShot[0]?.includes("hook")) findings.push(`${at}: shot 1 is not the hook`);
      if (!partsByShot[partsByShot.length - 1]?.includes("payoff"))
        findings.push(`${at}: the last shot before the end card is not the payoff`);
      const present = new Set(partsByShot.flat());
      for (const p of RUNG_PARTS[req.template]) if (!present.has(p)) findings.push(`${at}: no shot carries the ${p}`);
      // At 30s the turn is never merged into the payoff — that is the 15s
      // structure, and it leaves the spot with seconds and nothing to fill
      // them (ad-spot-30 PATTERNS §2).
      if (req.template === "ad-spot-30" && partsByShot.some((p) => p.includes("turn") && p.includes("payoff")))
        findings.push(`${at}: the turn is merged into the payoff`);
      // REFUSE: a product or brand cue in the opening shots
      // (brand-presence-timing).
      if (!anyEarlyBrand) findings.push(`${at}: no brand or product cue in the opening shots`);

      // REFUSE: the runtime outside the template's band. Inside the band but
      // off the target is KEPT — the card prints the sum against the target, so
      // the mismatch is shown, not absorbed (timed-shot-list rule 5).
      const total = round1(shots.reduce((t, s) => t + (Number.isNaN(s.durationS) ? 0 : s.durationS), 0) + AD_END_CARD_HOLD_S);
      if (total < minS || total > maxS)
        findings.push(`${at}: shots plus the ${AD_END_CARD_HOLD_S}s end card run ${total}s, outside ${minS}–${maxS}s`);
    }

    const card = isObj(item.endCard) ? item.endCard : {};
    scenarios.push({
      id: scenarioId,
      // REPAIR: the idea this executes is the request's, never the model's echo.
      ideaId: req.idea.id,
      title,
      logline,
      shots,
      musicMood,
      endCard: {
        // REPAIR: one CTA, and it is the creator's (payoff-before-ask).
        cta: req.brief.cta.trim(),
        line: textOrNull(card.line),
      },
    });
  });

  if (findings.length)
    throw new AdConceptError(
      `The scenarios round does not satisfy ADS-SCENARIOS-PROMPT (${findings.length} finding${findings.length > 1 ? "s" : ""}).`,
      findings,
    );
  return scenarios;
}
