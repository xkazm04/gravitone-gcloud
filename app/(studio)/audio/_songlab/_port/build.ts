// THE DESK OVER ONE BRACKET (spark yue2-song-lab S2): lib/yue2/draw.ts `bracketOf` answers in take
// ids; this turns that answer into what the browser may see. Pure, and shared by both sides of the
// port, so the fixture and the ledger are drawn by the same fold.
//
// THE BLIND IS DECIDED HERE, ONCE. Entrants become seeds and words; the waiting match becomes its
// pair id and two arm sources; the takes behind the arms are named only in a reveal, built from a
// JUDGED pair (its side read off the queued pair, its answers off the vote). Slot order is bracket
// order - the better seed first in the opening round, the upper feeder's winner after that - never
// the pair's order, so even the order of the two rows says nothing about which take plays as A.
import { AB_QUESTIONS, type AbPair, type AbQuestion, type AbVote } from "@gt/domain/audio.yue2";
import { DRAW_ROUNDS, type DrawRound, type Match } from "@gt/domain/audio.yue2.lab";
import type {
  Agreement,
  BlindMatchView,
  BracketView,
  EntrantView,
  MatchView,
  NextRowView,
  QuestionVerdict,
  RevealArm,
  RevealView,
  RoundView,
  ScoreRow,
  SlotView,
} from "@gt/ui/components/songlab/songlab.ts";

import type { Bracket } from "../../../../../lib/yue2/draw.ts";
import { condLine, gateOf, num, pct, rightsOf, shortLabel, songEvalOf, type LabEntry } from "./words.ts";

export type Judged = { readonly pair: AbPair; readonly vote: AbVote };

export type DeskInput = {
  readonly bracket: Bracket;
  readonly drawName: string;
  readonly takes: ReadonlyMap<string, LabEntry>;
  readonly judged: ReadonlyMap<string, Judged>;
  /** Both arms' blind windows are on disk. */
  readonly windowCut: (pairId: string) => boolean;
  readonly selected?: string;
};

export type Desk = {
  readonly bracket: BracketView;
  readonly glow?: string;
  readonly match?: BlindMatchView;
  readonly reveal?: RevealView;
  readonly next: readonly NextRowView[];
};

export const ROUND_NAME: Readonly<Record<DrawRound, string>> = { R16: "R16", QF: "QF", SF: "SF", F: "final" };
export const matchId = (m: Pick<Match, "round" | "slot">): string => `${m.round}-${m.slot}`;
const WINDOW_S = 25;

function entrantOf(input: DeskInput, takeId: string): EntrantView {
  const seed = input.bracket.draw.entrants.find((e) => e.takeId === takeId)?.seed ?? 0;
  const t = input.takes.get(takeId);
  if (t === undefined) return { seed, label: "take not in the lab", cond: "no facts on this server", rights: { short: "?", licence: "rights not recorded" } };
  return { seed, label: shortLabel(t), cond: condLine(t), rights: rightsOf(t) };
}

const seedOf = (input: DeskInput, takeId: string): number => input.bracket.draw.entrants.find((e) => e.takeId === takeId)?.seed ?? Number.MAX_SAFE_INTEGER;

/** The rounds this draw plays, first to final. */
export function roundsOf(size: number): readonly DrawRound[] {
  return size === 16 ? DRAW_ROUNDS : DRAW_ROUNDS.slice(1);
}

/** The match's two takes in bracket order (see the header). */
function ordered(input: DeskInput, m: Match, byId: ReadonlyMap<string, Match>, first: boolean): readonly [string | undefined, string | undefined] {
  const both = [m.takeA, m.takeB].filter((x): x is string => x !== undefined);
  if (first) {
    const s = [...both].sort((x, y) => seedOf(input, x) - seedOf(input, y));
    return [s[0], s[1]];
  }
  const rounds = roundsOf(input.bracket.draw.size);
  const prev = rounds[rounds.indexOf(m.round) - 1];
  const upper = prev === undefined ? undefined : byId.get(`${prev}-${m.slot * 2 - 1}`)?.winner;
  if (upper !== undefined && both.includes(upper)) return [upper, both.find((x) => x !== upper)];
  const lower = prev === undefined ? undefined : byId.get(`${prev}-${m.slot * 2}`)?.winner;
  if (lower !== undefined && both.includes(lower)) return [both.find((x) => x !== lower), lower];
  return [both[0], both[1]];
}

function slotOf(input: DeskInput, m: Match, takeId: string | undefined, feeder: string, ghost: string): SlotView {
  if (takeId === undefined) return { kind: "ghost", text: ghost === "" ? feeder : ghost };
  const entrant = entrantOf(input, takeId);
  if (m.outcome === undefined) return { kind: "entrant", entrant };
  if (m.outcome === "neither") return { kind: "entrant", entrant, mark: "neither" };
  if (m.winner === takeId) return { kind: "entrant", entrant, mark: m.outcome === "upset" ? "upset" : m.outcome === "walkover" ? "walked" : "won" };
  return { kind: "entrant", entrant, mark: "out" };
}

function statusOf(m: Match, first: boolean): MatchView["status"] {
  if (m.takeA !== undefined && m.takeB !== undefined) return m.outcome !== undefined ? "done" : m.pairId !== undefined ? "open" : "tbd";
  if (m.outcome === "walkover") return first ? "bye" : "walk";
  return "tbd";
}

function viewOf(input: DeskInput, m: Match, byId: ReadonlyMap<string, Match>, ri: number, rounds: readonly DrawRound[]): MatchView {
  const first = ri === 0;
  const [a, b] = ordered(input, m, byId, first);
  const prev = rounds[ri - 1];
  const feeder = (n: number): string => {
    if (prev === undefined) return "bye";
    const f = byId.get(`${prev}-${n}`);
    return f?.outcome === "neither" ? "empty — no winner" : `winner of ${ROUND_NAME[prev]} ${n}`;
  };
  return {
    id: matchId(m),
    round: m.round,
    slot: m.slot,
    status: statusOf(m, first),
    a: slotOf(input, m, a, feeder(m.slot * 2 - 1), ""),
    b: slotOf(input, m, b, feeder(m.slot * 2), ""),
    ...(m.outcome === undefined ? {} : { outcome: m.outcome }),
    lit: m.winner !== undefined && m.outcome !== "neither",
  };
}

/** Every round of the bracket as columns, its tallies and its champion. */
export function bracketView(input: DeskInput): BracketView {
  const rounds = roundsOf(input.bracket.draw.size);
  const byId = new Map(input.bracket.matches.map((m) => [matchId(m), m]));
  const cols: RoundView[] = rounds.map((round, ri) => {
    const ms = input.bracket.matches.filter((m) => m.round === round).sort((x, y) => x.slot - y.slot);
    const matches = ms.map((m) => viewOf(input, m, byId, ri, rounds));
    const played = matches.filter((m) => m.status !== "walk" && m.status !== "bye");
    return { round, name: ROUND_NAME[round], matches, decided: played.filter((m) => m.status === "done").length, of: played.length, open: played.filter((m) => m.status === "open").length };
  });
  const all = cols.flatMap((c) => c.matches).filter((m) => m.status !== "walk" && m.status !== "bye");
  const champ = input.bracket.champion;
  return {
    rounds: cols,
    ...(champ === undefined ? {} : { champion: { entrant: entrantOf(input, champ) } }),
    decided: all.filter((m) => m.status === "done").length,
    total: all.length,
    upsets: all.filter((m) => m.outcome === "upset").length,
    open: all.filter((m) => m.status === "open").length,
  };
}

const titleOf = (m: Pick<Match, "round" | "slot">): string => `${ROUND_NAME[m.round]} · match ${m.slot}`;

type Metric = { readonly label: string; readonly get: (e: LabEntry) => number | undefined; readonly fmt: (v: number | undefined) => string; readonly better: -1 | 0 | 1 };
const SCORE_ROWS: readonly Metric[] = [
  { label: "wer", get: (e) => e.scores?.wer, fmt: pct, better: -1 },
  { label: "diction", get: (e) => e.scores?.werSd, fmt: pct, better: -1 },
  { label: "SongEval", get: (e) => songEvalOf(e.scores), fmt: (v) => num(v), better: 1 },
  { label: "natural.", get: (e) => e.scores?.songEval?.naturalness, fmt: (v) => num(v), better: 1 },
  { label: "buzz dB", get: (e) => e.scores?.buzzIdx, fmt: (v) => num(v, 1), better: -1 },
];
const QUESTION_METRIC: Readonly<Record<AbQuestion, { readonly m: Metric; readonly eps: number }>> = {
  lyrics: { m: SCORE_ROWS[0]!, eps: 0.009 },
  vocal: { m: SCORE_ROWS[3]!, eps: 0.015 },
  release: { m: SCORE_ROWS[2]!, eps: 0.015 },
};

function scoreRows(me: LabEntry | undefined, other: LabEntry | undefined): ScoreRow[] {
  return SCORE_ROWS.map((r) => {
    const v = me === undefined ? undefined : r.get(me);
    const o = other === undefined ? undefined : r.get(other);
    const differs = v !== undefined && o !== undefined && r.fmt(v) !== r.fmt(o);
    const tone = !differs || r.better === 0 ? undefined : (r.better < 0 ? v < o : v > o) ? "better" : "worse";
    return { label: r.label, value: r.fmt(v), ...(tone === undefined ? {} : { tone }) };
  });
}

function verdict(q: AbQuestion, answer: string, picked: LabEntry | undefined, other: LabEntry | undefined): QuestionVerdict {
  if (answer === "neither") return { agree: "neither", detail: "" };
  const { m, eps } = QUESTION_METRIC[q];
  const pv = picked === undefined ? undefined : m.get(picked);
  const ov = other === undefined ? undefined : m.get(other);
  const agree: Agreement = pv === undefined || ov === undefined ? "unmeasured" : Math.abs(pv - ov) < eps ? "meters tie" : (m.better < 0 ? pv < ov : pv > ov) ? "agrees" : "differs";
  return { agree, detail: `${m.label} ${m.fmt(pv)} vs ${m.fmt(ov)}` };
}

/** A decided match unmasked: which take played as which arm, the answers, the upset named. */
function revealOf(input: DeskInput, m: Match, j: Judged): RevealView {
  const take = { a: j.pair.side === "ab" ? j.pair.takeA : j.pair.takeB, b: j.pair.side === "ab" ? j.pair.takeB : j.pair.takeA };
  const entry = (id: string) => input.takes.get(id);
  const arm = (k: "a" | "b"): RevealArm => {
    const me = entry(take[k]);
    const other = entry(take[k === "a" ? "b" : "a"]);
    const stages = me?.facts.lineage.sourceTakeId === undefined ? undefined : me.facts.lineage.postStages.join("·");
    return { arm: k, entrant: entrantOf(input, take[k]), gate: gateOf(me?.scores), ...(stages === undefined || stages === "" ? {} : { stages }), scores: scoreRows(me, other) };
  };
  const rel = j.vote.answers.release;
  const winnerArm = rel === "neither" ? undefined : rel;
  const verdicts = Object.fromEntries(
    AB_QUESTIONS.map((q) => {
      const a = j.vote.answers[q];
      const picked = a === "neither" ? undefined : entry(take[a]);
      const other = a === "neither" ? undefined : entry(take[a === "a" ? "b" : "a"]);
      return [q, verdict(q, a, picked, other)];
    }),
  ) as Record<AbQuestion, QuestionVerdict>;
  let line: string;
  if (winnerArm === undefined) line = `${ROUND_NAME[m.round]} · both out${j.vote.defect === undefined ? "" : ` · ${j.vote.defect}`}`;
  else {
    const w = take[winnerArm];
    const l = take[winnerArm === "a" ? "b" : "a"];
    const ws = songEvalOf(entry(w)?.scores);
    const ls = songEvalOf(entry(l)?.scores);
    const sw = seedOf(input, w);
    const sl = seedOf(input, l);
    line = sw > sl ? `seed ${sw} over seed ${sl}, SongEval had it ${num(ls)} to ${num(ws)}` : `seed ${sw} holds over seed ${sl}, SongEval ${num(ws)} to ${num(ls)}`;
  }
  return {
    matchId: matchId(m),
    title: titleOf(m),
    drawName: input.drawName,
    answers: j.vote.answers,
    ...(j.vote.defect === undefined ? {} : { defect: j.vote.defect }),
    arms: [arm("a"), arm("b")],
    ...(winnerArm === undefined ? {} : { winnerArm }),
    outcome: m.outcome ?? (winnerArm === undefined ? "neither" : "won"),
    line,
    verdicts,
    windowS: Math.max(1, j.pair.windowS[1] - j.pair.windowS[0]) || WINDOW_S,
  };
}

/** The whole desk for one bracket: columns, the glowing match, the booth, the queue under it. */
export function deskOf(input: DeskInput): Desk {
  const bracket = bracketView(input);
  const byId = new Map(input.bracket.matches.map((m) => [matchId(m), m]));
  const open = input.bracket.matches.filter((m) => m.pairId !== undefined && m.outcome === undefined && m.takeA !== undefined && m.takeB !== undefined);
  const sel = input.selected === undefined ? undefined : byId.get(input.selected);
  const current = sel !== undefined && open.includes(sel) ? sel : (input.bracket.current ?? open[0]);
  const judged = sel?.pairId === undefined || sel.outcome === undefined ? undefined : input.judged.get(sel.pairId);
  const rounds = roundsOf(input.bracket.draw.size);
  const ri = (m: Match): number => rounds.indexOf(m.round);
  let match: BlindMatchView | undefined;
  if (judged === undefined && current?.pairId !== undefined) {
    const [a, b] = ordered(input, current, byId, ri(current) === 0);
    const pid = current.pairId;
    match = {
      matchId: matchId(current),
      title: titleOf(current),
      drawName: input.drawName,
      pairId: pid,
      arms: [
        { arm: "a", src: `/api/sound/ab/${pid}/a` },
        { arm: "b", src: `/api/sound/ab/${pid}/b` },
      ],
      window: input.windowCut(pid) ? "cut" : "cutting",
      windowS: WINDOW_S,
      vs: [entrantOf(input, a ?? ""), entrantOf(input, b ?? "")],
    };
  }
  const next = open
    .filter((m) => m !== current)
    .map((m): NextRowView => {
      const [a, b] = ordered(input, m, byId, ri(m) === 0);
      const ea = entrantOf(input, a ?? "");
      const eb = entrantOf(input, b ?? "");
      return { matchId: matchId(m), drawId: input.bracket.draw.drawId, round: ROUND_NAME[m.round], label: `${ea.seed} ${ea.label} × ${eb.seed} ${eb.label}`, field: input.bracket.draw.field === "main" ? "main" : "post" };
    });
  return {
    bracket,
    ...(current === undefined ? {} : { glow: matchId(current) }),
    ...(match === undefined ? {} : { match }),
    ...(judged === undefined || sel === undefined ? {} : { reveal: revealOf(input, sel, judged) }),
    next,
  };
}
