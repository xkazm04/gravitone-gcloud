import "server-only";

// THE SONG LAB'S PORT, FIXTURE SIDE (spark yue2-song-lab S2): the contest's staged field (./fixtureData.ts)
// drawn as the winner drew it - a 16-seed main draw and one post draw per raw take with variants -
// with a SCRIPTED agent (the band says `scripted`). Votes, keeps, drops and directions made here are
// this server process's alone: they change what the next read shows and touch no store, so the desk
// can be driven end to end (a vote reveals and advances) on any machine. The post · s3 draw opens
// with its quarter-finals already judged - an upset, a neither, a hold - so a reveal is reachable by
// URL alone (`audio-songlab-match`).
import type { AbVote } from "@gt/domain/audio.yue2";
import type { Draw, LabProposal, LabSay, LabTurn } from "@gt/domain/audio.yue2.lab";
import { err, ok, type Result } from "@gt/domain/errors";
import type { JobRowView } from "@gt/ui/components/songlab/songlab.ts";

import { DEFECTS } from "../../../../../lib/sound/types.ts";
import { deskOf, type Judged } from "./build.ts";
import { directorOf } from "./director.ts";
import { MAIN_CUT, MAIN_SEEDS, fixtureTakes } from "./fixtureData.ts";
import { armOf, fixtureDrawId, fixturePair, foldFixture } from "./fixtureFold.ts";
import type { SongLabPort, SongLabRead } from "./port.ts";
import { drawNameOf, fieldRows, headOf } from "./shape.ts";
import { gateOf, songEvalOf, num, type LabEntry } from "./words.ts";

const TAKES = fixtureTakes();
const BY_ID = new Map<string, LabEntry>(TAKES.map((t) => [t.takeId, t]));
const SESSION = "fixture-lab";
const T0 = "2026-11-04T15:53:00.000Z";
const MAIN_ID = fixtureDrawId("main");

function postDraw(raw: string): Draw {
  const field = `post:${raw}` as const;
  const ids = TAKES.filter((t) => t.takeId === raw || t.facts.lineage.sourceTakeId === raw).sort((a, b) => (songEvalOf(b.scores) ?? 0) - (songEvalOf(a.scores) ?? 0) || a.takeId.localeCompare(b.takeId));
  return { drawId: fixtureDrawId(field), version: 1, field, size: 8, entrants: ids.map((t, i) => ({ takeId: t.takeId, seed: i + 1 })), rules: [] };
}

const mainDraw = (seeds: readonly string[], cut: readonly string[], version: number): Draw => ({
  drawId: MAIN_ID,
  version,
  field: "main",
  size: 16,
  entrants: seeds.map((takeId, i) => ({ takeId, seed: i + 1 })),
  rules: [{ kind: "exclude", metric: "wer", op: "gt", value: 0.1 }],
  cut,
});

const POST_S1 = postDraw("fx-raw-s1");
const POST_S3 = postDraw("fx-raw-s3");

/** The scripted quarter-final verdicts of post · s3: seeds 4 v 5 an upset, 3 v 6 neither, 2 v 7 a hold. */
function scriptedVotes(): Map<string, AbVote> {
  const out = new Map<string, AbVote>();
  const seed = (n: number): string => POST_S3.entrants.find((e) => e.seed === n)?.takeId ?? "";
  const vote = (hi: number, lo: number, pick: number | null, defect?: string) => {
    const p = fixturePair(POST_S3.drawId, seed(hi), seed(lo));
    const a = pick === null ? "neither" : armOf(p, seed(pick));
    const other = a === "neither" ? "neither" : a === "a" ? "b" : "a";
    out.set(p.pairId, { pairId: p.pairId, answers: { lyrics: a, vocal: other === "neither" ? "neither" : a, release: a }, ...(defect === undefined ? {} : { defect }) });
  };
  vote(4, 5, 5);
  vote(3, 6, null, "vocal-garble");
  vote(2, 7, 2);
  return out;
}

const OPENING: LabTurn = {
  session: SESSION,
  turnId: "t-fixture-1",
  line: "While you were away I seeded 16 of the 18 takes that pass the lyric gate and booked 15 matches; the first waits for your ear.",
  ran: [
    "takes: read 35 takes: 23 renders, 12 post variants",
    "takes: 18 of 23 renders pass the lyric gate (wer ≤ 0.10); seeded 16 by SongEval, cut off 1.5 r8 s3 and off 1.0 old s1",
    "queue_pairs: booked 8 main-draw matches and 6 post-draw matches; arm sides drawn at booking",
    "post: 12 variants on 2 inputs: master, heavy and soft debuzz, stems",
  ],
  learned: [
    "meters: heavy debuzz raised buzz on s3 from 2.6 to 18.5 dB; soft took it to −2.4 dB",
    "meters: cot off · cfg 1.5 passes the gate 5 of 8",
    "meters: s1_cotfull and full 1.0 s1 measure identically on every score",
  ],
  proposals: [
    { id: "p-dedupe", kind: "rule", label: "one render, one entry", why: "s1_cotfull and full 1.0 s1 match on all 16 scores", rule: { drawId: MAIN_ID, rules: [{ kind: "exclude", metric: "wer", op: "gt", value: 0.1 }] } },
    { id: "p-wildcard", kind: "launch", label: "wildcard · 8 seeds of cot off · cfg 1.5", why: "5 of 8 passed the gate there; ≥ 1 keeper ≈ 99%", launch: { style: "boom-bap", lyrics: "the sheet", seeds: [9, 10, 11, 12, 13, 14, 15, 16], cot: "off", cfg: 1.5 } },
    { id: "p-softpost", kind: "post", label: "soft debuzz + master on the finalists", why: "heavy debuzz took s3_cotfull buzz 2.6 → 18.5 dB; soft → −2.4", post: { takeIds: ["fx-raw-s3"], stages: ["debuzz", "master"] } },
  ],
  at: T0,
};

type Session = { votes: Map<string, AbVote>; decisions: Record<string, "kept" | "dropped">; says: LabSay[]; turns: LabTurn[]; jobs: JobRowView[]; main: Draw; n: number };
const fresh = (): Session => ({ votes: scriptedVotes(), decisions: {}, says: [], turns: [OPENING], jobs: [], main: mainDraw(MAIN_SEEDS, MAIN_CUT, 1), n: 1 });
let S: Session = fresh();

/** Back to the script (tests). */
export function resetFixture(): void {
  S = fresh();
}

const draws = (): Draw[] => [S.main, POST_S1, POST_S3];
const stamp = (): string => new Date(Date.parse(T0) + S.n++ * 60_000).toISOString();
const turn = (line: string, proposals: readonly LabProposal[] = [], answers?: string): void => {
  S.turns.push({ session: SESSION, turnId: `t-fixture-${S.turns.length + 1}`, ...(answers === undefined ? {} : { answers }), line, ran: [], learned: [], proposals, at: stamp() });
};

/** A vote on a booked fixture pair; the scripted agent names what it did to the bracket. */
export function fixtureVote(vote: AbVote): Result<{ readonly pairId: string }> {
  for (const d of draws()) {
    const b = foldFixture(d, S.votes);
    const m = b.matches.find((x) => x.pairId === vote.pairId);
    if (m === undefined) continue;
    if (m.outcome !== undefined) return err("conflict", `pair ${vote.pairId} is already judged`);
    S.votes.set(vote.pairId, vote);
    const after = foldFixture(d, S.votes).matches.find((x) => x.pairId === vote.pairId);
    const seed = (id: string | undefined) => d.entrants.find((e) => e.takeId === id)?.seed ?? 0;
    const se = (id: string | undefined) => num(songEvalOf(id === undefined ? undefined : BY_ID.get(id)?.scores));
    const loser = after?.winner === after?.takeA ? after?.takeB : after?.takeA;
    const round = after?.round === "F" ? "final" : (after?.round ?? "");
    if (after?.outcome === "neither") turn(`Neither advances from the ${round}; both out. A wildcard could fill the empty slot.`);
    else if (after?.outcome === "upset") turn(`Upset in the ${round}: seed ${seed(after.winner)} over seed ${seed(loser)}, SongEval had it ${se(loser)} to ${se(after.winner)}.`);
    else turn(`Seed ${seed(after?.winner)} holds; your ear and SongEval agree (${se(after?.winner)} vs ${se(loser)}).`);
    return ok({ pairId: vote.pairId });
  }
  return err("not-found", `no booked match has pair ${vote.pairId}`);
}

const ANSWERS: readonly { readonly test: RegExp; readonly line: (t: string) => string; readonly proposal?: LabProposal }[] = [
  { test: /loop|chorus|repeat/, line: (t) => `“${t}”: a rule. Three seeded takes run words past the sheet.`, proposal: { id: "p-loopers", kind: "rule", label: "loopers out: no words past the sheet", why: "off 1.5 r8 s4 +3 · full 2.0 s3 +4 · off 1.0 s1 +4", rule: { drawId: MAIN_ID, rules: [{ kind: "exclude", metric: "wer", op: "gt", value: 0.05 }] } } },
  { test: /dark|minor|moody/, line: (t) => `“${t}”: no meter measures it, so new entrants it is.`, proposal: { id: "p-dark", kind: "launch", label: "launch 8 seeds · style + “dark, minor-key”", why: "no meter hears darkness; only your ear can seed them", launch: { style: "boom-bap, dark, minor-key", lyrics: "the sheet", seeds: [1, 2, 3, 4, 5, 6, 7, 8], cot: "off", cfg: 1.5 } } },
  { test: /master|reference|loud/, line: (t) => `“${t}”: a post run for the two finalists, after the semis.`, proposal: { id: "p-master", kind: "post", label: "master the finalists to your reference", why: "seeds sit −18.1 to −13.9 LUFS raw; no reference attached yet", post: { takeIds: ["fx-r8-s8"], stages: ["master"] } } },
];

export function fixtureSay(text: string, listening: boolean): Result<LabSay> {
  const t = text.trim();
  if (t === "") return err("invalid", "a direction has words");
  const say: LabSay = { session: SESSION, turnId: `u-fixture-${S.says.length + 1}`, text: t, at: stamp() };
  S.says.push(say);
  if (!listening) return ok(say);
  const hit = ANSWERS.find((a) => a.test.test(t.toLowerCase()));
  turn(hit?.line(t) ?? `“${t}”: no act of mine fits that yet; it stays a note for the next batch.`, hit?.proposal === undefined ? [] : [hit.proposal], say.turnId);
  return ok(say);
}

const proposalOf = (turnId: string, id: string): LabProposal | undefined => S.turns.find((x) => x.turnId === turnId)?.proposals.find((p) => p.id === id);

export function fixtureKeep(turnId: string, proposalId: string): Result<{ readonly started: string }> {
  const p = proposalOf(turnId, proposalId);
  if (p === undefined) return err("not-found", `no proposal ${proposalId} in ${turnId}`);
  if (S.decisions[proposalId] !== undefined) return err("conflict", `proposal ${proposalId} is already ${S.decisions[proposalId]}`);
  S.decisions[proposalId] = "kept";
  if (p.kind === "rule") {
    // The scripted rule takes the twin out (one render, one entry) and the next take in.
    const seeds = S.main.entrants.map((e) => e.takeId).filter((id) => id !== "fx-fulldef-s1");
    S.main = mainDraw([...seeds, "fx-r8-s3"], ["fx-fulldef-s1", "fx-old10-s1"], S.main.version + 1);
    turn("Reseeded: full def s1 out · off 1.5 r8 s3 in · decided matches kept where both entrants stayed.");
    return ok({ started: `v${S.main.version}` });
  }
  const id = `job:fixture:${proposalId}`;
  S.jobs.push(p.kind === "launch" ? { id, label: `render · ${p.label}`, state: "running", done: 3, total: p.launch.seeds.length, stage: "render" } : { id, label: `post · ${p.label}`, state: "queued", done: 0, total: p.post.takeIds.length });
  return ok({ started: id });
}

export function fixtureDrop(turnId: string, proposalId: string): Result<{ readonly proposalId: string }> {
  if (proposalOf(turnId, proposalId) === undefined) return err("not-found", `no proposal ${proposalId} in ${turnId}`);
  if (S.decisions[proposalId] === "kept") return err("conflict", `proposal ${proposalId} is kept; a kept proposal cannot be removed`);
  S.decisions[proposalId] = "dropped";
  return ok({ proposalId });
}

export const fixturePort: SongLabPort = {
  read: async (url): Promise<SongLabRead> => {
    const all = draws();
    const open = all.find((d) => d.drawId === url.draw) ?? S.main;
    const judged = new Map<string, Judged>();
    for (const d of all) {
      for (const m of foldFixture(d, S.votes).matches) {
        const v = m.pairId === undefined ? undefined : S.votes.get(m.pairId);
        if (v !== undefined && m.takeA !== undefined && m.takeB !== undefined) judged.set(v.pairId, { pair: fixturePair(d.drawId, m.takeA, m.takeB), vote: v });
      }
    }
    const deskFor = (d: Draw, selected?: string) => deskOf({ bracket: foldFixture(d, S.votes), drawName: drawNameOf(d, BY_ID), takes: BY_ID, judged, windowCut: () => true, ...(selected === undefined ? {} : { selected }) });
    const desk = deskFor(open, url.match);
    const others = all.filter((d) => d !== open).flatMap((d) => deskFor(d).next.concat(deskFor(d).glow === undefined ? [] : []));
    const seeds = TAKES.filter((t) => t.facts.lineage.sourceTakeId === undefined);
    const presence = url.away === true ? "nobody" : "listening";
    return {
      source: "fixture",
      unavailable: [],
      director: directorOf({
        presence,
        says: S.says,
        turns: S.turns,
        decisions: S.decisions,
        figures: { takes: TAKES.length, pass: seeds.filter((t) => gateOf(t.scores) === "pass").length, seeded: S.main.entrants.length, cut: S.main.cut?.length ?? 0, decided: desk.bracket.decided, upsets: desk.bracket.upsets },
      }),
      draws: all.map((d) => {
        const v = deskFor(d).bracket;
        return { drawId: d.drawId, name: drawNameOf(d, BY_ID), open: v.open, decided: v.decided, total: v.total };
      }),
      drawId: open.drawId,
      head: headOf(open, BY_ID),
      bracket: desk.bracket,
      ...(desk.glow === undefined ? {} : { glow: desk.glow }),
      ...(url.match === undefined ? {} : { selected: url.match }),
      ...(desk.match === undefined ? {} : { match: desk.match }),
      ...(desk.reveal === undefined ? {} : { reveal: desk.reveal }),
      next: [...desk.next, ...others],
      jobs: S.jobs,
      ...(url.field ? { field: { takes: fieldRows(TAKES, open), references: [] } } : {}),
      defects: DEFECTS,
      open: desk.bracket.open,
    };
  },
};
