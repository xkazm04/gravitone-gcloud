import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import { sha256Hex } from "@gt/kernel/canonical";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { packetIdOf } from "../../../ledger/v1/packet.ts";
import { patchClip, readSuno } from "../../../sound/suno/store.ts";
import { SoundError } from "../../../sound/store.ts";
import { sunoModelLabel, type SunoClip, type SunoVerdict } from "../../../suno/types.ts";
import { isScoutSunoJob } from "../../../foundry/scout/types.ts";
import {
  buildConsequence,
  candidateOf,
  committedOutcome,
  decisionMap,
  fromV1,
  mintPacket,
  runIdOf,
  v1Call,
  v1DigestOf,
  type AdapterRef,
  type DecisionAdapter,
  type DecisionsAt,
  type Loss,
  type OpenPlan,
  type Preview,
} from "../types.ts";
import { cutoffOf, parsePile, pileRunId } from "./audio.ts";

// SUNO TRIAGE AS A PACKET - the clips in <sound store>/suno.json with no verdict
// (lib/sound/suno/store.ts), decided keep | drop as a matrix cull with a row per
// model, and written back through v1's own `patchClip` under the sound lock.
//
// READ THROUGH `readSuno`, NEVER `sunoSnapshot`: a snapshot read probes the
// browser driver and KICKS the worker (lib/sound/suno/queue.ts "a snapshot read
// is a kick"), so a preview would start spending the operator's Suno credits
// whenever the queue is switched on (the Phase 2 bypass, lib/ledger/v1/sources/
// suno.ts, kept).
//
// Absorbed from v1 (lib/board/sources/audio.ts gate `triage`): the pile is the
// clips with `verdict: null`; keep and drop are v1's two words (SunoVerdict);
// a drop only marks the record - the song stays in the operator's Suno library
// and nothing on suno.com is touched. Upgraded: v1 holding another verdict on a
// clip is refused at apply, never overwritten; the pile carries a generation
// (./audio.ts parsePile: the newest pending clip's createdAt), so a committed
// pile is not reopened under the same id and clips that land while it is open
// wait for the next one.
//
// A CLIP HAS NO BYTES HERE. v1 keeps a reference (SunoClipRef: songId, url,
// audioUrl), never a file, so the candidate's media addresses the REFERENCE -
// sha256 over the URL v1 plays it from, mime text/uri-list - and the packet
// says so as an approximate loss. Suno serves a song id at one URL for its
// life, so the address does not drift; it is still not the bytes.

export const SUNO_PILE = "suno/triage";

export type SunoV1 = {
  readonly runId: string;
  readonly cutoff: number;
  /** Every clip in suno.json: a commit may name one judged elsewhere since. */
  readonly clips: readonly SunoClip[];
};

// A scout take is judged on its night's packet (pkt:scout:<night>), never here.
const pending = (c: SunoClip): boolean => c.verdict === null && !isScoutSunoJob(c.jobId);

function pileOf(v1: Pick<SunoV1, "clips" | "cutoff">): SunoClip[] {
  return v1.clips.filter((c) => pending(c) && c.createdAt <= v1.cutoff).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

async function read(ref: AdapterRef): Promise<Result<SunoV1>> {
  const pile = parsePile(SUNO_PILE, ref.runId);
  if (!pile.ok) return pile;
  const file = await v1Call(() => readSuno());
  if (!file.ok) return file;
  const clips = file.value.clips;
  const cutoff = cutoffOf(pile.value, clips.filter(pending).map((c) => c.createdAt));
  if (cutoff === undefined) return err("not-found", "no Suno clip is waiting for a verdict");
  return ok({ runId: pileRunId(SUNO_PILE, cutoff), cutoff, clips });
}

/** Where the browser plays a clip: Suno's audio file, else its song page. */
const playable = (c: SunoClip): string => c.audioUrl ?? c.url;

/** The reference as a content address (the header's "a clip has no bytes here"). */
function referenceRef(c: SunoClip): BlobRef {
  const uri = playable(c);
  return { sha256: sha256Hex(uri), bytes: Buffer.byteLength(uri, "utf8"), mime: "text/uri-list" };
}

function words(c: SunoClip): ItemWords {
  const style = c.prompt?.style ?? "";
  return {
    label: c.title,
    meta: `${sunoModelLabel(c.model)} · ${c.origin}${c.durationS === null ? "" : ` · ${Math.round(c.durationS)} s`}`,
    ...(style === "" ? {} : { prompt: style }),
    music: true,
  };
}

function packet(v1: SunoV1): Result<OpenPlan> {
  const clips = pileOf(v1);
  if (clips.length === 0) return err("not-found", `no Suno clip waits for a verdict at or before ${new Date(v1.cutoff).toISOString()}`);
  const minted = mintPacket({
    id: packetIdOf("suno", v1.runId),
    lane: "audio",
    source: "suno",
    mode: "matrix-cull",
    state: "open",
    runId: v1.runId,
    title: `${clips.length} Suno clip${clips.length === 1 ? "" : "s"} to judge`,
    // A library clip was made by hand on suno.com: no job of ours, so it is its own.
    items: clips.map((c) => ({ id: c.id, jobId: c.jobId ?? c.id, media: referenceRef(c), row: sunoModelLabel(c.model), grades: [] })),
  });
  if (!minted.ok) return minted;
  const models = [...new Set(clips.map((c) => sunoModelLabel(c.model)))];
  const rows: RowWords[] = models.map((m) => ({ id: m, label: m }));
  const losses: Loss[] = [{ grade: "approximate", reason: "a Suno clip is a reference to suno.com, not a file here: its media is addressed by the URL v1 plays it from" }];
  return ok({
    packet: minted.value,
    // The pile is the clips with no verdict: there is none to import.
    initial: [],
    present: { items: Object.fromEntries(clips.map((c) => [c.id, words(c)])), rows, meta: "Suno triage" },
    urls: Object.fromEntries(clips.map((c) => [c.id, playable(c)])),
    losses,
  });
}

const verdictOf = (d: Pick<Decision, "verdict">): SunoVerdict | undefined => (d.verdict === "keep" ? "keep" : d.verdict === "reject" ? "drop" : undefined);

function consequence(v1: SunoV1, at: DecisionsAt): Result<Preview> {
  const byId = new Map(v1.clips.map((c) => [c.id, c]));
  const items = new Set(pileOf(v1).map((c) => c.id));
  const writes: Preview["consequence"]["writes"][number][] = [];
  const promotions: { target: string; candidate: string; detail: string }[] = [];
  const read: unknown[] = [];
  for (const [id, d] of decisionMap(at.decisions)) {
    items.add(id);
    const c = byId.get(id);
    if (c === undefined) return err("conflict", `Suno clip ${id} is no longer in suno.json`);
    read.push({ id, verdict: c.verdict, url: playable(c) });
    const v = verdictOf(d);
    if (v === undefined) continue;
    if (c.verdict !== null && c.verdict !== v) return err("conflict", `Suno clip ${id} was marked ${c.verdict} since this pile opened; the commit would overwrite it`);
    writes.push({ kind: "index-row", target: `suno.json clips ${id}`, candidate: id, detail: v });
    if (v === "keep") promotions.push({ target: "Suno · kept", candidate: id, detail: `${c.title}: a track the Settled column can make a video of` });
  }
  const v1Digest = v1DigestOf({ source: "suno", cutoff: v1.cutoff, clips: read });
  return ok({ consequence: buildConsequence(at, [...items], { writes, promotions }, v1Digest), v1Digest });
}

async function apply(claim: ApplyClaim): Promise<Result<void>> {
  const committed = committedOutcome(claim);
  if (!committed.ok) return committed;
  const run = runIdOf(claim);
  if (!run.ok) return run;
  const file = await v1Call(() => readSuno());
  if (!file.ok) return file;
  const now = new Map(file.value.clips.map((c) => [c.id, c.verdict]));
  const marks = [...claim.decisions]
    .sort((a, b) => a.key.localeCompare(b.key))
    .flatMap((d) => {
      const v = verdictOf(d);
      return v === undefined ? [] : [{ id: candidateOf(d), v }];
    });
  // Every clip is checked BEFORE the first is written: a permanent refusal (a clip gone, or marked
  // otherwise since) parks the row stuck, and it must find suno.json as the commit found it, not
  // holding the half of this packet that sorted before the refused clip.
  for (const { id, v } of marks) {
    if (!now.has(id)) return fromV1(new SoundError(`no Suno clip ${id}`, 404));
    const held = now.get(id);
    if (held !== null && held !== undefined && held !== v) return fromV1(new SoundError(`Suno clip ${id} is marked ${held} in the Sound lab; this packet would mark it ${v} - judge it there`, 403));
  }
  // Clip by clip, as v1's gate wrote them (each its own patchClip under the
  // lock); a redelivery after a crash finds the clips already marked and skips them.
  for (const { id, v } of marks) {
    if (now.get(id) === v) continue;
    const r = await v1Call(() => patchClip(id, { verdict: v }));
    if (!r.ok) return r;
  }
  return ok(undefined);
}

export const sunoAdapter: DecisionAdapter<SunoV1> = { source: "suno", read, packet, consequence, apply };
