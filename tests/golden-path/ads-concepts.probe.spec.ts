// LANE — THE ADS CONCEPT ROUNDS, WITHOUT A MODEL (dynamic).
//
// Spark `ads-project-type`, WP2. The ideas round and the scenarios round are
// one prompt document, one assembled run, one reasoning turn and one validator
// each. Everything but the turn is driven here against the real modules:
//
//   · lib/ads/validate.ts accepts a well-formed round and refuses the rules it
//     exists for (the bulk of its cases live in pipeline/ads-prompts-regression.mts;
//     these are the ones a route's behaviour turns on);
//   · the assembled prompt carries the brief verbatim, the format brief, and
//     every slot's assigned angle and seed;
//   · the route bodies (lib/ads/concepts.ts — what app/api/ads/{ideas,scenarios}
//     delegate to after `guardRequest`) answer a typed AdIdeasResponse /
//     AdScenariosResponse with a FAKE `reason`, a 502 with findings on a
//     malformed answer, a 422 on a question, a 400 on a bad brief;
//   · staleness: a brief edit makes ideas stale, a different picked idea makes
//     scenarios stale;
//   · picking an idea writes `research.researched` — Script's gate — through
//     the real record store over fake-indexeddb.
//
// NO VENDOR, NO SPAWN, NO SPEND: every `reason` here is a function in this file.

// The import below has a SIDE EFFECT and must come first — it installs the
// storage engine on globalThis before any module under test reads `indexedDB`.
import "fake-indexeddb/auto";
import { test, expect } from "@playwright/test";

import { ideasResponse, ideasPrompt, scenariosPrompt, scenariosResponse, slotsFor, type ReasonFn } from "@/lib/ads/concepts";
import { AdConceptError, assignAngles, parseIdeas, parseScenarios } from "@/lib/ads/validate";
import {
  AD_ANGLES,
  AD_IDEA_COUNT,
  AD_RUNTIME_RANGE,
  AD_SCENARIO_COUNT,
  digestBrief,
  type AdBrief,
  type AdIdea,
  type AdIdeasResponse,
  type AdScenariosResponse,
  type AdsIdeasData,
  type AdsScenariosData,
} from "@/lib/ads/types";
import { TEMPLATES } from "@/lib/projects";
import { TextError } from "@/lib/text/errors";
import type { TextRequest, TextResult } from "@/lib/text/types";
import { ADS_IDEAS } from "@/app/_phases/_shared/records/ads";
import { readRecord } from "@/app/_phases/_shared/records/registry";
import { patchRecord } from "@/app/_phases/_shared/records/patch";
import { RESEARCH } from "@/app/_phases/research/records";
import { ideasStale, pickIdea, scenariosStale } from "@/app/_phases/research/ads/pick";

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const BRIEF: AdBrief = {
  product: "Rainshell packable jacket",
  audience: "city cyclists",
  proposition: "This jacket keeps you dry in a downpour.",
  tone: "deadpan",
  mustInclude: ["logo on the end card"],
  cta: "Pack one today",
  platform: "vertical feed",
};

const yes = (why: string) => `yes — ${why}`;
const GATES = {
  swap: yes("a rival's jacket does not fold into its own pocket"),
  singleMinded: yes("you stay dry in a downpour"),
  oneLine: yes("a rider wears a raincloud as a hat and stays dry"),
  ownable: yes("the category never shows the rain losing"),
  filmable: yes("four stills, no dialogue, no text"),
};

function ideasAnswer() {
  const { slots } = assignAngles();
  return {
    proposition: BRIEF.proposition,
    truth: "it packs into its own chest pocket and still sheds a cloudburst",
    ask: null,
    exclusion: null,
    longlist: Array.from({ length: 14 }, (_, i) => `title ${i + 1}`),
    ideas: slots.map((angle, i) => ({
      slot: i + 1,
      angle,
      classifiedAs: angle,
      title: `Idea ${i + 1}`,
      hook: "a rider under a private cloud",
      twist: "the weather loses",
      whyItWorks: "the truth is felt",
      gates: GATES,
      pictureClaim: angle === "demo" ? "water beads off — substantiated by the brief" : null,
      needsTurn: null,
      risk: `risk ${i + 1}: misread unless the register is absurd from shot one`,
    })),
  };
}

const shot = (over: Record<string, unknown>) => ({
  parts: ["truth"],
  link: "therefore",
  brandCue: false,
  durationS: 4,
  image: "a rider at a red light, rain hammering, hood up",
  motion: "slow push in; the rider glances up steadily; glossy studio product film",
  super: null,
  ...over,
});
function scenariosAnswer() {
  const one = () => ({
    title: "The private cloud",
    logline: "A rider stays dry while the street drowns.",
    medium: "glossy studio product film",
    shots: [
      shot({ parts: ["hook"], link: null, brandCue: true, durationS: 2.5 }),
      shot({ parts: ["truth"], link: "but", durationS: 5.5 }),
      shot({ parts: ["payoff"], durationS: 5, super: "Dry. Every ride." }),
    ],
    musicMood: "a dry snare bed that resolves on the card",
    endCard: { cta: "the model's own CTA", line: "Dry in a downpour." },
  });
  return { scenarios: [one(), one(), one()] };
}

const IDEA: AdIdea = {
  id: "idea-picked",
  angle: "analogy",
  title: "The private cloud",
  hook: "a rider under a private cloud",
  twist: "the weather loses",
  whyItWorks: "the truth is felt",
  risk: "misread as a weather ad",
  truth: "it packs into its own pocket",
};

/** A fake engine: records what it was asked, answers with `answer`. */
function fakeReason(answer: unknown): { reason: ReasonFn; calls: TextRequest[] } {
  const calls: TextRequest[] = [];
  const reason: ReasonFn = async (req) => {
    calls.push(req);
    return {
      text: JSON.stringify(answer),
      json: answer,
      provenance: {
        provider: "claude-cli",
        model: "claude-fake",
        transport: "local-subprocess",
        rung: "preferred",
        turn: req.turn,
        schemaEnforcement: "prompted",
        durationMs: 1234,
        costBasis: "unpriced",
        promptChars: req.prompt.length,
      },
    } satisfies TextResult;
  };
  return { reason, calls };
}

const post = (body: unknown) =>
  new Request("http://localhost/api/ads/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const DOC = async () => "# THE DOCUMENT";
let n = 0;
const mint = () => `m${++n}`;

/* ── the validator ────────────────────────────────────────────────────────── */

test("validate: a well-formed ideas round comes back typed, stamped and in slot order", () => {
  const ideas = parseIdeas(ideasAnswer(), { brief: BRIEF, template: "ad-social-15" });
  expect(ideas).toHaveLength(AD_IDEA_COUNT);
  expect(ideas.map((i) => i.angle)).toEqual(assignAngles().slots);
  expect(new Set(ideas.map((i) => i.id)).size).toBe(AD_IDEA_COUNT);
  for (const i of ideas) {
    expect(i.truth).toBe("it packs into its own chest pocket and still sheds a cloudburst");
    expect(i.gateNotes).toHaveLength(5);
    expect(i.needsTurn).toBeNull();
  }
});

test("validate: the reserve angle is never assigned; problem-solution only arrives through a reasoned exclusion", () => {
  const { slots, reserve } = assignAngles();
  expect(slots).toHaveLength(AD_IDEA_COUNT);
  expect(new Set(slots).size).toBe(AD_IDEA_COUNT);
  expect(slots).not.toContain(reserve);
  expect(slots.slice(0, 1)).toEqual(["analogy"]);
  for (const a of slots) expect(AD_ANGLES).toContain(a);
});

test("validate: refusals carry every finding, not the first", () => {
  const bad = ideasAnswer();
  bad.ideas[1].angle = bad.ideas[0].angle;
  bad.ideas[2].risk = "";
  bad.ideas[3].title = "x".repeat(91);
  try {
    parseIdeas(bad, { brief: BRIEF, template: "ad-social-15" });
    throw new Error("accepted");
  } catch (e) {
    expect(e).toBeInstanceOf(AdConceptError);
    const f = (e as AdConceptError).findings.join("\n");
    expect(f).toContain("angle used twice");
    expect(f).toContain("no risk");
    expect(f).toContain("91 characters");
  }
});

test("validate: scenarios stamp the request's idea and the brief's CTA; the runtime band is enforced", () => {
  const out = parseScenarios(scenariosAnswer(), { brief: BRIEF, template: "ad-social-15", idea: IDEA });
  expect(out).toHaveLength(AD_SCENARIO_COUNT);
  for (const s of out) {
    expect(s.ideaId).toBe(IDEA.id);
    expect(s.endCard.cta).toBe(BRIEF.cta);
    expect(s.shots.map((x) => x.id.startsWith(s.id))).toEqual([true, true, true]);
  }
  const long = scenariosAnswer();
  long.scenarios[0].shots[1].durationS = 10;
  long.scenarios[0].shots[2].durationS = 9;
  expect(() => parseScenarios(long, { brief: BRIEF, template: "ad-social-15", idea: IDEA })).toThrow(AdConceptError);
});

test("the server-safe runtime bands mirror lib/projects TEMPLATES", () => {
  for (const id of ["ad-social-15", "ad-spot-30"] as const) {
    const t = TEMPLATES.find((x) => x.id === id);
    expect(t, id).toBeTruthy();
    expect([...AD_RUNTIME_RANGE[id]]).toEqual([...t!.range]);
  }
});

/* ── prompt assembly ──────────────────────────────────────────────────────── */

test("prompt: the ideas run carries the document, the brief verbatim, the format brief and every slot's angle and seed", () => {
  const p = ideasPrompt("# THE DOCUMENT", { brief: BRIEF, template: "ad-social-15", targetS: 15 }, 42);
  expect(p.startsWith("# THE DOCUMENT")).toBe(true);
  for (const v of [BRIEF.product, BRIEF.audience, BRIEF.proposition, BRIEF.tone, BRIEF.cta, BRIEF.platform, ...BRIEF.mustInclude])
    expect(p).toContain(v);
  expect(p).toContain("## THE FORMAT");
  expect(p).toContain("a vertical social ad");
  expect(p).toContain("Target runtime: 15s");
  const { slots } = slotsFor(42);
  for (const s of slots) {
    expect(p).toContain(`${s.n}. **${s.angle}**`);
    expect(p).toContain(s.persona);
    if (s.connection) expect(p).toContain(s.connection);
  }
  expect(p).toContain("Reserve angle: **problem-solution**");
  expect(p).toContain('"longlist"');
  // Same seed, same seeds; a different seed varies them (a regenerated set
  // starts somewhere else).
  expect(ideasPrompt("d", { brief: BRIEF, template: "ad-social-15", targetS: 15 }, 42)).toBe(
    ideasPrompt("d", { brief: BRIEF, template: "ad-social-15", targetS: 15 }, 42),
  );
  expect(slotsFor(42).slots.map((s) => s.persona)).not.toEqual(slotsFor(43).slots.map((s) => s.persona));
});

test("prompt: the scenarios run carries the picked idea as fixed fields and the binding runtime arithmetic", () => {
  const p = scenariosPrompt("# DOC", { brief: BRIEF, template: "ad-spot-30", targetS: 30, idea: IDEA });
  for (const v of [IDEA.title, IDEA.hook, IDEA.twist, IDEA.whyItWorks, IDEA.truth!, IDEA.risk, BRIEF.proposition]) expect(p).toContain(v);
  expect(p).toContain("Runtime: **30s**");
  expect(p).toContain("Picture budget: **28s**");
  expect(p).toContain("30s — hook, set-up, truth, turn, payoff, end card");
  expect(p).toContain("a thirty-second spot");
  expect(p).toContain(`verbatim: ${BRIEF.cta}`);
});

/* ── the route bodies, with a fake engine ─────────────────────────────────── */

test("route ideas: a typed AdIdeasResponse from a fake reason fn, asked as an `ad-ideas` turn with the schema", async () => {
  const fake = fakeReason(ideasAnswer());
  const res = await ideasResponse(post({ brief: BRIEF, template: "ad-social-15", targetS: 15 }), {
    reason: fake.reason,
    readPrompt: DOC,
    mint,
    seed: 7,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as AdIdeasResponse;
  expect(body.options).toHaveLength(AD_IDEA_COUNT);
  expect(body.engine).toEqual({ provider: "claude-cli", model: "claude-fake", costUsd: null, costBasis: "unpriced", durationMs: 1234 });
  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0].turn).toBe("ad-ideas");
  expect(fake.calls[0].schema).toBeTruthy();
  expect(fake.calls[0].prompt).toContain(BRIEF.proposition);
});

test("route scenarios: a typed AdScenariosResponse, every scenario stamped with the request's idea", async () => {
  const fake = fakeReason(scenariosAnswer());
  const res = await scenariosResponse(post({ brief: BRIEF, template: "ad-social-15", targetS: 15, idea: IDEA }), {
    reason: fake.reason,
    readPrompt: DOC,
    mint,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as AdScenariosResponse;
  expect(body.options).toHaveLength(AD_SCENARIO_COUNT);
  expect(body.options.every((s) => s.ideaId === IDEA.id)).toBe(true);
  expect(fake.calls[0].turn).toBe("ad-scenarios");
});

test("route: a malformed answer is a 502-class bad-response carrying every finding; nothing is kept", async () => {
  const bad = ideasAnswer();
  bad.ideas.pop();
  const res = await ideasResponse(post({ brief: BRIEF, template: "ad-social-15", targetS: 15 }), {
    reason: fakeReason(bad).reason,
    readPrompt: DOC,
  });
  expect(res.status).toBeGreaterThanOrEqual(500);
  const body = (await res.json()) as { error: string; message: string; findings: string[] };
  expect(body.error).toBe("bad-response");
  expect(body.findings.join("\n")).toContain(`expected ${AD_IDEA_COUNT} ideas`);

  const prose = await scenariosResponse(post({ brief: BRIEF, template: "ad-social-15", targetS: 15, idea: IDEA }), {
    reason: async (req) => ({ ...(await fakeReason({}).reason(req)), json: undefined, text: "Here are three lovely scenarios!" }),
    readPrompt: DOC,
  });
  expect(prose.status).toBeGreaterThanOrEqual(500);
  expect(((await prose.json()) as { error: string }).error).toBe("bad-response");
});

test("route: the model's question is a 422 with the question verbatim", async () => {
  const res = await ideasResponse(post({ brief: BRIEF, template: "ad-social-15", targetS: 15 }), {
    reason: fakeReason({ ...ideasAnswer(), ask: "Dry, or light enough to forget? Pick one.", ideas: [] }).reason,
    readPrompt: DOC,
  });
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({ error: "needs-brief", message: "Dry, or light enough to forget? Pick one." });
});

test("route: a brief the round cannot start from is a 400 naming the field, before any turn", async () => {
  const fake = fakeReason(ideasAnswer());
  const res = await ideasResponse(post({ brief: { ...BRIEF, proposition: "", cta: "" }, template: "ad-social-15", targetS: 15 }), {
    reason: fake.reason,
    readPrompt: DOC,
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { message: string }).message).toContain("proposition, cta");
  const outOfBand = await ideasResponse(post({ brief: BRIEF, template: "ad-social-15", targetS: 30 }), { reason: fake.reason, readPrompt: DOC });
  expect(outOfBand.status).toBe(400);
  const tooLong = await ideasResponse(post({ brief: { ...BRIEF, product: "x".repeat(201) }, template: "ad-social-15", targetS: 15 }), {
    reason: fake.reason,
    readPrompt: DOC,
  });
  expect(tooLong.status).toBe(400);
  expect(fake.calls).toHaveLength(0);
});

test("route: an engine failure keeps lib/text's kind and status", async () => {
  const res = await ideasResponse(post({ brief: BRIEF, template: "ad-social-15", targetS: 15 }), {
    reason: async () => {
      throw new TextError("no engine: claude-cli not installed, google no key.", "no-key");
    },
    readPrompt: DOC,
  });
  expect(res.status).toBe(503);
  expect(((await res.json()) as { error: string }).error).toBe("no-key");
});

test("route: the real prompt files are on disk and read per call", async () => {
  const fake = fakeReason(ideasAnswer());
  const res = await ideasResponse(post({ brief: BRIEF, template: "ad-spot-30", targetS: 30 }), { reason: fake.reason, mint });
  // 30s asks needsTurn of every idea — the fixture answers null, so this is a
  // refusal; what is under test is that the real document reached the engine.
  expect(res.status).toBeGreaterThanOrEqual(500);
  expect(fake.calls[0].prompt).toContain("standard: ad-concept-ideation/proposition-before-idea");
  expect(fake.calls[0].prompt).toContain("This is the thirty-second template");
});

/* ── staleness ────────────────────────────────────────────────────────────── */

test("stale: a brief edit after generation marks the ideas stale; the digest ignores order and whitespace", () => {
  const data: AdsIdeasData = { briefDigest: digestBrief(BRIEF), options: [{ ...IDEA }], pickedId: null, engine: null };
  expect(ideasStale(data, digestBrief(BRIEF))).toBe(false);
  expect(ideasStale(data, digestBrief({ ...BRIEF, mustInclude: [...BRIEF.mustInclude].reverse(), cta: ` ${BRIEF.cta} ` }))).toBe(false);
  expect(ideasStale(data, digestBrief({ ...BRIEF, proposition: "This jacket weighs nothing." }))).toBe(true);
  expect(ideasStale({ ...data, options: [] }, "anything")).toBe(false);
});

test("stale: scenarios for a different picked idea are stale", () => {
  const data: AdsScenariosData = { ideaId: "idea-a", options: parseScenarios(scenariosAnswer(), { brief: BRIEF, template: "ad-social-15", idea: { ...IDEA, id: "idea-a" } }), pickedId: null, engine: null };
  expect(scenariosStale(data, "idea-a")).toBe(false);
  expect(scenariosStale(data, "idea-b")).toBe(true);
  expect(scenariosStale(data, null)).toBe(true);
});

/* ── the pick writes the research gate ────────────────────────────────────── */

test("pick: choosing an idea records the pick AND marks the project researched", async () => {
  const pid = `ads-probe-${Date.now()}`;
  const options = parseIdeas(ideasAnswer(), { brief: BRIEF, template: "ad-social-15" });
  await patchRecord(ADS_IDEAS, pid, () => ({ briefDigest: digestBrief(BRIEF), options, pickedId: null, engine: null, savedAt: 1 }));
  await patchRecord(RESEARCH, pid, () => ({ topic: "kept", researched: false }));

  const out = await pickIdea(pid, options[2].id, 99);
  expect(out.ok).toBe(true);

  const ideas = await readRecord(ADS_IDEAS, pid);
  expect(ideas.ok && ideas.data?.pickedId).toBe(options[2].id);
  expect(ideas.ok && ideas.data?.options).toHaveLength(AD_IDEA_COUNT);
  const research = await readRecord(RESEARCH, pid);
  expect(research.ok && research.data?.researched).toBe(true);
  // A merge: the topic another writer left is kept.
  expect(research.ok && research.data?.topic).toBe("kept");
});
